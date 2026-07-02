/**
 * WalletContext — Live Price Edition
 * ──────────────────────────────────────────────────────────────────────────
 * Keeps all existing coin balance / trade logic intact.
 * Overlays LIVE prices from CoinGecko (via useCryptoPrices) and the
 * BTNG Gold Oracle so every coin card shows real market data.
 *
 * Coins whose live price is unavailable fall back to the mockData static price.
 */
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { COINS, TRANSACTIONS } from '@/constants/mockData';
import { fetchLiveCryptoPricesFullData, CryptoFullPrices, FALLBACK_FULL } from '@/services/cryptoPriceService';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

// Symbol → CoinGecko-key mapping
const SYMBOL_TO_CG_KEY: Record<string, keyof CryptoFullPrices> = {
  BTC: 'BTC', ETH: 'ETH', BNB: 'BNB', SOL: 'SOL',
  XRP: 'XRP', MATIC: 'MATIC', ADA: 'ADA', DOGE: 'DOGE', AVAX: 'AVAX', DOT: 'DOT',
};

interface LiveCoinEntry {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

interface WalletContextType {
  coins: typeof COINS;
  transactions: typeof TRANSACTIONS;
  practiceBalance: number;
  totalValue: number;
  livePrices: Record<string, LiveCoinEntry>; // keyed by symbol
  pricesLoading: boolean;
  pricesLastUpdated: Date | null;
  pricesSource: 'live' | 'fallback';
  btngLivePrice: number;  // from gold oracle
  btngChange24h: number;
  executeTrade: (coinId: string, type: 'buy' | 'sell', amount: number) => Promise<{ success: boolean; message: string }>;
  executePracticeTrade: (coinId: string, type: 'buy' | 'sell', amount: number) => Promise<{ success: boolean; message: string }>;
  deposit: (method: string, amount: number) => Promise<boolean>;
  withdraw: (method: string, amount: number, coin: string) => Promise<boolean>;
  refreshPrices: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const PRICE_REFRESH_MS = 60_000;   // 1 min for market prices
const GOLD_REFRESH_MS  = 15_000;   // 15 sec for BTNG/gold oracle — faster live updates

export function WalletProvider({ children }: { children: ReactNode }) {
  const [coins, setCoins]               = useState(COINS);
  const [transactions, setTransactions] = useState(TRANSACTIONS);
  const [practiceBalance, setPracticeBalance] = useState(100_000);

  // ── Live prices state ────────────────────────────────────────────────────
  const [livePrices, setLivePrices]           = useState<Record<string, LiveCoinEntry>>({});
  const [pricesLoading, setPricesLoading]     = useState(true);
  const [pricesLastUpdated, setPricesLastUpdated] = useState<Date | null>(null);
  const [pricesSource, setPricesSource]       = useState<'live' | 'fallback'>('fallback');
  const [btngLivePrice, setBtngLivePrice]     = useState(0);
  const [btngChange24h, setBtngChange24h]     = useState(0);

  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const goldTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted    = useRef(true);

  // ── Fetch live market prices ─────────────────────────────────────────────
  const fetchMarketPrices = async () => {
    try {
      const full = await fetchLiveCryptoPricesFullData();
      if (!mounted.current) return;
      if (full) {
        const map: Record<string, LiveCoinEntry> = {};
        for (const [symbol, cgKey] of Object.entries(SYMBOL_TO_CG_KEY)) {
          map[symbol] = full[cgKey as keyof CryptoFullPrices];
        }
        setLivePrices(map);
        setPricesLastUpdated(new Date());
        setPricesSource('live');

        // Patch coin prices with live data
        setCoins(prev => prev.map(c => {
          const live = map[c.symbol];
          if (live && live.price > 0) {
            return { ...c, price: live.price, change24h: live.change24h };
          }
          return c;
        }));
      } else {
        setPricesSource('fallback');
      }
    } catch { /* silent */ }
    if (mounted.current) setPricesLoading(false);
  };

  // ── Fetch BTNG/gold oracle price ─────────────────────────────────────────
  const fetchGoldPrice = async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.functions.invoke('gold-oracle', { body: {} });
      if (!mounted.current) return;
      if (!error && data?.priceUSD && data.priceUSD > 0) {
        // Unit 1: BTNGG = 1/1000 oz
        // Derive all three unit prices from the raw XAU/USD spot price
        const priceUSD     = data.priceUSD;
        const TROY         = 31.1035;
        const KG_TROY      = 32.1507;
        // Unit 1: BTNGG  = 1/1000 oz  (e.g. $4,462.20 / 1000 = $4.4622)
        const btnggPrice   = priceUSD / 1000;
        // Unit 2: BTNG-G = 1 gram     (e.g. $4,462.20 / 31.1035 = $143.46)
        const btngGPrice   = priceUSD / TROY;
        // Unit 3: BTNG-KG = 1 kg      (e.g. $4,462.20 * 32.1507 = $143,463)
        const btngKgPrice  = priceUSD * KG_TROY;
        const change       = data.changePct24h ?? 0;

        setBtngLivePrice(btnggPrice);
        setBtngChange24h(change);

        // Patch all three BTNG units in the coin list
        setCoins(prev => prev.map(c => {
          if (c.symbol === 'BTNGG'   || c.id === 'btng')    return { ...c, price: btnggPrice,   change24h: change };
          if (c.symbol === 'BTNG-G'  || c.id === 'btng-g')  return { ...c, price: btngGPrice,   change24h: change };
          if (c.symbol === 'BTNG-KG' || c.id === 'btng-kg') return { ...c, price: btngKgPrice,  change24h: change };
          return c;
        }));
      }
    } catch { /* silent */ }
  };

