import os
import re
import json
import urllib.request
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid
from fastapi import APIRouter, Body, Depends, HTTPException, status, Query, UploadFile, File, Form
from google.cloud.firestore import Client

from app.database.session import get_db
from app.schemas.schemas import (
    EventCreate,
    EventUpdate,
    EventResponse,
    ConflictCheckRequest,
    ConflictCheckResponse,
    ConflictItem,
    AcademicCalendarUploadResponse
)
from app.auth.permissions import get_current_active_user, check_role
from app.models.models import User, RoleEnum
from app.api.v1.notifications import trigger_notification
from app.services.whatsapp_service import WhatsAppService
from app.services.document_parser import parse_document
from app.services.institutional_ai import extract_calendar_from_text
from app.config.settings import settings
from app.utils.logging import logger

router = APIRouter()

ALLOWED_CALENDAR_EXTENSIONS = {".xlsx", ".xls", ".csv", ".json", ".pdf", ".docx", ".doc", ".txt"}

def map_category_to_enum(category_str: str) -> str:
    c = (category_str or "").lower()
    if any(k in c for k in ["academic", "exam", "assessment", "teaching", "test", "audit", "curriculum"]):
        return "ACADEMIC"
    elif any(k in c for k in ["meeting", "seminar", "conference"]):
        return "MEETING"
    elif any(k in c for k in ["workshop", "hands-on", "bootcamp", "training"]):
        return "WORKSHOP"
    elif any(k in c for k in ["faculty", "fdp", "research", "development"]):
        return "FACULTY_DEV"
    elif any(k in c for k in ["holiday", "vacation", "break"]):
        return "HOLIDAY"
    return "ACADEMIC"

# Titles that are pure OCR/fragment noise and must always be discarded.
_NOISE_TITLE_PATTERN = re.compile(
    r'^(\d{1,4}|\d{1,2}(st|nd|rd|th)?|20\d{2}|[,\.\-\/\|\s]+|no\.?|sr\.?|ref\.?|signatures?'
    r'|tentative\s+dates?|activity\s*/\s*event|s\.\s*no|ref\s*\.?\s*no|page\s*\d+)$',
    re.IGNORECASE
)


def sanitize_pdf_text_for_gemini(text: str) -> str:
    """
    Pre-processing sanitizer applied to raw PDF/pdfplumber text BEFORE sending
    to Gemini. Fixes institutional PDF OCR artifacts that confuse the LLM:

    1. Re-join ordinal superscripts split across lines:
       "10\\nth\\nAugust" → "10th August"
       "3\\nrd\\nSeptember" → "3rd September"
    2. Merge a digit row followed immediately by an ordinal on the next line
       (pdfplumber sometimes emits "10" then "th" as separate rows):
       "10 | | th" → handled by collapse logic
    3. Remove leading stray year/comma fragments at the start of cells:
       ",2026 Commencement" → "Commencement"  |  ".2026 " → ""
    4. Strip trailing comma/dot noise appended to year values:
       "August, 2026," → "August, 2026"
    5. Remove isolated ordinal fragments on their own pipe-delimited cell:
       " | th | " → " |  | " (blank cell — Gemini will skip it)
    6. Collapse 3+ blank lines to a single newline.
    7. Remove table-header noise lines that Gemini is told to ignore but
       occasionally still hallucinates as events.
    """
    # 1. Re-join split ordinal suffixes across newlines
    text = re.sub(r'(\d+)\n\s*(st|nd|rd|th)\b', r'\1\2', text, flags=re.IGNORECASE)

    # 2. Re-join digit followed by ordinal on the SAME pipe-delimited line
    #    e.g. "10 | th" → "10th"
    text = re.sub(r'\b(\d+)\s*\|\s*(st|nd|rd|th)\b', r'\1\2', text, flags=re.IGNORECASE)

    # 3. Remove leading stray year fragments at line/cell start
    text = re.sub(r'^[\.,]\s*20\d{2}\s+', '', text, flags=re.MULTILINE)

    # 4. Strip trailing comma/dot after a year
    text = re.sub(r'(20\d{2})[,\.]+(\s|$)', r'\1\2', text, flags=re.MULTILINE)

    # 5. Remove isolated ordinal-only pipe cells
    text = re.sub(r'\|\s*(st|nd|rd|th)\s*\|', '|  |', text, flags=re.IGNORECASE)

    # 6. Collapse excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)

    # 7. Strip known table-header noise lines entirely
    _header_noise = re.compile(
        r'^\s*(sr\.?\s*no\.?|ref\.?\s*no\.?|tentative\s+dates?|activity\s*/\s*event'
        r'|signatures?|s\.\s*no\.?)\s*$',
        re.IGNORECASE | re.MULTILINE
    )
    text = _header_noise.sub('', text)

    return text.strip()

