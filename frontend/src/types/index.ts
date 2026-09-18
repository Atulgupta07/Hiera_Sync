export type RoleEnum = 'FACULTY' | 'ADMIN' | 'HOD';

export interface UserBase {
  name: string;
  email: string;
  role: RoleEnum;
  department_id?: string;
  designation?: string;
  area_of_interest?: string;
  joining_date?: string;
  association?: string;
  avatar_url?: string;
  phone?: string;
  whatsapp_enabled?: boolean;
}

export interface UserResponse extends UserBase {
  id: string;
  status: string;
}

export interface LoginRequest {
  email: string;
  password?: string;
  rememberMe?: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password?: string;
  role?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

export interface EmployeeResponse extends UserBase {
  id: string;
  status: string;
}

export interface EmployeeCreate extends UserBase {
  password?: string;
}

export interface EmployeeUpdate {
  name?: string;
  designation?: string;
  area_of_interest?: string;
  joining_date?: string;
  association?: string;
  role?: RoleEnum;
  avatar_url?: string;
  phone?: string;
  whatsapp_enabled?: boolean;
}

export interface DashboardStatsResponse {
  employees_count: number;
  pending_tasks_count: number;
  high_priority_tasks: number;
  approvals_count: number;
  waiting_approvals: number;
  ai_productivity: string;
  workflow_progress: number;
}

export interface ActivityLogResponse {
  id: string;
  message: string;
  category?: string;
  icon?: string;
  timestamp?: string;
}

export interface DepartmentReportSummary {
  total_tasks: number;
  completed_tasks: number;
  active_faculty: number;
  ai_efficiency: string;
  completion_rate: string;
}

export interface EventCreate {
  title: string;
  date?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  category?: string;
  type?: string;
  person?: string;
  organizer_id?: string;
  organizer_name?: string;
  participant_ids?: string[];
  participant_names?: string[];
  location?: string;
  description?: string;
  priority?: string;
  status?: string;
  recurrence?: string;
  meeting_link?: string;
  notes?: string;
  send_whatsapp_reminder?: boolean;
  reminder_timing?: string;
  is_institutional?: boolean;
  academic_year?: string;
  semester?: string;
  approved_by?: string;
  approved_by_name?: string;
  published_at?: string;
  source?: string;
}

export interface EventUpdate {
  title?: string;
  date?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  category?: string;
  type?: string;
  person?: string;
  organizer_id?: string;
  organizer_name?: string;
  participant_ids?: string[];
  participant_names?: string[];
  location?: string;
  description?: string;
  priority?: string;
  status?: string;
  recurrence?: string;
  meeting_link?: string;
  notes?: string;
  send_whatsapp_reminder?: boolean;
  reminder_timing?: string;
  is_institutional?: boolean;
  academic_year?: string;
  semester?: string;
  approved_by?: string;
  approved_by_name?: string;
  published_at?: string;
  source?: string;
}

export interface EventResponse extends EventCreate {
  id: string;
  creator_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InstitutionalEventItem {
  id?: string;
  title: string;
  date: string;
  start_date: string;
  end_date?: string;
  category: string;
  description?: string;
  location?: string;
}

export interface InstitutionalCalendarUploadResponse {
  draft_id: string;
  filename: string;
  file_url: string;
  academic_year: string;
  semester: string;
  total_extracted: number;
  events: InstitutionalEventItem[];
  message: string;
}

export interface InstitutionalCalendarPublishRequest {
  draft_id?: string;
  academic_year?: string;
  semester?: string;
  events: InstitutionalEventItem[];
}

export interface InstitutionalCalendarHistoryItem {
  id: string;
  event_id?: string;
  event_title: string;
  action_type: string;
  field_changed?: string;
  previous_value?: string;
  updated_value?: string;
  modified_by: string;
  modified_by_role?: string;
  modified_at: string;
}

export interface AICalendarQueryRequest {
  question: string;
}

export interface AICalendarQueryResponse {
  question: string;
  answer: string;
  sources_count: number;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskCreate {
  title: string;
  assigned: string;
  deadline: string;
  assignees?: string[];
  assignee_ids?: string[];
  priority?: string;
  status?: string;
  progress?: string;
  description?: string;
  category?: string;
  start_date?: string;
  deadline_time?: string;
  estimated_effort?: string;
  reminder?: string;
  require_approval?: boolean;
  assigned_id?: string;
  subtasks?: Subtask[];
  goal_id?: string;
}

export interface TaskUpdate {
  title?: string;
  assigned?: string;
  deadline?: string;
  priority?: string;
  status?: string;
  progress?: string;
  description?: string;
  category?: string;
  start_date?: string;
  deadline_time?: string;
  estimated_effort?: string;
  reminder?: string;
  require_approval?: boolean;
  assigned_id?: string;
  subtasks?: Subtask[];
  goal_id?: string;
}

export interface TaskResponse extends TaskCreate {
  id: string;
  created_at?: string;
  risk_score?: number;
  risk_level?: "LOW" | "MEDIUM" | "HIGH";
  risk_factors?: string[];
  comments?: TaskCommentResponse[];
  attachments?: TaskAttachmentResponse[];
}

export interface ApprovalCreate {
  title: string;
  requested: string;
  assigned: string;
  priority?: string;
  status?: string;
  comments?: string;
  type?: string;
}

export interface ApprovalUpdate {
  status?: string;
  comments?: string;
}

export interface ApprovalResponse extends ApprovalCreate {
  id: string;
  reviewed_at?: string;
  created_at?: string;
}

export interface NotificationCreate {
  title: string;
  message: string;
  type?: string;
  priority?: string;
  target_route?: string;
  icon?: string;
  status?: string;
  time?: string;
  is_read?: boolean;
}

export interface NotificationResponse extends NotificationCreate {
  id: string;
  created_at?: string;
}

export interface UnreadCountResponse {
  unread_count: number;
}

export interface AIChatRequest {
  message: string;
}

export interface AIChatResponse {
  user: string;
  ai: string;
}

export interface AIDashboardSummaryResponse {
  greeting?: string;
  insights: string[];
  productivity_score?: string;
}

export interface AIReportResponse {
  title?: string;
  summary: string;
  recommendations: string[];
  generated_at: string;
}

export interface UserSettingsResponse {
  user_id: string;
  ai_recommendation?: boolean;
  task_analysis?: boolean;
  deadline_alert?: boolean;
  email_notifications?: boolean;
}

export interface UserSettingsUpdate {
  ai_recommendation?: boolean;
  task_analysis?: boolean;
  deadline_alert?: boolean;
  email_notifications?: boolean;
}

export interface DepartmentProfileResponse {
  department?: string;
  institute?: string;
  platform?: string;
  purpose?: string;
  version?: string;
  status?: string;
}

export interface SearchResultItem {
  id: string;
  title: string;
  type: string;
}

export interface GlobalSearchResponse {
  query: string;
  results: SearchResultItem[];
}


export interface TaskRequestCreate {
  title: string;
  description: string;
  category?: string;
  priority?: string;
  suggested_deadline: string;
  estimated_effort?: string;
  additional_notes?: string;
}

export interface TaskRequestResponse extends TaskRequestCreate {
  id: string;
  requester_id: string;
  requester_name: string;
  status: string;
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  rejection_reason?: string;
  created_task_id?: string;
}

export interface TaskCommentCreate {
  content: string;
  mentions: string[];
}

export interface TaskCommentResponse extends TaskCommentCreate {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  author_role?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskAttachmentResponse {
  id: string;
  task_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_by: string;
  uploaded_by_role?: string;
  attachment_type?: string;
  created_at: string;
}

export interface GoalMilestoneCreate {
  title: string;
  description: string;
  due_date: string;
  order: number;
  status?: string;
}

export interface GoalMilestoneResponse extends GoalMilestoneCreate {
  id: string;
  goal_id: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DepartmentGoalCreate {
  title: string;
  description: string;
  category?: string;
  start_date: string;
  target_date: string;
  status?: string;
}

export interface DepartmentGoalResponse extends DepartmentGoalCreate {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  milestones: GoalMilestoneResponse[];
}

export interface AIPriorityItem {
  task_id: string;
  title: string;
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW';
  priority_score: number;
  rank?: number;
  priority?: string;
  risk_score?: number;
  why?: string[];
  reason: string;
  suggested_action: string;
}

export interface HODActionItem {
  id: string;
  type: string;
  title: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  target_route: string | null;
  target_id?: string;
  priority_level: number;
}

export interface FacultyPerformance {
  faculty_id: string;
  faculty_name: string;
  total_tasks: number;
  completed: number;
  on_time: number;
  late: number;
  pending: number;
  overdue: number;
  completion_rate: number;
  on_time_rate: number;
  average_completion_time: number | null;
  current_workload: number;
  productivity_score: number;
  productivity_explanation: string;
}

export interface AIDashboardSummaryResponse {
  department_health_score: number;
  department_health_trend: string;
  risk_summary: string;
  ai_insights: string[];
  teacher_priorities?: AIPriorityItem[];
  hod_actions?: HODActionItem[];
}

<<<<<<< HEAD
export interface TaskAttachmentResponse {
  id: string;
  name: string;
  url: string;
  size: string;
  type: string;
}

export interface ReportCreate {
  title: string;
  description: string;
  attachments?: TaskAttachmentResponse[];
}

export interface ReportResponse {
  id: string;
  task_id: string;
  faculty_id: string;
  faculty_name: string;
  department_id: string;
  title: string;
  description: string;
  attachments: TaskAttachmentResponse[];
  status: string;
  created_at: string;
  review_notes?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface AIChecklistResponse {
  suggestions: string[];
}
=======
export interface ConflictCheckRequest {
  event_id?: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  participant_ids: string[];
  participant_names: string[];
}

export interface ConflictItem {
  faculty_id?: string;
  faculty_name: string;
  conflicting_event_id: string;
  conflicting_event_title: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
}

export interface ConflictCheckResponse {
  has_conflict: boolean;
  conflicts: ConflictItem[];
}

export interface WhatsAppSendRequest {
  faculty_id: string;
  message: string;
  template_name?: string;
}

export interface WhatsAppMessage {
  id: string;
  sender_id: string;
  sender_name?: string;
  recipient_id: string;
  recipient_name?: string;
  recipient_phone: string;
  message: string;
  message_type?: string;
  template_name?: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  provider_message_id?: string;
  error_message?: string;
  created_at: string;
  sent_at?: string;
}

export interface WhatsAppFacultyStatus {
  id: string;
  name: string;
  email: string;
  designation?: string;
  phone?: string;
  whatsapp_enabled: boolean;
  current_workload?: number;
}

export interface WhatsAppOptInUpdate {
  phone?: string;
  whatsapp_enabled: boolean;
}

>>>>>>> 1434925 (Add task document attachment support)
