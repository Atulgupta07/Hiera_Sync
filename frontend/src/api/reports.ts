import { client } from './client';
import { 
  DashboardStatsResponse,
  ReportCreate,
  ReportResponse,
  ActivityLogResponse,
  DepartmentReportSummary
} from '../types';

export const reportsApi = {
  createTaskReport: (taskId: string, data: ReportCreate) => client<ReportResponse>(`/reports/tasks/${taskId}/reports`, { method: 'POST', body: JSON.stringify(data) }),
  getTaskReports: (taskId: string) => client<ReportResponse[]>(`/reports/tasks/${taskId}/reports`),
  updateTaskReport: (reportId: string, data: { status?: string; review_notes?: string }) => client<ReportResponse>(`/reports/reports/${reportId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getDashboardStats: () => client<DashboardStatsResponse>('/reports/dashboard-stats'),
  getRecentActivities: () => client<ActivityLogResponse[]>('/reports/recent-activities'),
  getSummary: () => client<DepartmentReportSummary>('/reports/summary'),
  exportReport: () => client<any>('/reports/export'),
};
