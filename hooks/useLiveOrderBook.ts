
/**
 * useLiveOrderBook — Real-time bid/ask depth from btng-terminal Edge Function
 * ────────────────────────────────────────────────────────────────────────────
 * Polls every 10 seconds for the selected coin symbol.
 * Falls back to static ORDER_BOOK mock if the edge function is unreachable.
 * Exposes countdown (0-10s) for the progress bar in the UI.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { ORDER_BOOK } from '@/constants/mockData';

export interface OrderLevel {
  price: number;
  amount: number;
  total: number;
}

export interface LiveOrderBook {
  asks: OrderLevel[];
  bids: OrderLevel[];
  spread: number;
  spreadPct: number;
  midPrice: number;
  lastPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  ts: number;
  source: string;
}

export interface UseLiveOrderBookResult {
  book: LiveOrderBook | null;
  loading: boolean;
  error: boolean;
  isLive: boolean;
  lastUpdated: Date | null;
  countdown: number;   // seconds until next refresh (0–10)
  refresh: () => void;
}

const POLL_MS      = 10_000;
const LEVELS       = 10;

// Static fallback shaped like LiveOrderBook
function buildFallback(): LiveOrderBook {
  const mid = ORDER_BOOK.asks[ORDER_BOOK.asks.length - 1]?.price ?? 4.720;
  return {
    asks:      ORDER_BOOK.asks.map(a => ({ price: a.price, amount: a.amount, total: a.total })),
    bids:      ORDER_BOOK.bids.map(b => ({ price: b.price, amount: b.amount, total: b.total })),
    spread:    parseFloat((ORDER_BOOK.asks[ORDER_BOOK.asks.length - 1].price - ORDER_BOOK.bids[0].price).toFixed(6)),
    spreadPct: 0.04,
    midPrice:  mid,
    lastPrice: mid,
    change24h: 0,
    high24h:   mid * 1.04,
    low24h:    mid * 0.96,
    volume24h: 0,
    ts:        Date.now(),
    source:    'fallback',
  };
}

export function useLiveOrderBook(symbol: string): UseLiveOrderBookResult {
  const [book, setBook]               = useState<LiveOrderBook | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive]           = useState(false);
  const [countdown, setCountdown]     = useState(10);

  const mountedRef    = useRef(true);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdState       = useRef(10);
  const prevSymbolRef = useRef(symbol);

  const doFetch = useCallback(async (sym: string) => {
    if (!mountedRef.current) return;

    try {
      const supabase = getSupabaseClient();
      const { data, error: fnErr } = await supabase.functions.invoke('btng-terminal', {
        body: { symbol: sym, levels: LEVELS },
      });

      if (!mountedRef.current) return;

      if (fnErr) {
        let msg = fnErr.message;
        if (fnErr instanceof FunctionsHttpError) {
          try { msg = await fnErr.context?.text() ?? msg; } catch { /* ignore */ }
        }
        console.warn('[useLiveOrderBook] Edge function error:', msg);
        setError(true);
        setIsLive(false);
        if (!book) setBook(buildFallback());
        setLoading(false);
        return;
      }

      if (data && data.asks && data.bids) {
        setBook(data as LiveOrderBook);
        setLastUpdated(new Date());
        setIsLive(data.source !== 'fallback');
        setError(false);
      } else {
        setError(true);
        setIsLive(false);
        if (!book) setBook(buildFallback());
      }
    } catch (e) {
      if (!mountedRef.current) return;
      console.warn('[useLiveOrderBook] Unexpected:', e);
      setError(true);
      setIsLive(false);
      if (!book) setBook(buildFallback());
    }

    if (mountedRef.current) setLoading(false);
  }, [book]); // `book` is a dependency here, it was previously ignored by the eslint-disable comment

  const refresh = useCallback(() => {
    cdState.current = 10;
    setCountdown(10);
    doFetch(symbol);
  }, [symbol, doFetch]);

  // Re-fetch whenever symbol changes
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      prevSymbolRef.current = symbol;
      setLoading(true);
      setBook(null);
      setError(false);
    }

    mountedRef.current = true;

    // Initial fetch
    doFetch(symbol);

    // Poll every 10s
    pollRef.current = setInterval(() => {
      cdState.current = 10;
      setCountdown(10);
      doFetch(symbol);
    }, POLL_MS);

    // Countdown tick every 1s
    cdState.current = 10;
    cdRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      cdState.current = Math.max(0, cdState.current - 1);
      setCountdown(cdState.current);
    }, 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (cdRef.current)   clearInterval(cdRef.current);
    };
  }, [symbol, doFetch]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  return { book, loading, error, isLive, lastUpdated, countdown, refresh };
}
