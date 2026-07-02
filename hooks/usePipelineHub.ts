// BTNG Pipeline Hub Hook

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPipelineHubData, PipelineHubData, PipelineStats, ActivityEvent } from '@/services/pipelineHubService';

const EMPTY_STATS: PipelineStats = {
  total: 0,
  success: 0,
  failed: 0,
  lastTimestamp: null,
  successRate: 0,
};

const DEFAULT_DATA: PipelineHubData = {
  verification: EMPTY_STATS,
  minting: EMPTY_STATS,
  certificate: EMPTY_STATS,
  activity: [],
  lastRefreshed: new Date().toISOString(),
};

export function usePipelineHub() {
  const { user } = useAuth();
  const [data, setData] = useState<PipelineHubData>(DEFAULT_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPipelineHubData(user.id);
      setData(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load pipeline data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  return {
    ...data,
    loading,
    error,
    reload: load,
  };
}
