import { client, getAuthToken, ApiError } from './client';
import { TaskAttachmentResponse } from '../types';

export const attachmentsApi = {
  getForTask: (taskId: string) => client<TaskAttachmentResponse[]>(`/attachments/${taskId}`),
  upload: async (taskId: string, file: File): Promise<TaskAttachmentResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = getAuthToken();
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';
    
    const response = await fetch(`${API_BASE_URL}/attachments/${taskId}`, {
      method: 'POST',
      body: formData,
      headers: token ? {
        'Authorization': `Bearer ${token}`
      } : {}
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new ApiError(response.status, errorData?.detail || 'Failed to upload attachment', errorData);
    }
    
    return response.json();
  },
  delete: (taskId: string, attachmentId: string) => client<{message: string}>(`/attachments/${taskId}/${attachmentId}`, { method: 'DELETE' }),
};
