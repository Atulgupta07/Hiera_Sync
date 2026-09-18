import { client } from './client';
import { 
  AIChatRequest, 
  AIChatResponse,
  AIDashboardSummaryResponse,
  AIReportResponse,
  AIChecklistResponse
} from '../types';

export const aiApi = {
  getChecklistSuggestions: (title: string, description: string) => client<AIChecklistResponse>('/ai/checklist-suggestions', { method: 'POST', data: { title, description } }),
  chat: (data: AIChatRequest) => client<AIChatResponse>('/ai/chat', { data }),
  getDashboardSummary: () => client<AIDashboardSummaryResponse>('/ai/dashboard-summary'),
  generateReport: () => client<AIReportResponse>('/ai/generate-report', { data: {} }),
  getCalendarInsights: () => client<any>('/ai/calendar-insights'),
  getApprovalSuggestions: () => client<any>('/ai/approval-suggestions'),
  getNotificationSummary: () => client<any>('/ai/notification-summary', { data: {} }),
};
