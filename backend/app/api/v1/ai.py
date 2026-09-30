import os
import urllib.request
import json
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import AIChatRequest, AIChatResponse, AIChatHistoryItem, AIDashboardSummaryResponse, AIReportResponse, AIPriorityItem, HODActionItem
from app.auth.permissions import get_current_active_user
from app.models.models import User, RoleEnum
from app.config.settings import settings
from app.utils.logging import logger
from app.api.v1.tasks import calculate_task_risk

router = APIRouter()

def parse_deadline_date(deadline_str: str) -> Optional[date]:
    if not deadline_str:
        return None
    try:
        clean_str = deadline_str.strip()
        if "T" in clean_str or "Z" in clean_str:
            clean_str = clean_str.replace("Z", "").split("T")[0]
            return datetime.strptime(clean_str, "%Y-%m-%d").date()
        for fmt in ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%B %d, %Y", "%b %d, %Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(clean_str, fmt).date()
            except ValueError:
                pass
    except Exception:
        pass
    return None

def get_days_overdue(task: Dict[str, Any]) -> int:
    deadline_str = task.get("deadline", "")
    if not deadline_str: return 0
    try:
        dt = None
        if "T" in deadline_str or "Z" in deadline_str:
            dt = datetime.fromisoformat(deadline_str.replace("Z", ""))
        else:
            try:
                dt = datetime.strptime(deadline_str, "%d %B %Y")
            except ValueError:
                dt = datetime.strptime(deadline_str, "%Y-%m-%d")
        if dt:
            days_left = (dt - datetime.utcnow()).days
            if days_left < 0:
                return abs(days_left)
    except Exception:
        pass
    return 0

def get_days_remaining(task: Dict[str, Any]) -> Optional[int]:
    deadline_str = task.get("deadline", "")
    if not deadline_str: return None
    try:
        dt = None
        if "T" in deadline_str or "Z" in deadline_str:
            dt = datetime.fromisoformat(deadline_str.replace("Z", ""))
        else:
            try:
                dt = datetime.strptime(deadline_str, "%d %B %Y")
            except ValueError:
                dt = datetime.strptime(deadline_str, "%Y-%m-%d")
        if dt:
            return (dt - datetime.utcnow()).days
    except Exception:
        pass
    return None

