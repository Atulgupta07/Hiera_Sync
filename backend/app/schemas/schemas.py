from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from app.models.models import RoleEnum, PriorityEnum, TaskStatusEnum

# User Schemas
class UserBase(BaseModel):
    name: str
    email: EmailStr
    role: RoleEnum = RoleEnum.FACULTY
    department_id: Optional[str] = None
    designation: Optional[str] = "Assistant Professor"
    area_of_interest: Optional[str] = None
    joining_date: Optional[str] = "Not Available"
    association: Optional[str] = "Regular"
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: str
    status: str
    
    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class EmployeeResponse(UserBase):
    id: str
    status: str = "ACTIVE"
    
    class Config:
        from_attributes = True

class EmployeeCreate(UserBase):
    password: Optional[str] = "Sbjit@123"

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    designation: Optional[str] = None
    area_of_interest: Optional[str] = None
    joining_date: Optional[str] = None
    association: Optional[str] = None
    role: Optional[RoleEnum] = None
    avatar_url: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# Dashboard & Report Schemas
class DashboardStatsResponse(BaseModel):
    employees_count: int
    pending_tasks_count: int
    high_priority_tasks: int
    approvals_count: int
    waiting_approvals: int
    ai_productivity: str = "92%"
    workflow_progress: float = 75.0

class ActivityLogResponse(BaseModel):
    id: str
    message: str
    category: Optional[str] = "task"
    icon: Optional[str] = "✅"
    timestamp: Optional[str] = None

class DepartmentReportSummary(BaseModel):
    total_tasks: int
    completed_tasks: int
    active_faculty: int
    ai_efficiency: str = "92%"
    completion_rate: str = "66%"

# Event Schemas
class EventCreate(BaseModel):
    title: str
    date: str
    type: str = "Academic"
    person: str
    description: Optional[str] = None
    location: Optional[str] = None

class EventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    type: Optional[str] = None
    person: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None

class EventResponse(EventCreate):
    id: str
    creator_id: Optional[str] = "admin"
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

# Task Schemas
class TaskCreate(BaseModel):
    title: str
    assigned: str
    deadline: str
    priority: str = "High"
    status: Optional[str] = "Pending"
    progress: Optional[str] = "0%"

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    assigned: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[str] = None

class TaskResponse(TaskCreate):
    id: str
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

# Approval Schemas
class ApprovalCreate(BaseModel):
    title: str
    requested: str
    assigned: str
    priority: str = "High"
    status: Optional[str] = "Pending"
    comments: Optional[str] = None

class ApprovalUpdate(BaseModel):
    status: Optional[str] = None
    comments: Optional[str] = None

class ApprovalResponse(ApprovalCreate):
    id: str
    reviewed_at: Optional[str] = None
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

# Notification Schemas
class NotificationCreate(BaseModel):
    title: str
    message: str
    type: str = "Task"
    priority: Optional[str] = "Medium"
    target_route: Optional[str] = None
    icon: Optional[str] = "📋"
    status: Optional[str] = "New"
    time: Optional[str] = "Just now"
    is_read: bool = False

class NotificationResponse(NotificationCreate):
    id: str
    created_at: Optional[str] = None

    class Config:
        from_attributes = True

class UnreadCountResponse(BaseModel):
    unread_count: int

# AI Schemas
class AIChatRequest(BaseModel):
    message: str

class AIChatResponse(BaseModel):
    user: str
    ai: str

class AIDashboardSummaryResponse(BaseModel):
    greeting: str = "Good Morning, Tanvi 👋"
    insights: List[str]
    productivity_score: str = "92%"

class AIReportResponse(BaseModel):
    title: str = "HieraSync AI Workflow Analysis Report"
    summary: str
    recommendations: List[str]
    generated_at: str

# Settings Schemas
class UserSettingsResponse(BaseModel):
    user_id: str
    ai_recommendation: bool = True
    task_analysis: bool = True
    deadline_alert: bool = True
    email_notifications: bool = True

class UserSettingsUpdate(BaseModel):
    ai_recommendation: Optional[bool] = None
    task_analysis: Optional[bool] = None
    deadline_alert: Optional[bool] = None
    email_notifications: Optional[bool] = None

class DepartmentProfileResponse(BaseModel):
    department: str = "Artificial Intelligence & Machine Learning"
    institute: str = "SBJIT Nagpur"
    platform: str = "HieraSync AI"
    purpose: str = "Organizational Workflow Management"
    version: str = "1.0"
    status: str = "Active"

# Global Search Schemas
class SearchResultItem(BaseModel):
    id: str
    title: str
    type: str  # task | faculty | notification | event

class GlobalSearchResponse(BaseModel):
    query: str
    results: List[SearchResultItem]

# Department Schemas
class DepartmentCreate(BaseModel):
    name: str

class DepartmentResponse(BaseModel):
    id: str
    name: str
    code: str
    hod_id: str

# Join Request Schemas
class JoinRequestCreate(BaseModel):
    code: str

class JoinRequestResponse(BaseModel):
    id: str
    faculty_id: str
    faculty_name: str
    faculty_email: str
    department_id: str
    department_name: Optional[str] = None
    department_code: str
    status: str
    requested_at: str
