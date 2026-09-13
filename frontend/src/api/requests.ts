import { client } from './client';
import { TaskRequestCreate, TaskRequestResponse } from '../types';

export const requestsApi = {
  getAll: () => client<TaskRequestResponse[]>('/task-requests'),
  create: (data: TaskRequestCreate) => client<TaskRequestResponse>('/task-requests', { method: 'POST', data }),
  update: (id: string, data: any) => client<TaskRequestResponse>(`/task-requests/${id}`, { method: 'PATCH', data }),
};