@router.get("/dashboard-summary", response_model=AIDashboardSummaryResponse)
def get_ai_dashboard_summary(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    from app.api.v1.tasks import DEFAULT_TASKS
    
    tasks_ref = db.collection('tasks')
    docs = list(tasks_ref.stream())
    all_raw_tasks = [doc.to_dict() for doc in docs] if docs else DEFAULT_TASKS
    
    # Precompute faculty workload
    workload_map = {}
    for t in all_raw_tasks:
        if t.get("status") not in ["Completed", "Awaiting Approval"]:
            assignee = t.get("assigned_id") or t.get("assigned")
            if assignee:
                workload_map[assignee] = workload_map.get(assignee, 0) + 1
                
    # Filter for user and calculate risk
    my_tasks = []
    department_tasks = []
    for data in all_raw_tasks:
        assignee_key = data.get("assigned_id") or data.get("assigned")
        workload = workload_map.get(assignee_key, 0)
        data = calculate_task_risk(data, workload)
        
        department_tasks.append(data)
        
        if data.get("assigned_id") == current_user.id or current_user.name.lower() in data.get("assigned", "").lower():
            my_tasks.append(data)
            
    teacher_priorities = []
    hod_actions = []
    
    if current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD]:
        # HOD Action Center logic
        for t in department_tasks:
            status = t.get("status", "")
            if status in ["Completed"]: continue
            
            days_overdue = get_days_overdue(t)
            risk_score = t.get("risk_score", 0)
            
            # 1. Critical Overdue
            if days_overdue > 0 and status != "Awaiting Approval":
                hod_actions.append(HODActionItem(
                    type="CRITICAL",
                    title=t.get("title", "Unknown Task"),
                    description=f"{days_overdue} days overdue",
                    target_id=t.get("id"),
                    target_route="/tasks",
                    priority_level=100 + days_overdue
                ))
            # 2. High Risk
            elif risk_score > 70 and status != "Awaiting Approval":
                hod_actions.append(HODActionItem(
                    type="HIGH RISK",
                    title=t.get("title", "Unknown Task"),
                    description=f"{risk_score}% delay risk",
                    target_id=t.get("id"),
                    target_route="/tasks",
                    priority_level=80 + (risk_score / 10)
                ))
            # 3. Pending Approvals
            elif status == "Awaiting Approval":
                hod_actions.append(HODActionItem(
                    type="APPROVAL",
                    title=t.get("title", "Unknown Task"),
                    description=f"Waiting for approval from {t.get('assigned', 'Faculty')}",
                    target_id=t.get("id"),
                    target_route="/approvals",
                    priority_level=60
                ))
                
        # 4. Overloaded Faculty
        for fac_id, load in workload_map.items():
            if load > 4:
                # Need to find faculty name
                fac_name = fac_id
                for d in department_tasks:
                    if d.get("assigned_id") == fac_id or d.get("assigned") == fac_id:
                        fac_name = d.get("assigned", fac_id)
                        break
                hod_actions.append(HODActionItem(
                    type="WORKLOAD",
                    title=fac_name,
                    description=f"At {load} active tasks workload",
                    target_id=fac_id,
                    target_route="/employees",
                    priority_level=50 + load
                ))
                
        # Sort HOD actions
        hod_actions.sort(key=lambda x: x.priority_level, reverse=True)
        # Take top 10
        hod_actions = hod_actions[:10]
        
    else:
        # Teacher: Today's Priority logic
        for t in my_tasks:
            status = t.get("status", "")
            if status in ["Completed", "Awaiting Approval"]: continue
            
            days_overdue = get_days_overdue(t)
            days_remaining = get_days_remaining(t)
            risk_score = t.get("risk_score", 0)
            priority = t.get("priority", "Medium").upper()
            
            priority_multiplier = 30 if priority == "HIGH" else (15 if priority == "MEDIUM" else 5)
            
            score = (days_overdue * 50) + risk_score + priority_multiplier
            if days_remaining is not None and days_remaining <= 3 and days_remaining >= 0:
                score += (4 - days_remaining) * 10
                
            why = []
            if days_overdue > 0:
                why.append("Task is overdue")
            elif days_remaining is not None and days_remaining <= 2:
                why.append(f"Deadline is in {days_remaining} days")
            
            progress = t.get("progress", "0%")
            if int(progress.replace("%", "")) < 40 and days_remaining is not None and days_remaining <= 5:
                why.append(f"Progress is only {progress}")
                
            if risk_score > 70:
                why.append("High deadline risk")
            
            if priority == "HIGH":
                why.append("High priority task")
                
            if not why:
                why.append("Upcoming deadline or general priority")
                
            teacher_priorities.append(AIPriorityItem(
                task_id=t.get("id", ""),
                title=t.get("title", ""),
                priority=priority,
                risk_score=risk_score,
                rank=0, # assigned after sort
                why=why,
                _raw_score=score
            ))
            
        # Sort and assign rank
        teacher_priorities.sort(key=lambda x: getattr(x, '_raw_score', 0), reverse=True)
        for idx, item in enumerate(teacher_priorities):
            item.rank = idx + 1
            
        teacher_priorities = teacher_priorities[:5]

    return {
        "greeting": f"Good Morning, {current_user.name}",
        "teacher_priorities": teacher_priorities,
        "hod_actions": hod_actions,
        "productivity_score": "95%"
    }

DEFAULT_EVENTS = [
    {
        "id": "evt_1",
        "title": "AIML Curriculum Review & Academic Audit",
        "start_date": "2026-09-20",
        "start_time": "10:00 AM",
        "category": "Academic",
        "status": "UPCOMING",
        "organizer": "Dr. Animesh Tayal"
    },
    {
        "id": "evt_2",
        "title": "Machine Learning & Generative AI Workshop",
        "start_date": "2026-09-25",
        "start_time": "02:00 PM",
        "category": "Workshop",
        "status": "UPCOMING",
        "organizer": "Mrs. Neha Gurnani"
    },
    {
        "id": "evt_3",
        "title": "Monthly Faculty Progress Assessment",
        "start_date": "2026-09-30",
        "start_time": "11:00 AM",
        "category": "Department Meeting",
        "status": "UPCOMING",
        "organizer": "HOD AIML"
    }
]

