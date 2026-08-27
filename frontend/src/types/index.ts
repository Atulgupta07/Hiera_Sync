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
  date: string;
  type?: string;
  person: string;
  description?: string;
  location?: string;
}

export interface EventUpdate {
  title?: string;
  date?: string;
  type?: string;
  person?: string;
  description?: string;
  location?: string;
}

export interface EventResponse extends EventCreate {
  id: string;
  creator_id?: string;
  created_at?: string;
}

export interface TaskCreate {
  title: string;
  assigned: string;
  deadline: string;
  priority?: string;
  status?: string;
  progress?: string;
}

export interface TaskUpdate {
  title?: string;
  assigned?: string;
  deadline?: string;
  priority?: string;
  status?: string;
  progress?: string;
}

export interface TaskResponse extends TaskCreate {
  id: string;
  created_at?: string;
}

export interface ApprovalCreate {
  title: string;
  requested: string;
  assigned: string;
  priority?: string;
  status?: string;
  comments?: string;
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
