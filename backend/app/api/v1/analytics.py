from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from google.cloud.firestore import Client
from app.database.session import get_db
from app.schemas.schemas import FacultyPerformance
from app.auth.permissions import check_role
from app.models.models import User, RoleEnum
from app.api.v1.ai import get_days_remaining, get_days_overdue
from app.api.v1.tasks import DEFAULT_TASKS

router = APIRouter()

@router.get("/faculty-performance", response_model=List[FacultyPerformance])
def get_faculty_performance(
    db: Client = Depends(get_db),
    current_user: User = Depends(check_role([RoleEnum.ADMIN, RoleEnum.HOD]))
):
    tasks_ref = db.collection('tasks')
    docs = list(tasks_ref.stream())
    all_raw_tasks = [doc.to_dict() for doc in docs] if docs else []
    
    users_ref = db.collection('users')
    user_docs = list(users_ref.where('role', '==', RoleEnum.FACULTY.value).stream())
    
    faculty_map = {}
    for ud in user_docs:
        udata = ud.to_dict()
        faculty_map[udata['id']] = udata['name']
        
    # If no users in DB, mock from tasks
    if not faculty_map:
        for t in all_raw_tasks:
            if t.get("assigned_id") and t.get("assigned"):
                faculty_map[t["assigned_id"]] = t["assigned"]
                
    results = []
    
    for fac_id, fac_name in faculty_map.items():
        fac_tasks = [t for t in all_raw_tasks if fac_id in t.get("assignee_ids", []) or t.get("assigned_id") == fac_id or t.get("assigned") == fac_name]
        
        total_tasks = len(fac_tasks)
        completed = 0
        on_time = 0
        late = 0
        pending = 0
        overdue = 0
        active_progress_sum = 0
        
        for t in fac_tasks:
            status = t.get("status", "")
            days_overdue = get_days_overdue(t)
            
            if status in ["Completed", "Awaiting Approval"]:
                completed += 1
                # Check if it was completed late (if completion time exists, else heuristic)
                if days_overdue > 0:
                    late += 1
                else:
                    on_time += 1
            else:
                pending += 1
                if days_overdue > 0:
                    overdue += 1
                
                # Active progress
                prog_str = t.get("progress", "0%")
                prog_val = int(prog_str.replace("%", "")) if isinstance(prog_str, str) else 0
                active_progress_sum += prog_val
                
        completion_rate = (completed / total_tasks * 100) if total_tasks > 0 else 0.0
        on_time_rate = (on_time / completed * 100) if completed > 0 else (100.0 if total_tasks > 0 else 0.0)
        active_progress = (active_progress_sum / pending) if pending > 0 else 100.0
        
        current_workload = pending
        
        # Workload balance (0-100)
        # Optimal workload: 2-4 tasks. 
        if current_workload == 0:
            workload_balance = 50 # Underutilized
        elif current_workload <= 3:
            workload_balance = 100 # Perfect
        elif current_workload <= 5:
            workload_balance = 70 # Stretched
        else:
            workload_balance = max(0, 100 - (current_workload * 10)) # Overloaded
            
        productivity_score = (
            (on_time_rate * 0.35) + 
            (completion_rate * 0.30) + 
            (active_progress * 0.20) + 
            (workload_balance * 0.15)
        )
        
        # Generate Explanation
        explanation_points = []
        if on_time_rate < 80:
            explanation_points.append(f"On-time completion is low ({on_time_rate:.0f}%)")
        else:
            explanation_points.append(f"Strong on-time completion ({on_time_rate:.0f}%)")
            
        if overdue > 0:
            explanation_points.append(f"{overdue} tasks are currently overdue")
            
        if workload_balance < 60:
            if current_workload == 0:
                explanation_points.append("Faculty is underutilized with 0 active tasks")
            else:
                explanation_points.append("Faculty is currently overloaded")
                
        explanation = "🤖 Why this score?\n\n"
        for pt in explanation_points:
            explanation += f"• {pt}\n"
            
        if productivity_score < 75:
            explanation += "\nRecommendation: Reduce workload and prioritize overdue tasks before assigning new work."
        elif productivity_score > 90:
            explanation += "\nRecommendation: Excellent performance. Capable of handling high-priority assignments."
            
        results.append(FacultyPerformance(
            faculty_id=fac_id,
            faculty_name=fac_name,
            total_tasks=total_tasks,
            completed=completed,
            on_time=on_time,
            late=late,
            pending=pending,
            overdue=overdue,
            completion_rate=round(completion_rate, 1),
            on_time_rate=round(on_time_rate, 1),
            average_completion_time=None, # Cannot accurately compute without complete historical timestamps
            current_workload=current_workload,
            productivity_score=round(productivity_score, 1),
            productivity_explanation=explanation
        ))
        
    # Sort by score desc
    results.sort(key=lambda x: x.productivity_score, reverse=True)
    return results
