from typing import List, Optional
from datetime import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import NotificationCreate, NotificationResponse, UnreadCountResponse
from app.auth.permissions import get_current_active_user
from app.models.models import User

router = APIRouter()

DEFAULT_NOTIFICATIONS = [
    {
        "id": "notif_1",
        "title": "New Task Assigned",
        "message": "AI Lab Maintenance task assigned to Mrs. Neha Gurnani",
        "time": "10 minutes ago",
        "type": "Task",
        "priority": "High",
        "target_route": "/tasks",
        "icon": "📋",
        "status": "New",
        "is_read": False,
        "created_at": "2026-08-02T22:35:00Z"
    },
    {
        "id": "notif_2",
        "title": "Approval Pending",
        "message": "Final Year Project Review approval is waiting for review",
        "time": "1 hour ago",
        "type": "Approval",
        "priority": "High",
        "target_route": "/approvals",
        "icon": "✅",
        "status": "Pending",
        "is_read": False,
        "created_at": "2026-08-02T21:45:00Z"
    },
    {
        "id": "notif_3",
        "title": "Deadline Reminder",
        "message": "Machine Learning Workshop deadline is near",
        "time": "Today",
        "type": "Calendar",
        "priority": "Medium",
        "target_route": "/calendar",
        "icon": "⏰",
        "status": "Important",
        "is_read": False,
        "created_at": "2026-08-02T18:00:00Z"
    },
    {
        "id": "notif_4",
        "title": "Faculty Activity Update",
        "message": "Dr. Bhushan Mahendra Manjre updated research tracking status",
        "time": "Today",
        "type": "Employees",
        "priority": "Low",
        "target_route": "/employees",
        "icon": "👨‍🏫",
        "status": "Updated",
        "is_read": True,
        "created_at": "2026-08-02T15:30:00Z"
    },
    {
        "id": "notif_5",
        "title": "AI Recommendation",
        "message": "HieraSync AI suggested completing pending approvals first",
        "time": "Today",
        "type": "AI",
        "priority": "Medium",
        "target_route": "/ai",
        "icon": "🤖",
        "status": "AI Alert",
        "is_read": True,
        "created_at": "2026-08-02T12:00:00Z"
    }
]

def format_relative_time(created_at_str: Optional[str]) -> str:
    if not created_at_str:
        return "Just now"
    try:
        clean_str = created_at_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        if dt.tzinfo is not None:
            now = datetime.now(dt.tzinfo)
        else:
            now = datetime.utcnow()
        
        diff = now - dt
        total_seconds = int(diff.total_seconds())
        if total_seconds < 60:
            return "Just now"
        minutes = total_seconds // 60
        if minutes < 60:
            return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
        hours = minutes // 60
        if hours < 24:
            return f"{hours} hour{'s' if hours != 1 else ''} ago"
        days = hours // 24
        if days == 1:
            return "1 day ago"
        if days < 7:
            return f"{days} days ago"
        return dt.strftime("%b %d, %Y")
    except Exception:
        return "Just now"

