from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import Client
from typing import List, Optional
import uuid
from datetime import datetime
from app.database.session import get_db
from app.schemas.schemas import JoinRequestCreate, JoinRequestResponse
from app.auth.permissions import get_current_active_user, get_current_user
from app.models.models import User, RoleEnum
from google.cloud.firestore_v1.base_query import FieldFilter

router = APIRouter()

def send_notification(db: Client, user_id: str, title: str, message: str, notification_type: str = "SYSTEM_ALERT"):
    notif_id = str(uuid.uuid4())
    db.collection('notifications').document(notif_id).set({
        "id": notif_id,
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notification_type,
        "is_read": False,
        "created_at": datetime.utcnow().isoformat()
    })

@router.post("/request", response_model=JoinRequestResponse)
def submit_join_request(
    req_in: JoinRequestCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD]:
        raise HTTPException(status_code=400, detail="Admins cannot submit join requests")

    # Find the department by code
    departments_ref = db.collection('departments')
    dept_query = departments_ref.where(filter=FieldFilter('code', '==', req_in.code.upper())).stream()
    dept_docs = list(dept_query)
    
    if not dept_docs:
        raise HTTPException(status_code=404, detail="Invalid department code")
    
    dept_data = dept_docs[0].to_dict()

    if current_user.department_id == dept_data['id']:
        raise HTTPException(status_code=400, detail="You are already in this department")

    # Check for existing pending request
    requests_ref = db.collection('join_requests')
    existing_query = requests_ref.where(filter=FieldFilter('faculty_id', '==', current_user.id)).where(filter=FieldFilter('status', '==', 'Pending')).stream()
    if list(existing_query):
        raise HTTPException(status_code=400, detail="You already have a pending join request")

    req_id = str(uuid.uuid4())
    req_data = {
        "id": req_id,
        "faculty_id": current_user.id,
        "faculty_name": current_user.name,
        "faculty_email": current_user.email,
        "department_id": dept_data['id'],
        "department_code": req_in.code.upper(),
        "status": "Pending",
        "requested_at": datetime.utcnow().isoformat()
    }
    
    requests_ref.document(req_id).set(req_data)

    # Notify admin
    send_notification(db, dept_data['hod_id'], "New Join Request", f"{current_user.name} has requested to join your department.", "SYSTEM_ALERT")

    return req_data

@router.get("/status", response_model=Optional[JoinRequestResponse])
def get_request_status(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    requests_ref = db.collection('join_requests')
    # Get the most recent request
    query = requests_ref.where(filter=FieldFilter('faculty_id', '==', current_user.id)).stream()
    docs = list(query)
    if not docs:
        return None
    
    # Sort by requested_at descending
    docs.sort(key=lambda x: x.to_dict().get('requested_at', ''), reverse=True)
    return docs[0].to_dict()

def get_department_requests(db: Client, current_user: User, status_filter: str):
    if current_user.role not in [RoleEnum.ADMIN, RoleEnum.HOD]:
        raise HTTPException(status_code=403, detail="Not authorized")

    departments_ref = db.collection('departments')
    dept_query = departments_ref.where(filter=FieldFilter('hod_id', '==', current_user.id)).stream()
    dept_docs = list(dept_query)
    if not dept_docs:
        return []
    
    dept_id = dept_docs[0].to_dict()['id']
    
    requests_ref = db.collection('join_requests')
    req_query = requests_ref.where(filter=FieldFilter('department_id', '==', dept_id)).where(filter=FieldFilter('status', '==', status_filter)).stream()
    
    return [doc.to_dict() for doc in req_query]

@router.get("/pending", response_model=List[JoinRequestResponse])
def get_pending_requests(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return get_department_requests(db, current_user, "Pending")

@router.get("/approved", response_model=List[JoinRequestResponse])
def get_approved_requests(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return get_department_requests(db, current_user, "Approved")

@router.get("/rejected", response_model=List[JoinRequestResponse])
def get_rejected_requests(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return get_department_requests(db, current_user, "Rejected")

@router.put("/{request_id}/approve")
def approve_request(
    request_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if current_user.role not in [RoleEnum.ADMIN, RoleEnum.HOD]:
        raise HTTPException(status_code=403, detail="Not authorized")

    req_ref = db.collection('join_requests').document(request_id)
    doc = req_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Request not found")
        
    req_data = doc.to_dict()
    
    # Verify the admin owns this department
    dept_docs = list(db.collection('departments').where(filter=FieldFilter('hod_id', '==', current_user.id)).stream())
    if not dept_docs or dept_docs[0].to_dict()['id'] != req_data['department_id']:
        raise HTTPException(status_code=403, detail="Not authorized for this department")

    req_ref.update({"status": "Approved"})

    # Update user's department
    db.collection('users').document(req_data['faculty_id']).update({
        "department_id": req_data['department_id']
    })

    send_notification(db, req_data['faculty_id'], "Request Approved", f"Your request to join {dept_docs[0].to_dict()['name']} has been approved.", "SYSTEM_ALERT")

    return {"message": "Request approved"}

@router.put("/{request_id}/reject")
def reject_request(
    request_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if current_user.role not in [RoleEnum.ADMIN, RoleEnum.HOD]:
        raise HTTPException(status_code=403, detail="Not authorized")

    req_ref = db.collection('join_requests').document(request_id)
    doc = req_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Request not found")
        
    req_data = doc.to_dict()
    
    # Verify the admin owns this department
    dept_docs = list(db.collection('departments').where(filter=FieldFilter('hod_id', '==', current_user.id)).stream())
    if not dept_docs or dept_docs[0].to_dict()['id'] != req_data['department_id']:
        raise HTTPException(status_code=403, detail="Not authorized for this department")

    req_ref.update({"status": "Rejected"})

    send_notification(db, req_data['faculty_id'], "Request Rejected", "Your request to join the department was rejected.", "SYSTEM_ALERT")

    return {"message": "Request rejected"}
