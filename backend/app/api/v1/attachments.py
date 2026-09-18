import os
import uuid
import shutil
import mimetypes
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request, status
from fastapi.responses import FileResponse
from google.cloud.firestore import Client
from google.cloud.firestore_v1.base_query import FieldFilter
from app.database.session import get_db
from app.schemas.schemas import TaskAttachmentResponse
from app.auth.permissions import get_current_active_user
from app.auth.jwt import verify_token
from app.models.models import User, RoleEnum

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

def get_user_from_request_or_token(
    request: Request,
    token: Optional[str],
    db: Client
) -> User:
    auth_header = request.headers.get("Authorization")
    raw_token = None
    if auth_header and auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1]
    elif token:
        raw_token = token

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token_data = verify_token(raw_token, credentials_exception)
    users_ref = db.collection('users')
    query = list(users_ref.where(filter=FieldFilter('email', '==', token_data.email)).stream())
    if not query:
        raise credentials_exception

    user_doc = query[0]
    user_dict = user_doc.to_dict() or {}
    user_dict['id'] = user_doc.id

    user_fields = set(getattr(User, "model_fields", getattr(User, "__fields__", {})).keys())
    filtered_dict = {k: v for k, v in user_dict.items() if k in user_fields}

    try:
        return User(**filtered_dict)
    except Exception:
        raise credentials_exception

def validate_task_access(task_id: str, db: Client, current_user: User) -> dict:
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()
    
    task_data: dict = {}
    if not task_doc.exists:
        from app.api.v1.tasks import DEFAULT_TASKS
        for t in DEFAULT_TASKS:
            if t.get("id") == task_id:
                task_data = t
                break
        if not task_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Task not found"
            )
    else:
        task_data = task_doc.to_dict() or {}
    
    assigned_id = task_data.get('assigned_id') or task_data.get('assigned_to')
    if current_user.role == RoleEnum.FACULTY and assigned_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access denied to this task"
        )
        
    return task_data

@router.get("/{task_id}", response_model=List[TaskAttachmentResponse])
def get_task_attachments(
    task_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    validate_task_access(task_id, db, current_user)
    
    attach_ref = db.collection('task_attachments').where(filter=FieldFilter('task_id', '==', task_id))

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
    role_val = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    attachment_type = "HOD_REFERENCE" if role_val in ["HOD", "ADMIN"] else "TASK_ATTACHMENT"
    
    db_attachment = {
        "id": file_id,
        "task_id": task_id,
        "file_name": file.filename,
        "file_type": ext.lstrip('.'),
        "file_size": file_size,
        "storage_path": storage_path,
        "uploaded_by": current_user.name,
        "uploaded_by_role": role_val,
        "attachment_type": attachment_type,
        "created_at": now
    }
    
    db.collection('task_attachments').document(file_id).set(db_attachment)
    
    # Activity Log
    db.collection('activity_logs').add({
        "timestamp": now,
        "action": "REFERENCE_DOCUMENT_UPLOADED" if attachment_type == "HOD_REFERENCE" else "TASK_ATTACHMENT_UPLOADED",
        "details": f"{current_user.name} ({role_val}) uploaded a file: {file.filename}",
        "category": "task",
        "task_id": task_id
    })
    
    return db_attachment

@router.get("/{task_id}/{attachment_id}/download")
def download_task_attachment(
    task_id: str,
    attachment_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    db: Client = Depends(get_db)
):
    current_user = get_user_from_request_or_token(request, token, db)
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
        
    file_name = data.get('file_name', 'document.pdf')
    mime_type, _ = mimetypes.guess_type(file_name)
    if not mime_type:
        ext = os.path.splitext(file_name)[1].lower()
        if ext == '.pdf':
            mime_type = 'application/pdf'
        elif ext in ['.jpg', '.jpeg', '.png', '.gif']:
            mime_type = f"image/{'jpeg' if ext == '.jpg' else ext.lstrip('.')}"
        else:
            mime_type = 'application/octet-stream'

    return FileResponse(
        path=file_path, 
        filename=file_name,
        media_type=mime_type,
        headers={
            "Content-Disposition": f"inline; filename=\"{file_name}\"",
            "Content-Type": mime_type
        }
    )

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
        
    att_type = data.get('attachment_type', 'TASK_ATTACHMENT')
    role_val = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    
    if role_val == "FACULTY":
        if att_type == "HOD_REFERENCE" or data.get('uploaded_by_role') in ["HOD", "ADMIN"]:
            raise HTTPException(status_code=403, detail="Not authorized to delete HOD reference documents")
        if data.get('uploaded_by') != current_user.name:
            raise HTTPException(status_code=403, detail="Not authorized to delete this attachment")
        
    # Delete from filesystem
    file_path = data.get('storage_path')
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
        
    doc_ref.delete()
    return {"message": "Attachment deleted successfully"}
