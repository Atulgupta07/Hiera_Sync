from typing import List, Optional
from datetime import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import ApprovalCreate, ApprovalUpdate, ApprovalResponse
from app.auth.permissions import get_current_active_user, check_role
from app.models.models import User, RoleEnum

router = APIRouter()

DEFAULT_APPROVALS = [
    {
        "id": "app_1",
        "title": "Final Year Project Review",
        "requested": "AIML Final Year Students",
        "assigned": "Dr. Animesh Tayal",
        "priority": "High",
        "status": "Pending",
        "type": "Project Review",
        "comments": "Review of ML models and implementation for batch 2026.",
        "created_at": "2026-08-01T10:00:00Z"
    },
    {
        "id": "app_2",
        "title": "AI Lab Equipment Request",
        "requested": "AI Lab Coordinator",
        "assigned": "Mrs. Neha Gurnani",
        "priority": "Medium",
        "status": "Pending",
        "type": "Equipment Request",
        "comments": "Procurement of 10 RTX 4090 GPU workstations for student lab.",
        "created_at": "2026-08-01T10:00:00Z"
    },
    {
        "id": "app_3",
        "title": "Machine Learning Workshop Approval",
        "requested": "AIML Student Club",
        "assigned": "Ms. Sweta Arun Bokade",
        "priority": "Low",
        "status": "Approved",
        "type": "Workshop Approval",
        "comments": "Hands-on PyTorch and NLP workshop scheduled for department students.",
        "created_at": "2026-08-01T10:00:00Z",
        "reviewed_at": "2026-08-02T14:30:00Z"
    },
    {
        "id": "app_4",
        "title": "Research Paper Submission Review",
        "requested": "Student Research Team",
        "assigned": "Dr. Bhushan Mahendra Manjre",
        "priority": "High",
        "status": "Pending",
        "type": "Research Review",
        "comments": "Draft paper submission on Computer Vision in Healthcare for IEEE conference.",
        "created_at": "2026-08-01T10:00:00Z"
    }
]

