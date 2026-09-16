import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { notificationsApi } from '../api';
import { NotificationResponse } from '../types';
import { useAuth } from './AuthContext';

interface ToastItem {
  id: string;
  title: string;
  message: string;
  icon?: string;
  targetRoute?: string;
}

interface NotificationContextType {
  notifications: NotificationResponse[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAsUnread: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  showToast: (title: string, message: string, icon?: string, targetRoute?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastItem | null>(null);

  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initialFetchDoneRef = useRef<boolean>(false);

  const showToast = useCallback((title: string, message: string, icon: string = "🔔", targetRoute: string = "/notifications") => {
    setToast({
      id: Date.now().toString(),
      title,
      message,
      icon,
      targetRoute
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await notificationsApi.getAll();
      const newNotifs = data || [];

      // Detect newly arrived unread notifications for real-time toast popup
      if (initialFetchDoneRef.current) {
        const newlyAdded = newNotifs.filter(n => !n.is_read && !seenNotifIdsRef.current.has(n.id));
        if (newlyAdded.length > 0) {
          const latest = newlyAdded[0];
          showToast(
            latest.title,
            latest.message,
            latest.icon || "🔔",
            latest.target_route || "/notifications"
          );
        }
      }

      // Update seen IDs set
      newNotifs.forEach(n => seenNotifIdsRef.current.add(n.id));
      initialFetchDoneRef.current = true;

      setNotifications(newNotifs);
    } catch (err: any) {
      console.error('Error fetching notifications:', err);
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Auto dismiss toast after 6 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsRead = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true, status: 'Read' } : n))
    );

    try {
      await notificationsApi.markAsRead(id);
    } catch (err) {
      console.error('Failed to mark notification as read on backend:', err);
      fetchNotifications();
    }
  };

  const markAsUnread = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: false, status: 'Unread' } : n))
    );

    try {
      await notificationsApi.markAsUnread(id);
    } catch (err) {
      console.error('Failed to mark notification as unread on backend:', err);
      fetchNotifications();
    }
  };

  const markAllAsRead = async () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, is_read: true, status: 'Read' }))
    );

    try {
      await notificationsApi.markAllAsRead();
    } catch (err) {
      console.error('Failed to mark all as read on backend:', err);
      fetchNotifications();
    }
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));

    try {
      await notificationsApi.delete(id);
    } catch (err) {
      console.error('Failed to delete notification on backend:', err);
      fetchNotifications();
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        error,
        refreshNotifications: fetchNotifications,
        markAsRead,
        markAsUnread,
        markAllAsRead,
        deleteNotification,
        showToast
      }}
    >
      {children}

      {/* FLOATING REAL-TIME TOAST BANNER POPUP */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-700 flex items-start gap-3.5 font-sans animate-bounce-short">
          <div className="text-2xl shrink-0 mt-0.5">{toast.icon || "🔔"}</div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-sm text-white tracking-tight">{toast.title}</h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed line-clamp-2">{toast.message}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  const route = toast.targetRoute || "/notifications";
                  setToast(null);
                  window.location.hash = route;
                  window.location.pathname = route;
                }}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition"
              >
                View Details
              </button>
              <button
                onClick={() => setToast(null)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 font-medium"
              >
                Dismiss
              </button>
            </div>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white text-xs font-bold p-1">✕</button>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

