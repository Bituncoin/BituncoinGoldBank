// BTNG Gold — Admin Deposits & Withdrawals Hook
import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/template';
import { insertNotification } from '@/hooks/useNotifications';

export interface AdminTxRecord {
  id: string;
  user_id: string;
  type: 'deposit' | 'withdraw';
  coin: string;
  coin_name?: string;
  amount: number;
  total_usd?: number;
  fee?: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  note?: string;
  created_at: string;
  // joined from user_profiles
  user_email?: string;
  user_name?: string;
}

export type TxFilter = 'all' | 'pending' | 'completed' | 'failed' | 'deposit' | 'withdraw';

export function useAdminDeposits(adminId?: string) {
  const [records, setRecords] = useState<AdminTxRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<TxFilter>('all');

  const load = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);
    const client = getSupabaseClient();

    // Fetch deposit/withdraw records joined with user_profiles
    const { data, error } = await client
      .from('trade_history')
      .select(`
        id, user_id, type, coin, coin_name, amount, total_usd, fee, status, note, created_at,
        user_profiles!inner(email, full_name, username)
      `)
      .in('type', ['deposit', 'withdraw'])
      .order('created_at', { ascending: false })
      .limit(200);

    if (!error && data) {
      const mapped: AdminTxRecord[] = (data as any[]).map(r => ({
        id: r.id,
        user_id: r.user_id,
        type: r.type,
        coin: r.coin,
        coin_name: r.coin_name,
        amount: r.amount,
        total_usd: r.total_usd,
        fee: r.fee,
        status: r.status,
        note: r.note,
        created_at: r.created_at,
        user_email: r.user_profiles?.email ?? '—',
        user_name: r.user_profiles?.full_name ?? r.user_profiles?.username ?? 'Unknown',
      }));
      setRecords(mapped);
    }
    setLoading(false);
  }, [adminId]);

  useEffect(() => {
    load();
  }, [load]);

  // Apply client-side filter
  const filtered = records.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'deposit' || filter === 'withdraw') return r.type === filter;
    return r.status === filter;
  });

  // Counts
  const pendingCount = records.filter(r => r.status === 'pending').length;
  const depositCount = records.filter(r => r.type === 'deposit').length;
  const withdrawCount = records.filter(r => r.type === 'withdraw').length;
  const completedCount = records.filter(r => r.status === 'completed').length;

  // Approve: set status → completed
  const approve = useCallback(async (id: string): Promise<{ error: string | null }> => {
    setActing(id);
    const client = getSupabaseClient();
    const record = records.find(r => r.id === id);
    const { error } = await client
      .from('trade_history')
      .update({ status: 'completed' })
      .eq('id', id);
    setActing(null);
    if (!error) {
      setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'completed' } : r));
      // Send notification to user
      if (record) {
        const isDeposit = record.type === 'deposit';
        await insertNotification({
          userId: record.user_id,
          type: 'success',
          category: isDeposit ? 'deposit' : 'withdraw',
          title: isDeposit ? 'Deposit Approved' : 'Withdrawal Approved',
          message: isDeposit
            ? `Your deposit of ${record.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${record.coin}${record.total_usd ? ` ($${record.total_usd.toFixed(2)})` : ''} has been approved and credited to your wallet.`
            : `Your withdrawal of ${record.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${record.coin}${record.total_usd ? ` ($${record.total_usd.toFixed(2)})` : ''} has been approved and is being processed.`,
        });
      }
    }
    return { error: error?.message ?? null };
  }, [records]);

  // Reject: set status → failed (reason stored in note)
  const reject = useCallback(async (id: string, reason: string): Promise<{ error: string | null }> => {
    setActing(id);
    const client = getSupabaseClient();
    const record = records.find(r => r.id === id);
    const updatedNote = record?.note
      ? `${record.note} | Rejected: ${reason}`
      : `Rejected: ${reason}`;

    const { error } = await client
      .from('trade_history')
      .update({ status: 'failed', note: updatedNote })
      .eq('id', id);
    setActing(null);
    if (!error) {
      setRecords(prev => prev.map(r =>
        r.id === id ? { ...r, status: 'failed', note: updatedNote } : r
      ));
      // Send notification to user
      if (record) {
        const isDeposit = record.type === 'deposit';
        await insertNotification({
          userId: record.user_id,
          type: 'error',
          category: isDeposit ? 'deposit' : 'withdraw',
          title: isDeposit ? 'Deposit Rejected' : 'Withdrawal Rejected',
          message: isDeposit
            ? `Your deposit of ${record.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${record.coin} was rejected. Reason: ${reason}`
            : `Your withdrawal of ${record.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${record.coin} was rejected. Reason: ${reason}`,
        });
      }
    }
    return { error: error?.message ?? null };
  }, [records]);

  return {
    records: filtered,
    allRecords: records,
    loading,
    acting,
    filter,
    setFilter,
    refresh: load,
    approve,
    reject,
    pendingCount,
    depositCount,
    withdrawCount,
    completedCount,
  };
}
