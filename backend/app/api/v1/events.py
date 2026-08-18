from typing import List, Optional
from datetime import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import EventCreate, EventUpdate, EventResponse
from app.auth.permissions import get_current_active_user, check_role
from app.models.models import User, RoleEnum

router = APIRouter()

DEFAULT_EVENTS = [
    {
        "id": "evt_1",
        "title": "Final Year Project Review",
        "date": "05 August 2026",
        "type": "Academic",
        "person": "Dr. Animesh Tayal",
        "creator_id": "system",
        "created_at": "2026-08-01T10:00:00Z"
    },
    {
        "id": "evt_2",
        "title": "AI Lab Maintenance",
        "date": "08 August 2026",
        "type": "Department Activity",
        "person": "Mrs. Neha Gurnani",
        "creator_id": "system",
        "created_at": "2026-08-01T10:00:00Z"
    },
    {
        "id": "evt_3",
        "title": "Machine Learning Workshop",
        "date": "15 August 2026",
        "type": "Workshop",
        "person": "Ms. Sweta Arun Bokade",
        "creator_id": "system",
        "created_at": "2026-08-01T10:00:00Z"
    },
    {
        "id": "evt_4",
        "title": "Faculty Meeting",
        "date": "20 August 2026",
        "type": "Meeting",
        "person": "AIML Department Faculty",
        "creator_id": "system",
        "created_at": "2026-08-01T10:00:00Z"
    },
    {
        "id": "evt_5",
        "title": "Student Research Discussion",
        "date": "25 August 2026",
        "type": "Research",
        "person": "Dr. Bhushan Mahendra Manjre",
        "creator_id": "system",
        "created_at": "2026-08-01T10:00:00Z"
    }
]

@router.get("/", response_model=List[EventResponse])
def get_events(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    events_ref = db.collection('events')
    docs = list(events_ref.stream())
    events = []
    if docs:
        for doc in docs:
            events.append(doc.to_dict())
    else:
        events = DEFAULT_EVENTS
    return events

@router.post("/", response_model=EventResponse)
def create_event(
    event: EventCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    event_id = str(uuid.uuid4())
    db_event = event.dict()
    db_event['id'] = event_id
    db_event['creator_id'] = current_user.id
    db_event['created_at'] = datetime.utcnow().isoformat()
    
    db.collection('events').document(event_id).set(db_event)
    return db_event

@router.get("/{event_id}", response_model=EventResponse)
def get_event(
    event_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    doc_ref = db.collection('events').document(event_id)
    doc = doc_ref.get()
    if not doc.exists:
        for e in DEFAULT_EVENTS:
            if e["id"] == event_id:
                return e
        raise HTTPException(status_code=404, detail="Event not found")
    return doc.to_dict()

@router.put("/{event_id}", response_model=EventResponse)
def update_event(
    event_id: str,
    event_update: EventUpdate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    doc_ref = db.collection('events').document(event_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
        
    update_data = {k: v for k, v in event_update.dict(exclude_unset=True).items() if v is not None}
    doc_ref.update(update_data)
    
    return doc_ref.get().to_dict()

@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    doc_ref = db.collection('events').document(event_id)
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    doc_ref.delete()
    return None

