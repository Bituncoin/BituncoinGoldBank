// BTNG Gold — Portfolio Hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPortfolioStats, triggerPortfolioRecalc, PortfolioStats } from '@/services/portfolioService';

const POLL_INTERVAL_MS = 15_000; // poll every 15 seconds when screen is active

export function usePortfolio(userId?: string) {
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    const { data, error } = await fetchPortfolioStats(userId);
    if (data) {
      setStats(data);
      setLastUpdated(new Date());
    }
    if (!silent) setLoading(false);
  }, [userId]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Polling for live updates
  useEffect(() => {
    if (!userId) return;
    pollerRef.current = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => {
      if (pollerRef.current) clearInterval(pollerRef.current);
    };
  }, [userId, load]);

  /** Force a DB recalculation then reload — call after a trade completes */
  const recalculate = useCallback(async () => {
    if (!userId) return;
    await triggerPortfolioRecalc(userId);
    await load(true);
  }, [userId, load]);

  const portfolioValue = stats?.total_portfolio_value ?? 0;
  const pnl = stats?.total_pnl ?? 0;
  const pnlPct = stats?.total_pnl_pct ?? 0;
  const isPositive = pnl >= 0;

  return {
    stats,
    loading,
    lastUpdated,
    portfolioValue,
    pnl,
    pnlPct,
    isPositive,
    recalculate,
    refresh: load,
  };
}
