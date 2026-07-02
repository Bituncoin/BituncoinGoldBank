// BTNG Gold — Trading Service (Supabase)
import { getSupabaseClient } from '@/template';

export interface Order {
  id: string;
  user_id: string;
  coin_symbol: string;
  coin_name: string;
  side: 'buy' | 'sell';
  order_type: 'market' | 'limit' | 'stop-limit';
  status: 'pending' | 'filled' | 'cancelled' | 'partial';
  quantity: number;
  price: number;
  total_value: number;
  fee: number;
  filled_quantity?: number;
  limit_price?: number;
  created_at: string;
  updated_at?: string;
}

export interface TradeHistoryItem {
  id: string;
  user_id: string;
  order_id?: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'transfer' | 'receive' | 'send';
  coin: string;
  coin_name?: string;
  amount: number;
  price?: number;
  total_usd?: number;
  fee?: number;
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  note?: string;
  created_at: string;
}

export interface PlaceOrderPayload {
  userId: string;
  coinSymbol: string;
  coinName: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop-limit';
  quantity: number;
  price: number;
  limitPrice?: number;
}

const FEE_RATE = 0.001; // 0.1% trading fee

// ── Place a new order and write to trade_history
export async function placeOrder(payload: PlaceOrderPayload): Promise<{ data: Order | null; error: string | null }> {
  const client = getSupabaseClient();

  const totalValue = payload.quantity * payload.price;
  const fee = parseFloat((totalValue * FEE_RATE).toFixed(8));

  // Insert the order
  const { data: orderData, error: orderError } = await client
    .from('orders')
    .insert({
      user_id: payload.userId,
      coin_symbol: payload.coinSymbol,
      coin_name: payload.coinName,
      side: payload.side,
      order_type: payload.orderType,
      status: 'filled',
      quantity: payload.quantity,
      price: payload.price,
      total_value: totalValue,
      fee,
      filled_quantity: payload.quantity,
      limit_price: payload.limitPrice ?? null,
    })
    .select()
    .single();

  if (orderError) return { data: null, error: orderError.message };

  // Write to trade_history
  await client.from('trade_history').insert({
    user_id: payload.userId,
    order_id: (orderData as Order).id,
    type: payload.side,
    coin: payload.coinSymbol,
    coin_name: payload.coinName,
    amount: payload.quantity,
    price: payload.price,
    total_usd: totalValue,
    fee,
    status: 'completed',
    note: `${payload.orderType.charAt(0).toUpperCase() + payload.orderType.slice(1)} order filled at $${payload.price}`,
  });

  return { data: orderData as Order, error: null };
}

// ── Fetch all orders for a user (newest first)
export async function fetchOrders(
  userId: string,
  options?: { limit?: number; coin?: string; side?: 'buy' | 'sell' }
): Promise<{ data: Order[]; error: string | null }> {
  const client = getSupabaseClient();
  let query = client
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.limit) query = query.limit(options.limit);
  if (options?.coin) query = query.eq('coin_symbol', options.coin);
  if (options?.side) query = query.eq('side', options.side);

  const { data, error } = await query;
  return { data: (data as Order[]) ?? [], error: error?.message ?? null };
}

// ── Fetch full trade history for a user
export async function fetchTradeHistory(
  userId: string,
  options?: { limit?: number; type?: string }
): Promise<{ data: TradeHistoryItem[]; error: string | null }> {
  const client = getSupabaseClient();
  let query = client
    .from('trade_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (options?.limit) query = query.limit(options.limit);
  if (options?.type) query = query.eq('type', options.type);

  const { data, error } = await query;
  return { data: (data as TradeHistoryItem[]) ?? [], error: error?.message ?? null };
}

// ── Write a deposit/withdraw/transfer entry to trade_history
export async function recordTransaction(params: {
  userId: string;
  type: TradeHistoryItem['type'];
  coin: string;
  coinName?: string;
  amount: number;
  totalUsd?: number;
  fee?: number;
  note?: string;
  status?: TradeHistoryItem['status'];
}): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client.from('trade_history').insert({
    user_id: params.userId,
    type: params.type,
    coin: params.coin,
    coin_name: params.coinName ?? params.coin,
    amount: params.amount,
    total_usd: params.totalUsd ?? null,
    fee: params.fee ?? null,
    status: params.status ?? 'completed',
    note: params.note ?? null,
  });
  return { error: error?.message ?? null };
}

// ── Fetch open/recent orders for a specific coin (for order book display)
export async function fetchUserOrdersForCoin(
  userId: string,
  coinSymbol: string,
  limit = 10
): Promise<{ data: Order[]; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .eq('coin_symbol', coinSymbol)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: (data as Order[]) ?? [], error: error?.message ?? null };
}
