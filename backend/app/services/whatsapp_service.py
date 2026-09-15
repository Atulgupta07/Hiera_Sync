import re
import uuid
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
import requests

from app.config.settings import settings
from google.cloud.firestore import Client

logger = logging.getLogger(__name__)

def normalize_phone_number(phone: str) -> Optional[str]:
    """
    Validates and formats a phone number into international format without + for WhatsApp API.
    e.g., '+91 98765-43210' -> '919876543210'
    """
    if not phone:
        return None
    cleaned = re.sub(r'[\s\-\(\)\+]', '', str(phone))
    if not cleaned.isdigit():
        return None
    # For Indian 10-digit numbers missing country code, prepend 91
    if len(cleaned) == 10:
        cleaned = f"91{cleaned}"
    if len(cleaned) < 10 or len(cleaned) > 15:
        return None
    return cleaned

def format_display_phone(phone: str) -> str:
    """Formats phone number with + for UI display."""
    norm = normalize_phone_number(phone)
    return f"+{norm}" if norm else str(phone)

class WhatsAppService:
    @staticmethod
    def is_configured() -> bool:
        return bool(
            settings.WHATSAPP_ACCESS_TOKEN and
            settings.WHATSAPP_PHONE_NUMBER_ID
        )

    @staticmethod
    def send_message(
        recipient_phone: str,
        message_text: str,
        template_name: Optional[str] = None,
        template_params: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Calls official Meta WhatsApp Cloud API to send a message.
        """
        normalized_phone = normalize_phone_number(recipient_phone)
        if not normalized_phone:
            return {
                "success": False,
                "error": "Invalid phone number format. Must include valid country code.",
                "provider_id": None
            }

        if not WhatsAppService.is_configured():
            logger.warning("WhatsApp API credentials (ACCESS_TOKEN or PHONE_NUMBER_ID) not configured.")
            return {
                "success": False,
                "error": "WhatsApp Business API credentials are not configured in environment.",
                "provider_id": None
            }

        api_version = settings.WHATSAPP_API_VERSION or "v22.0"
        phone_number_id = settings.WHATSAPP_PHONE_NUMBER_ID
        url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
            "Content-Type": "application/json"
        }

        if template_name:
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": normalized_phone,
                "type": "template",
                "template": {
                    "name": template_name,
                    "language": {"code": "en"},
                }
            }
            if template_params:
                payload["template"]["components"] = [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": str(p)} for p in template_params]
                    }
                ]
        else:
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": normalized_phone,
                "type": "text",
                "text": {
                    "preview_url": False,
                    "body": message_text
                }
            }

        try:
            logger.info(f"Sending WhatsApp message to {normalized_phone}...")
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            res_data = response.json()

            if response.status_code in [200, 201]:
                messages = res_data.get("messages", [])
                provider_id = messages[0].get("id") if messages else None
                logger.info(f"WhatsApp message sent successfully. ID: {provider_id}")
                return {
                    "success": True,
                    "provider_id": provider_id,
                    "error": None
                }
            else:
                error_info = res_data.get("error", {})
                error_msg = error_info.get("message") or f"WhatsApp API Error {response.status_code}"
                logger.error(f"WhatsApp API call failed: {error_msg}")
                return {
                    "success": False,
                    "provider_id": None,
                    "error": error_msg
                }
        except requests.RequestException as exc:
            logger.error(f"Network error connecting to WhatsApp API: {exc}")
            return {
                "success": False,
                "provider_id": None,
                "error": "Network failure connecting to WhatsApp service."
            }

    @staticmethod
    def send_and_record(
        db: Client,
        sender_id: str,
        sender_name: str,
        recipient_id: str,
        recipient_name: str,
        recipient_phone: str,
        message: str,
        message_type: str = "direct",
        template_name: Optional[str] = None,
        template_params: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Validates opt-in, sends WhatsApp message and records to whatsapp_messages collection.
        """
        msg_id = f"wamsg_{uuid.uuid4().hex[:10]}"
        now = datetime.utcnow().isoformat()

        # Check recipient eligibility
        user_doc = db.collection('users').document(recipient_id).get()
        if not user_doc.exists:
            return {
                "success": False,
                "error": "Recipient faculty not found in database."
            }
        user_data = user_doc.to_dict()
        if not user_data.get("whatsapp_enabled", False):
            return {
                "success": False,
                "error": "WhatsApp messaging is not available for this faculty member (not opted in)."
            }

        phone = recipient_phone or user_data.get("phone", "")
        if not phone:
            return {
                "success": False,
                "error": "No phone number configured for this faculty member."
            }

        normalized = normalize_phone_number(phone)
        if not normalized:
            return {
                "success": False,
                "error": "Invalid WhatsApp phone number format."
            }

        api_res = WhatsAppService.send_message(
            recipient_phone=normalized,
            message_text=message,
            template_name=template_name,
            template_params=template_params
        )

        status_val = "sent" if api_res["success"] else "failed"
        provider_msg_id = api_res.get("provider_id")
        err_msg = api_res.get("error")

        msg_record = {
            "id": msg_id,
            "sender_id": sender_id,
            "sender_name": sender_name,
            "recipient_id": recipient_id,
            "recipient_name": recipient_name,
            "recipient_phone": format_display_phone(normalized),
            "message": message,
            "message_type": message_type,
            "template_name": template_name,
            "status": status_val,
            "provider_message_id": provider_msg_id,
            "error_message": err_msg,
            "created_at": now,
            "sent_at": now if api_res["success"] else None
        }

        try:
            db.collection('whatsapp_messages').document(msg_id).set(msg_record)
        except Exception as e:
            logger.error(f"Failed to record WhatsApp message in Firestore: {e}")

        return {
            "success": api_res["success"],
            "message_id": msg_id,
            "status": status_val,
            "error": err_msg,
            "record": msg_record
        }

    @staticmethod
    def is_reminder_already_sent(
        db: Client,
        dedup_key: str
    ) -> bool:
        """
        Prevents sending duplicate reminders.
        """
        doc = db.collection('calendar_reminders_log').document(dedup_key).get()
        return doc.exists

    @staticmethod
    def record_reminder_sent(
        db: Client,
        dedup_key: str,
        activity_id: str,
        recipient_id: str,
        reminder_type: str
    ) -> None:
        try:
            db.collection('calendar_reminders_log').document(dedup_key).set({
                "dedup_key": dedup_key,
                "activity_id": activity_id,
                "recipient_id": recipient_id,
                "reminder_type": reminder_type,
                "sent_at": datetime.utcnow().isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to log reminder deduplication key: {e}")
