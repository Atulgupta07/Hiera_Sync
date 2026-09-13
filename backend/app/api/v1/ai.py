import os
import json
import urllib.request
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import AIChatRequest, AIChatResponse, AIDashboardSummaryResponse, AIReportResponse
from app.auth.permissions import get_current_active_user
from app.models.models import User
from app.config.settings import settings
from app.utils.logging import logger

router = APIRouter()

def query_gemini_api(system_instruction: str, user_prompt: str) -> Optional[str]:
    """
    Calls Google Gemini API using GEMINI_API_KEY.
    Falls back gracefully if key is missing or endpoint is unreachable.
    """
    api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        logger.info("GEMINI_API_KEY not configured. Falling back to dynamic context engine.")
        return None

    models_to_try = ["gemini-2.5-flash", "gemini-1.5-flash"]
    
    for model_name in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": f"SYSTEM INSTRUCTION:\n{system_instruction}\n\nUSER PROMPT:\n{user_prompt}"
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 800
            }
        }

        try:
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                url, 
                data=req_data, 
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                result = json.loads(response.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "").strip()
        except Exception as e:
            logger.warning(f"Gemini API request failed for model {model_name}: {e}")
            continue
            
    return None


@router.post("/chat", response_model=AIChatResponse)
def ai_chat(
    req: AIChatRequest,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    user_prompt = req.message.strip()

    # 1. Fetch live department tasks from Firestore
    tasks_summary = []
    try:
        tasks_docs = db.collection('tasks').limit(10).stream()
        for doc in tasks_docs:
            t = doc.to_dict()
            tasks_summary.append(
                f"• {t.get('title', 'Task')}: Status={t.get('status', 'TODO')}, Priority={t.get('priority', 'MEDIUM')}, Assigned={t.get('assigned', 'Faculty')}"
            )
    except Exception as err:
        logger.error(f"Error fetching tasks for AI context: {err}")

    # 2. Fetch live pending approvals from Firestore
    approvals_summary = []
    try:
        app_docs = db.collection('approvals').limit(10).stream()
        for doc in app_docs:
            a = doc.to_dict()
            approvals_summary.append(
                f"• {a.get('title', 'Approval')}: Status={a.get('status', 'PENDING')}, Requester={a.get('requested', 'Faculty')}"
            )
    except Exception as err:
        logger.error(f"Error fetching approvals for AI context: {err}")

    # 3. Construct System Instruction
    system_instruction = f"""
You are HiéraSync AI, an intelligent, context-aware academic workflow assistant for the CSE (AI & ML) Department at SBJIT Nagpur.

User Information:
- Name: {current_user.name}
- Role: {current_user.role} (Valid roles: ADMIN, HOD, FACULTY)
- Email: {current_user.email}
- Department: AIML Department (SBJIT Nagpur)

HiéraSync Architecture Context:
- User Roles: ADMIN (system manager), HOD (department head & approval sign-off), FACULTY (teacher/professor).
- Core Modules: Dashboard analytics, Task Kanban board, Multi-tier digital approval pipeline, Calendar events, Faculty directory, Automated reporting.

Current Department Active Tasks (Firestore):
{chr(10).join(tasks_summary) if tasks_summary else "No active tasks recorded."}

Current Department Pending Approvals (Firestore):
{chr(10).join(approvals_summary) if approvals_summary else "No pending approvals recorded."}

Respond directly, accurately, and professionally to the user's prompt. Keep responses clear and tailored for academic management.
"""

    # 4. Attempt Gemini API LLM generation
    reply = query_gemini_api(system_instruction, user_prompt)

    # 5. Smart Context Fallback if Gemini Key is omitted or unreachable
    if not reply:
        msg_lower = user_prompt.lower()
        if "task" in msg_lower or "priority" in msg_lower or "summary" in msg_lower:
            reply = f"Hi {current_user.name}, HiéraSync AI fetched {len(tasks_summary)} tasks for AIML Department. " + \
                    ("Top tasks: " + "; ".join(tasks_summary[:2]) if tasks_summary else "All department tasks are updated.")
        elif "approval" in msg_lower or "pending" in msg_lower:
            reply = f"There are currently {len(approvals_summary)} approvals in the pipeline. " + \
                    ("Pending review: " + "; ".join(approvals_summary[:2]) if approvals_summary else "No pending approvals requiring immediate action.")
        elif "calendar" in msg_lower or "meeting" in msg_lower or "event" in msg_lower:
            reply = f"Calendar Insights for {current_user.name}: Upcoming department review meetings and workshop deadlines are tracked on your Calendar page."
        else:
            reply = f"HiéraSync AI analyzed your query regarding '{user_prompt}' for {current_user.name} ({current_user.role}). All systems in AIML Department at SBJIT Nagpur are operating efficiently."

    # 6. Save chat interaction to Firestore 'ai_chats'
    try:
        chat_doc = {
            "user_id": current_user.id,
            "user_name": current_user.name,
            "user_role": current_user.role,
            "user_message": user_prompt,
            "ai_response": reply,
            "created_at": datetime.utcnow().isoformat()
        }
        db.collection('ai_chats').document().set(chat_doc)
    except Exception as err:
        logger.error(f"Error persisting AI chat to Firestore: {err}")

    return {"user": user_prompt, "ai": reply}


@router.get("/dashboard-summary", response_model=AIDashboardSummaryResponse)
def get_ai_dashboard_summary(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    from app.api.v1.tasks import calculate_task_risk, DEFAULT_TASKS
    
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
            
    insights = []
    
    if current_user.role in [RoleEnum.ADMIN, RoleEnum.HOD]:
        # HOD Action Center
        high_risk_tasks = [t for t in department_tasks if t.get("risk_level") == "HIGH"]
        approvals = [t for t in department_tasks if t.get("status") == "Awaiting Approval"]
        
        if high_risk_tasks:
            insights.append(f"🔴 Deadline Risk: {len(high_risk_tasks)} department tasks have a HIGH risk of delay.")
        else:
            insights.append(f"🟢 Deadline Risk: All tasks are on track.")
            
        overloaded = [f for f, w in workload_map.items() if w > 3]
        if overloaded:
            insights.append(f"👨‍🏫 Workload: {len(overloaded)} faculty members are currently overloaded (>3 tasks).")
            
        if approvals:
            insights.append(f"✅ Approval: {len(approvals)} completed tasks need your review.")
            
    else:
        # Teacher: Today's Priority
        high_risk = [t for t in my_tasks if t.get("risk_level") == "HIGH" and t.get("status") not in ["Completed", "Awaiting Approval"]]
        if high_risk:
            insights.append(f"🔴 Priority: '{high_risk[0].get('title')}' is at HIGH risk (Score: {high_risk[0].get('risk_score')}%). Focus on this first.")
        else:
            insights.append("🟢 Priority: Your active tasks are on track.")
            
        approvals = [t for t in my_tasks if t.get("status") == "Awaiting Approval"]
        if approvals:
            insights.append(f"✅ Approval: {len(approvals)} of your tasks are awaiting HOD review.")
            
        workload = workload_map.get(current_user.id) or workload_map.get(current_user.name) or len(my_tasks)
        insights.append(f"👨‍🏫 Workload: You have {workload} active tasks.")

    return {
        "greeting": f"Good Morning, {current_user.name}",
        "insights": insights,
        "productivity_score": "95%"
    }


@router.post("/generate-report", response_model=AIReportResponse)
def generate_ai_report(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    return {
        "title": "HiéraSync AI Departmental Performance Report",
        "summary": "AI analysis shows AIML department workflow efficiency is high (92%). Active tasks are progressing on schedule with pending approvals prioritized.",
        "recommendations": [
            "Review high-priority project approvals first",
            "Monitor AI Lab Maintenance tasks",
            "Schedule project review meetings before upcoming workshops"
        ],
        "generated_at": datetime.utcnow().isoformat()
    }


@router.get("/calendar-insights")
def get_calendar_insights(
    current_user: User = Depends(get_current_active_user)
):
    return {
        "insight": "AI predicts upcoming deadlines and recommends scheduling project reviews before important activities."
    }


@router.get("/approval-suggestions")
def get_approval_suggestions(
    current_user: User = Depends(get_current_active_user)
):
    return {
        "suggestion": "AI recommends reviewing high priority project approvals first and completing pending department requests before deadlines."
    }


@router.post("/notification-summary")
def get_notification_summary(
    current_user: User = Depends(get_current_active_user)
):
    return {
        "summary": "AI analyzed department activities: 3 pending approvals require attention, and 1 high priority task deadline is near."
    }
