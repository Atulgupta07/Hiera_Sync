import os
import uuid
import shutil
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import TaskAttachmentResponse
from app.auth.permissions import get_current_active_user
from app.models.models import User, RoleEnum

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

def validate_task_access(task_id: str, db: Client, current_user: User):
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()
    if not task_doc.exists:
        raise HTTPException(status_code=404, detail="Task not found")
        
    task_data = task_doc.to_dict()
    if current_user.role == RoleEnum.FACULTY and task_data.get('assigned_id') != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access attachments for this task")
    return task_data

@router.get("/{task_id}", response_model=List[TaskAttachmentResponse])
def get_task_attachments(
    task_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    validate_task_access(task_id, db, current_user)
    
    attach_ref = db.collection('task_attachments').where('task_id', '==', task_id)
    docs = list(attach_ref.stream())
    
    attachments = [doc.to_dict() for doc in docs]
    attachments.sort(key=lambda x: x.get('created_at', ''))
    return attachments

@router.post("/{task_id}", response_model=TaskAttachmentResponse)
def upload_task_attachment(
    task_id: str,
    file: UploadFile = File(...),
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    validate_task_access(task_id, db, current_user)
    
    # Validate file type
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not allowed")
        
    # Read file to check size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum allowed (10MB)")
        
    # Generate unique storage path
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}{ext}"
    storage_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    # Save file
    with open(storage_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Save to db
    now = datetime.utcnow().isoformat()
    db_attachment = {
        "id": file_id,
        "task_id": task_id,
        "file_name": file.filename,
        "file_type": ext.lstrip('.'),
        "file_size": file_size,
        "storage_path": storage_path,
        "uploaded_by": current_user.name,
        "created_at": now
    }
    
    db.collection('task_attachments').document(file_id).set(db_attachment)
    return db_attachment

@router.get("/{task_id}/{attachment_id}/download")
def download_task_attachment(
    task_id: str,
    attachment_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    validate_task_access(task_id, db, current_user)
    
    doc_ref = db.collection('task_attachments').document(attachment_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Attachment not found")
        
    data = doc.to_dict()
    if data['task_id'] != task_id:
        raise HTTPException(status_code=400, detail="Attachment does not belong to this task")
        
    file_path = data['storage_path']
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
        
    return FileResponse(path=file_path, filename=data['file_name'])

@router.delete("/{task_id}/{attachment_id}")
def delete_task_attachment(
    task_id: str,
    attachment_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    validate_task_access(task_id, db, current_user)
    
    doc_ref = db.collection('task_attachments').document(attachment_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Attachment not found")
        
    data = doc.to_dict()
    if data['task_id'] != task_id:
        raise HTTPException(status_code=400, detail="Attachment does not belong to this task")
        
    if current_user.role == RoleEnum.FACULTY and data['uploaded_by'] != current_user.name:
        raise HTTPException(status_code=403, detail="Not authorized to delete this attachment")
        
    # Delete from filesystem
    file_path = data.get('storage_path')
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
        
    doc_ref.delete()
    return {"message": "Attachment deleted successfully"}
