// ExchangeRate-API free endpoint — no key required
// https://open.er-api.com/v6/latest/USD

export interface ExchangeRates {
  rates: Record<string, number>; // e.g. { GHS: 11.8, NGN: 1550, KES: 130 }
  lastUpdated: Date;
}

const BASE_URL = 'https://open.er-api.com/v6/latest/USD';
const TIMEOUT_MS = 10_000;

/**
 * Fetch live exchange rates from ExchangeRate-API.
 * Returns null on network error so callers can fall back gracefully.
 */
export async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(BASE_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();

    if (data?.result !== 'success' || !data?.rates) return null;

    // Basic sanity check — reject obviously bad data
    const rates: Record<string, number> = data.rates;
    if (!rates['GHS'] || !rates['NGN'] || rates['GHS'] < 1) return null;

    return { rates, lastUpdated: new Date() };
  } catch {
    return null;
  }
}
