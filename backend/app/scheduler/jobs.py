from apscheduler.schedulers.background import BackgroundScheduler
import logging
from datetime import datetime, timedelta
from typing import Optional

from app.database.session import db as global_db, get_db
from app.utils.logging import logger
from app.api.v1.notifications import trigger_notification
from app.services.whatsapp_service import WhatsAppService

scheduler = BackgroundScheduler()

def parse_activity_datetime(date_str: Optional[str], time_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        if time_str:
            clean_time = time_str.strip().upper()
            for fmt in ("%Y-%m-%d %I:%M %p", "%Y-%m-%d %I:%M%p", "%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
                try:
                    return datetime.strptime(f"{date_str} {clean_time}", fmt)
                except ValueError:
                    pass
        return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return None

def check_and_send_calendar_reminders():
    """
    Background scheduler job: Runs every 5 minutes.
    Evaluates upcoming calendar activities and sends both in-app notifications
    and WhatsApp reminders (if configured & eligible) with strict deduplication.
    Never triggered by GET /calendar or page refreshes.
    """
    logger.info("Running background calendar reminder check...")
    try:
        from app.database.session import db
        if db is None:
            return

        events_ref = db.collection('events')
        docs = list(events_ref.stream())
        now = datetime.utcnow()

        for doc in docs:
            evt = doc.to_dict()
            if evt.get("status") == "CANCELLED":
                continue

            if not evt.get("send_whatsapp_reminder"):
                continue

            start_date = evt.get("start_date") or evt.get("date")
            start_time = evt.get("start_time") or "09:00 AM"
            evt_dt = parse_activity_datetime(start_date, start_time)
            if not evt_dt:
                continue

            timing_str = (evt.get("reminder_timing") or "1 day before").lower()
            if "1 hour" in timing_str:
                window_delta = timedelta(hours=1)
            elif "2 hour" in timing_str:
                window_delta = timedelta(hours=2)
            else: # default 1 day
                window_delta = timedelta(days=1)

            reminder_trigger_time = evt_dt - window_delta

            # If reminder trigger time has arrived and event is still upcoming (within 2 hours after trigger)
            if reminder_trigger_time <= now < (evt_dt + timedelta(minutes=30)):
                participants = evt.get("participant_ids") or []
                evt_id = evt.get("id", doc.id)
                evt_title = evt.get("title", "Department Activity")

                for pid in participants:
                    dedup_key = f"rem_{evt_id}_{pid}_{timing_str.replace(' ', '_')}_{start_date}"
                    if WhatsAppService.is_reminder_already_sent(db, dedup_key):
                        continue

                    # Send in-app notification
                    try:
                        trigger_notification(
                            db=db,
                            user_id=pid,
                            notif_type="Calendar",
                            title=f"Reminder: {evt_title}",
                            message=f"Reminder: '{evt_title}' is scheduled for {start_date} at {start_time}.",
                            target_route="/calendar",
                            priority=evt.get("priority", "Medium"),
                            icon="⏰"
                        )
                    except Exception as exc:
                        logger.error(f"In-app reminder error for user {pid}: {exc}")

                    # Send WhatsApp reminder if eligible
                    try:
                        user_doc = db.collection('users').document(pid).get()
                        if user_doc.exists:
                            udata = user_doc.to_dict()
                            if udata.get("whatsapp_enabled") and udata.get("phone"):
                                wa_msg = (
                                    f"Reminder: {evt_title} is scheduled for "
                                    f"{'tomorrow' if 'day' in timing_str else 'today'} at {start_time}."
                                )
                                WhatsAppService.send_and_record(
                                    db=db,
                                    sender_id="system",
                                    sender_name="CampusPulse Scheduler",
                                    recipient_id=pid,
                                    recipient_name=udata.get("name", "Faculty"),
                                    recipient_phone=udata.get("phone"),
                                    message=wa_msg,
                                    message_type="calendar_reminder",
                                    template_name="CALENDAR_ACTIVITY_REMINDER",
                                    template_params=[evt_title, start_time]
                                )
                    except Exception as exc:
                        logger.error(f"WhatsApp reminder dispatch error for user {pid}: {exc}")

                    # Record deduplication key so it is never sent again
                    WhatsAppService.record_reminder_sent(
                        db=db,
                        dedup_key=dedup_key,
                        activity_id=evt_id,
                        recipient_id=pid,
                        reminder_type=timing_str
                    )

    except Exception as e:
        logger.error(f"Error in check_and_send_calendar_reminders job: {e}")

def daily_reminder():
    logger.info("Running daily task reminder job...")

def start_scheduler():
    scheduler.add_job(daily_reminder, 'cron', hour=8, minute=0)
    # Check reminders every 5 minutes
    scheduler.add_job(check_and_send_calendar_reminders, 'interval', minutes=5)
    scheduler.start()
    logger.info("APScheduler started with calendar reminder engine running every 5 minutes.")

def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler stopped.")