def _normalize_date_local(d: str) -> Optional[str]:
    """Normalize a date string to YYYY-MM-DD using multiple known formats."""
    if not d:
        return None
    d = d.strip()
    for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %B %Y", "%B %d, %Y", "%d-%b-%Y", "%d %b %Y"]:
        try:
            return datetime.strptime(d, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def extract_academic_calendar_with_gemini(text: str, filename: str, academic_year: str, semester: str) -> List[Dict[str, Any]]:
    """Extract academic calendar events from raw PDF text using Gemini AI.

    Pipeline:
      1. sanitize_pdf_text_for_gemini() — fix OCR artifacts before the LLM sees them.
      2. Send to gemini-2.5-flash (with 2.0/1.5 fallback) using a high-precision prompt.
      3. Post-process: strip noise titles, normalize dates, validate categories.
    """
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    is_placeholder = not api_key or "your_key_here" in api_key.lower() or "your_gemini_api_key" in api_key.lower()

    # ── Step 1: Pre-clean the raw text before Gemini sees it ──────────────────
    clean_text = sanitize_pdf_text_for_gemini(text)

    if not is_placeholder:
        system_instruction = f"""You are an expert institutional academic calendar parser for S.B. Jain Institute of Technology, Management & Research, Nagpur.
Analyze the extracted academic calendar text across all sections (Teaching Learning, Examination and Remedial Classes, Project, Value Added Course, Other Activities).

CRITICAL PARSING RULES:
1. Title Integrity:
   - The title MUST be a complete, descriptive academic event or milestone.
     Good examples: "Commencement of Classes", "CAE-I Examination", "Parent-Teacher Meet",
     "Display of Provisional Detention List", "Review Seminar-I for VII Semester",
     "Submission of Project Report", "Remedial Classes for Slow Learners".
   - NEVER output single fragmented words or numbers such as "th", "nd", "rd", "st",
     "2026", ".2026", ",2026", "14 8th", "6th", or any isolated punctuation/number.
   - Fix common OCR spelling errors: 'Commencernent' -> 'Commencement',
     'Regeistration' -> 'Registration', 'Detension' -> 'Detention'.
   - Strip any leading/trailing year numbers, commas, or footnote markers from titles.
   - If a title cell is empty or is only noise, merge context from adjacent cells to
     reconstruct the full event name.
2. Date Normalization — convert ALL dates to ISO format "YYYY-MM-DD" for session {academic_year}:
   - Single date  ("15th June, 2026"):                 start_date="2026-06-15", end_date="2026-06-15"
   - Date range   ("10th-20th August, 2026"):          start_date="2026-08-10", end_date="2026-08-20"
   - Multi-month  ("16th November - 5th December, 2026"): start_date="2026-11-16", end_date="2026-12-05"
   - On/before    ("On or before 6th June, 2026"):     start_date="2026-06-06", end_date="2026-06-06"
   - Up to        ("Up to 30th July, 2026"):           start_date="2026-07-30", end_date="2026-07-30"
   - Year 2026 months: June(06), July(07), August(08), September(09), October(10),
     November(11), December(12).
   - Year 2027 months: January(01), February(02), March(03), April(04), May(05).
   - ALL dates MUST fall within academic year {academic_year}.
   - NEVER invent or guess dates — if a row has no date, set both to "".
3. Accurate Categorization (use ONLY these exact enum values):
   - "Examination and Remedial Classes" section -> "ACADEMIC"
   - "Teaching Learning" section              -> "ACADEMIC"
   - "Project" or "Value Added Course" section-> "WORKSHOP"
   - "Other Activities" section               -> "MEETING"
   - "Holidays" / "Vacations"                 -> "HOLIDAY"
   - "Faculty" / "IQAC" / "FDP" / "Training"  -> "FACULTY_DEV"
   - When section is unclear, default to     -> "ACADEMIC"
4. Noise Rejection: Completely ignore rows whose title column contains only:
   'Sr. No.', 'Ref No.', 'Tentative Dates', 'Activity/Event', 'Signatures',
   standalone page numbers, or blank cells.
5. Completeness: Extract EVERY data row from the table — do not skip any
   activity, milestone, or sub-event.

Return ONLY a valid JSON array with NO markdown fences, NO extra commentary:
[
  {{
    "title": "Complete, Clean Event Title",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "category": "ACADEMIC" | "MEETING" | "WORKSHOP" | "FACULTY_DEV" | "HOLIDAY",
    "description": "Full description from the table row including any submission notes"
  }}
]

Ensure 100% date accuracy matching academic year {academic_year}, {semester}."""

        try:
            # Try gemini-2.5-flash first, fall back through 2.0-flash then 1.5-flash
            # Use clean_text (pre-sanitized) and a 32k token window for better coverage.
            result = None
            for model_name in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                data = {
                    "contents": [
                        {
                            "parts": [
                                {"text": system_instruction},
                                {"text": (
                                    f"Academic Calendar Document ({filename}) "
                                    f"for {academic_year}, {semester}:\n\n"
                                    f"{clean_text[:32000]}"
                                )}
                            ]
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0.05,
                        "topP": 0.9,
                        "maxOutputTokens": 8192
                    }
                }
                req = urllib.request.Request(
                    url,
                    data=json.dumps(data).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                try:
                    response = urllib.request.urlopen(req, timeout=90)
                    result = json.loads(response.read().decode('utf-8'))
                    logger.info(f"Gemini model {model_name} succeeded for {filename}")
                    break
                except Exception as model_err:
                    logger.warning(f"Gemini model {model_name} failed: {model_err}, trying next...")
                    result = None

            if not result:
                raise ValueError("All Gemini model attempts failed to return a response.")

            raw_ans = result['candidates'][0]['content']['parts'][0]['text'].strip()

            # Strip any markdown code fences
            if raw_ans.startswith("```"):
                raw_ans = re.sub(r'^```[a-zA-Z]*\n?', '', raw_ans)
                raw_ans = re.sub(r'\n?```$', '', raw_ans.strip())
            raw_ans = raw_ans.strip()

            parsed_items = json.loads(raw_ans)
            if isinstance(parsed_items, list) and len(parsed_items) > 0:
                out = []
                for item in parsed_items:
                    if not isinstance(item, dict) or not item.get("title"):
                        continue

                    # ── POST-PROCESSING SANITIZER ──────────────────────────────────
                    # Pass 1: Strip leading/trailing junk characters from title
                    raw_title = str(item.get("title", "")).strip()
                    clean_title = re.sub(r'^[,\.\s\d\-\/\|]+', '', raw_title).strip()
                    clean_title = re.sub(r'[,\.\s\-\/\|]+$', '', clean_title).strip()
                    # Also strip isolated ordinal suffixes left at the front
                    clean_title = re.sub(r'^(st|nd|rd|th)\s+', '', clean_title, flags=re.IGNORECASE).strip()
                    # Remove stray year fragments embedded at start/end of title
                    clean_title = re.sub(r'^20\d{2}[,\.\s]+', '', clean_title).strip()
                    clean_title = re.sub(r'[,\.\s]+20\d{2}$', '', clean_title).strip()

                    # Pass 2: Reject fragment-only / noise titles
                    if not clean_title or len(clean_title) < 4:
                        logger.debug(f"Discarding short/empty title: '{raw_title}'")
                        continue
                    if _NOISE_TITLE_PATTERN.match(clean_title):
                        logger.debug(f"Discarding noise title: '{clean_title}'")
                        continue
                    # Reject titles that are pure digit+ordinal combinations (e.g. "10th", "3rd")
                    if re.match(r'^\d{1,2}(st|nd|rd|th)?$', clean_title, re.IGNORECASE):
                        logger.debug(f"Discarding ordinal-only title: '{clean_title}'")
                        continue

                    # Pass 3: Validate & normalise dates
                    s_date = _normalize_date_local(item.get("start_date", "")) or datetime.utcnow().strftime("%Y-%m-%d")
                    e_date = _normalize_date_local(item.get("end_date", "")) or s_date

                    # Pass 4: Validate that end_date >= start_date
                    if e_date < s_date:
                        logger.warning(f"end_date '{e_date}' < start_date '{s_date}' for '{clean_title}' — resetting end_date")
                        e_date = s_date

                    cat = map_category_to_enum(item.get("category", "ACADEMIC"))
                    out.append({
                        "title": clean_title,
                        "start_date": s_date,
                        "end_date": e_date,
                        "category": cat,
                        "description": str(item.get("description", "")).strip(),
                        "teaching_learning_notes": str(item.get("teaching_learning_notes", "")).strip()
                    })
                if out:
                    logger.info(f"Gemini extracted {len(out)} clean events from {filename}")
                    return out
        except Exception as e:
            logger.error(f"Gemini API calendar extraction error for {filename}: {e}")

    # Fallback to local regex/heuristics extraction
    fallback_items = extract_calendar_from_text(text, filename)
    out = []
    for ev in fallback_items:
        s_date = ev.get("start_date") or ev.get("date") or datetime.utcnow().strftime("%Y-%m-%d")
        e_date = ev.get("end_date") or s_date
        out.append({
            "title": ev.get("title") or "Academic Event",
            "start_date": s_date,
            "end_date": e_date,
            "category": map_category_to_enum(ev.get("category") or ev.get("type") or "ACADEMIC"),
            "description": ev.get("description") or f"Official {ev.get('category', 'Academic')} activity.",
            "teaching_learning_notes": ev.get("notes") or f"Academic milestone for {semester}."
        })
    return out

def parse_iso_or_parts(date_str: Optional[str], time_str: Optional[str]) -> Optional[datetime]:
    """Helper to parse date and time into a comparable datetime object."""
    if not date_str:
        return None
    try:
        # Check if already ISO format with T
        if "T" in date_str:
            clean = date_str.replace("Z", "")
            return datetime.fromisoformat(clean)
        
        # If time provided
        if time_str:
            clean_time = time_str.strip().upper()
            # Try 12-hour format e.g. "10:00 AM" or "10:00AM"
            for fmt in ("%Y-%m-%d %I:%M %p", "%Y-%m-%d %I:%M%p", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
                try:
                    return datetime.strptime(f"{date_str} {clean_time}", fmt)
                except ValueError:
                    pass
        # Date only: treat as midnight
        return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return None

def normalize_event_dates(data: Dict[str, Any]) -> Dict[str, Any]:
    """Ensures start_date, start_time, end_date, end_time, and legacy date are populated consistently."""
    if not data.get("start_date") and data.get("date"):
        data["start_date"] = data["date"]
    if not data.get("date") and data.get("start_date"):
        data["date"] = data["start_date"]
    if not data.get("end_date"):
        data["end_date"] = data.get("start_date", data.get("date"))
    if not data.get("start_time"):
        data["start_time"] = "09:00 AM"
    if not data.get("end_time"):
        data["end_time"] = "10:00 AM"
    if not data.get("category"):
        data["category"] = data.get("type", "Academic")
    if not data.get("type"):
        data["type"] = data.get("category", "Academic")
    if not data.get("status"):
        data["status"] = "UPCOMING"
    if not data.get("priority"):
        data["priority"] = "Medium"
    if not data.get("participant_ids"):
        data["participant_ids"] = []
    if not data.get("participant_names"):
        data["participant_names"] = []
    return data

@router.get("/", response_model=List[EventResponse])
def get_events(
    faculty_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    department_id: Optional[str] = Query(None),
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieve real department events from database. Returns empty list if no events exist.
    """
    events_ref = db.collection('events')
    docs = list(events_ref.stream())
    events = []
    
    for doc in docs:
        evt = doc.to_dict()
        evt = normalize_event_dates(evt)
        
        # Optional department filter
        if department_id:
            evt_dept = evt.get("department_id")
            if evt_dept and evt_dept.lower() != department_id.lower():
                continue

        # Optional faculty filter
        if faculty_id:
            participants = evt.get("participant_ids") or []
            organizer = evt.get("organizer_id")
            person = evt.get("person") or ""
            names = evt.get("participant_names") or []
            
            # Match by ID or Name
            matches = (
                faculty_id in participants or 
                faculty_id == organizer or 
                faculty_id.lower() in person.lower() or
                any(faculty_id.lower() in n.lower() for n in names)
            )
            if not matches:
                continue

        # Optional category filter
        if category and category != "All":
            evt_cat = (evt.get("category") or evt.get("type") or "").lower()
            if evt_cat != category.lower():
                continue

        events.append(evt)

    # Sort events by start date/time ascending
    events.sort(key=lambda x: (x.get("start_date") or x.get("date") or "", x.get("start_time") or ""))
    return events


@router.post("/extract-calendar", response_model=AcademicCalendarUploadResponse)
async def extract_calendar_endpoint(
    file: UploadFile = File(...),
    academic_year: str = Form("2026-2027"),
    semester: str = Form("Odd Semester (Sem I, III, V, VII)"),
    department_id: Optional[str] = Form(None),
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    PDF Calendar Extraction Endpoint with Gemini:
    - Reads PDF / document bytes across all pages.
    - Uses Gemini 1.5/2.5 Flash to extract structured academic events into strict JSON.
    - Batch-deletes previous academic calendar events for this department in Firestore `events` collection.
    - Batch-inserts extracted events into Firestore with `is_institutional_calendar: true`, `department_id`, and `created_by`.
    - Updates department metadata: `calendar_last_synced` timestamp.
    """
    target_dept = department_id or current_user.department_id or "AIML"
    filename = file.filename or "academic_calendar.pdf"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_CALENDAR_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: .pdf, .xlsx, .csv, .json"
        )

    temp_dir = "./uploads/academic_calendars"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"{uuid.uuid4().hex}_{filename}")

    try:
        content = await file.read()
        with open(temp_path, "wb") as buffer:
            buffer.write(content)
    except Exception as e:
        logger.error(f"Error saving uploaded file for Gemini extraction: {e}")
        raise HTTPException(status_code=500, detail="Failed to save uploaded calendar file.")

    try:
        parsed_doc = parse_document(temp_path, filename)
        doc_text = parsed_doc.get("text", "")
    except Exception as e:
        logger.error(f"Document parsing error: {e}")
        doc_text = ""

    extracted_records = extract_academic_calendar_with_gemini(doc_text, filename, academic_year, semester)

    if not extracted_records:
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        extracted_records = [{
            "title": f"Semester Commencement ({academic_year})",
            "start_date": today_str,
            "end_date": today_str,
            "category": "ACADEMIC",
            "description": f"Official academic calendar event for {target_dept}.",
            "teaching_learning_notes": f"Commencement of academic activities for {semester}."
        }]

    now_iso = datetime.utcnow().isoformat()
    events_ref = db.collection('events')

    # OVERWRITE / REPLACE COLLECTION LOGIC: Batch-delete previous academic calendar events
    try:
        existing_docs = list(events_ref.stream())
        for doc in existing_docs:
            evt_data = doc.to_dict()
            dept = evt_data.get("department_id")
            is_acad = (
                evt_data.get("is_institutional_calendar") or 
                evt_data.get("is_academic_calendar") or 
                evt_data.get("is_institutional")
            )
            if is_acad and (not dept or dept.lower() == target_dept.lower()):
                events_ref.document(doc.id).delete()
    except Exception as e:
        logger.warning(f"Error removing previous academic calendar events: {e}")

    new_events = []
    cat_display_map = {
        "ACADEMIC": "Academic",
        "MEETING": "Meeting",
        "WORKSHOP": "Workshop",
        "FACULTY_DEV": "Faculty Development",
        "HOLIDAY": "Holiday"
    }

    for rec in extracted_records:
        event_id = f"evt_acad_{uuid.uuid4().hex[:10]}"
        cat_enum = rec.get("category", "ACADEMIC")
        type_display = cat_display_map.get(cat_enum, "Academic")

        evt_dict = {
            "id": event_id,
            "title": rec["title"],
            "date": rec["start_date"],
            "start_date": rec["start_date"],
            "end_date": rec["end_date"],
            "start_time": "09:00 AM",
            "end_time": "05:00 PM",
            "category": cat_enum,
            "type": type_display,
            "department_id": target_dept,
            "description": rec.get("description", ""),
            "teaching_learning_notes": rec.get("teaching_learning_notes", ""),
            "academic_year": academic_year,
            "semester": semester,
            "organizer_id": current_user.id,
            "organizer_name": current_user.name,
            "created_by": current_user.id,
            "creator_id": current_user.id,
            "person": f"{target_dept} Faculty",
            "priority": "High" if cat_enum in ["ACADEMIC", "EXAM"] else "Medium",
            "status": "UPCOMING",
            "is_institutional_calendar": True,
            "is_academic_calendar": True,
            "is_institutional": True,
            "created_at": now_iso,
            "updated_at": now_iso
        }
        evt_dict = normalize_event_dates(evt_dict)
        events_ref.document(event_id).set(evt_dict)
        new_events.append(evt_dict)

    # Update department metadata calendar_last_synced
    try:
        dept_ref = db.collection('departments').document(target_dept)
        dept_ref.set({
            "id": target_dept,
            "calendar_last_synced": now_iso,
            "academic_calendar_last_updated": now_iso,
            "updated_by": current_user.id
        }, merge=True)
    except Exception as e:
        logger.warning(f"Failed to update department metadata timestamp: {e}")

    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except Exception:
            pass

    return AcademicCalendarUploadResponse(
        message=f"Gemini AI extracted and synced {len(new_events)} academic calendar activities for department {target_dept}.",
        total_imported=len(new_events),
        department_id=target_dept,
        events=new_events,
        academic_calendar_last_updated=now_iso
    )


@router.post("/upload-academic-calendar", response_model=AcademicCalendarUploadResponse)
async def upload_academic_calendar(
    file: UploadFile = File(...),
    academic_year: str = Form("2026-2027"),
    semester: str = Form("Odd Semester"),
    department_id: Optional[str] = Form(None),
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Admin Calendar Upload & Overwrite Engine:
    Delegates directly to Gemini PDF calendar extraction pipeline.
    """
    return await extract_calendar_endpoint(
        file=file,
        academic_year=academic_year,
        semester=semester,
        department_id=department_id,
        db=db,
        current_user=current_user
    )

@router.post("/publish-calendar")
async def publish_calendar(
    payload: dict = Body(...),
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Accepts verified preview entries from the Gemini extraction flow,
    batch-deletes previous institutional calendar events for this dept/semester,
    and batch-inserts the new verified events into the 'events' Firestore collection.
    Used when extract-calendar (Gemini) flow completes — draftId is not available.
    """
    events_list = payload.get("events", [])
    academic_year = payload.get("academic_year") or "2026-2027"
    semester = payload.get("semester") or ""
    target_dept = payload.get("department_id") or getattr(current_user, "department_id", None) or "AIML"

    if not events_list:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish an empty calendar. Please include at least one verified activity."
        )

    now_iso = datetime.utcnow().isoformat()
    events_ref = db.collection('events')

    # Batch-delete previous institutional calendar events for this dept
    try:
        existing_docs = list(events_ref.stream())
        for doc in existing_docs:
            evt_data = doc.to_dict()
            dept = evt_data.get("department_id")
            is_inst = (
                evt_data.get("is_institutional_calendar")
                or evt_data.get("is_academic_calendar")
                or evt_data.get("is_institutional")
            )
            if is_inst and (not dept or dept.lower() == target_dept.lower()):
                events_ref.document(doc.id).delete()
    except Exception as e:
        logger.warning(f"Error removing previous institutional events before publish: {e}")

    cat_display_map = {
        "ACADEMIC": "Academic",
        "MEETING": "Meeting",
        "WORKSHOP": "Workshop",
        "FACULTY_DEV": "Faculty Development",
        "HOLIDAY": "Holiday"
    }

    saved_count = 0
    published_events = []
    for ev in events_list:
        raw_title = str(ev.get("title", "")).strip()
        clean_title = re.sub(r'^[,\.\s\d\-\/]+', '', raw_title).strip()
        clean_title = re.sub(r'[,\.\s\-]+$', '', clean_title).strip()
        if not clean_title:
            clean_title = raw_title or "Academic Event"

        s_date = str(ev.get("start_date") or ev.get("date") or now_iso[:10])
        e_date = str(ev.get("end_date") or s_date)
        cat_enum = map_category_to_enum(str(ev.get("category") or "ACADEMIC"))
        type_display = cat_display_map.get(cat_enum, "Academic")

        event_id = f"inst_pub_{uuid.uuid4().hex[:10]}"
        evt_dict = {
            "id": event_id,
            "title": clean_title,
            "date": s_date,
            "start_date": s_date,
            "end_date": e_date,
            "start_time": "09:00 AM",
            "end_time": "05:00 PM",
            "category": cat_enum,
            "type": type_display,
            "department_id": target_dept,
            "description": str(ev.get("description") or f"Official {type_display} activity."),
            "teaching_learning_notes": str(ev.get("teaching_learning_notes") or ""),
            "academic_year": academic_year,
            "semester": semester,
            "organizer_id": current_user.id,
            "organizer_name": current_user.name,
            "created_by": current_user.id,
            "creator_id": current_user.id,
            "person": f"{target_dept} Faculty",
            "priority": "High" if cat_enum in ["ACADEMIC"] else "Medium",
            "status": "UPCOMING",
            "participant_ids": [],
            "participant_names": ["All Faculty", "All Students"],
            "is_institutional_calendar": True,
            "is_academic_calendar": True,
            "is_institutional": True,
            "source": "GEMINI_EXTRACT",
            "published_at": now_iso,
            "approved_by": current_user.id,
            "approved_by_name": current_user.name,
            "created_at": now_iso,
            "updated_at": now_iso
        }
        evt_dict = normalize_event_dates(evt_dict)
        events_ref.document(event_id).set(evt_dict)
        published_events.append(evt_dict)
        saved_count += 1

    # Log in calendar history
    try:
        history_id = f"hist_{uuid.uuid4().hex[:10]}"
        db.collection('calendar_history').document(history_id).set({
            "id": history_id,
            "event_id": None,
            "event_title": f"Institutional Academic Calendar ({academic_year} - {semester})",
            "action_type": "PUBLISH",
            "field_changed": "status",
            "previous_value": "AI Extraction Draft",
            "updated_value": f"Officially Published via Gemini Extraction ({saved_count} activities)",
            "modified_by": current_user.name,
            "modified_by_role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
            "modified_at": now_iso
        })
    except Exception as e:
        logger.warning(f"Failed to log publish history: {e}")

    # Update department metadata
    try:
        db.collection('departments').document(target_dept).set({
            "id": target_dept,
            "calendar_last_synced": now_iso,
            "academic_calendar_last_updated": now_iso,
            "updated_by": current_user.id
        }, merge=True)
    except Exception as e:
        logger.warning(f"Failed to update dept calendar metadata: {e}")

    logger.info(f"Published {saved_count} calendar events for {target_dept} by {current_user.name}")
    return {"success": True, "published_count": saved_count, "events": published_events}


@router.post("/check-conflicts", response_model=ConflictCheckResponse)
def check_conflicts(
    payload: ConflictCheckRequest,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Checks whether any of the selected faculty participants have an overlapping activity.
    """
    new_start = parse_iso_or_parts(payload.start_date, payload.start_time)
    new_end = parse_iso_or_parts(payload.end_date, payload.end_time)

    if not new_start or not new_end:
        return ConflictCheckResponse(has_conflict=False, conflicts=[])

    if new_end <= new_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End date/time must be after start date/time."
        )

    events_ref = db.collection('events')
    docs = list(events_ref.stream())
    conflicts = []

    check_ids = set(payload.participant_ids)
    check_names = {n.strip().lower() for n in payload.participant_names if n.strip()}

    for doc in docs:
        evt = doc.to_dict()
        evt_id = evt.get("id")
        # Ignore self when updating existing activity
        if payload.event_id and evt_id == payload.event_id:
            continue

        evt_start = parse_iso_or_parts(evt.get("start_date") or evt.get("date"), evt.get("start_time"))
        evt_end = parse_iso_or_parts(evt.get("end_date") or evt.get("date"), evt.get("end_time"))

        if not evt_start or not evt_end:
            continue

        # Check time overlap: (StartA < EndB) and (EndA > StartB)
        if new_start < evt_end and new_end > evt_start:
            evt_participants = set(evt.get("participant_ids") or [])
            evt_names = {n.strip().lower() for n in (evt.get("participant_names") or []) if n.strip()}
            evt_person = (evt.get("person") or "").strip().lower()

            overlapping_fac = None
            # Check by ID
            common_ids = check_ids.intersection(evt_participants)
            if common_ids:
                overlapping_fac = list(common_ids)[0]

            # Check by Name
            if not overlapping_fac:
                common_names = check_names.intersection(evt_names)
                if common_names:
                    overlapping_fac = list(common_names)[0].title()
                elif evt_person and evt_person in check_names:
                    overlapping_fac = evt.get("person")

            if overlapping_fac:
                conflicts.append(ConflictItem(
                    faculty_id=str(overlapping_fac),
                    faculty_name=str(overlapping_fac),
                    conflicting_event_id=evt_id or "unknown",
                    conflicting_event_title=evt.get("title", "Existing Event"),
                    start_date=evt.get("start_date") or evt.get("date") or "",
                    start_time=evt.get("start_time") or "",
                    end_date=evt.get("end_date") or evt.get("date") or "",
                    end_time=evt.get("end_time") or ""
                ))

    return ConflictCheckResponse(
        has_conflict=len(conflicts) > 0,
        conflicts=conflicts
    )

@router.post("/", response_model=EventResponse)
def create_event(
    event: EventCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Create a new department activity with validation, in-app notifications, and WhatsApp reminder setup.
    """
    event_id = f"evt_{uuid.uuid4().hex[:10]}"
    db_event = event.dict()
    db_event = normalize_event_dates(db_event)
    db_event['id'] = event_id
    db_event['creator_id'] = current_user.id
    db_event['created_at'] = datetime.utcnow().isoformat()
    db_event['updated_at'] = datetime.utcnow().isoformat()

    db.collection('events').document(event_id).set(db_event)
    logger.info(f"Created department activity: {event_id} - {db_event['title']}")

    # Send in-app notification to all participants
    participants = db_event.get("participant_ids") or []
    for pid in participants:
        try:
            trigger_notification(
                db=db,
                user_id=pid,
                notif_type="Calendar",
                title=f"Activity Assigned: {db_event['title']}",
                message=f"You have been assigned to '{db_event['title']}' on {db_event['start_date']} at {db_event['start_time']}.",
                target_route="/calendar",
                priority=db_event.get("priority", "Medium"),
                icon="📅"
            )
        except Exception as e:
            logger.error(f"Failed to create in-app notification for {pid}: {e}")

    # Optional immediate WhatsApp notification if enabled
    if db_event.get("send_whatsapp_reminder"):
        for pid in participants:
            try:
                user_doc = db.collection('users').document(pid).get()
                if user_doc.exists:
                    udata = user_doc.to_dict()
                    if udata.get("whatsapp_enabled") and udata.get("phone"):
                        msg_text = (
                            f"Hello {udata.get('name', 'Faculty')}, you have been assigned a department activity: "
                            f"'{db_event['title']}' on {db_event['start_date']} at {db_event['start_time']}."
                        )
                        WhatsAppService.send_and_record(
                            db=db,
                            sender_id=current_user.id,
                            sender_name=current_user.name,
                            recipient_id=pid,
                            recipient_name=udata.get("name", "Faculty"),
                            recipient_phone=udata.get("phone"),
                            message=msg_text,
                            message_type="activity_assigned"
                        )
            except Exception as e:
                logger.error(f"Failed to dispatch WhatsApp activity assigned message to {pid}: {e}")

    return db_event

@router.get("/{event_id}", response_model=EventResponse)
def get_event(
    event_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieve single event details.
    """
    doc_ref = db.collection('events').document(event_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Activity not found")
    data = doc.to_dict()
    return normalize_event_dates(data)

@router.put("/{event_id}", response_model=EventResponse)
def update_event(
    event_id: str,
    event_update: EventUpdate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update an activity (including drag-and-drop and resize). Enforces HOD/Admin permission.
    """
    # Verify permission
    is_admin_or_hod = current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD]
    if not is_admin_or_hod:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only HOD or Administrator can modify department activities."
        )

    doc_ref = db.collection('events').document(event_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Activity not found")

    old_data = doc.to_dict()
    update_data = {k: v for k, v in event_update.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()

    # Sync legacy date field if start_date changed
    if "start_date" in update_data and "date" not in update_data:
        update_data["date"] = update_data["start_date"]
    elif "date" in update_data and "start_date" not in update_data:
        update_data["start_date"] = update_data["date"]

    if "category" in update_data and "type" not in update_data:
        update_data["type"] = update_data["category"]
    elif "type" in update_data and "category" not in update_data:
        update_data["category"] = update_data["type"]

    doc_ref.update(update_data)
    updated_doc = doc_ref.get().to_dict()
    normalized = normalize_event_dates(updated_doc)

    # Track version history for institutional events
    if old_data.get("is_institutional"):
        changed_fields = []
        prev_vals = []
        upd_vals = []
        for k, new_v in update_data.items():
            if k in ["updated_at", "date", "type"]:
                continue
            old_v = old_data.get(k)
            if old_v != new_v:
                changed_fields.append(k)
                prev_vals.append(f"{k}: {old_v}")
                upd_vals.append(f"{k}: {new_v}")
        if changed_fields:
            hist_id = f"hist_{uuid.uuid4().hex[:10]}"
            try:
                db.collection('calendar_history').document(hist_id).set({
                    "id": hist_id,
                    "event_id": event_id,
                    "event_title": updated_doc.get("title", old_data.get("title", "Institutional Activity")),
                    "action_type": "UPDATE",
                    "field_changed": ", ".join(changed_fields),
                    "previous_value": "; ".join(prev_vals),
                    "updated_value": "; ".join(upd_vals),
                    "modified_by": current_user.name,
                    "modified_by_role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
                    "modified_at": datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.error(f"Failed to log calendar history in events.py: {e}")

    # Check if rescheduled to notify participants
    date_changed = (
        ("start_date" in update_data and update_data["start_date"] != old_data.get("start_date")) or
        ("start_time" in update_data and update_data["start_time"] != old_data.get("start_time"))
    )

    if date_changed:
        participants = normalized.get("participant_ids") or []
        for pid in participants:
            try:
                trigger_notification(
                    db=db,
                    user_id=pid,
                    notif_type="Calendar",
                    title=f"Activity Rescheduled: {normalized['title']}",
                    message=f"'{normalized['title']}' has been rescheduled to {normalized['start_date']} at {normalized['start_time']}.",
                    target_route="/calendar",
                    priority=normalized.get("priority", "Medium"),
                    icon="⏰"
                )
                if normalized.get("send_whatsapp_reminder"):
                    user_doc = db.collection('users').document(pid).get()
                    if user_doc.exists:
                        udata = user_doc.to_dict()
                        if udata.get("whatsapp_enabled") and udata.get("phone"):
                            msg = f"Activity rescheduled: '{normalized['title']}' has been rescheduled to {normalized['start_date']} at {normalized['start_time']}."
                            WhatsAppService.send_and_record(
                                db=db,
                                sender_id=current_user.id,
                                sender_name=current_user.name,
                                recipient_id=pid,
                                recipient_name=udata.get("name", "Faculty"),
                                recipient_phone=udata.get("phone"),
                                message=msg,
                                message_type="activity_rescheduled"
                            )
            except Exception as e:
                logger.error(f"Notification error on activity reschedule: {e}")

    return normalized

@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Delete an activity and notify participants.
    """
    doc_ref = db.collection('events').document(event_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Activity not found")

    data = doc.to_dict()
    title = data.get("title", "Department Activity")
    start_date = data.get("start_date") or data.get("date") or "scheduled date"
    participants = data.get("participant_ids") or []

    doc_ref.delete()
    logger.info(f"Deleted department activity: {event_id}")

    # Track deletion in Version History if institutional
    if data.get("is_institutional"):
        hist_id = f"hist_{uuid.uuid4().hex[:10]}"
        try:
            db.collection('calendar_history').document(hist_id).set({
                "id": hist_id,
                "event_id": event_id,
                "event_title": title,
                "action_type": "DELETE",
                "field_changed": "status",
                "previous_value": f"Scheduled on {start_date} ({data.get('category')})",
                "updated_value": "Deleted from Official Institutional Calendar",
                "modified_by": current_user.name,
                "modified_by_role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
                "modified_at": datetime.utcnow().isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to record calendar deletion history: {e}")

    # Notify participants of cancellation
    for pid in participants:
        try:
            trigger_notification(
                db=db,
                user_id=pid,
                notif_type="Calendar",
                title=f"Activity Cancelled: {title}",
                message=f"Activity '{title}' scheduled for {start_date} has been cancelled.",
                target_route="/calendar",
                priority="Medium",
                icon="❌"
            )
            if data.get("send_whatsapp_reminder"):
                user_doc = db.collection('users').document(pid).get()
                if user_doc.exists:
                    udata = user_doc.to_dict()
                    if udata.get("whatsapp_enabled") and udata.get("phone"):
                        msg = f"Activity cancelled: '{title}' scheduled for {start_date} has been cancelled."
                        WhatsAppService.send_and_record(
                            db=db,
                            sender_id=current_user.id,
                            sender_name=current_user.name,
                            recipient_id=pid,
                            recipient_name=udata.get("name", "Faculty"),
                            recipient_phone=udata.get("phone"),
                            message=msg,
                            message_type="activity_cancelled"
                        )
        except Exception as e:
            logger.error(f"Notification error on activity cancellation: {e}")

    return None
