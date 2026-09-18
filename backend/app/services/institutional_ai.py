import os
import re
import json
import urllib.request
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from google.cloud.firestore import Client
from app.config.settings import settings
from app.models.models import User
from app.utils.logging import logger

INSTITUTIONAL_CATEGORIES = [
    "Teaching & Learning",
    "Examination",
    "Internal Assessment",
    "Workshop",
    "Seminar",
    "Meeting",
    "Holiday",
    "Faculty Development",
    "Student Activity",
    "Academic Deadline",
    "Events"
]

CATEGORY_KEYWORDS = {
    "Internal Assessment": [
        "internal assessment", "sessional", "mst", "cie", "midterm", "mid-term",
        "unit test", "class test", "internal exam", "continuous assessment"
    ],
    "Examination": [
        "examination", "end sem", "final exam", "university exam", "practical exam",
        "oral exam", "viva", "re-exam", "backlog exam", "external exam", "theory exam"
    ],
    "Teaching & Learning": [
        "commencement of classes", "instruction", "syllabus", "course commencement",
        "academic session", "curriculum review", "attendance review", "academic audit",
        "teaching", "class start", "lecture commencement"
    ],
    "Faculty Development": [
        "faculty development", "fdp", "pedagogy", "sttp", "teacher training",
        "faculty orientation", "staff development", "capacity building"
    ],
    "Workshop": [
        "workshop", "hands-on", "bootcamp", "technical training", "hackathon training"
    ],
    "Seminar": [
        "seminar", "webinar", "expert talk", "guest lecture", "symposium",
        "keynote", "panel discussion", "colloquium", "invited lecture"
    ],
    "Meeting": [
        "meeting", "pac", "dac", "board of studies", "bos", "iqac", "council",
        "department meeting", "faculty meeting", "review meeting", "committee meeting"
    ],
    "Holiday": [
        "holiday", "vacation", "diwali", "republic day", "independence day",
        "gandhi jayanti", "christmas", "eid", "recess", "break", "mid term break",
        "winter break", "summer vacation"
    ],
    "Student Activity": [
        "induction", "orientation", "sports", "cultural", "fest", "tech fest",
        "student club", "hackathon", "annual day", "alumni meet", "freshers"
    ],
    "Academic Deadline": [
        "deadline", "submission", "last date", "due date", "cutoff", "fee payment",
        "registration last date", "project submission", "synopsis submission", "mark entry"
    ]
}

def categorize_activity(title: str, description: str = "") -> str:
    """Classifies an activity into one of the official institutional categories."""
    combined = f"{title} {description}".lower()
    
    # Priority check for Internal Assessment first to prevent generic "Examination" clash
    for kw in CATEGORY_KEYWORDS["Internal Assessment"]:
        if kw in combined:
            return "Internal Assessment"
            
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in combined:
                return cat
                
    return "Events"

def _detect_academic_year(text: str) -> int:
    """Tries to detect academic year from text (e.g. 2026-2027), otherwise returns current year."""
    match = re.search(r'\b(202\d)\s*[-/–]\s*(202\d|\d{2})\b', text)
    if match:
        return int(match.group(1))
    # Or single 4 digit year
    year_match = re.search(r'\b(202\d)\b', text)
    if year_match:
        return int(year_match.group(1))
    return datetime.utcnow().year

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12
}

def extract_calendar_from_text(text: str, filename: str) -> List[Dict[str, Any]]:
    """
    Extracts date-wise activities from text using Gemini if available,
    or falls back to a rule-based extraction engine.
    """
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    is_placeholder = not api_key or "your_key_here" in api_key.lower() or "your_gemini_api_key" in api_key.lower()

    if not is_placeholder:
        try:
            gemini_events = _extract_with_gemini(text, api_key)
            if gemini_events and len(gemini_events) > 0:
                logger.info(f"Gemini extracted {len(gemini_events)} calendar events from {filename}")
                return gemini_events
        except Exception as e:
            logger.error(f"Gemini calendar extraction failed: {e}. Running rule-based extractor.")

    # Fallback rule-based extractor
    fallback_events = _extract_rule_based(text)
    logger.info(f"Rule-based extracted {len(fallback_events)} calendar events from {filename}")
    return fallback_events

