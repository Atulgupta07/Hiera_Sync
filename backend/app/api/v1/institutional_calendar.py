import os
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from google.cloud.firestore import Client

from app.database.session import get_db
from app.auth.permissions import get_current_active_user, check_role
from app.models.models import User, RoleEnum
from app.schemas.schemas import (
    InstitutionalEventItem,
    InstitutionalCalendarUploadResponse,
    InstitutionalCalendarPublishRequest,
    InstitutionalCalendarHistoryItem,
    AICalendarQueryRequest,
    AICalendarQueryResponse,
    EventResponse,
    EventUpdate
)
from app.services.document_parser import parse_document
from app.services.institutional_ai import (
    extract_calendar_from_text,
    query_institutional_calendar,
    categorize_activity
)
from app.utils.logging import logger

router = APIRouter()

UPLOAD_DIR = "./uploads/institutional_calendars"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".txt", ".csv"}

@router.post("/upload", response_model=InstitutionalCalendarUploadResponse)
async def upload_institutional_calendar(
    file: UploadFile = File(...),
    academic_year: Optional[str] = Form("2026-2027"),
    semester: Optional[str] = Form("Odd Semester"),
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Step 1-5 of workflow: HOD/Admin uploads calendar document (PDF/DOCX/XLSX).
    Extracts text, uses AI to analyze and categorize events, and returns draft preview.
    Does NOT publish automatically.
    """
    filename = file.filename or "calendar_document.pdf"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: PDF, DOCX, XLSX, XLS."
        )

    draft_id = f"draft_{uuid.uuid4().hex[:10]}"
    safe_filename = f"{draft_id}_{filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Save uploaded file
    try:
        content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)
    except Exception as e:
        logger.error(f"Failed to save uploaded file {filename}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded calendar document."
        )

    # Parse document text
    try:
        doc_data = parse_document(file_path, filename)
        extracted_text = doc_data.get("text", "")
    except Exception as e:
        logger.error(f"Document parsing error for {filename}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error reading document: {str(e)}"
        )

    # Run AI Calendar Assistant extraction
    try:
        extracted_events = extract_calendar_from_text(extracted_text, filename)
    except Exception as e:
        logger.error(f"AI calendar extraction error for {filename}: {e}")
        extracted_events = []

    # Format event items
    items: List[InstitutionalEventItem] = []
    for idx, ev in enumerate(extracted_events):
        items.append(InstitutionalEventItem(
            id=ev.get("id") or f"item_{idx + 1}",
            title=ev.get("title", "Untitled Activity"),
            date=ev.get("date") or ev.get("start_date") or "",
            start_date=ev.get("start_date") or "",
            end_date=ev.get("end_date") or ev.get("start_date") or "",
            category=ev.get("category") or "Teaching & Learning",
            description=ev.get("description", ""),
            location=ev.get("location", "")
        ))

    # Persist draft preview in Firestore
    draft_record = {
        "id": draft_id,
        "filename": filename,
        "file_path": file_path,
        "file_url": f"/api/v1/files/download/{draft_id}",
        "academic_year": academic_year,
        "semester": semester,
        "total_extracted": len(items),
        "events": [item.dict() for item in items],
        "uploaded_by": current_user.id,
        "uploaded_by_name": current_user.name,
        "uploaded_at": datetime.utcnow().isoformat(),
        "status": "DRAFT_PREVIEW"
    }
    
    try:
        db.collection('institutional_drafts').document(draft_id).set(draft_record)
    except Exception as e:
        logger.error(f"Failed to persist draft preview to Firestore: {e}")

    logger.info(f"Successfully processed calendar document '{filename}' with {len(items)} events (Draft: {draft_id})")

    return InstitutionalCalendarUploadResponse(
        draft_id=draft_id,
        filename=filename,
        file_url=f"/api/v1/files/download/{draft_id}",
        academic_year=academic_year,
        semester=semester,
        total_extracted=len(items),
        events=items,
        message=f"Successfully extracted {len(items)} activities from {filename}. Ready for HOD review."
    )

@router.get("/draft/{draft_id}")
def get_draft_preview(
    draft_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Step 6-7: Retrieve draft preview for HOD verification.
    """
    doc_ref = db.collection('institutional_drafts').document(draft_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Calendar draft preview not found.")
    return doc.to_dict()

@router.post("/publish/{draft_id}")
def publish_institutional_calendar(
    draft_id: str,
    payload: InstitutionalCalendarPublishRequest,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Step 8-10: HOD approves and publishes the verified calendar.
    Saves entries to official events collection with is_institutional=True.
    Logs publication in version history.
    Faculty immediately see the official calendar.
    """
    events_to_publish = payload.events
    if not events_to_publish:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish an empty calendar. Please include at least one verified activity."
        )

    academic_year = payload.academic_year or "2026-2027"
    semester = payload.semester or "Odd Semester"
    now_iso = datetime.utcnow().isoformat()

    # Retrieve existing institutional events to cleanly synchronize/replace old import
    existing_ref = db.collection('events')
    existing_docs = list(existing_ref.where('is_institutional', '==', True).stream())
    existing_ids = [doc.id for doc in existing_docs]
    
    # Batch delete old institutional events if re-publishing a revised calendar
    # so we don't duplicate events across multiple imports
    for old_id in existing_ids:
        try:
            existing_ref.document(old_id).delete()
        except Exception as e:
            logger.warning(f"Error cleaning up previous institutional event {old_id}: {e}")

    published_events = []
    
    for idx, item in enumerate(events_to_publish):
        event_id = f"inst_evt_{uuid.uuid4().hex[:10]}"
        start_date = item.start_date or item.date
        end_date = item.end_date or start_date
        
        event_dict = {
            "id": event_id,
            "title": item.title.strip(),
            "date": item.date or start_date,
            "start_date": start_date,
            "start_time": "09:00 AM",
            "end_date": end_date,
            "end_time": "05:00 PM",
            "category": item.category or "Teaching & Learning",
            "type": item.category or "Teaching & Learning",
            "person": "Institutional / Department",
            "organizer_id": current_user.id,
            "organizer_name": current_user.name,
            "participant_ids": [],
            "participant_names": ["All Faculty", "All Students"],
            "location": item.location or "Campus / SBJIT",
            "description": item.description or f"Official {item.category} activity.",
            "priority": "High" if item.category in ["Examination", "Internal Assessment"] else "Medium",
            "status": "UPCOMING",
            "recurrence": "Does not repeat",
            "meeting_link": None,
            "notes": f"Published under Institutional Academic Calendar ({academic_year}, {semester})",
            "send_whatsapp_reminder": False,
            "reminder_timing": "1 day before",
            "is_institutional": True,
            "academic_year": academic_year,
            "semester": semester,
            "approved_by": current_user.id,
            "approved_by_name": current_user.name,
            "published_at": now_iso,
            "source": "INSTITUTIONAL_CALENDAR",
            "creator_id": current_user.id,
            "created_at": now_iso,
            "updated_at": now_iso
        }
        
        # Persist to events collection
        db.collection('events').document(event_id).set(event_dict)
        published_events.append(event_dict)

    # Update draft status
    try:
        db.collection('institutional_drafts').document(draft_id).update({
            "status": "PUBLISHED",
            "published_at": now_iso,
            "published_by": current_user.id,
            "published_count": len(published_events)
        })
    except Exception:
        pass

    # Log in Calendar Version History
    history_id = f"hist_{uuid.uuid4().hex[:10]}"
    history_entry = {
        "id": history_id,
        "event_id": None,
        "event_title": f"Institutional Academic Calendar ({academic_year} - {semester})",
        "action_type": "PUBLISH",
        "field_changed": "status",
        "previous_value": "Draft Preview / Unverified",
        "updated_value": f"Officially Approved & Published ({len(published_events)} activities)",
        "modified_by": current_user.name,
        "modified_by_role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        "modified_at": now_iso
    }
    try:
        db.collection('calendar_history').document(history_id).set(history_entry)
    except Exception as e:
        logger.error(f"Failed to record publication history: {e}")

    logger.info(f"Published {len(published_events)} official institutional calendar activities by {current_user.name}")

    return {
        "message": f"Successfully approved and published {len(published_events)} official institutional activities.",
        "academic_year": academic_year,
        "semester": semester,
        "published_count": len(published_events),
        "events": published_events
    }

@router.get("/official", response_model=List[EventResponse])
def get_official_institutional_calendar(
    category: Optional[str] = None,
    month: Optional[str] = None,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Read-only endpoint for Faculty and HOD to view approved institutional events.
    """
    events_ref = db.collection('events')
    docs = list(events_ref.where('is_institutional', '==', True).stream())
    
    events = []
    for doc in docs:
        evt = doc.to_dict()
        
        # Category filter
        if category and category != "All":
            e_cat = (evt.get("category") or evt.get("type") or "").lower()
            if e_cat != category.lower():
                continue
                
        # Month filter
        if month:
            s_date = evt.get("start_date") or evt.get("date") or ""
            if month not in s_date:
                continue
                
        events.append(evt)
        
    events.sort(key=lambda x: (x.get("start_date") or x.get("date") or "", x.get("start_time") or ""))
    return events

@router.put("/event/{event_id}", response_model=EventResponse)
def update_institutional_event(
    event_id: str,
    event_update: EventUpdate,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    HOD modifies an official calendar entry after publishing.
    Enforces automatic synchronization: updates database, logs in version history.
    Faculty immediately see the updated calendar.
    """
    doc_ref = db.collection('events').document(event_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Calendar activity not found.")

    old_data = doc.to_dict()
    update_dict = {k: v for k, v in event_update.dict(exclude_unset=True).items() if v is not None}
    
    # Sync legacy date field if start_date changed
    if "start_date" in update_dict:
        update_dict["date"] = update_dict["start_date"]
    if "category" in update_dict:
        update_dict["type"] = update_dict["category"]

    update_dict["updated_at"] = datetime.utcnow().isoformat()
    now_iso = datetime.utcnow().isoformat()

    # Track modified fields for version history
    changed_fields = []
    previous_values = []
    updated_values = []

    for k, new_v in update_dict.items():
        if k in ["updated_at", "date", "type"]:
            continue
        old_v = old_data.get(k)
        if old_v != new_v:
            changed_fields.append(k)
            previous_values.append(f"{k}: {old_v}")
            updated_values.append(f"{k}: {new_v}")

    # Update document in Firestore
    doc_ref.update(update_dict)
    updated_doc = doc_ref.get().to_dict()

    # Record Version History if changes were made
    if changed_fields:
        history_id = f"hist_{uuid.uuid4().hex[:10]}"
        history_entry = {
            "id": history_id,
            "event_id": event_id,
            "event_title": updated_doc.get("title", old_data.get("title", "Department Activity")),
            "action_type": "UPDATE",
            "field_changed": ", ".join(changed_fields),
            "previous_value": "; ".join(previous_values),
            "updated_value": "; ".join(updated_values),
            "modified_by": current_user.name,
            "modified_by_role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
            "modified_at": now_iso
        }
        try:
            db.collection('calendar_history').document(history_id).set(history_entry)
        except Exception as e:
            logger.error(f"Failed to record calendar history update: {e}")

    logger.info(f"HOD {current_user.name} modified institutional activity {event_id}: {changed_fields}")
    return updated_doc

@router.delete("/event/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_institutional_event(
    event_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    HOD deletes an official calendar entry. Records in version history.
    """
    doc_ref = db.collection('events').document(event_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Calendar activity not found.")

    old_data = doc.to_dict()
    doc_ref.delete()
    
    # Record deletion in Version History
    history_id = f"hist_{uuid.uuid4().hex[:10]}"
    history_entry = {
        "id": history_id,
        "event_id": event_id,
        "event_title": old_data.get("title", "Institutional Activity"),
        "action_type": "DELETE",
        "field_changed": "status",
        "previous_value": f"Scheduled on {old_data.get('start_date') or old_data.get('date')} ({old_data.get('category')})",
        "updated_value": "Deleted from Official Institutional Calendar",
        "modified_by": current_user.name,
        "modified_by_role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        "modified_at": datetime.utcnow().isoformat()
    }
    try:
        db.collection('calendar_history').document(history_id).set(history_entry)
    except Exception as e:
        logger.error(f"Failed to record calendar deletion history: {e}")

    return None

@router.get("/history", response_model=List[InstitutionalCalendarHistoryItem])
def get_calendar_version_history(
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Returns full version history / audit trail of institutional calendar modifications.
    """
    try:
        hist_ref = db.collection('calendar_history')
        docs = list(hist_ref.stream())
        history = [doc.to_dict() for doc in docs]
        history.sort(key=lambda x: x.get("modified_at", ""), reverse=True)
        return history
    except Exception as e:
        logger.error(f"Error fetching calendar history: {e}")
        return []

@router.post("/ai-query", response_model=AICalendarQueryResponse)
def query_calendar_assistant(
    payload: AICalendarQueryRequest,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    AI Calendar Assistant connected to approved institutional calendar data.
    Answers natural calendar questions using strictly stored data.
    Never hallucinates missing events.
    """
    if not payload.question or not payload.question.strip():
        raise HTTPException(status_code=400, detail="Please provide a valid calendar question.")

    result = query_institutional_calendar(db, current_user, payload.question)
    return AICalendarQueryResponse(
        question=result.get("question", payload.question),
        answer=result.get("answer", "The requested information is not available in the institutional calendar."),
        sources_count=result.get("sources_count", 0)
    )
