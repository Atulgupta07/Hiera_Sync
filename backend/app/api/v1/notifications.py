from typing import List, Optional
from datetime import datetime
import uuid
import hashlib
from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import Client
from google.cloud.firestore_v1.base_query import FieldFilter
from google.api_core.exceptions import GoogleAPICallError, ResourceExhausted
from app.database.session import get_db
from app.schemas.schemas import NotificationCreate, NotificationResponse, UnreadCountResponse
from app.auth.permissions import get_current_active_user
from app.models.models import User, RoleEnum
from app.utils.cache import notification_cache, unread_count_cache
from app.utils.logging import logger

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
    # Check 15-second in-memory cache first to avoid exhausting Firestore read quota
    cache_key = f"notifs_{current_user.id}"
    cached = notification_cache.get(cache_key)
    if cached is not None:
        return cached

    is_admin_or_hod = current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD, RoleEnum.PRINCIPAL]

    try:
        notifs_ref = db.collection('notifications')
        if is_admin_or_hod:
            docs = list(notifs_ref.where(filter=FieldFilter('user_id', 'in', [current_user.id, 'department'])).limit(50).stream())
        else:
            docs = list(notifs_ref.where(filter=FieldFilter('user_id', '==', current_user.id)).limit(50).stream())

        notifications = []
        if docs:
            for doc in docs:
                data = doc.to_dict()
                if not data.get("id"):
                    data["id"] = doc.id
                if data.get("created_at"):
                    data["time"] = format_relative_time(data.get("created_at"))
                notifications.append(data)
            # Sort notifications by creation timestamp descending (newest first)
            notifications.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        elif is_admin_or_hod:
            for n in DEFAULT_NOTIFICATIONS:
                item = dict(n)
                if item.get("created_at"):
                    item["time"] = format_relative_time(item.get("created_at"))
                notifications.append(item)
        notification_cache.set(cache_key, notifications, ttl=15)
        return notifications
    except (GoogleAPICallError, ResourceExhausted, Exception) as e:
        logger.warning(f"Firestore quota exceeded or error fetching notifications for user {current_user.id}: {e}")
        if is_admin_or_hod:
            fallback = []
            for n in DEFAULT_NOTIFICATIONS:
                item = dict(n)
                if item.get("created_at"):
                    item["time"] = format_relative_time(item.get("created_at"))
                fallback.append(item)
            return fallback
        return []

@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    cache_key = f"unread_{current_user.id}"
    cached = unread_count_cache.get(cache_key)
    if cached is not None:
        return {"unread_count": cached}

    is_admin_or_hod = current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD, RoleEnum.PRINCIPAL]

    try:
        notifs_ref = db.collection('notifications')
        if is_admin_or_hod:
            docs = list(notifs_ref.where(filter=FieldFilter('user_id', 'in', [current_user.id, 'department'])).limit(50).stream())
            if docs:
                unread = sum(1 for d in docs if not d.to_dict().get("is_read", False))
            else:
                unread = sum(1 for d in DEFAULT_NOTIFICATIONS if not d.get("is_read", False))
        else:
            docs = list(notifs_ref.where(filter=FieldFilter('user_id', '==', current_user.id)).limit(50).stream())
            unread = sum(1 for d in docs if not d.to_dict().get("is_read", False))

        unread_count_cache.set(cache_key, unread, ttl=15)
        return {"unread_count": unread}
    except (GoogleAPICallError, ResourceExhausted, Exception) as e:
        logger.warning(f"Firestore quota exceeded or error fetching unread count for user {current_user.id}: {e}")
        return {"unread_count": 0}

@router.post("/", response_model=NotificationResponse)
def create_notification(
    notification: NotificationCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    notif_id = f"notif_{uuid.uuid4().hex[:8]}"
    db_notif = notification.dict()
    db_notif["id"] = notif_id
    
    is_admin_or_hod = current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD, RoleEnum.PRINCIPAL]
    target_user_id = notification.user_id if (is_admin_or_hod and notification.user_id) else current_user.id
    db_notif["user_id"] = target_user_id
    db_notif["created_at"] = datetime.utcnow().isoformat()
    if not db_notif.get("time"):
        db_notif["time"] = "Just now"
    
    try:
        db.collection('notifications').document(notif_id).set(db_notif)
    except Exception as e:
        logger.warning(f"Error persisting notification to Firestore: {e}")

    # Invalidate cache for target user and current user
    notification_cache.delete(f"notifs_{target_user_id}")
    unread_count_cache.delete(f"unread_{target_user_id}")
    if target_user_id != current_user.id:
        notification_cache.delete(f"notifs_{current_user.id}")
        unread_count_cache.delete(f"unread_{current_user.id}")
    return db_notif

