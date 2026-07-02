// BTNG Gold — Admin Users Hook
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabaseClient } from '@/template';

export interface AdminUserRecord {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  kyc_status?: string;
  tier?: string;
  is_admin: boolean;
  country?: string;
  total_portfolio_value?: number;
  created_at?: string;
}

export function useAdminUsers(adminId?: string) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('user_profiles')
      .select('id, email, username, full_name, kyc_status, tier, is_admin, country, total_portfolio_value, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      setUsers(data as AdminUserRecord[]);
    }
    setLoading(false);
  }, [adminId]);

  useEffect(() => {
    load();
  }, [load]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      (u.email ?? '').toLowerCase().includes(q) ||
      (u.full_name ?? '').toLowerCase().includes(q) ||
      (u.username ?? '').toLowerCase().includes(q)
    );
  }, [users, search]);

  // Change tier
  const changeTier = useCallback(async (userId: string, tier: string): Promise<{ error: string | null }> => {
    setActing(userId);
    const client = getSupabaseClient();
    const { error } = await client
      .from('user_profiles')
      .update({ tier })
      .eq('id', userId);
    setActing(null);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, tier } : u));
    }
    return { error: error?.message ?? null };
  }, []);

  // Toggle admin status
  const toggleAdmin = useCallback(async (userId: string, isAdmin: boolean): Promise<{ error: string | null }> => {
    setActing(userId);
    const client = getSupabaseClient();
    const { error } = await client
      .from('user_profiles')
      .update({ is_admin: isAdmin })
      .eq('id', userId);
    setActing(null);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: isAdmin } : u));
    }
    return { error: error?.message ?? null };
  }, []);

  const totalCount = users.length;
  const verifiedCount = users.filter(u => u.kyc_status === 'verified').length;
  const adminCount = users.filter(u => u.is_admin).length;

  return {
    users: filtered,
    allUsers: users,
    loading,
    acting,
    search,
    setSearch,
    refresh: load,
    changeTier,
    toggleAdmin,
    totalCount,
    verifiedCount,
    adminCount,
  };
}
