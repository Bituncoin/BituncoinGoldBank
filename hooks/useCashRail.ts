
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  fetchCashRailTransactions,
  fetchCashRailStats,
  updateTransactionStatus,
  CashRailTransaction,
  CashRailStats,
  StatusFilter,
  TransactionStatus,
} from '@/services/cashRailService';

const POLL_INTERVAL_MS = 30_000; // 30-second polling

export interface UseCashRailResult {
  transactions: CashRailTransaction[];
  stats: CashRailStats | null;
  totalCount: number;
  loading: boolean;
  refreshing: boolean;
  statsLoading: boolean;
  error: string | null;
  statusFilter: StatusFilter;
  searchQuery: string;
  hasMore: boolean;
  lastUpdatedAt: string | null;
  setStatusFilter: (f: StatusFilter) => void;
  setSearchQuery: (q: string) => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  updateStatus: (id: string, status: TransactionStatus) => Promise<string | null>;
}

const PAGE_SIZE = 20;

export function useCashRail(): UseCashRailResult {
  const [transactions, setTransactions] = useState<CashRailTransaction[]>([]);
  const [stats, setStats] = useState<CashRailStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTransactions = useCallback(
    async (reset = false, isRefresh = false) => {
      const currentOffset = reset ? 0 : offset;
      if (reset) {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setOffset(0);
      }
      setError(null);

      const result = await fetchCashRailTransactions({
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: currentOffset,
        search: searchQuery,
      });

      if ('error' in result) {
        setError(result.error);
      } else {
        setTransactions(prev =>
          reset ? result.data : [...prev, ...result.data]
        );
        setTotalCount(result.count);
        setHasMore(currentOffset + PAGE_SIZE < result.count);
        if (!reset) setOffset(prev => prev + PAGE_SIZE);
        setLastUpdatedAt(
          new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      }

      setLoading(false);
      setRefreshing(false);
    },
    [statusFilter, searchQuery, offset]
  );

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const result = await fetchCashRailStats();
    if (!('error' in result)) setStats(result);
    setStatsLoading(false);
  }, []);

  // Initial load + reset on filter/search changes
  useEffect(() => {
    loadTransactions(true, false);
    loadStats();
  }, [loadTransactions, loadStats, statusFilter]); // Added dependencies to fix react-hooks/exhaustive-deps
  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      loadTransactions(true, false);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [loadTransactions, searchQuery]); // Added dependencies to fix react-hooks/exhaustive-deps

  // Polling for real-time updates
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const result = await fetchCashRailTransactions({
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: 0,
        search: searchQuery,
      });
      if (!('error' in result)) {
        setTransactions(result.data);
        setTotalCount(result.count);
        setHasMore(PAGE_SIZE < result.count);
        setOffset(PAGE_SIZE);
        setLastUpdatedAt(
          new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      }
      const statsResult = await fetchCashRailStats();
      if (!('error' in statsResult)) setStats(statsResult);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [statusFilter, searchQuery, setTransactions, setTotalCount, setHasMore, setOffset, setLastUpdatedAt, setStats]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadTransactions(true, true), loadStats()]);
  }, [loadTransactions, loadStats]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await loadTransactions(false, false);
  }, [hasMore, loading, loadTransactions]);

  const updateStatus = useCallback(
    async (id: string, status: TransactionStatus): Promise<string | null> => {
      const result = await updateTransactionStatus(id, status);
      if (result.error) return result.error;
      setTransactions(prev =>
        prev.map(t => (t.id === id ? { ...t, status, updated_at: new Date().toISOString() } : t))
      );
      // Refresh stats after status change
      const statsResult = await fetchCashRailStats();
      if (!('error' in statsResult)) setStats(statsResult);
      return null;
    },
    [setTransactions, setStats]
  );

  return {
    transactions,
    stats,
    totalCount,
    loading,
    refreshing,
    statsLoading,
    error,
    statusFilter,
    searchQuery,
    hasMore,
    lastUpdatedAt,
    setStatusFilter,
    setSearchQuery,
    refresh,
    loadMore,
    updateStatus,
  };
}
