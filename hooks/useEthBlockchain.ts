import { useState, useCallback } from 'react';
import { getSupabaseClient } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EthBalance {
  address: string;
  balance: { wei: string; eth: string; gwei: string };
  txCount: number;
  blockNumber: number;
  gasPrice: { wei: string; gwei: string };
  network: string;
  fetchedAt: string;
}

export interface EthTokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceRaw: string;
  hasBalance: boolean;
}

export interface EthTokenResult {
  address: string;
  tokens: EthTokenBalance[];
  totalTokens: number;
  fetchedAt: string;
}

export interface EthTransaction {
  hash: string;
  status: 'success' | 'failed' | 'pending';
  blockNumber: number | null;
  from: string;
  to: string | null;
  value: { wei: string; eth: string };
  gasPrice: { wei: string; gwei: string };
  gasLimit: number;
  gasUsed: number | null;
  fee: { wei: string; eth: string } | null;
  nonce: number | null;
  input: string | null;
  contractAddress: string | null;
  isContractCreation: boolean;
  fetchedAt: string;
}

export interface EthNetworkStatus {
  network: string;
  chainId: number;
  blockNumber: number;
  blockTimestamp: string;
  blockTxCount: number;
  gasPrice: { wei: string; gwei: string };
  baseFee: { wei: string; gwei: string } | null;
  feeEstimates: {
    fast:   { gwei: string; label: string; usd: string };
    normal: { gwei: string; label: string; usd: string };
    slow:   { gwei: string; label: string; usd: string };
  };
  fetchedAt: string;
}

// ── Edge Function caller ──────────────────────────────────────────────────────
async function callEthBlockchain<T>(
  action: string,
  params: Record<string, unknown> = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke('eth-blockchain', {
      body: { action, ...params },
    });

    if (error) {
      let errorMessage = error.message;
      if (error instanceof FunctionsHttpError) {
        try {
          const statusCode = error.context?.status ?? 500;
          const textContent = await error.context?.text();
          errorMessage = `[Code: ${statusCode}] ${textContent || error.message}`;
        } catch {
          errorMessage = error.message;
        }
      }
      return { data: null, error: errorMessage };
    }

    return { data: data as T, error: null };
  } catch (e: unknown) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Main Hook ─────────────────────────────────────────────────────────────────
export function useEthBlockchain() {
  const [balanceData, setBalanceData] = useState<EthBalance | null>(null);
  const [tokenData, setTokenData] = useState<EthTokenResult | null>(null);
  const [txData, setTxData] = useState<EthTransaction | null>(null);
  const [networkStatus, setNetworkStatus] = useState<EthNetworkStatus | null>(null);

  const [loadingBalance, setLoadingBalance] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);
  const [loadingNetwork, setLoadingNetwork] = useState(false);

  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // Fetch ETH balance + tx count for an address
  const lookupAddress = useCallback(async (address: string) => {
    setLoadingBalance(true);
    setBalanceError(null);
    setBalanceData(null);

    const { data, error } = await callEthBlockchain<EthBalance>('getBalance', { address });
    if (error) setBalanceError(error);
    else setBalanceData(data);

    setLoadingBalance(false);
    return { data, error };
  }, []);

  // Fetch ERC-20 token balances for an address
  const lookupTokenBalances = useCallback(async (address: string) => {
    setLoadingTokens(true);
    setTokensError(null);
    setTokenData(null);

    const { data, error } = await callEthBlockchain<EthTokenResult>('getTokenBalances', { address });
    if (error) setTokensError(error);
    else setTokenData(data);

    setLoadingTokens(false);
    return { data, error };
  }, []);

  // Fetch full address data (ETH + tokens in parallel)
  const lookupFull = useCallback(async (address: string) => {
    const [balResult, tokenResult] = await Promise.all([
      (async () => {
        setLoadingBalance(true);
        setBalanceError(null);
        const r = await callEthBlockchain<EthBalance>('getBalance', { address });
        if (r.error) setBalanceError(r.error); else setBalanceData(r.data);
        setLoadingBalance(false);
        return r;
      })(),
      (async () => {
        setLoadingTokens(true);
        setTokensError(null);
        const r = await callEthBlockchain<EthTokenResult>('getTokenBalances', { address });
        if (r.error) setTokensError(r.error); else setTokenData(r.data);
        setLoadingTokens(false);
        return r;
      })(),
    ]);
    return { balance: balResult, tokens: tokenResult };
  }, []);

  // Fetch transaction details
  const lookupTransaction = useCallback(async (txHash: string) => {
    setLoadingTx(true);
    setTxError(null);
    setTxData(null);

    const { data, error } = await callEthBlockchain<EthTransaction>('getTransaction', { txHash });
    if (error) setTxError(error);
    else setTxData(data);

    setLoadingTx(false);
    return { data, error };
  }, []);

  // Fetch current network gas/fee status
  const fetchNetworkStatus = useCallback(async () => {
    setLoadingNetwork(true);
    setNetworkError(null);

    const { data, error } = await callEthBlockchain<EthNetworkStatus>('getNetworkStatus');
    if (error) setNetworkError(error);
    else setNetworkStatus(data);

    setLoadingNetwork(false);
    return { data, error };
  }, []);

  // Clear all state
  const reset = useCallback(() => {
    setBalanceData(null);
    setTokenData(null);
    setTxData(null);
    setNetworkStatus(null);
    setBalanceError(null);
    setTokensError(null);
    setTxError(null);
    setNetworkError(null);
  }, []);

  return {
    // State
    balanceData,
    tokenData,
    txData,
    networkStatus,

    // Loading
    loadingBalance,
    loadingTokens,
    loadingTx,
    loadingNetwork,

    // Errors
    balanceError,
    tokensError,
    txError,
    networkError,

    // Actions
    lookupAddress,
    lookupTokenBalances,
    lookupFull,
    lookupTransaction,
    fetchNetworkStatus,
    reset,
  };
}