@router.get("/", response_model=List[ApprovalResponse])
def get_approvals(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    approvals_ref = db.collection('approvals')
    docs = list(approvals_ref.stream())
    approvals = []
    if docs:
        for doc in docs:
            data = doc.to_dict()
            if not data.get("type"):
                data["type"] = "Academic Approval"
            approvals.append(data)
    else:
        approvals = [dict(a) for a in DEFAULT_APPROVALS]

    # Also aggregate any tasks submitted by faculty with 'Awaiting Approval'
    try:
        task_docs = list(db.collection('tasks').where('status', '==', 'Awaiting Approval').stream())
        for td in task_docs:
            t = td.to_dict()
            task_app_id = f"task_{t.get('id', td.id)}"
            # Avoid duplicate if already present
            if not any(a["id"] == task_app_id for a in approvals):
                approvals.append({
                    "id": task_app_id,
                    "title": f"Task Completion: {t.get('title', 'Task')}",
                    "requested": t.get("assigned", "Faculty Member"),
                    "assigned": "Department Admin",
                    "priority": t.get("priority", "Medium"),
                    "status": "Pending",
                    "type": "Task Completion",
                    "comments": t.get("description") or "Submitted for HOD completion review.",
                    "created_at": t.get("created_at") or datetime.utcnow().isoformat(),
                    "user_id": t.get("assigned_id")
                })
    except Exception:
        pass

    # Role-based filtering:
    # If user is Faculty (not ADMIN or HOD), strictly return only approvals belonging to them
    if current_user.role not in [RoleEnum.ADMIN, RoleEnum.HOD]:
        user_name = (current_user.name or "").strip().lower()
        user_email = (current_user.email or "").strip().lower()
        user_id = str(current_user.id or "")

        filtered = []
        for a in approvals:
            req_str = str(a.get("requested", "")).lower()
            assign_str = str(a.get("assigned", "")).lower()
            a_user_id = str(a.get("user_id", ""))
            a_req_id = str(a.get("requested_id", ""))

            matches = (
                (a_user_id and a_user_id == user_id) or
                (a_req_id and a_req_id == user_id) or
                (user_name and user_name in req_str) or
                (user_email and user_email in req_str) or
                (user_name and user_name in assign_str)
            )
            if matches:
                filtered.append(a)
        approvals = filtered

    # Sort approvals by created_at descending
    approvals.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
    return approvals

@router.post("/", response_model=ApprovalResponse)
def create_approval(
    approval: ApprovalCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    approval_id = str(uuid.uuid4())
    db_approval = approval.dict()
    db_approval['id'] = approval_id
    db_approval['created_at'] = datetime.utcnow().isoformat()
    if not db_approval.get('type'):
        db_approval['type'] = "Academic Approval"
    if not db_approval.get('requested'):
        db_approval['requested'] = current_user.name
    db_approval['user_id'] = current_user.id
    
    db.collection('approvals').document(approval_id).set(db_approval)
    return db_approval

@router.put("/{approval_id}/approve", response_model=ApprovalResponse)
def approve_request(
    approval_id: str,
    action: Optional[ApprovalUpdate] = None,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    now = datetime.utcnow().isoformat()
    review_comments = action.comments if action and action.comments else None

    # Handle bridged task approval
    if approval_id.startswith("task_"):
        real_task_id = approval_id.replace("task_", "")
        task_ref = db.collection('tasks').document(real_task_id)
        task_doc = task_ref.get()
        if task_doc.exists:
            t_data = task_doc.to_dict()
            task_ref.update({
                "status": "Completed",
                "progress": "100%",
                "reviewed_at": now
            })
            return {
                "id": approval_id,
                "title": f"Task Completion: {t_data.get('title', 'Task')}",
                "requested": t_data.get("assigned", "Faculty Member"),
                "assigned": "Department Admin",
                "priority": t_data.get("priority", "Medium"),
                "status": "Approved",
                "type": "Task Completion",
                "comments": review_comments or t_data.get("description"),
                "created_at": t_data.get("created_at", now),
                "reviewed_at": now
            }

    doc_ref = db.collection('approvals').document(approval_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        for a in DEFAULT_APPROVALS:
            if a["id"] == approval_id:
                a["status"] = "Approved"
                a["reviewed_at"] = now
                if review_comments:
                    a["comments"] = review_comments
                return a
        raise HTTPException(status_code=404, detail="Approval request not found")
        
    update_fields = {
        "status": "Approved",
        "reviewed_at": now
    }
    if review_comments:
        update_fields["comments"] = review_comments

    doc_ref.update(update_fields)
    res = doc_ref.get().to_dict()
    return res

@router.put("/{approval_id}/reject", response_model=ApprovalResponse)
def reject_request(
    approval_id: str,
    action: Optional[ApprovalUpdate] = None,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    now = datetime.utcnow().isoformat()
    rejection_reason = action.comments if action and action.comments else None

    # Handle bridged task rejection
    if approval_id.startswith("task_"):
        real_task_id = approval_id.replace("task_", "")
        task_ref = db.collection('tasks').document(real_task_id)
        task_doc = task_ref.get()
        if task_doc.exists:
            t_data = task_doc.to_dict()
            task_ref.update({
                "status": "Revision Required",
                "progress": "50%",
                "reviewed_at": now
            })
            return {
                "id": approval_id,
                "title": f"Task Completion: {t_data.get('title', 'Task')}",
                "requested": t_data.get("assigned", "Faculty Member"),
                "assigned": "Department Admin",
                "priority": t_data.get("priority", "Medium"),
                "status": "Rejected",
                "type": "Task Completion",
                "comments": rejection_reason or "Revision required by HOD.",
                "created_at": t_data.get("created_at", now),
                "reviewed_at": now
            }

    doc_ref = db.collection('approvals').document(approval_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        for a in DEFAULT_APPROVALS:
            if a["id"] == approval_id:
                a["status"] = "Rejected"
                a["reviewed_at"] = now
                if rejection_reason:
                    a["comments"] = rejection_reason
                return a
        raise HTTPException(status_code=404, detail="Approval request not found")
        
    update_fields = {
        "status": "Rejected",
        "reviewed_at": now
    }
    if rejection_reason:
        update_fields["comments"] = rejection_reason

    doc_ref.update(update_fields)
    res = doc_ref.get().to_dict()
    return res

@router.delete("/{approval_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_approval(
    approval_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    doc_ref = db.collection('approvals').document(approval_id)
    if not doc_ref.get().exists:
        global DEFAULT_APPROVALS
        for i, a in enumerate(DEFAULT_APPROVALS):
            if a["id"] == approval_id:
                DEFAULT_APPROVALS.pop(i)
                return None
        raise HTTPException(status_code=404, detail="Approval request not found")
        
    doc_ref.delete()
    return None

