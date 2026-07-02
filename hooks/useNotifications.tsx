// BTNG Gold — Notifications Hook
import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/template';

export interface Notification {
  id: string;
  user_id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category: 'kyc' | 'deposit' | 'withdraw' | 'system' | 'general' | 'trade' | 'payment';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export type NotifFilter = 'all' | 'unread' | 'kyc' | 'deposit' | 'withdraw' | 'system' | 'trade';

export function useNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<NotifFilter>('all');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) {
      setNotifications(data as Notification[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtered list
  const filtered = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.is_read;
    if (filter === 'trade') return n.category === 'trade' || n.category === 'payment';
    return n.category === filter;
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Mark single notification as read
  const markRead = useCallback(async (id: string) => {
    const client = getSupabaseClient();
    await client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
  }, []);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const client = getSupabaseClient();
    await client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }, [userId]);

  // Delete a single notification
  const deleteNotification = useCallback(async (id: string) => {
    const client = getSupabaseClient();
    await client.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  return {
    notifications: filtered,
    allNotifications: notifications,
    loading,
    filter,
    setFilter,
    unreadCount,
    refresh: load,
    markRead,
    markAllRead,
    deleteNotification,
  };
}

// ─── Helper: insert a notification for a user (used by admin actions) ────────
export async function insertNotification(params: {
  userId: string;
  type: Notification['type'];
  category: Notification['category'];
  title: string;
  message: string;
}): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    category: params.category,
    title: params.title,
    message: params.message,
    is_read: false,
  });
  return { error: error?.message ?? null };
}
