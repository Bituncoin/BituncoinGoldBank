// BTNG Gold — P2P Hook
import { useState, useEffect, useCallback } from 'react';
import {
  fetchListings,
  fetchMyListings,
  fetchMyP2POrders,
  createListing,
  updateListingStatus,
  deleteListing,
  placeP2POrder,
  updateP2POrderStatus,
  P2PListing,
  P2POrder,
  P2PListingType,
  P2POrderStatus,
  CreateListingPayload,
  PlaceP2POrderPayload,
} from '@/services/p2pService';

// ── Main P2P listings hook (marketplace view)
export function useP2P(options?: { coin?: string; type?: P2PListingType }) {
  const [listings, setListings] = useState<P2PListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await fetchListings({
      coin: options?.coin,
      type: options?.type,
      limit: 50,
    });
    setListings(data);
    if (err) setError(err);
    setLoading(false);
  }, [options?.coin, options?.type]);

  useEffect(() => {
    load();
  }, [load]);

  return { listings, loading, error, refresh: load };
}

// ── My listings management hook
export function useMyListings(userId?: string) {
  const [listings, setListings] = useState<P2PListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await fetchMyListings(userId);
    setListings(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const postListing = useCallback(async (payload: CreateListingPayload): Promise<{ error: string | null }> => {
    setPosting(true);
    const { data, error } = await createListing(payload);
    setPosting(false);
    if (!error && data) setListings(prev => [data, ...prev]);
    return { error };
  }, []);

  const pauseListing = useCallback(async (id: string, isPaused: boolean): Promise<{ error: string | null }> => {
    setActing(id);
    const { error } = await updateListingStatus(id, isPaused ? 'paused' : 'open');
    setActing(null);
    if (!error) setListings(prev => prev.map(l => l.id === id ? { ...l, status: isPaused ? 'paused' : 'open' } : l));
    return { error };
  }, []);

  const removeListing = useCallback(async (id: string): Promise<{ error: string | null }> => {
    setActing(id);
    const { error } = await deleteListing(id);
    setActing(null);
    if (!error) setListings(prev => prev.filter(l => l.id !== id));
    return { error };
  }, []);

  return { listings, loading, acting, posting, postListing, pauseListing, removeListing, refresh: load };
}

// ── My P2P orders (buy/sell activity)
export function useMyP2POrders(userId?: string) {
  const [orders, setOrders] = useState<P2POrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await fetchMyP2POrders(userId);
    setOrders(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const initiateOrder = useCallback(async (payload: PlaceP2POrderPayload): Promise<{ data: P2POrder | null; error: string | null }> => {
    const { data, error } = await placeP2POrder(payload);
    if (data) setOrders(prev => [data, ...prev]);
    return { data, error };
  }, []);

  const updateStatus = useCallback(async (
    orderId: string,
    status: P2POrderStatus,
    isBuyer: boolean
  ): Promise<{ error: string | null }> => {
    setActing(orderId);
    const { error } = await updateP2POrderStatus(orderId, status, {
      buyerConfirmed: isBuyer && status === 'paid',
      sellerConfirmed: !isBuyer && status === 'completed',
    });
    setActing(null);
    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    }
    return { error };
  }, []);

  const activeOrders = orders.filter(o => !['completed', 'cancelled', 'disputed'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'completed');

  return {
    orders,
    activeOrders,
    completedOrders,
    loading,
    acting,
    initiateOrder,
    updateStatus,
    refresh: load,
  };
}
