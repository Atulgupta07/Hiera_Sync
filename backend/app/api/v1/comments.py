from typing import List
from datetime import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import TaskCommentCreate, TaskCommentResponse
from app.auth.permissions import get_current_active_user
from app.models.models import User, RoleEnum
from app.api.v1.notifications import trigger_notification

router = APIRouter()

@router.get("/{task_id}", response_model=List[TaskCommentResponse])
def get_task_comments(
    task_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify task access
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()
    if not task_doc.exists:
        raise HTTPException(status_code=404, detail="Task not found")
        
    task_data = task_doc.to_dict()
    if current_user.role == RoleEnum.FACULTY and current_user.id not in task_data.get('assignee_ids', []) and task_data.get('assigned_id') != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view comments for this task")

    comments_ref = db.collection('task_comments').where('task_id', '==', task_id)
    docs = list(comments_ref.stream())
    
    comments = [doc.to_dict() for doc in docs]
    comments.sort(key=lambda x: x.get('created_at', ''))
    return comments

@router.post("/{task_id}", response_model=TaskCommentResponse)
def create_task_comment(
    task_id: str,
    comment: TaskCommentCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify task access
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()
    if not task_doc.exists:
        raise HTTPException(status_code=404, detail="Task not found")
        
    task_data = task_doc.to_dict()
    if current_user.role == RoleEnum.FACULTY and current_user.id not in task_data.get('assignee_ids', []) and task_data.get('assigned_id') != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to comment on this task")

    comment_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    
    db_comment = comment.dict()
    db_comment['id'] = comment_id
    db_comment['task_id'] = task_id
    db_comment['author_id'] = current_user.id
    db_comment['author_name'] = current_user.name
    db_comment['author_role'] = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    db_comment['created_at'] = now
    db_comment['updated_at'] = now
    
    db.collection('task_comments').document(comment_id).set(db_comment)
    
    # Activity Log
    db.collection('activity_logs').add({
        "timestamp": now,
        "action": "COMMENT_ADDED",
        "details": f"{current_user.name} ({db_comment['author_role']}) added a comment",
        "category": "task",
        "department_id": task_data.get("department_id", ""),
        "task_id": task_id
    })
    
    # Update task document to sync comments array if necessary, but it's better to fetch dynamically.
    # The prompt allows safe handling if missing, so we'll just fetch dynamically from `task_comments` collection.
    
    # Handle Mentions Notifications
    for mentioned_id in comment.mentions:
        trigger_notification(
            db, 
            mentioned_id, 
            "MENTION", 
            "You were mentioned", 
            f"{current_user.name} mentioned you in task: {task_data.get('title')}", 
            "/tasks",
            "Medium",
            "💬"
        )
        
    # Also notify the assignee if HOD commented, or HOD if assignee commented (if not mentioned directly)
    if current_user.role == RoleEnum.HOD and task_data.get('assigned_id') not in comment.mentions:
        trigger_notification(
            db, 
            task_data.get('assigned_id'), 
            "NEW COMMENT", 
            "New Comment on Task", 
            f"{current_user.name} commented on your task: {task_data.get('title')}", 
            "/tasks",
            "Low",
            "💬"
        )

    return db_comment

@router.delete("/{task_id}/{comment_id}")
def delete_task_comment(
    task_id: str,
    comment_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    doc_ref = db.collection('task_comments').document(comment_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Comment not found")
        
    data = doc.to_dict()
    if data['task_id'] != task_id:
        raise HTTPException(status_code=400, detail="Comment does not belong to this task")
        
    if current_user.role == RoleEnum.FACULTY and data['author_id'] != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
        
    doc_ref.delete()
    return {"message": "Comment deleted successfully"}
