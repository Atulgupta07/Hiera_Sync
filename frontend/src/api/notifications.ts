import { client } from './client';
import { 
  NotificationCreate,
  NotificationResponse,
  UnreadCountResponse
} from '../types';

export const notificationsApi = {
  getAll: () => client<NotificationResponse[]>('/notifications'),
  getUnreadCount: () => client<UnreadCountResponse>('/notifications/unread-count'),
  create: (data: NotificationCreate) => client<NotificationResponse>('/notifications', { data }),
  markAsRead: (id: string) => client<NotificationResponse>(`/notifications/${id}/read`, { method: 'PUT' }),
  markAsUnread: (id: string) => client<NotificationResponse>(`/notifications/${id}/unread`, { method: 'PUT' }),
  markAllAsRead: () => client<{ message: string }>('/notifications/read-all', { method: 'PUT' }),
  delete: (id: string) => client<void>(`/notifications/${id}`, { method: 'DELETE' }),
};
