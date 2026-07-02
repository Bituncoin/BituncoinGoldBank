import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchExchangeRates } from '@/services/exchangeRateService';
import { AFRICAN_CURRENCIES } from '@/constants/africanCurrencies';
import type { UseExchangeRatesResult } from '@/constants/types';

// Re-export so existing imports from this hook continue to work
export type { UseExchangeRatesResult };

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Build static fallback map from africanCurrencies.ts
const STATIC_RATES: Record<string, number> = {};
AFRICAN_CURRENCIES.forEach(c => {
  if (!STATIC_RATES[c.code]) STATIC_RATES[c.code] = c.usdRate;
});

export function useExchangeRates(): UseExchangeRatesResult {
  const [rates, setRates] = useState<Record<string, number>>(STATIC_RATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(false);

    const result = await fetchExchangeRates();

    if (!mountedRef.current) return;

    if (result) {
      setRates(result.rates);
      setLastUpdated(result.lastUpdated);
      setError(false);
    } else {
      setError(true);
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

  const getRate = useCallback(
    (code: string): number =>
      rates[code] ?? STATIC_RATES[code] ?? 1,
    [rates]
  );

  return { rates, loading, error, lastUpdated, refresh: doFetch, getRate };
}
