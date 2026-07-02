import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/template';

export interface SecurityEvent {
  id: string;
  admin_id: string;
  action_type: string;
  target_user_id: string | null;
  target_user_email: string | null;
  target_user_name: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

export type AdminActionType =
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'kyc_reviewed'
  | 'user_tier_changed'
  | 'user_admin_granted'
  | 'user_admin_revoked'
  | 'blog_published'
  | 'blog_updated'
  | 'blog_deleted'
  | 'blog_status_toggled'
  | 'deposit_approved'
  | 'deposit_rejected'
  | 'withdrawal_approved'
  | 'withdrawal_rejected'
  | 'admin_login';

export function useAdminActivityLog(adminUserId: string | undefined) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_SIZE = 50;

  const fetchEvents = useCallback(async () => {
    if (!adminUserId) return;
    setLoading(true);
    try {
      const client = getSupabaseClient();
      const { data, error, count } = await client
        .from('security_events')
        .select('*', { count: 'exact' })
        .eq('admin_id', adminUserId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (!error && data) {
        setEvents(data as SecurityEvent[]);
        setTotalCount(count ?? data.length);
      }
    } finally {
      setLoading(false);
    }
  }, [adminUserId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const logEvent = useCallback(async (params: {
    action_type: AdminActionType;
    target_user_id?: string | null;
    target_user_email?: string | null;
    target_user_name?: string | null;
    details?: Record<string, any> | null;
  }) => {
    if (!adminUserId) return;
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.from('security_events').insert({
        admin_id: adminUserId,
        action_type: params.action_type,
        target_user_id: params.target_user_id ?? null,
        target_user_email: params.target_user_email ?? null,
        target_user_name: params.target_user_name ?? null,
        details: params.details ?? null,
      }).select().single();
      if (!error && data) {
        setEvents(prev => [data as SecurityEvent, ...prev.slice(0, PAGE_SIZE - 1)]);
        setTotalCount(c => c + 1);
      }
    } catch { /* non-blocking */ }
  }, [adminUserId]);

  return { events, loading, totalCount, refresh: fetchEvents, logEvent };
}
