import { client } from './client';
import { 
  TaskCreate, 
  TaskUpdate, 
  TaskResponse 
} from '../types';

export const tasksApi = {
  getAll: (skip = 0, limit = 100) => 
    client<TaskResponse[]>(`/tasks?skip=${skip}&limit=${limit}`),
    
  getById: (id: string) => 
    client<TaskResponse>(`/tasks/${id}`),
    
  create: (data: TaskCreate) => 
    client<TaskResponse>('/tasks', { data }),
    
  update: (id: string, data: TaskUpdate) => 
    client<TaskResponse>(`/tasks/${id}`, { method: 'PUT', data }),
    
  delete: (id: string) => 
    client<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' }),
    
  review: (id: string, decision: 'APPROVE' | 'RECHECK' | 'REJECT', remarks?: string) =>
    client<TaskResponse>(`/tasks/${id}/review`, { method: 'POST', data: { decision, remarks } }),
};