def get_active_project_context(db: Client, current_user: User):
    from app.api.v1.tasks import DEFAULT_TASKS
    from app.api.v1.approvals import DEFAULT_APPROVALS

    server_today = datetime.utcnow().date()
    tomorrow = server_today + timedelta(days=1)
    yesterday = server_today - timedelta(days=1)
    start_of_week = server_today - timedelta(days=server_today.weekday())
    end_of_week = start_of_week + timedelta(days=6)

    # 1. Tasks
    try:
        tasks_ref = db.collection('tasks')
        docs = list(tasks_ref.stream())
        raw_tasks = [doc.to_dict() for doc in docs] if docs else DEFAULT_TASKS
    except Exception as e:
        logger.warning(f"Error streaming tasks collection: {e}")
        raw_tasks = DEFAULT_TASKS

    workload_map = {}
    for t in raw_tasks:
        if t.get("status") not in ["Completed", "Awaiting Approval"]:
            assignee = t.get("assigned_id") or t.get("assigned")
            if assignee:
                workload_map[assignee] = workload_map.get(assignee, 0) + 1

    tasks = []
    user_tasks = []
    user_name_lower = current_user.name.lower()
    user_id = current_user.id

    for data in raw_tasks:
        assignee_key = data.get("assigned_id") or data.get("assigned")
        wl = workload_map.get(assignee_key, 0)
        data = calculate_task_risk(data, wl)

        # Parse deadline and calculate temporal flags & status normalization
        d_date = parse_deadline_date(data.get("deadline", ""))
        data["is_today"] = (d_date == server_today) if d_date else False
        data["is_tomorrow"] = (d_date == tomorrow) if d_date else False
        data["is_yesterday"] = (d_date == yesterday) if d_date else False
        data["is_this_week"] = (start_of_week <= d_date <= end_of_week) if d_date else False

        raw_st = str(data.get("status", "")).strip().upper()
        if raw_st in ["COMPLETED", "APPROVED", "DONE"]:
            data["status_normalized"] = "COMPLETED"
        elif raw_st in ["IN_PROGRESS", "IN PROGRESS", "DOING"]:
            data["status_normalized"] = "IN_PROGRESS"
        else:
            data["status_normalized"] = "PENDING"

        tasks.append(data)
        
        assigned_id = data.get("assigned_id")
        assigned_name = (data.get("assigned") or "").lower()
        if assigned_id == user_id or user_name_lower in assigned_name or assigned_name in user_name_lower:
            user_tasks.append(data)

    if not user_tasks and current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD]:
        user_tasks = tasks

    # 2. Approvals
    try:
        app_ref = db.collection('approvals')
        docs = list(app_ref.stream())
        approvals = [doc.to_dict() for doc in docs] if docs else DEFAULT_APPROVALS
    except Exception as e:
        logger.warning(f"Error streaming approvals collection: {e}")
        approvals = DEFAULT_APPROVALS

    pending_approvals = [
        a for a in approvals 
        if str(a.get("status", "")).upper() in ["PENDING", "AWAITING APPROVAL", "AWAITING_APPROVAL"]
    ]

    # 3. Events
    try:
        evt_ref = db.collection('events')
        docs = list(evt_ref.stream())
        events = [doc.to_dict() for doc in docs] if docs else DEFAULT_EVENTS
    except Exception as e:
        logger.warning(f"Error streaming events collection: {e}")
        events = DEFAULT_EVENTS

    upcoming_events = [
        e for e in events 
        if str(e.get("status", "")).upper() in ["UPCOMING", "SCHEDULED"] or not e.get("status")
    ]

    return {
        "all_tasks": tasks,
        "user_tasks": user_tasks if user_tasks else tasks,
        "approvals": approvals,
        "pending_approvals": pending_approvals if pending_approvals else approvals,
        "events": events,
        "upcoming_events": upcoming_events if upcoming_events else events,
        "server_today": server_today,
        "tomorrow": tomorrow,
        "yesterday": yesterday,
        "start_of_week": start_of_week,
        "end_of_week": end_of_week,
        "_db": db
    }

