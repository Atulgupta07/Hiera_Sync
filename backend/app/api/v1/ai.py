import os
import urllib.request
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import AIChatRequest, AIChatResponse, AIDashboardSummaryResponse, AIReportResponse, AIPriorityItem, HODActionItem
from app.auth.permissions import get_current_active_user
from app.models.models import User, RoleEnum
from app.config.settings import settings
from app.utils.logging import logger
from app.api.v1.tasks import calculate_task_risk

router = APIRouter()

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

@router.post("/chat", response_model=AIChatResponse)
def gemini_query(
    request: AIChatRequest,
    current_user: User = Depends(get_current_active_user)
):
    if not settings.GEMINI_API_KEY:
        return {"user": request.message, "ai": "HierSync AI is operating in simulated mode. Please add your GEMINI_API_KEY to the backend .env to enable live chat."}
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
        data = {"contents": [{"parts": [{"text": request.message}]}]}
        req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
        response = urllib.request.urlopen(req)
        result = json.loads(response.read().decode('utf-8'))
        answer = result['candidates'][0]['content']['parts'][0]['text']
        return {"user": request.message, "ai": answer}
    except Exception as e:
        logger.error(f"Gemini API Error: {str(e)}")
        return {"user": request.message, "ai": f"AI Error: {str(e)}"}

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
