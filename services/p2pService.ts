// BTNG Gold — P2P Service (Supabase)
import { getSupabaseClient } from '@/template';

export type P2PListingType = 'buy' | 'sell';
export type P2PListingStatus = 'open' | 'paused' | 'completed' | 'cancelled';
export type P2POrderStatus = 'pending' | 'paid' | 'confirmed' | 'completed' | 'disputed' | 'cancelled';

export interface P2PListing {
  id: string;
  user_id: string;
  coin_symbol: string;
  coin_name: string;
  type: P2PListingType;
  price: number;
  currency: string;
  min_amount: number;
  max_amount: number;
  available_amount: number;
  payment_methods: string[];
  status: P2PListingStatus;
  completed_trades: number;
  rating: number;
  response_time: string;
  country: string;
  badge: string | null;
  terms: string | null;
  created_at: string;
  updated_at: string | null;
  // joined from user_profiles
  user_profiles?: {
    username: string | null;
    full_name: string | null;
    email: string;
    kyc_status: string | null;
    tier: string | null;
  };
}

export interface P2POrder {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  coin_symbol: string;
  amount: number;
  price: number;
  total_fiat: number;
  currency: string;
  payment_method: string;
  status: P2POrderStatus;
  payment_proof: string | null;
  buyer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string | null;
  // joined
  listing?: Partial<P2PListing>;
  buyer_profile?: { username: string | null; full_name: string | null };
  seller_profile?: { username: string | null; full_name: string | null };
}

export interface CreateListingPayload {
  userId: string;
  coinSymbol: string;
  coinName: string;
  type: P2PListingType;
  price: number;
  currency: string;
  minAmount: number;
  maxAmount: number;
  availableAmount: number;
  paymentMethods: string[];
  responseTime?: string;
  country?: string;
  terms?: string;
}

export interface PlaceP2POrderPayload {
  listingId: string;
  buyerId: string;
  sellerId: string;
  coinSymbol: string;
  amount: number;
  price: number;
  totalFiat: number;
  currency: string;
  paymentMethod: string;
}

// ── Fetch open listings with optional filters
export async function fetchListings(options?: {
  coin?: string;
  type?: P2PListingType;
  limit?: number;
}): Promise<{ data: P2PListing[]; error: string | null }> {
  const client = getSupabaseClient();
  let query = client
    .from('p2p_listings')
    .select('*, user_profiles(username, full_name, email, kyc_status, tier)')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (options?.coin && options.coin !== 'All') query = query.eq('coin_symbol', options.coin);
  if (options?.type) query = query.eq('type', options.type);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  return { data: (data as P2PListing[]) ?? [], error: error?.message ?? null };
}

// ── Fetch my own listings
export async function fetchMyListings(userId: string): Promise<{ data: P2PListing[]; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('p2p_listings')
    .select('*, user_profiles(username, full_name, email, kyc_status, tier)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: (data as P2PListing[]) ?? [], error: error?.message ?? null };
}

// ── Create a new listing
export async function createListing(payload: CreateListingPayload): Promise<{ data: P2PListing | null; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('p2p_listings')
    .insert({
      user_id: payload.userId,
      coin_symbol: payload.coinSymbol,
      coin_name: payload.coinName,
      type: payload.type,
      price: payload.price,
      currency: payload.currency,
      min_amount: payload.minAmount,
      max_amount: payload.maxAmount,
      available_amount: payload.availableAmount,
      payment_methods: payload.paymentMethods,
      response_time: payload.responseTime ?? '< 15 min',
      country: payload.country ?? 'Ghana',
      terms: payload.terms ?? null,
      status: 'open',
    })
    .select()
    .single();
  return { data: data as P2PListing | null, error: error?.message ?? null };
}

// ── Update listing status
export async function updateListingStatus(
  listingId: string,
  status: P2PListingStatus
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('p2p_listings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', listingId);
  return { error: error?.message ?? null };
}

// ── Delete a listing (only if open/paused)
export async function deleteListing(listingId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('p2p_listings')
    .delete()
    .eq('id', listingId);
  return { error: error?.message ?? null };
}

// ── Place a P2P order (buyer initiates)
export async function placeP2POrder(payload: PlaceP2POrderPayload): Promise<{ data: P2POrder | null; error: string | null }> {
  const client = getSupabaseClient();

  // Validate available amount
  const { data: listing } = await client
    .from('p2p_listings')
    .select('available_amount, status')
    .eq('id', payload.listingId)
    .single();

  if (!listing || listing.status !== 'open') {
    return { data: null, error: 'This listing is no longer available.' };
  }
  if (payload.amount > listing.available_amount) {
    return { data: null, error: `Insufficient available amount. Max: ${listing.available_amount}` };
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min window

  const { data, error } = await client
    .from('p2p_orders')
    .insert({
      listing_id: payload.listingId,
      buyer_id: payload.buyerId,
      seller_id: payload.sellerId,
      coin_symbol: payload.coinSymbol,
      amount: payload.amount,
      price: payload.price,
      total_fiat: payload.totalFiat,
      currency: payload.currency,
      payment_method: payload.paymentMethod,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // Reduce available_amount on the listing
  await client
    .from('p2p_listings')
    .update({
      available_amount: listing.available_amount - payload.amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.listingId);

  return { data: data as P2POrder, error: null };
}

// ── Fetch my P2P orders (as buyer or seller)
export async function fetchMyP2POrders(userId: string): Promise<{ data: P2POrder[]; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('p2p_orders')
    .select(`
      *,
      listing:p2p_listings(coin_symbol, type, payment_methods, country),
      buyer_profile:user_profiles!p2p_orders_buyer_id_fkey(username, full_name),
      seller_profile:user_profiles!p2p_orders_seller_id_fkey(username, full_name)
    `)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(30);
  return { data: (data as P2POrder[]) ?? [], error: error?.message ?? null };
}

// ── Update P2P order status
export async function updateP2POrderStatus(
  orderId: string,
  status: P2POrderStatus,
  extra?: { buyerConfirmed?: boolean; sellerConfirmed?: boolean }
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const update: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (extra?.buyerConfirmed) update.buyer_confirmed_at = new Date().toISOString();
  if (extra?.sellerConfirmed) update.seller_confirmed_at = new Date().toISOString();

  const { error } = await client.from('p2p_orders').update(update).eq('id', orderId);
  return { error: error?.message ?? null };
}