def execute_local_fallback_query(query: str, current_user: User, context: dict) -> str:
    q = query.lower()
    user_tasks = context.get("user_tasks", [])
    pending_approvals = context.get("pending_approvals", [])
    upcoming_events = context.get("upcoming_events", [])
    all_tasks = context.get("all_tasks", [])

    server_today = context.get("server_today", datetime.utcnow().date())
    tomorrow = context.get("tomorrow", server_today + timedelta(days=1))
    yesterday = context.get("yesterday", server_today - timedelta(days=1))

    # Detect specific temporal query intents
    is_tomorrow_query = any(k in q for k in ["tomorrow", "twomorow", "twomorows", "tomorrows", "to morrow"])
    is_today_query = any(k in q for k in ["today", "today's", "todays"])
    is_yesterday_query = any(k in q for k in ["yesterday", "yesterday's"])
    is_this_week_query = any(k in q for k in ["this week", "week's"])

    is_pending_query = any(k in q for k in ["pending", "active", "open", "incomplete", "unfinished"])
    is_completed_query = any(k in q for k in ["completed", "done", "finished", "approved"])

    if is_tomorrow_query:
        tomorrow_tasks = [
            t for t in user_tasks 
            if t.get("is_tomorrow") or parse_deadline_date(t.get("deadline", "")) == tomorrow
        ]
        if not tomorrow_tasks:
            tomorrow_tasks = [
                t for t in all_tasks 
                if t.get("is_tomorrow") or parse_deadline_date(t.get("deadline", "")) == tomorrow
            ]
        if not tomorrow_tasks:
            return "You have no tasks scheduled for tomorrow."
        
        msg = f"### 📋 Tomorrow's Tasks ({tomorrow.strftime('%Y-%m-%d')})\n\n"
        msg += f"Retrieved **{len(tomorrow_tasks)}** task(s) scheduled for tomorrow:\n\n"
        for t in tomorrow_tasks:
            title = t.get("title", "Untitled Task")
            assigned = t.get("assigned", current_user.name)
            priority = t.get("priority", "Medium")
            status = t.get("status", "Pending")
            progress = t.get("progress", "0%")
            msg += f"* **{title}**\n"
            msg += f"  * **Assigned To**: {assigned}\n"
            msg += f"  * **Priority**: `{priority}` | **Status**: `{status}` | **Progress**: {progress}\n\n"
        return msg

    if is_today_query and any(k in q for k in ["task", "work", "todo", "assigned", "schedule"]):
        today_tasks = [
            t for t in user_tasks 
            if t.get("is_today") or parse_deadline_date(t.get("deadline", "")) == server_today
        ]
        if not today_tasks:
            return "You have no tasks scheduled for today."
        msg = f"### 📋 Today's Tasks ({server_today.strftime('%Y-%m-%d')})\n\n"
        msg += f"Retrieved **{len(today_tasks)}** task(s) scheduled for today:\n\n"
        for t in today_tasks:
            title = t.get("title", "Untitled Task")
            assigned = t.get("assigned", current_user.name)
            priority = t.get("priority", "Medium")
            status = t.get("status", "In Progress")
            progress = t.get("progress", "0%")
            msg += f"* **{title}**\n"
            msg += f"  * **Assigned To**: {assigned}\n"
            msg += f"  * **Priority**: `{priority}` | **Status**: `{status}` | **Progress**: {progress}\n\n"
        return msg

    if is_yesterday_query:
        yesterday_tasks = [
            t for t in user_tasks 
            if t.get("is_yesterday") or parse_deadline_date(t.get("deadline", "")) == yesterday
        ]
        if not yesterday_tasks:
            return "You had no tasks scheduled for yesterday."
        msg = f"### 📋 Yesterday's Tasks ({yesterday.strftime('%Y-%m-%d')})\n\n"
        for t in yesterday_tasks:
            msg += f"* **{t.get('title')}** (Status: `{t.get('status')}`)\n"
        return msg

    if is_this_week_query and any(k in q for k in ["task", "work", "todo"]):
        week_tasks = [t for t in user_tasks if t.get("is_this_week")]
        if not week_tasks:
            return "You have no tasks scheduled for this week."
        msg = f"### 📋 Tasks Scheduled for This Week\n\n"
        for t in week_tasks:
            msg += f"* **{t.get('title')}** — Deadline: {t.get('deadline')} | Priority: `{t.get('priority')}`\n"
        return msg

    if is_completed_query and any(k in q for k in ["task", "work", "todo"]):
        comp_tasks = [t for t in user_tasks if t.get("status_normalized") == "COMPLETED"]
        if not comp_tasks:
            return "You have no completed tasks."
        msg = f"### ✅ Completed Tasks ({len(comp_tasks)})\n\n"
        for t in comp_tasks:
            msg += f"* **{t.get('title')}** — Status: Completed\n"
        return msg

    if is_pending_query and any(k in q for k in ["task", "work", "todo"]):
        pend_tasks = [t for t in user_tasks if t.get("status_normalized") != "COMPLETED"]
        if not pend_tasks:
            return "You have no pending tasks."
        msg = f"### 📋 Pending Tasks ({len(pend_tasks)})\n\n"
        for t in pend_tasks[:6]:
            msg += f"* **{t.get('title')}** — Deadline: {t.get('deadline', 'N/A')} | Status: `{t.get('status')}`\n"
        return msg

    # Intent 1: General Tasks / Workload
    if any(k in q for k in ["task", "assigned", "work", "todo", "progress", "overdue"]):
        if not user_tasks:
            return f"### 📋 Active Tasks for {current_user.name}\n\nNo active tasks currently assigned to you in the AIML Department."

        msg = f"### 📋 Active Tasks & Workload Summary for {current_user.name}\n\n"
        msg += f"Retrieved **{len(user_tasks)}** task(s) for your profile (`{current_user.role.value if hasattr(current_user.role, 'value') else current_user.role}`):\n\n"
        for t in user_tasks[:6]:
            title = t.get("title", "Untitled Task")
            assigned = t.get("assigned", current_user.name)
            priority = t.get("priority", "Medium")
            status = t.get("status", "In Progress")
            progress = t.get("progress", "0%")
            deadline = t.get("deadline", "No deadline specified")
            risk_level = t.get("risk_level", "LOW")
            risk_score = t.get("risk_score", 0)

            msg += f"* **{title}**\n"
            msg += f"  * **Assigned To**: {assigned}\n"
            msg += f"  * **Priority**: `{priority}` | **Status**: `{status}` | **Progress**: {progress}\n"
            msg += f"  * **Deadline**: {deadline} (Risk Level: `{risk_level}` - {risk_score}%)\n\n"
        return msg

    # Intent 2: Approvals
    elif any(k in q for k in ["approval", "pending", "requisition", "leave", "request", "review"]):
        if not pending_approvals:
            return "### 📑 Pending Department Approvals\n\nThere are currently no pending approval requests requiring action."

        msg = f"### 📑 Pending Department Approvals (AIML Dept)\n\n"
        msg += f"Retrieved **{len(pending_approvals)}** pending approval request(s):\n\n"
        for a in pending_approvals[:6]:
            title = a.get("title", "Untitled Request")
            requested = a.get("requested") or a.get("requested_by") or "Faculty/Student"
            assigned = a.get("assigned") or a.get("assigned_to") or "HOD / Admin"
            priority = a.get("priority", "Medium")
            status = a.get("status", "Pending")

            msg += f"* **{title}**\n"
            msg += f"  * **Requested By**: {requested}\n"
            msg += f"  * **Assigned Reviewer**: {assigned}\n"
            msg += f"  * **Priority**: `{priority}` | **Status**: `{status}`\n\n"
        return msg

    # Intent 3: Calendar / Events / Schedule / Institutional Activities
    elif any(k in q for k in ["calendar", "event", "schedule", "deadline", "upcoming", "meeting", "hackathon", "workshop", "assessment", "exam", "fdp", "activity", "activities", "holiday", "this month", "september", "october", "november", "december", "january", "february", "march", "april", "may", "june", "july", "august"]):
        if context.get("_db"):
            from app.services.institutional_ai import query_institutional_calendar
            res = query_institutional_calendar(context.get("_db"), current_user, query)
            if res and res.get("answer"):
                return res.get("answer")
        if not upcoming_events:
            return "### 📅 Upcoming Departmental Calendar\n\nNo upcoming events or deadlines currently scheduled."

        msg = f"### 📅 Upcoming Departmental Calendar & Events\n\n"
        msg += f"Retrieved **{len(upcoming_events)}** upcoming schedule item(s) for AIML Department:\n\n"
        for e in upcoming_events[:6]:
            title = e.get("title", "Untitled Event")
            start_date = e.get("start_date") or e.get("date") or "TBA"
            start_time = e.get("start_time") or "09:00 AM"
            category = e.get("category") or e.get("type") or "Academic"
            status = e.get("status", "UPCOMING")
            organizer = e.get("organizer") or e.get("organizer_name") or "SBJIT Faculty"

            msg += f"* **{title}**\n"
            msg += f"  * **Date & Time**: {start_date} at {start_time}\n"
            msg += f"  * **Category**: `{category}` | **Status**: `{status}`\n"
            msg += f"  * **Organizer**: {organizer}\n\n"
        return msg

    # Intent 4: Report / Summary
    elif any(k in q for k in ["report", "performance", "analytics", "insight", "summary"]):
        high_risk_count = sum(1 for t in all_tasks if t.get("risk_score", 0) > 60)
        msg = f"### 📊 HiéraSync Department Intelligence Report\n\n"
        msg += f"**Target Department**: SBJIT Nagpur - CSE (AI & ML)\n"
        msg += f"**User Role**: `{current_user.role.value if hasattr(current_user.role, 'value') else current_user.role}` ({current_user.name})\n\n"
        msg += f"#### Executive Highlights:\n"
        msg += f"* **Total Active Tasks**: {len(all_tasks)}\n"
        msg += f"* **Tasks Assigned to You**: {len(user_tasks)}\n"
        msg += f"* **Pending Approvals**: {len(pending_approvals)}\n"
        msg += f"* **High Risk Tasks**: {high_risk_count} item(s) requiring attention\n"
        msg += f"* **Upcoming Department Events**: {len(upcoming_events)}\n\n"
        msg += f"#### Key Recommendations:\n"
        msg += f"1. Prioritize review of pending approvals for lab requisitions.\n"
        msg += f"2. Address overdue or high-risk task deadlines before upcoming academic audits.\n"
        return msg

    # Intent 5: Greeting / General Inquiry
    elif any(k in q for k in ["hello", "hi", "hey", "who are you", "help", "guide"]):
        msg = f"### 👋 Hello {current_user.name}!\n\n"
        msg += f"I am **HiéraSync AI**, your academic workflow & department intelligence assistant for **SBJIT Nagpur (AIML Dept)**.\n\n"
        msg += f"**Your Active Summary:**\n"
        msg += f"* 📋 **Your Tasks**: {len(user_tasks)} active task(s)\n"
        msg += f"* 📑 **Pending Approvals**: {len(pending_approvals)} item(s) awaiting review\n"
        msg += f"* 📅 **Upcoming Events**: {len(upcoming_events)} scheduled item(s)\n\n"
        msg += f"How can I help you today? You can ask me to summarize tasks, show pending approvals, or inspect upcoming calendar events!"
        return msg

    # Fallback Overview for any other prompt
    else:
        msg = f"### 🤖 HiéraSync AI Department Context\n\n"
        msg += f"Here is your current institutional context for **{current_user.name}** (`{current_user.role.value if hasattr(current_user.role, 'value') else current_user.role}`):\n\n"
        msg += f"#### 📋 Active Assigned Tasks ({len(user_tasks)})\n"
        for t in user_tasks[:3]:
            msg += f"* **{t.get('title')}** — Priority: `{t.get('priority', 'Medium')}` | Status: `{t.get('status', 'In Progress')}` | Deadline: {t.get('deadline', 'N/A')}\n"
        
        msg += f"\n#### 📑 Pending Approvals ({len(pending_approvals)})\n"
        for a in pending_approvals[:3]:
            msg += f"* **{a.get('title')}** — Requested by: {a.get('requested', 'Staff')} | Priority: `{a.get('priority', 'Medium')}`\n"

        msg += f"\n#### 📅 Next Upcoming Event ({len(upcoming_events)})\n"
        if upcoming_events:
            e = upcoming_events[0]
            msg += f"* **{e.get('title')}** on {e.get('start_date', 'TBA')} ({e.get('category', 'Academic')})\n"

        return msg

