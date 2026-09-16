from typing import List, Optional
import os
import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
from google.cloud.firestore import Client
from app.database.session import get_db
from app.auth.permissions import get_current_active_user
from app.models.models import User

router = APIRouter()
UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
        
    doc_metadata = {
        "id": file_id,
        "filename": file.filename,
        "safe_filename": safe_filename,
        "file_path": file_path,
        "file_size": len(content),
        "content_type": file.content_type,
        "uploader_id": current_user.id,
        "uploader_name": current_user.name,
        "uploaded_at": datetime.utcnow().isoformat()
    }
    
    db.collection('files').document(file_id).set(doc_metadata)
    
    return {
        "id": file_id,
        "filename": file.filename,
        "file_size": len(content),
        "url": f"/api/v1/files/download/{file_id}",
        "message": "File uploaded successfully"
    }

@router.get("/")
def list_files(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    files_ref = db.collection('files')
    docs = list(files_ref.stream())
    return [doc.to_dict() for doc in docs]

import mimetypes
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status, Query, Request
from fastapi.responses import FileResponse
from app.api.v1.attachments import get_user_from_request_or_token

@router.get("/download/{file_id}")
def download_file_info(
    file_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    db: Client = Depends(get_db)
):
    current_user = get_user_from_request_or_token(request, token, db)
    doc_ref = db.collection('files').document(file_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="File not found")
    data = doc.to_dict()
    file_path = data.get("file_path")
    if file_path and os.path.exists(file_path):
        file_name = data.get("filename", "document.pdf")
        mime_type, _ = mimetypes.guess_type(file_name)
        if not mime_type:
            mime_type = data.get("content_type", "application/octet-stream")
        return FileResponse(
            path=file_path,
            filename=file_name,
            media_type=mime_type,
            headers={
                "Content-Disposition": f"inline; filename=\"{file_name}\"",
                "Content-Type": mime_type
            }
        )
    return data


