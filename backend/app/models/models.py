from pydantic import BaseModel, Field
import enum
from datetime import datetime
from typing import Optional, List

class RoleEnum(str, enum.Enum):
    ADMIN = "ADMIN"
    PRINCIPAL = "PRINCIPAL"
    HOD = "HOD"
    TEACHER = "TEACHER"
    FACULTY = "FACULTY"
    TA = "TA"
    STUDENT = "STUDENT"
    STUDENT_REP = "STUDENT_REP"
    LAB_ASSISTANT = "LAB_ASSISTANT"
    STAFF = "STAFF"

class PriorityEnum(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"

class TaskStatusEnum(str, enum.Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    IN_REVIEW = "IN_REVIEW"
    COMPLETED = "COMPLETED"
    OVERDUE = "OVERDUE"

class ApprovalStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED_HOD = "APPROVED_HOD"
    APPROVED_PRINCIPAL = "APPROVED_PRINCIPAL"
    REJECTED = "REJECTED"

class NotificationTypeEnum(str, enum.Enum):
    TASK_ASSIGNED = "TASK_ASSIGNED"
    EVENT_INVITE = "EVENT_INVITE"
    APPROVAL_REQUEST = "APPROVAL_REQUEST"
    SYSTEM_ALERT = "SYSTEM_ALERT"

class User(BaseModel):
    id: str
    name: str
    email: str
    hashed_password: Optional[str] = None
    role: RoleEnum = RoleEnum.FACULTY
    department_id: Optional[str] = None
    designation: Optional[str] = "Assistant Professor"
    area_of_interest: Optional[str] = None
    joining_date: Optional[str] = "Not Available"
    association: Optional[str] = "Regular"
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_enabled: Optional[bool] = False
    status: str = "ACTIVE"

class Department(BaseModel):
    id: str
    name: str
    code: str
    hod_id: Optional[str] = None

class Task(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    creator_id: str
    assignee_id: Optional[str] = None
    department_id: Optional[str] = None
    priority: PriorityEnum = PriorityEnum.MEDIUM
    due_date: Optional[datetime] = None
    status: TaskStatusEnum = TaskStatusEnum.TODO
    progress_pct: float = 0.0
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    ai_priority_score: float = 0.0

class Event(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    category: Optional[str] = "Academic"
    location: Optional[str] = None
    start_date: Optional[str] = None
    start_time: Optional[str] = None
    end_date: Optional[str] = None
    end_time: Optional[str] = None
    organizer_id: Optional[str] = None
    organizer_name: Optional[str] = None
    participant_ids: Optional[List[str]] = None
    participant_names: Optional[List[str]] = None
    priority: Optional[str] = "Medium"
    status: Optional[str] = "UPCOMING"
    recurrence: Optional[str] = "Does not repeat"
    meeting_link: Optional[str] = None
    notes: Optional[str] = None
    send_whatsapp_reminder: Optional[bool] = False
    reminder_timing: Optional[str] = "1 day before"
    creator_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class Approval(BaseModel):
    id: str
    title: str
    description: str
    requester_id: str
    hod_id: Optional[str] = None
    principal_id: Optional[str] = None
    department_id: Optional[str] = None
    status: str = "PENDING"
    current_stage: str = "HOD_STAGE"
    hod_comment: Optional[str] = None
    principal_comment: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Notification(BaseModel):
    id: str
    user_id: str
    title: str
    message: str
    type: NotificationTypeEnum = NotificationTypeEnum.SYSTEM_ALERT
    is_read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Document(BaseModel):
    id: str
    filename: str
    file_path: str
    uploader_id: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
