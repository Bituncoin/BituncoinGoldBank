
/**
 * useCustomServer
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook wrapping customServerService.ts with state management,
 * auto-refresh polling (default 15 s), and individual transaction lookup.
 *
 * Exposed API
 * ───────────
 *  // Network status (polls every 15 s)
 *  networkStatus  : NetworkStatusResponse | null
 *  networkLoading : boolean
 *  networkError   : string | null
 *  refreshNetwork : () => void
 *
 *  // Block explorer (polls every 15 s)
 *  blocks        : BlocksResponse | null
 *  blocksLoading : boolean
 *  blocksError   : string | null
 *  refreshBlocks : () => void
 *  setBlockLimit : (n: number) => void
 *
 *  // Transaction lookup (manual trigger)
 *  transaction      : TransactionResponse | null
 *  txLoading        : boolean
 *  txError          : string | null
 *  lookupTransaction: (txId: string) => Promise<void>
 *  clearTransaction : () => void
 *
 *  // Global
 *  lastUpdated : Date | null
 *  isPolling   : boolean
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getNetworkStatus,
  getBlocks,
  getTransaction,
  type NetworkStatusResponse,
  type BlocksResponse,
  type TransactionResponse,
} from '@/services/customServerService';

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_BLOCK_LIMIT      = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseCustomServerOptions {
  /** Polling interval in milliseconds. Default: 15000 */
  pollIntervalMs?: number;
  /** Initial block limit. Default: 10 (max 50) */
  blockLimit?: number;
  /** Whether to start polling immediately on mount. Default: true */
  autoStart?: boolean;
}

export interface UseCustomServerResult {
  // Network status
  networkStatus:  NetworkStatusResponse | null;
  networkLoading: boolean;
  networkError:   string | null;
  refreshNetwork: () => void;

  // Blocks
  blocks:       BlocksResponse | null;
  blocksLoading: boolean;
  blocksError:  string | null;
  refreshBlocks: () => void;
  setBlockLimit: (n: number) => void;

  // Transaction lookup
  transaction:       TransactionResponse | null;
  txLoading:         boolean;
  txError:           string | null;
  lookupTransaction: (txId: string) => Promise<void>;
  clearTransaction:  () => void;

  // Global
  lastUpdated: Date | null;
  isPolling:   boolean;
  startPolling: () => void;
  stopPolling:  () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCustomServer(options: UseCustomServerOptions = {}): UseCustomServerResult {
  const {
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    blockLimit: initialBlockLimit = DEFAULT_BLOCK_LIMIT,
    autoStart = true,
  } = options;

  // ── Network status state ──────────────────────────────────────────────────
  const [networkStatus,  setNetworkStatus]  = useState<NetworkStatusResponse | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkError,   setNetworkError]   = useState<string | null>(null);