@router.put("/{notification_id}/read", response_model=NotificationResponse)
def mark_read(
    notification_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    notification_cache.delete(f"notifs_{current_user.id}")
    unread_count_cache.delete(f"unread_{current_user.id}")
    is_admin_or_hod = current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD, RoleEnum.PRINCIPAL]

    try:
        doc_ref = db.collection('notifications').document(notification_id)
        doc = doc_ref.get()
        if not doc.exists:
            if is_admin_or_hod:
                for n in DEFAULT_NOTIFICATIONS:
                    if n["id"] == notification_id:
                        n["is_read"] = True
                        n["status"] = "Read"
                        if n.get("created_at"):
                            n["time"] = format_relative_time(n["created_at"])
                        return n
            raise HTTPException(status_code=404, detail="Notification not found")
        
        doc_data = doc.to_dict()
        if not is_admin_or_hod and doc_data.get("user_id") != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this notification")

        doc_ref.update({"is_read": True, "status": "Read"})
        data = doc_ref.get().to_dict()
        if data.get("created_at"):
            data["time"] = format_relative_time(data.get("created_at"))
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Error marking notification as read: {e}")
        if is_admin_or_hod:
            for n in DEFAULT_NOTIFICATIONS:
                if n["id"] == notification_id:
                    n["is_read"] = True
                    return n
        raise HTTPException(status_code=500, detail="Failed to update notification")

@router.put("/{notification_id}/unread", response_model=NotificationResponse)
def mark_unread(
    notification_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    notification_cache.delete(f"notifs_{current_user.id}")
    unread_count_cache.delete(f"unread_{current_user.id}")
    is_admin_or_hod = current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD, RoleEnum.PRINCIPAL]

    try:
        doc_ref = db.collection('notifications').document(notification_id)
        doc = doc_ref.get()
        if not doc.exists:
            if is_admin_or_hod:
                for n in DEFAULT_NOTIFICATIONS:
                    if n["id"] == notification_id:
                        n["is_read"] = False
                        n["status"] = "Unread"
                        if n.get("created_at"):
                            n["time"] = format_relative_time(n["created_at"])
                        return n
            raise HTTPException(status_code=404, detail="Notification not found")
        
        doc_data = doc.to_dict()
        if not is_admin_or_hod and doc_data.get("user_id") != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this notification")

        doc_ref.update({"is_read": False, "status": "Unread"})
        data = doc_ref.get().to_dict()
        if data.get("created_at"):
            data["time"] = format_relative_time(data.get("created_at"))
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Error marking notification as unread: {e}")
        if is_admin_or_hod:
            for n in DEFAULT_NOTIFICATIONS:
                if n["id"] == notification_id:
                    n["is_read"] = False
                    return n
        raise HTTPException(status_code=500, detail="Failed to update notification")

@router.put("/read-all")
def mark_all_read(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    notification_cache.delete(f"notifs_{current_user.id}")
    unread_count_cache.delete(f"unread_{current_user.id}")
    is_admin_or_hod = current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD, RoleEnum.PRINCIPAL]

    try:
        notifs_ref = db.collection('notifications')
        if is_admin_or_hod:
            docs = list(notifs_ref.where(filter=FieldFilter('user_id', 'in', [current_user.id, 'department'])).limit(50).stream())
            if docs:
                for doc in docs:
                    doc.reference.update({"is_read": True, "status": "Read"})
            else:
                for n in DEFAULT_NOTIFICATIONS:
                    n["is_read"] = True
                    n["status"] = "Read"
        else:
            docs = list(notifs_ref.where(filter=FieldFilter('user_id', '==', current_user.id)).limit(50).stream())
            for doc in docs:
                doc.reference.update({"is_read": True, "status": "Read"})
        return {"message": "All notifications marked as read."}
    except Exception as e:
        logger.warning(f"Error marking all read: {e}")
        if is_admin_or_hod:
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
    notification_cache.delete(f"notifs_{current_user.id}")
    unread_count_cache.delete(f"unread_{current_user.id}")
    is_admin_or_hod = current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD, RoleEnum.PRINCIPAL]

    try:
        doc_ref = db.collection('notifications').document(notification_id)
        doc = doc_ref.get()
        if doc.exists:
            doc_data = doc.to_dict()
            if not is_admin_or_hod and doc_data.get("user_id") != current_user.id:
                raise HTTPException(status_code=403, detail="Not authorized to delete this notification")
            doc_ref.delete()
            return None
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Error deleting notification: {e}")
    
    # Check default notifications
    if is_admin_or_hod:
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
    """
    Safely triggers a notification using deterministic ID hashing to avoid
    costly compound queries on Firestore. Never throws or fails the caller.
    """
    try:
        # Invalidate in-memory caches for the target user
        notification_cache.delete(f"notifs_{user_id}")
        unread_count_cache.delete(f"unread_{user_id}")

        # Deterministic doc ID based on content to naturally deduplicate without reading
        notif_hash = hashlib.md5(f"{user_id}_{title}_{message}".encode("utf-8")).hexdigest()[:16]
        notif_id = f"notif_{notif_hash}"

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
        db.collection('notifications').document(notif_id).set(db_notif, merge=True)
    except Exception as exc:
        logger.warning(f"Failed to trigger notification for user {user_id}: {exc}")

