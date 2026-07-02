import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@btng_rate_alerts_v1';

export interface RateAlert {
  id: string;
  fromCode: string;
  toCode: string;
  targetRate: number;
  condition: 'above' | 'below';
  createdAt: string;
  triggeredAt: string | null; // null = not yet fired
  currentRateAtCreation: number;
}

export interface UseRateAlertsResult {
  alerts: RateAlert[];
  loading: boolean;
  addAlert: (
    fromCode: string,
    toCode: string,
    targetRate: number,
    condition: 'above' | 'below',
    currentRate: number
  ) => Promise<void>;
  removeAlert: (id: string) => Promise<void>;
  resetAlert: (id: string) => Promise<void>;
  checkAlerts: (
    getRate: (fromCode: string, toCode: string) => number,
    onFire: (alert: RateAlert, liveRate: number) => void
  ) => void;
  getAlertsForPair: (fromCode: string, toCode: string) => RateAlert[];
}

export function useRateAlerts(): UseRateAlertsResult {
  const [alerts, setAlerts] = useState<RateAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  // ── Load from AsyncStorage on mount
  useEffect(() => {
    mountedRef.current = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!mountedRef.current) return;
        if (raw) {
          try {
            const parsed: RateAlert[] = JSON.parse(raw);
            setAlerts(parsed);
          } catch {
            // corrupted data — start fresh
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { mountedRef.current = false; };
  }, []);

  const persist = useCallback(async (next: RateAlert[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // silent — alerts are best-effort
    }
  }, []);

  const addAlert = useCallback(async (
    fromCode: string,
    toCode: string,
    targetRate: number,
    condition: 'above' | 'below',
    currentRate: number
  ) => {
    const newAlert: RateAlert = {
      id: `${fromCode}-${toCode}-${Date.now()}`,
      fromCode,
      toCode,
      targetRate,
      condition,
      createdAt: new Date().toISOString(),
      triggeredAt: null,
      currentRateAtCreation: currentRate,
    };
    const next = (prev: RateAlert[]) => [...prev, newAlert];
    setAlerts(prev => {
      const updated = next(prev);
      persist(updated);
      return updated;
    });
  }, [persist]);

  const removeAlert = useCallback(async (id: string) => {
    setAlerts(prev => {
      const updated = prev.filter(a => a.id !== id);
      persist(updated);
      return updated;
    });
  }, [persist]);

  const resetAlert = useCallback(async (id: string) => {
    setAlerts(prev => {
      const updated = prev.map(a =>
        a.id === id ? { ...a, triggeredAt: null } : a
      );
      persist(updated);
      return updated;
    });
  }, [persist]);

  /**
   * Check all non-triggered alerts against live rates.
   * `getRate(fromCode, toCode)` should return how many `toCode` units = 1 `fromCode`.
   * `onFire` is called for every alert that crosses its threshold (once per crossing).
   */
  const checkAlerts = useCallback((
    getRate: (fromCode: string, toCode: string) => number,
    onFire: (alert: RateAlert, liveRate: number) => void
  ) => {
    setAlerts(prev => {
      let changed = false;
      const updated = prev.map(alert => {
        if (alert.triggeredAt !== null) return alert; // already fired
        try {
          const liveRate = getRate(alert.fromCode, alert.toCode);
          if (!liveRate || !isFinite(liveRate)) return alert;

          const hit =
            alert.condition === 'above'
              ? liveRate >= alert.targetRate
              : liveRate <= alert.targetRate;

          if (hit) {
            changed = true;
            onFire(alert, liveRate);
            return { ...alert, triggeredAt: new Date().toISOString() };
          }
        } catch {
          // ignore conversion errors
        }
        return alert;
      });

      if (changed) {
        persist(updated);
        return updated;
      }
      return prev;
    });
  }, [persist]);

  const getAlertsForPair = useCallback((fromCode: string, toCode: string): RateAlert[] => {
    return alerts.filter(a => a.fromCode === fromCode && a.toCode === toCode);
  }, [alerts]);

  return { alerts, loading, addAlert, removeAlert, resetAlert, checkAlerts, getAlertsForPair };
}