  // ── Blocks state ──────────────────────────────────────────────────────────
  const [blocks,        setBlocks]        = useState<BlocksResponse | null>(null);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocksError,   setBlocksError]   = useState<string | null>(null);
  const [blockLimit,    setBlockLimit]    = useState(
    Math.min(Math.max(1, initialBlockLimit), 50)
  );

  // ── Transaction state ─────────────────────────────────────────────────────
  const [transaction, setTransaction] = useState<TransactionResponse | null>(null);
  const [txLoading,   setTxLoading]   = useState(false);
  const [txError,     setTxError]     = useState<string | null>(null);

  // ── Polling control ───────────────────────────────────────────────────────
  const [isPolling,   setIsPolling]   = useState(autoStart);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Refs so interval callbacks always see fresh values without re-creating the timer
  const isPollingRef   = useRef(autoStart);
  const blockLimitRef  = useRef(blockLimit);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep refs in sync with state
  useEffect(() => { isPollingRef.current   = isPolling;  }, [isPolling]);
  useEffect(() => { blockLimitRef.current  = blockLimit; }, [blockLimit]);

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchNetworkStatus = useCallback(async (silent = false) => {
    if (!silent) setNetworkLoading(true);
    const { data, error } = await getNetworkStatus();
    if (!silent) setNetworkLoading(false);
    if (error) {
      setNetworkError(error);
    } else {
      setNetworkStatus(data);
      setNetworkError(null);
    }
  }, []); // Empty dependency array as setNetworkLoading, setNetworkError, setNetworkStatus are stable dispatch functions

  const fetchBlocks = useCallback(async (limit: number, silent = false) => {
    if (!silent) setBlocksLoading(true);
    const { data, error } = await getBlocks(limit);
    if (!silent) setBlocksLoading(false);
    if (error) {
      setBlocksError(error);
    } else {
      setBlocks(data);
      setBlocksError(null);
    }
  }, []); // Empty dependency array as setBlocksLoading, setBlocksError, setBlocks are stable dispatch functions

  const fetchAll = useCallback(async (silent = false) => {
    await Promise.all([
      fetchNetworkStatus(silent),
      fetchBlocks(blockLimitRef.current, silent),
    ]);
    setLastUpdated(new Date());
  }, [fetchNetworkStatus, fetchBlocks]); // Dependencies: fetchNetworkStatus, fetchBlocks. blockLimitRef.current is accessed via ref.

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoStart) {
      fetchAll(false);
    }
  // No eslint-disable-next-line needed here. 'react-hooks/exhaustive-deps' rule issues are typically fixed by adding missing dependencies.
  // In this case, if fetchAll is stable (e.g., wrapped in useCallback with correct deps), this is fine.
  }, [autoStart, fetchAll]); // Added fetchAll to dependencies.

  // ── Polling timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPolling) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (isPollingRef.current) {
        fetchAll(true); // silent = true: skip loading spinners on background refresh
      }
    }, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPolling, pollIntervalMs, fetchAll]);

  // Re-fetch immediately when blockLimit changes
  useEffect(() => {
    fetchBlocks(blockLimit, false);
  // No eslint-disable-next-line needed here.
  }, [blockLimit, fetchBlocks]); // Added fetchBlocks to dependencies.

  // ── Public actions ────────────────────────────────────────────────────────

  const refreshNetwork = useCallback(() => {
    fetchNetworkStatus(false);
  }, [fetchNetworkStatus]);

  const refreshBlocks = useCallback(() => {
    fetchBlocks(blockLimitRef.current, false);
  }, [fetchBlocks]);

  const handleSetBlockLimit = useCallback((n: number) => {
    setBlockLimit(Math.min(Math.max(1, n), 50));
  }, []); // setBlockLimit is a stable dispatch function, no need to add to deps.

  const lookupTransaction = useCallback(async (txId: string) => {
    setTxLoading(true);
    setTxError(null);
    setTransaction(null);
    const { data, error } = await getTransaction(txId);
    setTxLoading(false);
    if (error) {
      setTxError(error);
    } else {
      setTransaction(data);
    }
  }, []); // setTxLoading, setTxError, setTransaction are stable dispatch functions.

  const clearTransaction = useCallback(() => {
    setTransaction(null);
    setTxError(null);
    setTxLoading(false);
  }, []); // setTransaction, setTxError, setTxLoading are stable dispatch functions.

  const startPolling = useCallback(() => {
    setIsPolling(true);
    fetchAll(false);
  }, [fetchAll]); // setIsPolling is a stable dispatch function.

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []); // setIsPolling is a stable dispatch function.

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []); // Empty dependency array as this effect only cleans up on unmount.

  return {
    // Network status
    networkStatus,
    networkLoading,
    networkError,
    refreshNetwork,

    // Blocks
    blocks,
    blocksLoading,
    blocksError,
    refreshBlocks,
    setBlockLimit: handleSetBlockLimit,

    // Transaction
    transaction,
    txLoading,
    txError,
    lookupTransaction,
    clearTransaction,

    // Global
    lastUpdated,
    isPolling,
    startPolling,
    stopPolling,
  };
}
