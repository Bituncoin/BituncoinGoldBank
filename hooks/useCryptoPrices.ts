/**
 * useCryptoPrices — Live crypto price hook
 * ──────────────────────────────────────────────────────────────────────────
 * Fetches full live data (price + 24h change + high/low/volume) via
 * Edge Function → CoinGecko free API fallback → cached fallback.
 * Auto-refreshes every 60 seconds. Exposes rich per-coin data.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchLiveCryptoPricesFullData,
  CryptoFullPrices,
  CoinLiveData,
  FALLBACK_FULL,
  FALLBACK_PRICES,
  CryptoPrices,
} from '@/services/cryptoPriceService';

export type { CoinLiveData, CryptoFullPrices };

const REFRESH_INTERVAL_MS = 60_000;

export interface UseCryptoPricesResult {
  prices: CryptoPrices;         // simple price map (compat)
  fullPrices: CryptoFullPrices; // rich per-coin data
  loading: boolean;
  error: boolean;
  lastUpdated: Date | null;
  source: 'live' | 'fallback';
  refresh: () => void;
}

export function useCryptoPrices(): UseCryptoPricesResult {
  const [fullPrices, setFullPrices] = useState<CryptoFullPrices>(FALLBACK_FULL);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [source, setSource]         = useState<'live' | 'fallback'>('fallback');

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(false);

    const result = await fetchLiveCryptoPricesFullData();

    if (!mountedRef.current) return;

    if (result) {
      setFullPrices(result);
      setLastUpdated(new Date());
      setSource('live');
      setError(false);
    } else {
      setError(true);
      setSource('fallback');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    doFetch();
    timerRef.current = setInterval(doFetch, REFRESH_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [doFetch]);

  // Simple price map for compat
  const prices: CryptoPrices = {
    BTC:   fullPrices.BTC.price,
    ETH:   fullPrices.ETH.price,
    BNB:   fullPrices.BNB.price,
    SOL:   fullPrices.SOL.price,
    XRP:   fullPrices.XRP.price,
    MATIC: fullPrices.MATIC.price,
    ADA:   fullPrices.ADA.price,
    DOGE:  fullPrices.DOGE.price,
    AVAX:  fullPrices.AVAX.price,
    DOT:   fullPrices.DOT.price,
    BTNG:  FALLBACK_PRICES.BTNG,
  };

  return { prices, fullPrices, loading, error, lastUpdated, source, refresh: doFetch };
}
