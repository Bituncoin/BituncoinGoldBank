// BTNG Gold — Copy Trading Hook (Supabase)
import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import type { CopyTrader, CopySubscription } from '@/constants/types';

// Re-export so existing imports from this hook continue to work
export type { CopyTrader, CopySubscription };

export function useCopyTrading() {
  const { user } = useAuth();
  const [traders, setTraders] = useState<CopyTrader[]>([]);
  const [subscriptions, setSubscriptions] = useState<CopySubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch traders ──────────────────────────────────────────────────────────
  const fetchTraders = useCallback(async () => {
    const client = getSupabaseClient();
    const { data, error: err } = await client
      .from('copy_traders')
      .select('*')
      .eq('active', true)
      .order('follower_count', { ascending: false });

    if (err) { setError(err.message); return; }
    setTraders((data ?? []) as CopyTrader[]);
  }, []);

  // ── Fetch user subscriptions ───────────────────────────────────────────────
  const fetchSubscriptions = useCallback(async () => {
    if (!user?.id) return;
    const client = getSupabaseClient();
    const { data, error: err } = await client
      .from('user_copy_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (err) { setError(err.message); return; }
    setSubscriptions((data ?? []) as CopySubscription[]);
  }, [user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchTraders(), fetchSubscriptions()]);
    setLoading(false);
  }, [fetchTraders, fetchSubscriptions]);

  useEffect(() => { load(); }, [load]);

  // ── Follow a trader ────────────────────────────────────────────────────────
  const followTrader = useCallback(async (
    traderId: string,
    copyAmount: number,
  ): Promise<{ error: string | null }> => {
    if (!user?.id) return { error: 'Not authenticated' };
    setActionLoading(traderId);
    const client = getSupabaseClient();

    // Upsert subscription (re-activate if previously stopped)
    const { error: subErr } = await client
      .from('user_copy_subscriptions')
      .upsert(
        {
          user_id: user.id,
          trader_id: traderId,
          copy_amount: copyAmount,
          is_active: true,
          total_pnl: 0,
          total_pnl_pct: 0,
          trades_copied: 0,
          started_at: new Date().toISOString(),
          stopped_at: null,
        },
        { onConflict: 'user_id,trader_id' }
      );

    if (subErr) { setActionLoading(null); return { error: subErr.message }; }

    // Increment follower count on the trader
    const { error: updErr } = await client.rpc('increment_follower_count', {
      p_trader_id: traderId,
    });
    // Non-fatal if RPC not available — just ignore
    if (updErr) {
      // Manually increment via update fallback
      const trader = traders.find(t => t.id === traderId);
      if (trader) {
        await client
          .from('copy_traders')
          .update({ follower_count: trader.follower_count + 1 })
          .eq('id', traderId);
      }
    }

    await Promise.all([fetchTraders(), fetchSubscriptions()]);
    setActionLoading(null);
    return { error: null };
  }, [user?.id, traders, fetchTraders, fetchSubscriptions]);

  // ── Unfollow a trader ──────────────────────────────────────────────────────
  const unfollowTrader = useCallback(async (
    traderId: string,
  ): Promise<{ error: string | null }> => {
    if (!user?.id) return { error: 'Not authenticated' };
    setActionLoading(traderId);
    const client = getSupabaseClient();

    const { error: subErr } = await client
      .from('user_copy_subscriptions')
      .update({ is_active: false, stopped_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('trader_id', traderId);

    if (subErr) { setActionLoading(null); return { error: subErr.message }; }

    // Decrement follower count
    const trader = traders.find(t => t.id === traderId);
    if (trader && trader.follower_count > 0) {
      await client
        .from('copy_traders')
        .update({ follower_count: trader.follower_count - 1 })
        .eq('id', traderId);
    }

    await Promise.all([fetchTraders(), fetchSubscriptions()]);
    setActionLoading(null);
    return { error: null };
  }, [user?.id, traders, fetchTraders, fetchSubscriptions]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isFollowing = useCallback((traderId: string): boolean => {
    return subscriptions.some(s => s.trader_id === traderId && s.is_active);
  }, [subscriptions]);

  const getSubscription = useCallback((traderId: string): CopySubscription | undefined => {
    return subscriptions.find(s => s.trader_id === traderId && s.is_active);
  }, [subscriptions]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    topMonthlyPnl: traders.length > 0 ? Math.max(...traders.map(t => t.monthly_pnl)) : 0,
    totalActiveCopiers: traders.reduce((sum, t) => sum + t.follower_count, 0),
    myActiveCopies: subscriptions.filter(s => s.is_active).length,
    totalMyPnl: subscriptions.reduce((sum, s) => sum + s.total_pnl, 0),
  };

  return {
    traders,
    subscriptions,
    loading,
    actionLoading,
    error,
    isFollowing,
    getSubscription,
    followTrader,
    unfollowTrader,
    reload: load,
    stats,
  };
}