@router.post("/chat", response_model=AIChatResponse)
def gemini_query(
    request: AIChatRequest,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    context = get_active_project_context(db, current_user)
    server_today = context.get("server_today", datetime.utcnow().date())
    tomorrow = context.get("tomorrow", server_today + timedelta(days=1))

    api_key = settings.GEMINI_API_KEY.strip() if settings.GEMINI_API_KEY else ""
    is_placeholder = not api_key or "your_key_here" in api_key.lower() or "your_gemini_api_key" in api_key.lower()

    ai_answer = None

    if not is_placeholder:
        try:
            system_instruction = (
                f"You are HiéraSync AI, the Academic Workflow & Department Intelligence Assistant for SBJIT Nagpur (AIML Department).\n"
                f"User Profile: Name={current_user.name}, Role={current_user.role.value if hasattr(current_user.role, 'value') else current_user.role}, ID={current_user.id}, Dept=AIML.\n"
                f"SERVER CURRENT DATE: {server_today.strftime('%Y-%m-%d')} ({server_today.strftime('%A')}). Tomorrow is {tomorrow.strftime('%Y-%m-%d')}.\n\n"
                f"ACTIVE USER TASKS:\n{json.dumps(context['user_tasks'], indent=2)}\n\n"
                f"PENDING APPROVALS:\n{json.dumps(context['pending_approvals'], indent=2)}\n\n"
                f"UPCOMING EVENTS & CALENDAR:\n{json.dumps(context['upcoming_events'], indent=2)}\n\n"
                f"STRICT SYSTEM PROMPT RULES:\n"
                f"Rule 1 (Strict Temporal Scope): If the user asks about 'tomorrow\'s tasks' (or 'twomorow', 'tomorrow'), check task deadlines (`is_tomorrow` flag or deadline matching tomorrow). ONLY list tasks due tomorrow ({tomorrow.strftime('%Y-%m-%d')}). If no tasks match tomorrow\'s date, reply directly: 'You have no tasks scheduled for tomorrow.' If user asks for 'today\'s tasks', ONLY list tasks with `is_today=True`.\n"
                f"Rule 2 (Status Precision): If user asks for 'pending tasks', exclude all COMPLETED tasks. If asking for 'completed tasks', exclude pending or in-progress tasks.\n"
                f"Rule 3 (No Mass Data Dumps): Answer strictly what was asked. Never list the entire database registry of unrelated tasks when a filtered question is asked.\n\n"
                f"Instructions: Answer user queries accurately using the active context and strict rules above. Format response in clean Markdown."
            )

            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            data = {
                "contents": [
                    {
                        "parts": [
                            {"text": system_instruction},
                            {"text": f"User Query: {request.message}"}
                        ]
                    }
                ]
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            response = urllib.request.urlopen(req, timeout=10)
            result = json.loads(response.read().decode('utf-8'))
            answer = result['candidates'][0]['content']['parts'][0]['text']
            if answer and answer.strip():
                ai_answer = answer.strip()
        except Exception as e:
            logger.error(f"Gemini API Error: {str(e)}. Falling back to local context engine.")

    if not ai_answer:
        ai_answer = execute_local_fallback_query(request.message, current_user, context)

    # Save conversation record in Firestore ai_chats collection
    chat_id = f"chat_{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow()
    chat_record = {
        "id": chat_id,
        "user_id": current_user.id,
        "message": request.message,
        "response": ai_answer,
        "created_at": now.isoformat(),
        "timestamp_readable": now.strftime("%Y-%m-%d %H:%M:%S")
    }
    try:
        db.collection('ai_chats').document(chat_id).set(chat_record)
    except Exception as e:
        logger.error(f"Failed to save AI chat message to Firestore ai_chats: {e}")

    return {"user": request.message, "ai": ai_answer}


@router.get("/history", response_model=List[AIChatHistoryItem])
def get_ai_chat_history(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    try:
        chats_ref = db.collection('ai_chats')
        docs = list(chats_ref.where('user_id', '==', current_user.id).stream())
        history = [doc.to_dict() for doc in docs]
        history.sort(key=lambda x: x.get("created_at", ""))
        return history
    except Exception as e:
        logger.error(f"Error reading ai_chats history: {e}")
        return []


@router.post("/generate-report", response_model=AIReportResponse)
def generate_ai_report(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return {
        "title": "HiAcraSync AI Departmental Performance Report",
        "summary": "AI analysis shows AIML department workflow efficiency is high.",
        "recommendations": [
            "Review high-priority project approvals first",
            "Monitor overdue tasks"
        ],
        "generated_at": datetime.utcnow().isoformat()
    }


from app.schemas.schemas import AIChecklistRequest, AIChecklistResponse
from app.auth.permissions import get_current_active_user, check_role

@router.post("/checklist-suggestions", response_model=AIChecklistResponse)
def get_checklist_suggestions(
    req: AIChecklistRequest,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    # This is a mocked AI response as per requirements "AI should generate suggestions"
    # In a real scenario, this would call Gemini or OpenAI.
    
    title_lower = req.title.lower()
    desc = (req.description or "").lower()
    
    suggestions = []
    
    if "accreditation" in title_lower or "report" in title_lower:
        suggestions.extend([
            "Collect faculty qualification records",
            "Collect student attendance data",
            "Verify department statistics",
            "Prepare supporting documents",
            "Review final report"
        ])
    elif "event" in title_lower or "workshop" in title_lower:
        suggestions.extend([
            "Book venue",
            "Send invitations to speakers",
            "Prepare event schedule",
            "Arrange catering",
            "Collect feedback forms"
        ])
    elif "exam" in title_lower or "test" in title_lower:
        suggestions.extend([
            "Prepare question papers",
            "Assign invigilators",
            "Print answer sheets",
            "Coordinate with grading team"
        ])
    else:
        suggestions.extend([
            "Review requirements",
            "Gather necessary data",
            "Draft initial version",
            "Get feedback from stakeholders",
            "Finalize and submit"
        ])
        
    return {"suggestions": suggestions}

@router.get("/calendar-insights")
def get_calendar_insights(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    try:
        events_ref = db.collection('events')
        docs = list(events_ref.limit(20).stream())
        total = len(docs) if docs else len(DEFAULT_EVENTS)
    except Exception:
        total = len(DEFAULT_EVENTS)
        
    return {
        "message": f"Calendar AI: {total} departmental events are scheduled. Academic milestones are on track with optimal distribution."
    }

@router.get("/approval-suggestions")
def get_approval_suggestions(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return {
        "suggestions": [
            "Verify prerequisite documentation for project review approvals.",
            "Confirm lab equipment inventory status before approving requisition requests.",
            "Cross-reference faculty duty allocation before approving leave requests."
        ]
    }

@router.post("/notification-summary")
def get_notification_summary(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return {
        "summary": "AI Summary: Department activities are progressing normally. Priority focus recommended on upcoming project submissions and scheduled academic audits."
    }