def _extract_with_gemini(text: str, api_key: str) -> List[Dict[str, Any]]:
    """Calls Gemini with strict schema instructions to extract academic calendar entries."""
    prompt = f"""
You are an expert academic calendar analyzer for an educational institution.
Analyze the following academic calendar document and extract all date-wise institutional activities and academic events.

CRITICAL EXTRACTION RULES:
1. Extract every distinct event, activity, examination, internal assessment, meeting, holiday, workshop, seminar, faculty development, or academic deadline.
2. For each event, determine:
   - "title": Clear and concise activity or event name.
   - "date": Date as a formatted string (e.g. "15 September 2026").
   - "start_date": ISO date "YYYY-MM-DD". If year is omitted in document, infer from context or use 2026.
   - "end_date": ISO date "YYYY-MM-DD" if it is a multi-day event/range, otherwise same as start_date.
   - "category": MUST be strictly one of:
     ["Teaching & Learning", "Examination", "Internal Assessment", "Workshop", "Seminar", "Meeting", "Holiday", "Faculty Development", "Student Activity", "Academic Deadline", "Events"]
   - "description": Detailed description, context, or notes provided in the document.
   - "location": Location or venue if mentioned (e.g. "Seminar Hall", "Campus", "Online"), or "" if not specified.
3. DO NOT invent or fabricate any dates or events that do not exist in the document text.
4. Output ONLY a valid, raw JSON array of objects. Do not include markdown code block formatting or backticks.

DOCUMENT CONTENT:
\"\"\"{text[:16000]}\"\"\"
"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    data = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    response = urllib.request.urlopen(req, timeout=30)
    result = json.loads(response.read().decode('utf-8'))
    raw_output = result['candidates'][0]['content']['parts'][0]['text']
    
    # Strip any potential markdown wrappers
    clean_json = raw_output.strip()
    if clean_json.startswith("```"):
        clean_json = re.sub(r"^```(?:json)?", "", clean_json)
        clean_json = re.sub(r"```$", "", clean_json).strip()
        
    events = json.loads(clean_json)
    if isinstance(events, list):
        validated = []
        for idx, ev in enumerate(events):
            if not isinstance(ev, dict) or not ev.get("title"):
                continue
            cat = ev.get("category", "")
            if cat not in INSTITUTIONAL_CATEGORIES:
                cat = categorize_activity(ev.get("title", ""), ev.get("description", ""))
            
            validated.append({
                "id": f"draft_{idx + 1}",
                "title": ev.get("title", "").strip(),
                "date": ev.get("date") or ev.get("start_date") or "",
                "start_date": ev.get("start_date") or "",
                "end_date": ev.get("end_date") or ev.get("start_date") or "",
                "category": cat,
                "description": ev.get("description", "").strip(),
                "location": ev.get("location", "").strip()
            })
        return validated
    return []

def _extract_rule_based(text: str) -> List[Dict[str, Any]]:
    """Rule-based pattern extractor for dates and activities in academic calendars."""
    events = []
    academic_year = _detect_academic_year(text)
    
    # Split text by lines
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    
    # Common date regex patterns
    # Pattern 1: Table row with pipe "15/09/2026 | Faculty Development Programme | Remarks"
    # Pattern 2: "15 September — Faculty Development Programme" or "15 Sep: Event"
    # Pattern 3: "10-14 October 2026: Mid-term Assessment"
    # Pattern 4: "2026-09-15 - Event"
    
    date_range_pattern = re.compile(
        r'(?:^|[|\s])(\d{1,2})\s*(?:[-–to]+)\s*(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?',
        re.IGNORECASE
    )
    single_date_name_pattern = re.compile(
        r'(?:^|[|\s])(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?',
        re.IGNORECASE
    )
    iso_or_numeric_pattern = re.compile(
        r'(?:^|[|\s])(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})',
        re.IGNORECASE
    )
    
    event_idx = 1
    seen_keys = set()
    
    for line in lines:
        if len(line) < 5 or line.startswith("---") or line.startswith("==="):
            continue
            
        start_date_str = ""
        end_date_str = ""
        display_date = ""
        activity_title = ""
        desc = ""
        
        # Check table pipe separation first
        if "|" in line:
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if len(parts) >= 2:
                # One of parts could be date
                date_part = ""
                text_parts = []
                for p in parts:
                    if not date_part and (re.search(r'\d{1,2}', p) and any(m in p.lower() for m in MONTH_MAP.keys())):
                        date_part = p
                    elif not date_part and re.search(r'\d{1,2}[-/]\d{1,2}', p):
                        date_part = p
                    else:
                        text_parts.append(p)
                        
                if date_part and text_parts:
                    activity_title = text_parts[0]
                    desc = " | ".join(text_parts[1:]) if len(text_parts) > 1 else ""
                    # Parse date_part
                    s_dt, e_dt, disp = _parse_date_string(date_part, academic_year)
                    if s_dt:
                        start_date_str = s_dt
                        end_date_str = e_dt or s_dt
                        display_date = disp or date_part
        
        # If not matched via table pipe, test delimiters like " - ", " : ", " — ", " – "
        if not activity_title:
            delims = [" — ", " – ", " - ", " : ", ": ", "\t"]
            for d in delims:
                if d in line:
                    left, right = line.split(d, 1)
                    left, right = left.strip(), right.strip()
                    # Check if left is date
                    s_dt, e_dt, disp = _parse_date_string(left, academic_year)
                    if s_dt and right:
                        start_date_str = s_dt
                        end_date_str = e_dt or s_dt
                        display_date = disp or left
                        activity_title = right
                        break
                    # Check if right is date and left is activity
                    s_dt, e_dt, disp = _parse_date_string(right, academic_year)
                    if s_dt and left:
                        start_date_str = s_dt
                        end_date_str = e_dt or s_dt
                        display_date = disp or right
                        activity_title = left
                        break
                        
        # If still not matched, check if line starts with a date
        if not activity_title:
            m_range = date_range_pattern.search(line)
            if m_range:
                d1, d2, month_str, yr = m_range.groups()
                month_num = MONTH_MAP.get(month_str.lower()[:3])
                if month_num:
                    year = int(yr) if yr else academic_year
                    start_date_str = f"{year:04d}-{month_num:02d}-{int(d1):02d}"
                    end_date_str = f"{year:04d}-{month_num:02d}-{int(d2):02d}"
                    display_date = f"{d1}-{d2} {month_str.title()} {year}"
                    activity_title = line[m_range.end():].strip(" -:—–|")
            else:
                m_single = single_date_name_pattern.search(line)
                if m_single:
                    d, month_str, yr = m_single.groups()
                    month_num = MONTH_MAP.get(month_str.lower()[:3])
                    if month_num:
                        year = int(yr) if yr else academic_year
                        start_date_str = f"{year:04d}-{month_num:02d}-{int(d):02d}"
                        end_date_str = start_date_str
                        display_date = f"{d} {month_str.title()} {year}"
                        activity_title = line[m_single.end():].strip(" -:—–|")
                else:
                    m_num = iso_or_numeric_pattern.search(line)
                    if m_num:
                        raw_date = m_num.group(1)
                        s_dt, e_dt, disp = _parse_numeric_date(raw_date, academic_year)
                        if s_dt:
                            start_date_str = s_dt
                            end_date_str = e_dt or s_dt
                            display_date = disp
                            activity_title = line[m_num.end():].strip(" -:—–|")

        # Clean title
        if activity_title:
            activity_title = re.sub(r'^(date|event|activity|sr\.?\s*no\.?)\s*[:|–-]\s*', '', activity_title, flags=re.IGNORECASE).strip()
            # If title has additional notes separated by parenthetical or dash
            if "(" in activity_title and ")" in activity_title and not desc:
                sub_match = re.search(r'\((.*?)\)', activity_title)
                if sub_match:
                    desc = sub_match.group(1)
                    
            if len(activity_title) >= 3 and start_date_str:
                dedup_key = f"{start_date_str}_{activity_title.lower()}"
                if dedup_key not in seen_keys:
                    seen_keys.add(dedup_key)
                    category = categorize_activity(activity_title, desc)
                    events.append({
                        "id": f"draft_{event_idx}",
                        "title": activity_title,
                        "date": display_date or start_date_str,
                        "start_date": start_date_str,
                        "end_date": end_date_str or start_date_str,
                        "category": category,
                        "description": desc or f"Institutional {category} activity scheduled for {display_date or start_date_str}.",
                        "location": ""
                    })
                    event_idx += 1

    return events

def _parse_date_string(date_str: str, default_year: int) -> tuple[Optional[str], Optional[str], str]:
    """Helper to parse varied date representations into (start_date, end_date, display_date)."""
    clean = date_str.strip()
    # Check range like "10-14 Oct", "10 to 14 October", or "10 October to 14 October"
    m_range = re.search(r'(\d{1,2})\s*(?:[A-Za-z]+)?\s*(?:[-–to]+)\s*(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?', clean, re.IGNORECASE)
    if m_range:
        d1, d2, month_str, yr = m_range.groups()
        m_num = MONTH_MAP.get(month_str.lower()[:3])
        if m_num:
            year = int(yr) if yr else default_year
            s_dt = f"{year:04d}-{m_num:02d}-{int(d1):02d}"
            e_dt = f"{year:04d}-{m_num:02d}-{int(d2):02d}"
            disp = f"{d1}-{d2} {month_str.title()} {year}"
            return s_dt, e_dt, disp
            
    # Single month name date "15 September 2026" or "15th Sept"
    m_single = re.search(r'(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?', clean, re.IGNORECASE)
    if m_single:
        d, month_str, yr = m_single.groups()
        m_num = MONTH_MAP.get(month_str.lower()[:3])
        if m_num:
            year = int(yr) if yr else default_year
            s_dt = f"{year:04d}-{m_num:02d}-{int(d):02d}"
            disp = f"{d} {month_str.title()} {year}"
            return s_dt, s_dt, disp

    # Numeric formats
    return _parse_numeric_date(clean, default_year)

def _parse_numeric_date(raw_date: str, default_year: int) -> tuple[Optional[str], Optional[str], str]:
    clean = re.sub(r'[^\d/-]', '', raw_date)
    formats = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"]
    for fmt in formats:
        try:
            dt = datetime.strptime(clean, fmt)
            iso = dt.strftime("%Y-%m-%d")
            disp = dt.strftime("%d %B %Y")
            return iso, iso, disp
        except ValueError:
            pass
            
    # Two-digit year: 15/09/26
    for fmt in ["%d-%m-%y", "%d/%m/%y"]:
        try:
            dt = datetime.strptime(clean, fmt)
            iso = dt.strftime("%Y-%m-%d")
            disp = dt.strftime("%d %B %Y")
            return iso, iso, disp
        except ValueError:
            pass
            
    return None, None, raw_date


# =========================================================================
# AI CALENDAR ASSISTANT (STRICT APPROVED DATABASE RETRIEVAL)
# =========================================================================

def get_approved_institutional_events(db: Client) -> List[Dict[str, Any]]:
    """Retrieves all official approved institutional calendar events from Firestore."""
    try:
        events_ref = db.collection('events')
        docs = list(events_ref.stream())
        approved = []
        for doc in docs:
            data = doc.to_dict()
            # Match institutional events
            if data.get("is_institutional") or data.get("source") == "INSTITUTIONAL_CALENDAR" or data.get("approved_by"):
                approved.append(data)
                
        # If no explicit institutional flag found in DB, include all department events
        if not approved:
            approved = [doc.to_dict() for doc in docs]
            
        approved.sort(key=lambda x: (x.get("start_date") or x.get("date") or "", x.get("start_time") or ""))
        return approved
    except Exception as e:
        logger.error(f"Error retrieving approved institutional events: {e}")
        return []

def query_institutional_calendar(db: Client, current_user: User, question: str) -> Dict[str, Any]:
    """
    Answers user queries grounded strictly in the official approved institutional calendar.
    Never invents events or dates. If not found, explicitly states so.
    """
    approved_events = get_approved_institutional_events(db)
    q = question.strip()
    
    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    is_placeholder = not api_key or "your_key_here" in api_key.lower() or "your_gemini_api_key" in api_key.lower()
    
    if not is_placeholder and approved_events:
        try:
            gemini_answer = _query_calendar_with_gemini(q, approved_events, current_user, api_key)
            if gemini_answer:
                return {
                    "question": q,
                    "answer": gemini_answer,
                    "sources_count": len(approved_events)
                }
        except Exception as e:
            logger.error(f"Gemini calendar query error: {e}. Executing local context search.")
            
    # Local fallback query processor
    local_answer = _query_calendar_local_engine(q, approved_events)
    return {
        "question": q,
        "answer": local_answer,
        "sources_count": len(approved_events)
    }

def _query_calendar_with_gemini(question: str, events: List[Dict[str, Any]], current_user: User, api_key: str) -> str:
    """Invokes Gemini with strictly grounded prompt to prevent hallucination."""
    events_json = json.dumps([
        {
            "title": e.get("title"),
            "date": e.get("date") or e.get("start_date"),
            "start_date": e.get("start_date"),
            "end_date": e.get("end_date"),
            "category": e.get("category") or e.get("type"),
            "description": e.get("description"),
            "location": e.get("location")
        }
        for e in events
    ], indent=2)
    
    system_prompt = (
        "You are the official HiéraSync Institutional Calendar AI Assistant for SBJIT Nagpur (CSE AIML Dept).\n"
        "You answer user questions strictly based on the approved institutional calendar entries provided below.\n\n"
        "STRICT INSTRUCTIONS:\n"
        "1. Retrieve and report information ONLY from the provided APPROVED INSTITUTIONAL CALENDAR DATA.\n"
        "2. DO NOT invent, hallucinate, assume, or extrapolate any events, activities, dates, or deadlines.\n"
        "3. If the user asks about an event, activity, category, or date that does NOT appear in the approved calendar data, "
        "you MUST state clearly: 'The requested information is not available in the institutional calendar.'\n"
        "4. Format your answer nicely in GitHub-flavored Markdown with clear headings, bullet points, dates, and categories.\n\n"
        f"APPROVED INSTITUTIONAL CALENDAR DATA ({len(events)} events):\n"
        f"{events_json}\n\n"
        f"Today's Reference Date: {datetime.utcnow().strftime('%Y-%m-%d')} ({datetime.utcnow().strftime('%A, %d %B %Y')})\n"
    )
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    data = {
        "contents": [
            {
                "parts": [
                    {"text": system_prompt},
                    {"text": f"User Query: {question}"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    response = urllib.request.urlopen(req, timeout=15)
    result = json.loads(response.read().decode('utf-8'))
    return result['candidates'][0]['content']['parts'][0]['text'].strip()

def _query_calendar_local_engine(question: str, events: List[Dict[str, Any]]) -> str:
    """Accurately processes natural calendar questions against approved data without hallucinating."""
    if not events:
        return "### 📅 Official Institutional Academic Calendar\n\nNo official institutional activities are currently approved or published in the calendar."
        
    q = question.lower()
    now = datetime.utcnow()
    today_str = now.strftime("%Y-%m-%d")
    
    # 1. "tomorrow"
    if "tomorrow" in q:
        tomorrow_str = (now + timedelta(days=1)).strftime("%Y-%m-%d")
        matched = [e for e in events if e.get("start_date") == tomorrow_str or tomorrow_str in (e.get("date") or "")]
        if not matched:
            return f"### 📅 Activities for Tomorrow ({(now + timedelta(days=1)).strftime('%d %B %Y')})\n\nThere are no institutional activities scheduled for tomorrow in the approved calendar."
        return _format_event_list("Activities Scheduled for Tomorrow", matched)
        
    # 2. Specific date check e.g. "15 october", "15th october", "2026-10-15"
    date_match = re.search(r'\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\b', q)
    if date_match:
        day_val = int(date_match.group(1))
        month_str = date_match.group(2).lower()
        if month_str in MONTH_MAP:
            month_num = MONTH_MAP[month_str]
            matched = []
            for e in events:
                e_date = e.get("start_date") or e.get("date") or ""
                # Check YYYY-MM-DD
                if f"-{month_num:02d}-{day_val:02d}" in e_date:
                    matched.append(e)
                elif f"{day_val} {month_str}" in e_date.lower():
                    matched.append(e)
            if not matched:
                return f"### 📅 Institutional Calendar: {day_val} {month_str.title()}\n\nNo activities or events are scheduled on **{day_val} {month_str.title()}** in the approved institutional calendar."
            return _format_event_list(f"Activities Scheduled on {day_val} {month_str.title()}", matched)

    # 3. Specific month check e.g. "in september", "in october", "september"
    for m_name, m_num in MONTH_MAP.items():
        if f"in {m_name}" in q or f"{m_name} activities" in q or f"{m_name} events" in q:
            matched = [
                e for e in events 
                if f"-{m_num:02d}-" in (e.get("start_date") or "") or m_name in (e.get("date") or "").lower()
            ]
            # Check if filtered by category also e.g. "teaching and learning activities in september"
            cat_filter = _get_category_filter(q)
            if cat_filter:
                matched = [e for e in matched if (e.get("category") or e.get("type") or "").lower() == cat_filter.lower()]
                if not matched:
                    return f"### 📅 {cat_filter} Activities in {m_name.title()}\n\nNo {cat_filter.lower()} activities are scheduled in **{m_name.title()}** in the approved institutional calendar."
                return _format_event_list(f"{cat_filter} Activities in {m_name.title()}", matched)
                
            if not matched:
                return f"### 📅 Institutional Calendar: {m_name.title()}\n\nNo institutional activities are scheduled in **{m_name.title()}** in the approved calendar."
            return _format_event_list(f"Institutional Activities in {m_name.title()}", matched)

    # 4. "this week"
    if "this week" in q:
        start_of_week = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        end_of_week = (now + timedelta(days=(6 - now.weekday()))).strftime("%Y-%m-%d")
        matched = [
            e for e in events 
            if (e.get("start_date") or "") >= start_of_week and (e.get("start_date") or "") <= end_of_week
        ]
        if not matched:
            return f"### 📅 Activities Scheduled This Week\n\nNo activities are scheduled for this week in the approved institutional calendar."
        return _format_event_list("Institutional Activities Scheduled This Week", matched)

    # 5. "next week"
    if "next week" in q:
        start_next = (now + timedelta(days=(7 - now.weekday()))).strftime("%Y-%m-%d")
        end_next = (now + timedelta(days=(13 - now.weekday()))).strftime("%Y-%m-%d")
        matched = [
            e for e in events 
            if (e.get("start_date") or "") >= start_next and (e.get("start_date") or "") <= end_next
        ]
        if not matched:
            return f"### 📅 Activities Scheduled Next Week\n\nNo activities are scheduled for next week in the approved institutional calendar."
        return _format_event_list("Institutional Activities Scheduled Next Week", matched)

    # 6. "this month"
    if "this month" in q:
        current_month_prefix = now.strftime("%Y-%m")
        matched = [
            e for e in events 
            if (e.get("start_date") or "").startswith(current_month_prefix)
        ]
        if not matched:
            return f"### 📅 Activities Scheduled This Month ({now.strftime('%B %Y')})\n\nNo activities are scheduled for this month in the approved institutional calendar."
        return _format_event_list(f"Activities Scheduled This Month ({now.strftime('%B %Y')})", matched)

    # 7. Category queries
    cat_filter = _get_category_filter(q)
    if cat_filter:
        matched = [
            e for e in events 
            if (e.get("category") or e.get("type") or "").lower() == cat_filter.lower()
        ]
        if not matched:
            return f"### 📅 Institutional Calendar: {cat_filter}\n\nNo **{cat_filter}** activities are listed in the approved institutional calendar."
        return _format_event_list(f"Approved {cat_filter} Activities", matched)

    # 8. Upcoming institutional activities
    if any(k in q for k in ["upcoming", "next", "schedule", "events", "activities"]):
        future_events = [
            e for e in events 
            if (e.get("start_date") or e.get("date") or "") >= today_str
        ]
        target_list = future_events[:8] if future_events else events[:8]
        if not target_list:
            return "### 📅 Upcoming Institutional Activities\n\nThere are currently no upcoming activities in the approved institutional calendar."
        return _format_event_list("Upcoming Institutional Activities", target_list)

    # General fallback
    return (
        f"### 🏛️ HiéraSync Institutional Academic Calendar\n\n"
        f"The official institutional calendar contains **{len(events)}** approved activities across the semester.\n\n"
        f"You can ask specific questions like:\n"
        f"* *What activities are scheduled this week?*\n"
        f"* *Show all teaching and learning activities in September.*\n"
        f"* *What events are scheduled on 15 October?*\n"
        f"* *When is the next internal assessment?*\n"
        f"* *List all faculty development activities this semester.*\n"
        f"* *Show upcoming academic deadlines.*"
    )

def _get_category_filter(query: str) -> Optional[str]:
    """Extracts official category name from query string."""
    q = query.lower()
    if "internal assessment" in q or "sessional" in q or "cie" in q or "midterm" in q:
        return "Internal Assessment"
    if "teaching" in q and "learning" in q:
        return "Teaching & Learning"
    if "faculty development" in q or "fdp" in q:
        return "Faculty Development"
    if "examination" in q or "exam" in q or "end sem" in q:
        return "Examination"
    if "workshop" in q:
        return "Workshop"
    if "seminar" in q or "webinar" in q or "expert talk" in q:
        return "Seminar"
    if "meeting" in q:
        return "Meeting"
    if "holiday" in q or "vacation" in q:
        return "Holiday"
    if "student activit" in q or "club" in q or "sports" in q or "fest" in q:
        return "Student Activity"
    if "deadline" in q or "due date" in q or "submission" in q:
        return "Academic Deadline"
    return None

def _format_event_list(heading: str, events: List[Dict[str, Any]]) -> str:
    msg = f"### 📅 {heading} ({len(events)})\n\n"
    for e in events:
        title = e.get("title", "Untitled Activity")
        date_display = e.get("date") or e.get("start_date") or "TBA"
        cat = e.get("category") or e.get("type") or "Academic"
        desc = e.get("description", "").strip()
        loc = e.get("location", "").strip()
        
        msg += f"* **{title}**\n"
        msg += f"  * **Date**: `{date_display}` | **Category**: `{cat}`\n"
        if loc:
            msg += f"  * **Location**: {loc}\n"
        if desc:
            msg += f"  * **Details**: {desc}\n"
        msg += "\n"
    return msg