  // ── Initialise & schedule refreshes ─────────────────────────────────────
  useEffect(() => {
    mounted.current = true;
    fetchMarketPrices();
    fetchGoldPrice();
    timerRef.current  = setInterval(fetchMarketPrices, PRICE_REFRESH_MS);
    goldTimer.current = setInterval(fetchGoldPrice,    GOLD_REFRESH_MS);
    return () => {
      mounted.current = false;
      if (timerRef.current)  clearInterval(timerRef.current);
      if (goldTimer.current) clearInterval(goldTimer.current);
    };
  }, []);

  const refreshPrices = () => {
    fetchMarketPrices();
    fetchGoldPrice();
  };

  // ── Portfolio total with live prices ────────────────────────────────────
  const totalValue = coins.reduce((sum, c) => sum + c.balance * c.price, 0);

  // ── Trade execution ──────────────────────────────────────────────────────
  const executeTrade = async (coinId: string, type: 'buy' | 'sell', amount: number) => {
    await new Promise(r => setTimeout(r, 800));
    const coin = coins.find(c => c.id === coinId);
    if (!coin) return { success: false, message: 'Coin not found' };

    setCoins(prev => prev.map(c => {
      if (c.id === coinId) {
        const newBal = type === 'buy' ? c.balance + amount : c.balance - amount;
        return { ...c, balance: Math.max(0, newBal), isOwned: newBal > 0 };
      }
      if (c.id === 'usdt' && type === 'buy')  return { ...c, balance: Math.max(0, c.balance - amount * coin.price) };
      if (c.id === 'usdt' && type === 'sell') return { ...c, balance: c.balance + amount * coin.price };
      return c;
    }));

    const newTx = {
      id: Date.now().toString(),
      type,
      coin: coin.symbol,
      amount,
      price: coin.price,
      value: amount * coin.price,
      date: new Date().toISOString().split('T')[0],
      status: 'completed' as const,
    };
    setTransactions(prev => [newTx, ...prev]);
    return { success: true, message: `${type === 'buy' ? 'Bought' : 'Sold'} ${amount} ${coin.symbol} successfully` };
  };

  const executePracticeTrade = async (coinId: string, type: 'buy' | 'sell', amount: number) => {
    await new Promise(r => setTimeout(r, 600));
    const coin = coins.find(c => c.id === coinId);
    if (!coin) return { success: false, message: 'Coin not found' };
    const cost = amount * coin.price;
    if (type === 'buy' && cost > practiceBalance) return { success: false, message: 'Insufficient practice balance' };
    setPracticeBalance(prev => type === 'buy' ? prev - cost : prev + cost);
    return { success: true, message: `Practice ${type}: ${amount} ${coin.symbol}` };
  };

  const deposit = async (method: string, amount: number) => {
    await new Promise(r => setTimeout(r, 1500));
    setCoins(prev => prev.map(c => c.id === 'usdt' ? { ...c, balance: c.balance + amount } : c));
    return true;
  };

  const withdraw = async (method: string, amount: number, coin: string) => {
    await new Promise(r => setTimeout(r, 1500));
    return true;
  };

  return (
    <WalletContext.Provider value={{
      coins, transactions, practiceBalance, totalValue,
      livePrices, pricesLoading, pricesLastUpdated, pricesSource,
      btngLivePrice, btngChange24h,
      executeTrade, executePracticeTrade, deposit, withdraw,
      refreshPrices,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
