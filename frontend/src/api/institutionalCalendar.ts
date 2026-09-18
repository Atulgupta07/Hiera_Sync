import { client, getAuthToken, ApiError } from './client';
import {
  InstitutionalCalendarUploadResponse,
  InstitutionalCalendarPublishRequest,
  InstitutionalCalendarHistoryItem,
  EventResponse,
  EventUpdate,
  AICalendarQueryResponse
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export const institutionalCalendarApi = {
  upload: async (
    file: File,
    academicYear = "2026-2027",
    semester = "Odd Semester"
  ): Promise<InstitutionalCalendarUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('academic_year', academicYear);
    formData.append('semester', semester);

    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/institutional-calendar/upload`, {
      method: 'POST',
      body: formData,
      headers: token ? {
        'Authorization': `Bearer ${token}`
      } : {}
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        errorData?.detail || 'Failed to upload and analyze institutional calendar',
        errorData
      );
    }

    return response.json();
  },

  getDraft: (draftId: string) => client<any>(`/institutional-calendar/draft/${draftId}`),

  publish: (draftId: string, data: InstitutionalCalendarPublishRequest) =>
    client<{
      message: string;
      academic_year: string;
      semester: string;
      published_count: number;
      events: EventResponse[];
    }>(`/institutional-calendar/publish/${draftId}`, { data }),

  getOfficial: (params?: { category?: string; month?: string }) => {
    let query = '';
    if (params) {
      const sp = new URLSearchParams();
      if (params.category && params.category !== 'All') sp.append('category', params.category);
      if (params.month) sp.append('month', params.month);
      const str = sp.toString();
      if (str) query = `?${str}`;
    }
    return client<EventResponse[]>(`/institutional-calendar/official${query}`);
  },

  updateEvent: (eventId: string, data: EventUpdate) =>
    client<EventResponse>(`/institutional-calendar/event/${eventId}`, {
      method: 'PUT',
      data
    }),

  deleteEvent: (eventId: string) =>
    client<void>(`/institutional-calendar/event/${eventId}`, {
      method: 'DELETE'
    }),

  getHistory: () => client<InstitutionalCalendarHistoryItem[]>('/institutional-calendar/history'),

  askAI: (question: string) =>
    client<AICalendarQueryResponse>('/institutional-calendar/ai-query', {
      data: { question }
    }),
};
