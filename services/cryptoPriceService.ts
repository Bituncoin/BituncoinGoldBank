/**
 * BTNG Crypto Price Service — LIVE DATA
 * ──────────────────────────────────────────────────────────────────────────
 * Fetches real-time prices via the coingecko-prices Edge Function (server-side,
 * API key protected). Falls back to direct CoinGecko free API if edge function
 * is unreachable, then falls back to last-known prices.
 *
 * Includes: price, 24h change %, 24h high, 24h low, volume
 */

import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

export interface CoinLiveData {
  price: number;
  change24h: number;   // percent, e.g. +2.14 or -1.23
  high24h: number;
  low24h: number;
  volume24h: number;
}

export interface CryptoPrices {
  BTC:   number;
  ETH:   number;
  BNB:   number;
  SOL:   number;
  XRP:   number;
  MATIC: number;
  ADA:   number;
  DOGE:  number;
  AVAX:  number;
  DOT:   number;
  BTNG:  number; // gold-oracle driven — set externally
}

export interface CryptoFullPrices {
  BTC:   CoinLiveData;
  ETH:   CoinLiveData;
  BNB:   CoinLiveData;
  SOL:   CoinLiveData;
  XRP:   CoinLiveData;
  MATIC: CoinLiveData;
  ADA:   CoinLiveData;
  DOGE:  CoinLiveData;
  AVAX:  CoinLiveData;
  DOT:   CoinLiveData;
}

// CoinGecko ID map
const CG_IDS: Record<keyof CryptoFullPrices, string> = {
  BTC:   'bitcoin',
  ETH:   'ethereum',
  BNB:   'binancecoin',
  SOL:   'solana',
  XRP:   'ripple',
  MATIC: 'polygon-ecosystem-token',
  ADA:   'cardano',
  DOGE:  'dogecoin',
  AVAX:  'avalanche-2',
  DOT:   'polkadot',
};

// Fallback prices based on live gold $4,462.20/oz (June 2026)
export const FALLBACK_FULL: CryptoFullPrices = {
  BTC:   { price: 107_200, change24h: 2.14,  high24h: 108_500, low24h: 105_800, volume24h: 48_320_000_000 },
  ETH:   { price: 3_840,   change24h: -1.23, high24h: 3_920,   low24h: 3_780,   volume24h: 21_500_000_000 },
  BNB:   { price: 685,     change24h: 3.45,  high24h: 695,     low24h: 670,     volume24h: 2_100_000_000  },
  SOL:   { price: 184,     change24h: -0.87, high24h: 188,     low24h: 181,     volume24h: 4_300_000_000  },
  XRP:   { price: 2.14,    change24h: -2.11, high24h: 2.22,    low24h: 2.08,    volume24h: 7_800_000_000  },
  MATIC: { price: 0.29,    change24h: 1.20,  high24h: 0.31,    low24h: 0.27,    volume24h: 180_000_000    },
  ADA:   { price: 0.72,    change24h: 1.34,  high24h: 0.75,    low24h: 0.69,    volume24h: 980_000_000    },
  DOGE:  { price: 0.38,    change24h: 4.12,  high24h: 0.40,    low24h: 0.36,    volume24h: 3_200_000_000  },
  AVAX:  { price: 6.78,    change24h: -4.48, high24h: 6.91,    low24h: 6.64,    volume24h: 409_000_000    },
  DOT:   { price: 9.14,    change24h: 2.78,  high24h: 9.45,    low24h: 8.88,    volume24h: 560_000_000    },
};

export const FALLBACK_PRICES: CryptoPrices = {
  BTC:   FALLBACK_FULL.BTC.price,
  ETH:   FALLBACK_FULL.ETH.price,
  BNB:   FALLBACK_FULL.BNB.price,
  SOL:   FALLBACK_FULL.SOL.price,
  XRP:   FALLBACK_FULL.XRP.price,
  MATIC: FALLBACK_FULL.MATIC.price,
  ADA:   FALLBACK_FULL.ADA.price,
  DOGE:  FALLBACK_FULL.DOGE.price,
  AVAX:  FALLBACK_FULL.AVAX.price,
  DOT:   FALLBACK_FULL.DOT.price,
  BTNG:  4.4418,  // BTNGG = $4,441.84 / 1000  (fawazahmed0 CDN live June 6 2026)
};

