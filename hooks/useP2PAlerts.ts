// BTNG Gold — P2P Price Alert Hook
import { useState, useCallback, useEffect, useRef } from 'react';

export interface P2PAlert {
  id: string;
  listingId: string;
  coinSymbol: string;
  listingPrice: number;      // price per coin in listingCurrency
  listingCurrency: string;   // the currency the listing is priced in
  targetPrice: number;       // user's desired price in targetCurrency
  targetCurrency: string;    // currency the user chose for the alert
  createdAt: number;
  triggered: boolean;
  traderName: string;
}

export interface P2PToast {
  id: string;
  alertId: string;
  message: string;
  detail: string;
  coinSymbol: string;
  targetCurrency: string;
  currentConverted: number;
  targetPrice: number;
}

const THRESHOLD = 0.02; // 2% within target

let _counter = 0;
function uid(): string { return `pal_${Date.now()}_${++_counter}`; }

export function useP2PAlerts(
  /** Pass current FX rates so the hook can re-check whenever rates update */
  getRate: (code: string) => number,
) {
  const [alerts, setAlerts] = useState<P2PAlert[]>([]);
  const [toasts, setToasts] = useState<P2PToast[]>([]);
  const firedRef = useRef<Set<string>>(new Set());

  // ── Add alert ────────────────────────────────────────────────────────────
  const addAlert = useCallback((params: Omit<P2PAlert, 'id' | 'createdAt' | 'triggered'>): P2PAlert => {
    const alert: P2PAlert = {
      ...params,
      id: uid(),
      createdAt: Date.now(),
      triggered: false,
    };
    setAlerts(prev => [...prev.filter(a => a.listingId !== params.listingId), alert]);
    firedRef.current.delete(alert.id);
    return alert;
  }, []);

  // ── Remove alert ─────────────────────────────────────────────────────────
  const removeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    firedRef.current.delete(alertId);
  }, []);

  const removeAlertForListing = useCallback((listingId: string) => {
    setAlerts(prev => {
      const found = prev.find(a => a.listingId === listingId);
      if (found) firedRef.current.delete(found.id);
      return prev.filter(a => a.listingId !== listingId);
    });
  }, []);

  const hasAlert = useCallback((listingId: string): boolean => {
    return alerts.some(a => a.listingId === listingId);
  }, [alerts]);

  const getAlert = useCallback((listingId: string): P2PAlert | undefined => {
    return alerts.find(a => a.listingId === listingId);
  }, [alerts]);

  // ── Dismiss a toast ───────────────────────────────────────────────────────
  const dismissToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  }, []);

  // ── Check alerts against live rates ──────────────────────────────────────
  const checkAlerts = useCallback(() => {
    if (alerts.length === 0) return;

    const newToasts: P2PToast[] = [];

    for (const alert of alerts) {
      if (alert.triggered || firedRef.current.has(alert.id)) continue;

      // Convert listing price to USD first, then to target currency
      const listingRate = getRate(alert.listingCurrency) || 1;
      const targetRate  = getRate(alert.targetCurrency)  || 1;

      const priceInUSD = alert.listingPrice / listingRate;
      const currentConverted = priceInUSD * targetRate;

      // Check within 2% of target
      const diff = Math.abs(currentConverted - alert.targetPrice) / alert.targetPrice;
      if (diff <= THRESHOLD) {
        firedRef.current.add(alert.id);
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, triggered: true } : a));

        newToasts.push({
          id: uid(),
          alertId: alert.id,
          message: `Price alert: ${alert.coinSymbol} is near your target!`,
          detail: `${alert.coinSymbol} in ${alert.targetCurrency} is ${currentConverted.toLocaleString('en-US', { maximumFractionDigits: 2 })} — within 2% of your target ${alert.targetPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${alert.targetCurrency}`,
          coinSymbol: alert.coinSymbol,
          targetCurrency: alert.targetCurrency,
          currentConverted,
          targetPrice: alert.targetPrice,
        });
      }
    }

    if (newToasts.length > 0) {
      setToasts(prev => [...prev, ...newToasts]);
    }
  }, [alerts, getRate]);

  // Re-check whenever getRate changes (i.e. new FX data arrives)
  useEffect(() => {
    checkAlerts();
  }, [checkAlerts]);

  // Auto-dismiss toasts after 6 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts(prev => prev.slice(1));
    }, 6000);
    return () => clearTimeout(timer);
  }, [toasts]);

  return {
    alerts,
    toasts,
    addAlert,
    removeAlert,
    removeAlertForListing,
    hasAlert,
    getAlert,
    dismissToast,
    checkAlerts,
  };
}
