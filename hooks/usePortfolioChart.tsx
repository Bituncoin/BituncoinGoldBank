// BTNG Gold — 7-Day Portfolio Chart Hook
import { useMemo } from 'react';
import { TradeHistoryItem } from '@/services/tradingService';

export interface DayBucket {
  label: string;      // e.g. "Mon", "Tue"
  value: number;      // cumulative net USD value on that day
  date: string;       // ISO date string  YYYY-MM-DD
}

const INFLOW_TYPES  = new Set(['deposit', 'receive', 'buy']);
const OUTFLOW_TYPES = new Set(['withdraw', 'send', 'sell']);

/**
 * Builds 7 daily buckets (oldest → newest, ending today).
 * Each bucket's `value` = running cumulative net USD from the very first
 * transaction up to the end of that day.
 *
 * Returns:
 *  - buckets      : DayBucket[7]
 *  - pctChange    : % change from day 0 → day 6
 *  - isPositive   : boolean
 *  - hasData      : whether any transactions exist
 */
export function usePortfolioChart(history: TradeHistoryItem[]) {
  return useMemo(() => {
    // ── Build a map of date → net delta ─────────────────────────────────────
    const deltaByDate: Record<string, number> = {};

    for (const tx of history) {
      const dateKey = tx.created_at.slice(0, 10); // YYYY-MM-DD
      const usd = tx.total_usd ?? 0;
      let delta = 0;

      if (INFLOW_TYPES.has(tx.type)) {
        delta = usd;
      } else if (OUTFLOW_TYPES.has(tx.type)) {
        delta = -usd;
      }
      // 'transfer' skips — it is internal and net-zero

      deltaByDate[dateKey] = (deltaByDate[dateKey] ?? 0) + delta;
    }

    // ── Generate last 7 days (oldest first) ─────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: { date: string; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
      days.push({ date: iso, label });
    }

    // ── Compute ALL dates' cumulative delta up to and including each day ─────
    // First, compute the running total of ALL history that is before day[0]
    const day0Date = days[0].date;
    let baseline = 0;
    for (const [dateKey, delta] of Object.entries(deltaByDate)) {
      if (dateKey < day0Date) baseline += delta;
    }

    // ── Build buckets with running cumulative value ──────────────────────────
    let runningTotal = baseline;
    const buckets: DayBucket[] = days.map(day => {
      runningTotal += deltaByDate[day.date] ?? 0;
      return { label: day.label, value: Math.max(0, runningTotal), date: day.date };
    });

    const hasData = history.length > 0 && buckets.some(b => b.value > 0);

    // ── PnL ──────────────────────────────────────────────────────────────────
    const firstNonZero = buckets.find(b => b.value > 0)?.value ?? 0;
    const lastValue    = buckets[buckets.length - 1].value;
    const pctChange    = firstNonZero > 0
      ? ((lastValue - firstNonZero) / firstNonZero) * 100
      : 0;
    const isPositive   = pctChange >= 0;

    return { buckets, pctChange, isPositive, hasData };
  }, [history]);
}
