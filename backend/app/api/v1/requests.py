from typing import List, Optional
from datetime import datetime
import uuid
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from google.cloud.firestore import Client
from google.cloud.firestore_v1.base_query import FieldFilter
from app.database.session import get_db
from app.schemas.schemas import (
    TaskRequestCreate, 
    TaskRequestUpdate, 
    TaskRequestResponse, 
    TaskCreate, 
    TaskResponse,
    RequestCommentCreate,
    RequestCommentResponse,
    RequestAttachmentResponse
)
from app.auth.permissions import get_current_active_user, check_role
from app.models.models import User, RoleEnum
from app.api.v1.notifications import trigger_notification

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/", response_model=TaskRequestResponse)
def create_task_request(
    request: TaskRequestCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    req_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    db_req = request.dict()
    db_req['id'] = req_id
    db_req['requester_id'] = current_user.id
    db_req['requester_name'] = current_user.name
    db_req['department_id'] = current_user.department_id or request.department_id or "AIML"
    db_req['request_type'] = request.request_type or "Task Request"
    db_req['priority'] = request.priority or "Medium"
    db_req['status'] = "PENDING"
    db_req['created_at'] = now
    db_req['updated_at'] = now
    db_req['reviewed_at'] = None
    db_req['reviewed_by'] = None
    db_req['rejection_reason'] = None
    db_req['created_task_id'] = None
    db_req['linked_task_id'] = None
    db_req['attachments'] = []
    db_req['comments'] = []
    
    db.collection('task_requests').document(req_id).set(db_req)
    
    # Audit Log
    db.collection('activity_logs').document().set({
        "user_id": current_user.id,
        "user_name": current_user.name,
        "action": f"Request Created: {request.title}",
        "category": "request",
        "details": f"{current_user.name} submitted a {db_req['request_type']}: '{request.title}'",
        "timestamp": now
    })
    
    # Notify HOD(s) of this department
    try:
        users_ref = db.collection('users')
        hod_docs = list(users_ref.where(filter=FieldFilter('role', 'in', [RoleEnum.HOD.value, RoleEnum.ADMIN.value])).stream())
        notified = False
        for doc in hod_docs:
            data = doc.to_dict()
            if not current_user.department_id or data.get('department_id') == current_user.department_id or data.get('role') == RoleEnum.ADMIN.value:
                if data.get('id', doc.id) != current_user.id:
                    trigger_notification(
                        db,
                        data.get('id', doc.id),
                        "REQUEST_SUBMITTED",
                        f"New {db_req['request_type']}",
                        f"{current_user.name} submitted a {db_req['request_type']}: '{request.title}'",
                        "/task-requests",
                        request.priority or "Medium",
                        "📋"
                    )
                    notified = True
        if not notified:
            trigger_notification(
                db, 
                "department", 
                "REQUEST_SUBMITTED", 
                f"New {db_req['request_type']}", 
                f"{current_user.name} submitted: '{request.title}'", 
                "/task-requests",
                request.priority or "Medium",
                "📋"
            )
    except Exception as e:
        print("Notification trigger error on request create:", e)
    
    return db_req


@router.get("/", response_model=List[TaskRequestResponse])
def get_task_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    type_filter: Optional[str] = Query(None, alias="type"),
    priority_filter: Optional[str] = Query(None, alias="priority"),
    search: Optional[str] = Query(None),
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    requests_ref = db.collection('task_requests')
    
    # Department Isolation & Role-based filtering
    if current_user.role == RoleEnum.FACULTY:
        # Faculty sees ONLY their own requests
        docs = list(requests_ref.where(filter=FieldFilter('requester_id', '==', current_user.id)).stream())
    else:
        # HOD / ADMIN sees department requests
        if current_user.department_id and current_user.role != RoleEnum.ADMIN:
            docs = list(requests_ref.where(filter=FieldFilter('department_id', '==', current_user.department_id)).stream())
            if not docs:
                all_docs = list(requests_ref.stream())
                docs = [d for d in all_docs if not d.to_dict().get('department_id') or d.to_dict().get('department_id') == current_user.department_id]
        else:
            docs = list(requests_ref.stream())
        
    results = []
    for doc in docs:
        data = doc.to_dict()
        data.setdefault('request_type', data.get('category', 'Task Request'))
        data.setdefault('priority', 'Medium')
        data.setdefault('attachments', [])
        data.setdefault('comments', [])
        data.setdefault('linked_task_id', data.get('created_task_id'))
        
        # Apply Query Filters
        if status_filter and data.get('status', '').upper() != status_filter.upper():
            continue
        if type_filter and type_filter.lower() not in data.get('request_type', '').lower():
            continue
        if priority_filter and priority_filter.lower() != data.get('priority', '').lower():
            continue
        if search:
            q = search.lower()
            t = data.get('title', '').lower()
            d = data.get('description', '').lower()
            r = data.get('requester_name', '').lower()
            if q not in t and q not in d and q not in r:
                continue
                
        results.append(data)
        
    results.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return results

@router.post("/{req_id}/approve")
def approve_task_request(
    req_id: str,
    task_data: dict,  # Receive the final task payload from the frontend form
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    doc_ref = db.collection('task_requests').document(req_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Task Request not found")
        
    req_data = doc.to_dict()
    if req_data['status'] != "PENDING":
        raise HTTPException(status_code=400, detail=f"Cannot approve request with status {req_data['status']}")
        
    # We create the task via tasks.py logic or manually here. 
    # The frontend will prefill the Create Task form and send us the final task object.
    # But wait, the simplest way is to manually do what `create_task` does here, or the frontend 
    # just calls `/tasks` directly and then calls `/task-requests/{req_id}` with PATCH to mark approved.
    # The prompt specifically says "When HOD clicks [Approve & Create Task]... Open the existing Create Task form with the request information pre-filled. After HOD confirms task creation: 1. Create the actual Task... 2. Set TaskRequest.status = APPROVED..."
    
    # So the HOD workflow will be:
    # 1. HOD clicks Approve
    # 2. Frontend opens modal prefilled
    # 3. Frontend POST /tasks (creates task)
    # 4. Frontend PATCH /task-requests/{req_id} { status: 'APPROVED', created_task_id: '...' }
    # Let's provide a PATCH route to handle this cleanly.
    raise HTTPException(status_code=400, detail="Use PATCH /task-requests/{req_id} instead")

@router.patch("/{req_id}", response_model=TaskRequestResponse)
def update_task_request(
    req_id: str,
    update_data: TaskRequestUpdate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    doc_ref = db.collection('task_requests').document(req_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Task Request not found")
        
    req_data = doc.to_dict()
    
    # Enforce RBAC
    if current_user.role == RoleEnum.FACULTY:
        if req_data['requester_id'] != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this request")
        # Teachers can only cancel their pending requests
        if update_data.status not in [None, "CANCELLED"]:
             raise HTTPException(status_code=403, detail="Teachers can only cancel requests")
    else:
        # HOD can approve or reject
        pass
        
    update_dict = {k: v for k, v in update_data.dict(exclude_unset=True).items() if v is not None}
    
    if "status" in update_dict and update_dict["status"] != req_data.get("status"):
        update_dict["reviewed_at"] = datetime.utcnow().isoformat()
        update_dict["reviewed_by"] = current_user.id
        
        # Notifications
        if update_dict["status"] == "APPROVED":
            trigger_notification(
                db, 
                req_data['requester_id'], 
                "REQUEST APPROVED", 
                "Task Request Approved", 
                f"Your request '{req_data.get('title')}' was approved and a task was created.", 
                "/tasks",
                "Medium",
                "✅"
            )
        elif update_dict["status"] == "REJECTED":
            reason = update_dict.get("rejection_reason", "No reason provided.")
            trigger_notification(
                db, 
                req_data['requester_id'], 
                "REQUEST REJECTED", 
                "Task Request Rejected", 
                f"Your request '{req_data.get('title')}' was rejected.\nReason: {reason}", 
                "/task-requests",
                "High",
                "❌"
            )

    doc_ref.update(update_dict)
    return doc_ref.get().to_dict()
