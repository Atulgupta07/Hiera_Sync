from typing import List
from fastapi import APIRouter, Depends
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import DashboardStatsResponse, ActivityLogResponse, DepartmentReportSummary
from app.auth.permissions import get_current_active_user
from app.models.models import User

router = APIRouter()

@router.get("/dashboard-stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # 1. Active Employees Count
    users_ref = db.collection('users')
    users_docs = list(users_ref.stream())
    employees_count = len(users_docs)
    
    # 2. Pending Tasks Count & High Priority Tasks
    tasks_ref = db.collection('tasks')
    tasks_docs = list(tasks_ref.stream())
    
    total_tasks = len(tasks_docs)
    completed_tasks = 0
    pending_tasks_count = 0
    high_priority_tasks = 0
    
    if tasks_docs:
        for t in tasks_docs:
            data = t.to_dict()
            status = data.get("status", "").upper()
            priority = data.get("priority", "").upper()
            if status in ["COMPLETED", "DONE"]:
                completed_tasks += 1
            else:
                pending_tasks_count += 1
                if priority in ["HIGH", "URGENT"]:
                    high_priority_tasks += 1


    # 3. Approvals Count
    approvals_ref = db.collection('approvals')
    app_docs = list(approvals_ref.stream())
    approvals_count = len(app_docs)
    waiting_approvals = sum(1 for a in app_docs if a.to_dict().get("status") == "Pending")

    # 4. Progress calculation
    workflow_progress = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0.0

    return {
        "employees_count": employees_count,
        "pending_tasks_count": pending_tasks_count,
        "high_priority_tasks": high_priority_tasks,
        "approvals_count": approvals_count,
        "waiting_approvals": waiting_approvals,
        "ai_productivity": "92%",
        "workflow_progress": workflow_progress
    }

@router.get("/recent-activities", response_model=List[ActivityLogResponse])
def get_recent_activities(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    logs_ref = db.collection('activity_logs')
    logs_docs = list(logs_ref.order_by('timestamp', direction='DESCENDING').limit(5).stream())
    
    activities = []
    if logs_docs:
        for doc in logs_docs:
            data = doc.to_dict()
            activities.append({
                "id": doc.id,
                "message": data.get("details", data.get("action", "New Activity")),
                "category": data.get("category", "task"),
                "icon": "✅",
                "timestamp": str(data.get("timestamp", ""))
            })
    else:
        # Fallback default activities matching UI
        activities = [
            {"id": "act_1", "message": "New task assigned to Faculty Member", "category": "task", "icon": "✅", "timestamp": "10 mins ago"},
            {"id": "act_2", "message": "Department meeting scheduled at 3:00 PM", "category": "meeting", "icon": "📅", "timestamp": "1 hour ago"},
            {"id": "act_3", "message": "AI suggested priority task completion", "category": "ai", "icon": "🤖", "timestamp": "2 hours ago"},
            {"id": "act_4", "message": "Approval request completed", "category": "approval", "icon": "✔", "timestamp": "3 hours ago"}
        ]
    return activities

@router.get("/summary", response_model=DepartmentReportSummary)
def get_department_report_summary(
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    users_ref = db.collection('users')
    active_faculty = len(list(users_ref.stream()))

    tasks_ref = db.collection('tasks')
    tasks_docs = list(tasks_ref.stream())
    total_tasks = len(tasks_docs)
    completed_tasks = sum(1 for t in tasks_docs if t.to_dict().get("status") in ["Completed", "COMPLETED"])

    completion_rate = f"{int((completed_tasks / total_tasks) * 100)}%" if total_tasks > 0 else "0%"

    return {
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "active_faculty": active_faculty,
        "ai_efficiency": "92%",
        "completion_rate": completion_rate
    }

@router.get("/export")
def export_report(current_user: User = Depends(get_current_active_user)):
    return {
        "message": "Department report generated successfully.",
        "status": "Ready",
        "download_url": "/api/v1/files/report_aiml_2026.pdf"
    }



from app.schemas.schemas import ReportCreate, ReportResponse, ReportUpdate
from app.models.models import RoleEnum
import uuid
from datetime import datetime
from fastapi import HTTPException

@router.post("/tasks/{task_id}/reports", response_model=ReportResponse)
def create_report(
    task_id: str,
    report_in: ReportCreate,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if current_user.role != RoleEnum.FACULTY:
        raise HTTPException(status_code=403, detail="Only Faculty can submit reports")
        
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()
    if not task_doc.exists:
        raise HTTPException(status_code=404, detail="Task not found")
        
    task_data = task_doc.to_dict()
    is_assigned = False
    if current_user.id in task_data.get('assignee_ids', []):
        is_assigned = True
    elif task_data.get('assigned_id') == current_user.id:
        is_assigned = True
    elif current_user.name.lower() in task_data.get('assigned', '').lower():
        is_assigned = True
        
    if not is_assigned:
        raise HTTPException(status_code=403, detail="You are not assigned to this task")
        
    report_id = str(uuid.uuid4())
    report_data = {
        "id": report_id,
        "task_id": task_id,
        "faculty_id": current_user.id,
        "faculty_name": current_user.name,
        "department_id": current_user.department_id,
        "title": report_in.title,
        "description": report_in.description,
        "attachments": [a.dict() for a in (report_in.attachments or [])],
        "status": "SUBMITTED",
        "created_at": datetime.utcnow().isoformat(),
    }
    
    db.collection('reports').document(report_id).set(report_data)
    
    return report_data

@router.get("/tasks/{task_id}/reports", response_model=List[ReportResponse])
def get_task_reports(
    task_id: str,
    db: Client = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    task_ref = db.collection('tasks').document(task_id)
    task_doc = task_ref.get()
    if not task_doc.exists:
        raise HTTPException(status_code=404, detail="Task not found")
    
    reports_ref = db.collection('reports').where('task_id', '==', task_id)
    reports = [doc.to_dict() for doc in reports_ref.stream()]
    
    if current_user.role == RoleEnum.FACULTY:
        task_data = task_doc.to_dict()
        is_assigned = False
        if current_user.id in task_data.get('assignee_ids', []):
            is_assigned = True
        elif task_data.get('assigned_id') == current_user.id:
            is_assigned = True
        elif current_user.name.lower() in task_data.get('assigned', '').lower():
            is_assigned = True
            
        if not is_assigned:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        return reports
    elif current_user.role == RoleEnum.HOD or current_user.role == RoleEnum.ADMIN:
        return reports
        
    return []

from app.auth.permissions import check_role

@router.patch("/reports/{report_id}", response_model=ReportResponse)
def update_report(
    report_id: str,
    update_in: ReportUpdate,
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.HOD, RoleEnum.ADMIN]))
):
    doc_ref = db.collection('reports').document(report_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Report not found")
        
    update_data = {}
    if update_in.status:
        update_data["status"] = update_in.status
    if update_in.review_notes:
        update_data["review_notes"] = update_in.review_notes
        
    update_data["reviewed_at"] = datetime.utcnow().isoformat()
    update_data["reviewed_by"] = current_user.name
    
    doc_ref.update(update_data)
    return doc_ref.get().to_dict()
