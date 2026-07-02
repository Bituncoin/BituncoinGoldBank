// BTNG Gold — Trading Hook
import { useState, useEffect, useCallback } from 'react';
import {
  placeOrder,
  fetchOrders,
  fetchTradeHistory,
  fetchUserOrdersForCoin,
  Order,
  TradeHistoryItem,
  PlaceOrderPayload,
} from '@/services/tradingService';
import { triggerPortfolioRecalc } from '@/services/portfolioService';

export function useTrading(userId?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<TradeHistoryItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!userId) return;
    setLoadingOrders(true);
    const { data, error: err } = await fetchOrders(userId, { limit: 50 });
    setOrders(data);
    if (err) setError(err);
    setLoadingOrders(false);
  }, [userId]);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setLoadingHistory(true);
    const { data, error: err } = await fetchTradeHistory(userId, { limit: 50 });
    setHistory(data);
    if (err) setError(err);
    setLoadingHistory(false);
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadOrders();
      loadHistory();
    } else {
      setOrders([]);
      setHistory([]);
    }
  }, [userId]);

  const submitOrder = useCallback(async (payload: PlaceOrderPayload): Promise<{
    success: boolean;
    order: Order | null;
    error: string | null;
  }> => {
    if (!userId) return { success: false, order: null, error: 'Not authenticated' };
    setPlacing(true);
    const { data, error: err } = await placeOrder(payload);
    setPlacing(false);

    if (err || !data) return { success: false, order: null, error: err ?? 'Order failed' };

    // Trigger portfolio recalculation in background (non-blocking)
    triggerPortfolioRecalc(userId).catch(() => {});

    // Optimistic prepend
    setOrders(prev => [data, ...prev]);
    setHistory(prev => [{
      id: data.id + '_hist',
      user_id: data.user_id,
      order_id: data.id,
      type: data.side,
      coin: data.coin_symbol,
      coin_name: data.coin_name,
      amount: data.quantity,
      price: data.price,
      total_usd: data.total_value,
      fee: data.fee,
      status: 'completed',
      created_at: data.created_at,
    }, ...prev]);

    return { success: true, order: data, error: null };
  }, [userId]);

  const refresh = useCallback(() => {
    loadOrders();
    loadHistory();
  }, [loadOrders, loadHistory]);

  // Derived stats
  const totalBuyVolume = orders
    .filter(o => o.side === 'buy' && o.status === 'filled')
    .reduce((sum, o) => sum + o.total_value, 0);

  const totalSellVolume = orders
    .filter(o => o.side === 'sell' && o.status === 'filled')
    .reduce((sum, o) => sum + o.total_value, 0);

  const totalFeesPaid = orders
    .filter(o => o.status === 'filled')
    .reduce((sum, o) => sum + (o.fee ?? 0), 0);

  const filledOrdersCount = orders.filter(o => o.status === 'filled').length;

  return {
    orders,
    history,
    loadingOrders,
    loadingHistory,
    placing,
    error,
    submitOrder,
    refresh,
    totalBuyVolume,
    totalSellVolume,
    totalFeesPaid,
    filledOrdersCount,
  };
}
