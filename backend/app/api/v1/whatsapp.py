from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, Response
from google.cloud.firestore import Client
from google.cloud.firestore_v1.base_query import FieldFilter

from app.database.session import get_db
from app.auth.permissions import get_current_active_user, check_role
from app.models.models import User, RoleEnum
from app.schemas.schemas import (
    WhatsAppSendRequest,
    WhatsAppMessageResponse,
    WhatsAppFacultyStatus,
    WhatsAppOptInUpdate
)
from app.services.whatsapp_service import (
    WhatsAppService,
    normalize_phone_number,
    format_display_phone
)
from app.config.settings import settings
from app.utils.logging import logger

router = APIRouter()

@router.post("/send", response_model=WhatsAppMessageResponse)
def send_whatsapp_message(
    payload: WhatsAppSendRequest,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    HOD/Admin sends a WhatsApp message to a faculty member using WhatsApp Business Platform.
    """
    # Find recipient faculty
    doc_ref = db.collection('users').document(payload.faculty_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    faculty_data = doc.to_dict()
    faculty_name = faculty_data.get("name", "Faculty")
    phone = faculty_data.get("phone", "")
    whatsapp_enabled = faculty_data.get("whatsapp_enabled", False)

    if not whatsapp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp messaging is not available for this faculty member (not opted in)."
        )

    if not phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No WhatsApp phone number configured for this faculty member."
        )

    result = WhatsAppService.send_and_record(
        db=db,
        sender_id=current_user.id,
        sender_name=current_user.name,
        recipient_id=payload.faculty_id,
        recipient_name=faculty_name,
        recipient_phone=phone,
        message=payload.message,
        message_type="direct",
        template_name=payload.template_name
    )

    if not result["success"]:
        # If credentials not configured, we still saved record as failed and return it with 400 or info
        logger.warning(f"WhatsApp sending failed: {result.get('error')}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error") or "WhatsApp message could not be sent."
        )

    return result["record"]

@router.get("/messages", response_model=List[WhatsAppMessageResponse])
def get_whatsapp_messages(
    limit: int = Query(50, le=100),
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Retrieve WhatsApp message history.
    """
    msgs_ref = db.collection('whatsapp_messages')
    try:
        query = msgs_ref.order_by('created_at', direction='DESCENDING').limit(limit)
        docs = list(query.stream())
    except Exception:
        # Fallback if Firestore composite index not built yet
        docs = list(msgs_ref.limit(limit).stream())

    messages = []
    for doc in docs:
        data = doc.to_dict()
        messages.append(data)

    messages.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return messages

@router.get("/faculty", response_model=List[WhatsAppFacultyStatus])
def get_whatsapp_faculty_directory(
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    List all faculty members with phone number, WhatsApp status, and current workload.
    """
    users_ref = db.collection('users')
    docs = list(users_ref.stream())

    # Get task workload counts
    tasks_ref = db.collection('tasks')
    task_docs = list(tasks_ref.stream())
    pending_tasks = {}
    for td in task_docs:
        tdata = td.to_dict()
        if tdata.get("status") not in ["Completed", "Awaiting Approval"]:
            assignee_id = tdata.get("assigned_id")
            if assignee_id:
                pending_tasks[assignee_id] = pending_tasks.get(assignee_id, 0) + 1
            assignee_name = tdata.get("assigned")
            if assignee_name:
                pending_tasks[assignee_name] = pending_tasks.get(assignee_name, 0) + 1

    faculty_list = []
    for doc in docs:
        udata = doc.to_dict()
        uid = udata.get("id", doc.id)
        uname = udata.get("name", "")
        # Filter for academic staff / faculty / hod
        workload = pending_tasks.get(uid, pending_tasks.get(uname, 0))

        faculty_list.append(WhatsAppFacultyStatus(
            id=uid,
            name=uname,
            email=udata.get("email", ""),
            designation=udata.get("designation", "Faculty"),
            phone=udata.get("phone"),
            whatsapp_enabled=bool(udata.get("whatsapp_enabled", False)),
            current_workload=workload
        ))

    return faculty_list

@router.patch("/faculty/{faculty_id}/opt-in", response_model=WhatsAppFacultyStatus)
def update_faculty_whatsapp_status(
    faculty_id: str,
    payload: WhatsAppOptInUpdate,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    """
    Update faculty phone number and WhatsApp opt-in status.
    """
    doc_ref = db.collection('users').document(faculty_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    update_data = {
        "whatsapp_enabled": payload.whatsapp_enabled
    }
    if payload.phone is not None:
        normalized = normalize_phone_number(payload.phone)
        if normalized:
            update_data["phone"] = format_display_phone(normalized)
        else:
            update_data["phone"] = payload.phone.strip()

    doc_ref.update(update_data)
    updated = doc_ref.get().to_dict()

    return WhatsAppFacultyStatus(
        id=updated.get("id", faculty_id),
        name=updated.get("name", ""),
        email=updated.get("email", ""),
        designation=updated.get("designation"),
        phone=updated.get("phone"),
        whatsapp_enabled=bool(updated.get("whatsapp_enabled", False)),
        current_workload=0
    )

@router.get("/webhook")
def verify_webhook(request: Request):
    """
    Meta WhatsApp Cloud API Webhook verification.
    """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN:
            logger.info("WhatsApp webhook verified successfully.")
            return Response(content=challenge, media_type="text/plain")
        else:
            logger.warning("WhatsApp webhook verification failed: Token mismatch.")
            raise HTTPException(status_code=403, detail="Verification token mismatch")
    return {"status": "ok"}

@router.post("/webhook")
async def receive_webhook_event(request: Request, db: Client = Depends(get_db)):
    """
    Handle WhatsApp status updates (sent, delivered, read, failed).
    """
    try:
        body = await request.json()
        logger.info(f"Received WhatsApp webhook event: {body}")

        entry = body.get("entry", [])
        for e in entry:
            changes = e.get("changes", [])
            for c in changes:
                value = c.get("value", {})
                statuses = value.get("statuses", [])
                for st in statuses:
                    wamid = st.get("id")
                    status_text = st.get("status") # sent, delivered, read, failed
                    if wamid and status_text:
                        # Find message in Firestore
                        docs = list(db.collection('whatsapp_messages').where(filter=FieldFilter('provider_message_id', '==', wamid)).limit(1).stream())
                        if docs:
                            docs[0].reference.update({
                                "status": status_text,
                                "updated_at": datetime.utcnow().isoformat()
                            })
                            logger.info(f"Updated WhatsApp message {wamid} status to {status_text}")
    except Exception as exc:
        logger.error(f"Error handling WhatsApp webhook payload: {exc}")

    return {"status": "received"}
