import { client } from './client';
import { 
  EventCreate, 
  EventUpdate, 
  EventResponse,
  ConflictCheckRequest,
  ConflictCheckResponse
} from '../types';

export const eventsApi = {
  getAll: (params?: { faculty_id?: string; category?: string }) => {
    let query = '';
    if (params) {
      const sp = new URLSearchParams();
      if (params.faculty_id) sp.append('faculty_id', params.faculty_id);
      if (params.category) sp.append('category', params.category);
      const str = sp.toString();
      if (str) query = `?${str}`;
    }
    return client<EventResponse[]>(`/events${query}`);
  },
  getById: (id: string) => client<EventResponse>(`/events/${id}`),
  create: (data: EventCreate) => client<EventResponse>('/events', { data }),
  update: (id: string, data: EventUpdate) => client<EventResponse>(`/events/${id}`, { method: 'PUT', data }),
  delete: (id: string) => client<{ message: string }>(`/events/${id}`, { method: 'DELETE' }),
  checkConflicts: (data: ConflictCheckRequest) => client<ConflictCheckResponse>('/events/check-conflicts', { data }),
};
