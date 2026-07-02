import React, { createContext, useState, useCallback, useEffect, useRef } from 'react';
import { COINS } from '@/constants/mockData';

export interface PriceAlert {
  id: string;
  coinId: string;
  coinSymbol: string;
  condition: 'above' | 'below';
  targetPrice: number;
  createdAt: string;
  triggeredAt?: string;
  status: 'active' | 'triggered';
}

export interface AlertNotification {
  id: string;
  coinSymbol: string;
  coinLogo: string;
  condition: 'above' | 'below';
  targetPrice: number;
  currentPrice: number;
  triggeredAt: string;
}

export interface WatchlistContextType {
  watchlist: string[];                // coin IDs
  alerts: PriceAlert[];
  alertHistory: AlertNotification[];
  activeNotification: AlertNotification | null;
  addToWatchlist: (coinId: string) => void;
  removeFromWatchlist: (coinId: string) => void;
  isWatched: (coinId: string) => boolean;
  addAlert: (coinId: string, condition: 'above' | 'below', targetPrice: number) => void;
  removeAlert: (alertId: string) => void;
  dismissNotification: () => void;
  clearAlertHistory: () => void;
}

export const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>(['btng', 'btc', 'eth']);
  const [alerts, setAlerts] = useState<PriceAlert[]>([
    {
      id: 'a1',
      coinId: 'btng',
      coinSymbol: 'BTNG',
      condition: 'above',
      targetPrice: 5.00,
      createdAt: '2026-05-24 10:00',
      status: 'active',
    },
    {
      id: 'a2',
      coinId: 'btc',
      coinSymbol: 'BTC',
      condition: 'below',
      targetPrice: 105000,
      createdAt: '2026-05-23 09:15',
      status: 'active',
    },
    {
      id: 'a3',
      coinId: 'eth',
      coinSymbol: 'ETH',
      condition: 'above',
      targetPrice: 3900,
      createdAt: '2026-05-22 14:30',
      triggeredAt: '2026-05-23 08:45',
      status: 'triggered',
    },
  ]);
  const [alertHistory, setAlertHistory] = useState<AlertNotification[]>([
    {
      id: 'h1',
      coinSymbol: 'ETH',
      coinLogo: 'Ξ',
      condition: 'above',
      targetPrice: 3900,
      currentPrice: 3920,
      triggeredAt: '2026-05-23 08:45',
    },
    {
      id: 'h2',
      coinSymbol: 'BTNG',
      coinLogo: '🥇',
      condition: 'above',
      targetPrice: 4.50,
      currentPrice: 4.53,
      triggeredAt: '2026-05-22 16:20',
    },
    {
      id: 'h3',
      coinSymbol: 'BTC',
      coinLogo: '₿',
      condition: 'below',
      targetPrice: 106000,
      currentPrice: 105800,
      triggeredAt: '2026-05-21 11:10',
    },
  ]);
  const [activeNotification, setActiveNotification] = useState<AlertNotification | null>(null);
  const simulationFired = useRef(false);

  // Simulate a price alert firing after 4 seconds on mount
  useEffect(() => {
    if (simulationFired.current) return;
    const timer = setTimeout(() => {
      if (simulationFired.current) return;
      simulationFired.current = true;
      const notification: AlertNotification = {
        id: `notif_${Date.now()}`,
        coinSymbol: 'BTNG',
        coinLogo: '🥇',
        condition: 'above',
        targetPrice: 4.70,
        currentPrice: 4.72,
        triggeredAt: new Date().toLocaleTimeString(),
      };
      setActiveNotification(notification);
      setAlertHistory(prev => [notification, ...prev]);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const addToWatchlist = useCallback((coinId: string) => {
    setWatchlist(prev => prev.includes(coinId) ? prev : [...prev, coinId]);
  }, []);

  const removeFromWatchlist = useCallback((coinId: string) => {
    setWatchlist(prev => prev.filter(id => id !== coinId));
  }, []);

  const isWatched = useCallback((coinId: string) => watchlist.includes(coinId), [watchlist]);

  const addAlert = useCallback((coinId: string, condition: 'above' | 'below', targetPrice: number) => {
    const coin = COINS.find(c => c.id === coinId);
    if (!coin) return;
    const newAlert: PriceAlert = {
      id: `alert_${Date.now()}`,
      coinId,
      coinSymbol: coin.symbol,
      condition,
      targetPrice,
      createdAt: new Date().toLocaleString(),
      status: 'active',
    };
    setAlerts(prev => [newAlert, ...prev]);
  }, []);

  const removeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  const dismissNotification = useCallback(() => {
    setActiveNotification(null);
  }, []);

  const clearAlertHistory = useCallback(() => {
    setAlertHistory([]);
  }, []);

  return (
    <WatchlistContext.Provider value={{
      watchlist, alerts, alertHistory, activeNotification,
      addToWatchlist, removeFromWatchlist, isWatched,
      addAlert, removeAlert,
      dismissNotification, clearAlertHistory,
    }}>
      {children}
    </WatchlistContext.Provider>
  );
}