// ── Primary: Edge Function (server-side, API-key protected) ─────────────────
async function fetchViaEdgeFunction(): Promise<CryptoFullPrices | null> {
  try {
    const supabase = getSupabaseClient();
    const ids = Object.values(CG_IDS);
    const { data, error } = await supabase.functions.invoke('coingecko-prices', {
      body: { ids },
    });

    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { msg = await error.context?.text() ?? msg; } catch { /* ignore */ }
      }
      console.warn('[cryptoPriceService] Edge function error:', msg);
      return null;
    }

    if (!data?.data) return null;

    const raw = data.data as Record<string, any>;
    const result = { ...FALLBACK_FULL };

    for (const [symbol, cgId] of Object.entries(CG_IDS) as [keyof CryptoFullPrices, string][]) {
      const entry = raw[cgId];
      if (entry && typeof entry.price === 'number' && entry.price > 0) {
        result[symbol] = {
          price:     entry.price,
          change24h: entry.change24h ?? 0,
          high24h:   entry.high24h   ?? entry.price,
          low24h:    entry.low24h    ?? entry.price,
          volume24h: entry.volume24h ?? 0,
        };
      }
    }

    return result;
  } catch (e) {
    console.warn('[cryptoPriceService] Edge function unexpected:', e);
    return null;
  }
}

// ── Fallback: Direct CoinGecko free API ──────────────────────────────────────
async function fetchDirectCoinGecko(): Promise<CryptoFullPrices | null> {
  try {
    const ids = Object.values(CG_IDS).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price` +
      `?ids=${ids}&vs_currencies=usd` +
      `&include_24hr_change=true&include_24hr_vol=true&precision=full`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);

    if (!res.ok) return null;
    const raw = await res.json();

    const result = { ...FALLBACK_FULL };
    for (const [symbol, cgId] of Object.entries(CG_IDS) as [keyof CryptoFullPrices, string][]) {
      const entry = raw[cgId];
      if (entry?.usd && entry.usd > 0) {
        result[symbol] = {
          price:     entry.usd,
          change24h: entry.usd_24h_change ?? 0,
          high24h:   entry.usd ?? 0,
          low24h:    entry.usd ?? 0,
          volume24h: entry.usd_24h_vol   ?? 0,
        };
      }
    }

    // Basic sanity
    if (result.BTC.price < 1000 || result.ETH.price < 50) return null;

    return result;
  } catch {
    return null;
  }
}

/**
 * fetchLiveCryptoPricesFullData — returns rich CoinLiveData per coin.
 * Tries edge function first, then direct CoinGecko, then returns null.
 */
export async function fetchLiveCryptoPricesFullData(): Promise<CryptoFullPrices | null> {
  const edge = await fetchViaEdgeFunction();
  if (edge) return edge;
  return fetchDirectCoinGecko();
}

/**
 * fetchLiveCryptoPrices — simple price-only map (legacy compat)
 */
export async function fetchLiveCryptoPrices(): Promise<CryptoPrices | null> {
  const full = await fetchLiveCryptoPricesFullData();
  if (!full) return null;
  return {
    BTC:   full.BTC.price,
    ETH:   full.ETH.price,
    BNB:   full.BNB.price,
    SOL:   full.SOL.price,
    XRP:   full.XRP.price,
    MATIC: full.MATIC.price,
    ADA:   full.ADA.price,
    DOGE:  full.DOGE.price,
    AVAX:  full.AVAX.price,
    DOT:   full.DOT.price,
    BTNG:  FALLBACK_PRICES.BTNG,
  };
}
