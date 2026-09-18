from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from google.cloud.firestore import Client

from app.database.session import get_db
from app.schemas.schemas import (
    EventCreate,
    EventUpdate,
    EventResponse,
    ConflictCheckRequest,
    ConflictCheckResponse,
    ConflictItem
)
from app.auth.permissions import get_current_active_user, check_role
from app.models.models import User, RoleEnum
from app.api.v1.notifications import trigger_notification
from app.services.whatsapp_service import WhatsAppService
from app.utils.logging import logger

router = APIRouter()

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
