import { client } from './client';
import { TaskCommentCreate, TaskCommentResponse } from '../types';

export const commentsApi = {
  getForTask: (taskId: string) => client<TaskCommentResponse[]>(`/comments/${taskId}`),
  create: (taskId: string, data: TaskCommentCreate) => client<TaskCommentResponse>(`/comments/${taskId}`, { method: 'POST', data }),
  delete: (taskId: string, commentId: string) => client<{message: string}>(`/comments/${taskId}/${commentId}`, { method: 'DELETE' }),
};