@router.get("/", response_model=List[NotificationResponse])
def get_notifications(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    notifs_ref = db.collection('notifications')
    docs = list(notifs_ref.where('user_id', 'in', [current_user.id, 'department']).stream())
    notifications = []
    if docs:
        for doc in docs:
            data = doc.to_dict()
            if data.get("created_at"):
                data["time"] = format_relative_time(data.get("created_at"))
            notifications.append(data)
    else:
        for n in DEFAULT_NOTIFICATIONS:
            item = dict(n)
            if item.get("created_at"):
                item["time"] = format_relative_time(item.get("created_at"))
            notifications.append(item)
    return notifications

@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    notifs_ref = db.collection('notifications')
    docs = list(notifs_ref.where('user_id', 'in', [current_user.id, 'department']).stream())
    if docs:
        unread = sum(1 for d in docs if not d.to_dict().get("is_read", False))
    else:
        unread = sum(1 for d in DEFAULT_NOTIFICATIONS if not d.get("is_read", False))
    return {"unread_count": unread}

@router.post("/", response_model=NotificationResponse)
def create_notification(
    notification: NotificationCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    notif_id = f"notif_{uuid.uuid4().hex[:8]}"
    db_notif = notification.dict()
    db_notif["id"] = notif_id
    db_notif["user_id"] = current_user.id
    db_notif["created_at"] = datetime.utcnow().isoformat()
    if not db_notif.get("time"):
        db_notif["time"] = "Just now"
    
    db.collection('notifications').document(notif_id).set(db_notif)
    return db_notif

@router.put("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    doc_ref = db.collection('notifications').document(notification_id)
    doc = doc_ref.get()
    if not doc.exists:
        for n in DEFAULT_NOTIFICATIONS:
            if n["id"] == notification_id:
                n["is_read"] = True
                n["status"] = "Read"
                if n.get("created_at"):
                    n["time"] = format_relative_time(n["created_at"])
                return n
        raise HTTPException(status_code=404, detail="Notification not found")
    
    doc_ref.update({"is_read": True, "status": "Read"})
    data = doc_ref.get().to_dict()
    if data.get("created_at"):
        data["time"] = format_relative_time(data.get("created_at"))
    return data

@router.put("/{notification_id}/unread", response_model=NotificationResponse)
def mark_unread(
    notification_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    doc_ref = db.collection('notifications').document(notification_id)
    doc = doc_ref.get()
    if not doc.exists:
        for n in DEFAULT_NOTIFICATIONS:
            if n["id"] == notification_id:
                n["is_read"] = False
                n["status"] = "Unread"
                if n.get("created_at"):
                    n["time"] = format_relative_time(n["created_at"])
                return n
        raise HTTPException(status_code=404, detail="Notification not found")
    
    doc_ref.update({"is_read": False, "status": "Unread"})
    data = doc_ref.get().to_dict()
    if data.get("created_at"):
        data["time"] = format_relative_time(data.get("created_at"))
    return data

@router.put("/read-all")
def mark_all_read(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    notifs_ref = db.collection('notifications')
    docs = list(notifs_ref.where('user_id', 'in', [current_user.id, 'department']).stream())
    if docs:
        for doc in docs:
            doc.reference.update({"is_read": True, "status": "Read"})
    else:
        for n in DEFAULT_NOTIFICATIONS:
            n["is_read"] = True
            n["status"] = "Read"
    return {"message": "All notifications marked as read."}

@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    doc_ref = db.collection('notifications').document(notification_id)
    if doc_ref.get().exists:
        doc_ref.delete()
        return None
    
    # Check default notifications
    global DEFAULT_NOTIFICATIONS
    for i, n in enumerate(DEFAULT_NOTIFICATIONS):
        if n["id"] == notification_id:
            DEFAULT_NOTIFICATIONS.pop(i)
            return None
            
    raise HTTPException(status_code=404, detail="Notification not found")

def trigger_notification(
    db: Client,
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    target_route: str = "/tasks",
    priority: str = "Medium",
    icon: str = "🔔"
):
    # Avoid exact duplicates
    existing = list(db.collection('notifications')
                    .where('user_id', '==', user_id)
                    .where('title', '==', title)
                    .where('message', '==', message)
                    .limit(1).stream())
    if existing:
        return
        
    notif_id = f"notif_{uuid.uuid4().hex[:8]}"
    db_notif = {
        "id": notif_id,
        "user_id": user_id,
        "title": title,
        "message": message,
        "time": "Just now",
        "type": notif_type,
        "priority": priority,
        "target_route": target_route,
        "icon": icon,
        "status": "New",
        "is_read": False,
        "created_at": datetime.utcnow().isoformat()
    }
    db.collection('notifications').document(notif_id).set(db_notif)
