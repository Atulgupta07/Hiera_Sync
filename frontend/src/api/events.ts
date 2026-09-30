import { client, getAuthToken } from './client';
import { 
  EventCreate, 
  EventUpdate, 
  EventResponse,
  ConflictCheckRequest,
  ConflictCheckResponse,
  AcademicCalendarUploadResponse
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export const eventsApi = {
  getAll: (params?: { faculty_id?: string; category?: string; department_id?: string }) => {
    let query = '';
    if (params) {
      const sp = new URLSearchParams();
      if (params.faculty_id) sp.append('faculty_id', params.faculty_id);
      if (params.category) sp.append('category', params.category);
      if (params.department_id) sp.append('department_id', params.department_id);
      const str = sp.toString();
      if (str) query = `?${str}`;
    }
    return client<EventResponse[]>(`/events${query}`);
  },

  getById: (id: string) => client<EventResponse>(`/events/${id}`),

  create: (data: EventCreate) => client<EventResponse>('/events', { data }),

  update: (id: string, data: EventUpdate) =>
    client<EventResponse>(`/events/${id}`, { method: 'PUT', data }),

  delete: (id: string) => client<{ message: string }>(`/events/${id}`, { method: 'DELETE' }),

  checkConflicts: (data: ConflictCheckRequest) =>
    client<ConflictCheckResponse>('/events/check-conflicts', { data }),

  uploadAcademicCalendar: (file: File, department_id?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (department_id) formData.append('department_id', department_id);
    return client<AcademicCalendarUploadResponse>('/events/upload-academic-calendar', {
      method: 'POST',
      data: formData,
    });
  },

  /**
   * Extracts academic calendar events from a PDF using Gemini AI.
   * Uses raw fetch (not the JSON client) so that FormData multipart headers
   * are set correctly by the browser (with the proper boundary).
   */
  extractCalendar: async (
    file: File,
    academic_year?: string,
    semester?: string,
    department_id?: string
  ): Promise<AcademicCalendarUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    if (academic_year) formData.append('academic_year', academic_year);
    if (semester) formData.append('semester', semester);
    if (department_id) formData.append('department_id', department_id);

    const token = getAuthToken();
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // NOTE: Do NOT set Content-Type here — the browser must set it automatically
    //       with the correct multipart boundary for FormData to work.

    const response = await fetch(`${API_BASE_URL}/events/extract-calendar`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorData: unknown = null;
      try { errorData = await response.json(); } catch { /* ignore */ }
      // Attach errorData so getCleanErrorMessage can pick it up via err.data
      const apiErr = new Error(
        (errorData as Record<string, unknown>)?.detail as string ||
        `Calendar extraction failed (${response.status})`
      ) as Error & { data: unknown };
      apiErr.data = errorData;
      throw apiErr;
    }

    return response.json() as Promise<AcademicCalendarUploadResponse>;
  },

  /**
   * Publishes verified draft events extracted by Gemini directly into Firestore.
   * Called from the preview modal "Publish Official Calendar" button when draftId is empty.
   */
  publishCalendar: async (payload: {
    events: unknown[];
    academic_year: string;
    semester: string;
    department_id?: string;
  }): Promise<{ success: boolean; published_count: number }> => {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE_URL}/events/publish-calendar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorData: unknown = null;
      try { errorData = await response.json(); } catch { /* ignore */ }
      const apiErr = new Error(
        (errorData as Record<string, unknown>)?.detail as string ||
        `Failed to publish calendar (${response.status})`
      ) as Error & { data: unknown };
      apiErr.data = errorData;
      throw apiErr;
    }

    return response.json();
  },
};
