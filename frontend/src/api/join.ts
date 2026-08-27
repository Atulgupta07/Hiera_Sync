import { client } from './client';

export interface JoinRequestCreate {
  code: string;
}

export interface JoinRequestResponse {
  id: string;
  faculty_id: string;
  faculty_name: string;
  faculty_email: string;
  department_id: string;
  department_name?: string;
  department_code: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requested_at: string;
}

export const joinApi = {
  submitRequest: (data: JoinRequestCreate) => client<JoinRequestResponse>('/join/request', { data }),
  getPending: () => client<JoinRequestResponse[]>('/join/pending'),
  getApproved: () => client<JoinRequestResponse[]>('/join/approved'),
  getRejected: () => client<JoinRequestResponse[]>('/join/rejected'),
  getStatus: () => client<JoinRequestResponse | null>('/join/status'),
  approve: (id: string) => client<{message: string}>(`/join/${id}/approve`, { method: 'PUT' }),
  reject: (id: string) => client<{message: string}>(`/join/${id}/reject`, { method: 'PUT' }),
};
