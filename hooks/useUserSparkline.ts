// BTNG Gold — 7-day portfolio sparkline from trade_history for a given user
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/template';

interface SparklineResult {
  points: number[];   // 7 daily cumulative total_usd values
  loading: boolean;
  isEmpty: boolean;
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

export function useUserSparkline(userId: string | null, enabled: boolean): SparklineResult {
  const [points, setPoints] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !enabled) {
      setPoints([]);
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 6);
        since.setHours(0, 0, 0, 0);

        const client = getSupabaseClient();
        const { data, error } = await client
          .from('trade_history')
          .select('created_at, total_usd, type')
          .eq('user_id', userId)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: true });

        if (cancelled) return;

        if (error || !data || data.length === 0) {
          setPoints([]);
          setLoading(false);
          return;
        }

        // Group by date — sum net value per day (buys add, sells subtract)
        const days = getLast7Days();
        const dailyNet: Record<string, number> = {};
        days.forEach(d => { dailyNet[d] = 0; });

        for (const row of data) {
          const day = (row.created_at as string).split('T')[0];
          if (day in dailyNet) {
            const usd = (row.total_usd as number) ?? 0;
            // buys / deposits add value, sells / withdrawals subtract
            if (row.type === 'sell' || row.type === 'withdraw') {
              dailyNet[day] -= usd;
            } else {
              dailyNet[day] += usd;
            }
          }
        }

        // Build cumulative running total starting from any prior portfolio base
        const values: number[] = [];
        let running = 0;
        for (const d of days) {
          running += dailyNet[d];
          values.push(Math.max(0, running));
        }

        setPoints(values);
      } catch {
        setPoints([]);
      }
      setLoading(false);
    };

    fetch();
    return () => { cancelled = true; };
  }, [userId, enabled]);

  return {
    points,
    loading,
    isEmpty: points.length === 0 || points.every(v => v === 0),
  };
}
