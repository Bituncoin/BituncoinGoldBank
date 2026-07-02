import { corsHeaders } from '../_shared/cors.ts';

// Ethereum blockchain data via Infura/Alchemy JSON-RPC
// Supports: balance, transactions, token balances, gas price, block info

const ETH_API_KEY = Deno.env.get('ETHEREUM_API_KEY') ?? '';

// Detect provider type from key format
function getRpcUrl(): string {
  if (!ETH_API_KEY) return '';
  // Alchemy keys are typically 32 chars alphanumeric
  if (ETH_API_KEY.length === 32 || ETH_API_KEY.startsWith('2') || ETH_API_KEY.startsWith('_')) {
    return `https://eth-mainnet.g.alchemy.com/v2/${ETH_API_KEY}`;
  }
  // Infura keys are 32-char hex
  return `https://mainnet.infura.io/v3/${ETH_API_KEY}`;
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const url = getRpcUrl();
  if (!url) throw new Error('ETHEREUM_API_KEY not configured');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json() as { result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

function hexToDecimal(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

function weiToEth(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  if (eth === 0) return '0';
  if (eth < 0.0001) return eth.toExponential(4);
  return eth.toFixed(6);
}

function weiToGwei(wei: bigint): string {
  return (Number(wei) / 1e9).toFixed(2);
}

function isValidEthAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isValidTxHash(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}

// ERC-20 Transfer event signature
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Popular ERC-20 tokens on mainnet
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number; name: string }> = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, name: 'Tether USD' },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, name: 'USD Coin' },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18, name: 'Dai Stablecoin' },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, name: 'Wrapped BTC' },
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18, name: 'Wrapped ETH' },
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': { symbol: 'UNI', decimals: 18, name: 'Uniswap' },
  '0x514910771af9ca656af840dff83e8264ecf986ca': { symbol: 'LINK', decimals: 18, name: 'Chainlink' },
  '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': { symbol: 'AAVE', decimals: 18, name: 'Aave' },
  '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2': { symbol: 'MKR', decimals: 18, name: 'Maker' },
  '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': { symbol: 'SNX', decimals: 18, name: 'Synthetix' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ETH_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Ethereum API key not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json() as {
      action: string;
      address?: string;
      txHash?: string;
      blockNumber?: string | number;
      tokenAddress?: string;
      fromBlock?: string;
      toBlock?: string;
    };

    const { action } = body;
    console.log(`[eth-blockchain] action=${action}`);

    // ── GET WALLET BALANCE ─────────────────────────────────────────────────
    if (action === 'getBalance') {
      const { address } = body;
      if (!address || !isValidEthAddress(address)) {
        return new Response(
          JSON.stringify({ error: 'Invalid Ethereum address. Must be 0x followed by 40 hex chars.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const [balanceHex, txCountHex, blockNumberHex, gasPriceHex] = await Promise.all([
        rpcCall('eth_getBalance', [address, 'latest']),
        rpcCall('eth_getTransactionCount', [address, 'latest']),
        rpcCall('eth_blockNumber', []),
        rpcCall('eth_gasPrice', []),
      ]) as [string, string, string, string];

      const balanceWei = hexToDecimal(balanceHex);
      const txCount = Number(hexToDecimal(txCountHex));
      const blockNumber = Number(hexToDecimal(blockNumberHex));
      const gasPriceWei = hexToDecimal(gasPriceHex);

      return new Response(
        JSON.stringify({
          address,
          balance: {
            wei: balanceWei.toString(),
            eth: weiToEth(balanceWei),
            gwei: weiToGwei(balanceWei),
          },
          txCount,
          blockNumber,
          gasPrice: {
            wei: gasPriceWei.toString(),
            gwei: weiToGwei(gasPriceWei),
          },
          network: 'mainnet',
          source: 'ethereum',
          fetchedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── GET TOKEN BALANCES ─────────────────────────────────────────────────
    if (action === 'getTokenBalances') {
      const { address } = body;
      if (!address || !isValidEthAddress(address)) {
        return new Response(
          JSON.stringify({ error: 'Invalid Ethereum address' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ERC-20 balanceOf(address) call: 0x70a08231
      const balanceCalls = Object.entries(KNOWN_TOKENS).map(([tokenAddr]) => ({
        to: tokenAddr,
        data: `0x70a08231000000000000000000000000${address.slice(2)}`,
      }));

      const balanceResults = await Promise.all(
        balanceCalls.map(call =>
          rpcCall('eth_call', [call, 'latest']).catch(() => '0x0')
        )
      ) as string[];

      const tokens = Object.entries(KNOWN_TOKENS)
        .map(([tokenAddr, info], i) => {
          const rawHex = balanceResults[i] ?? '0x0';
          const raw = hexToDecimal(rawHex);
          const balance = Number(raw) / Math.pow(10, info.decimals);
          return {
            address: tokenAddr,
            symbol: info.symbol,
            name: info.name,
            decimals: info.decimals,
            balance: balance.toFixed(info.decimals > 6 ? 6 : info.decimals),
            balanceRaw: raw.toString(),
            hasBalance: raw > 0n,
          };
        })
        .filter(t => t.hasBalance)
        .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

      return new Response(
        JSON.stringify({
          address,
          tokens,
          totalTokens: tokens.length,
          fetchedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── GET TRANSACTION ────────────────────────────────────────────────────
    if (action === 'getTransaction') {
      const { txHash } = body;
      if (!txHash || !isValidTxHash(txHash)) {
        return new Response(
          JSON.stringify({ error: 'Invalid transaction hash. Must be 0x followed by 64 hex chars.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const [tx, receipt] = await Promise.all([
        rpcCall('eth_getTransactionByHash', [txHash]),
        rpcCall('eth_getTransactionReceipt', [txHash]).catch(() => null),
      ]) as [Record<string, string>, Record<string, string> | null];

      if (!tx) {
        return new Response(
          JSON.stringify({ error: 'Transaction not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const valueWei = hexToDecimal(tx.value ?? '0x0');
      const gasPriceWei = hexToDecimal(tx.gasPrice ?? '0x0');
      const gasLimit = Number(hexToDecimal(tx.gas ?? '0x0'));
      const gasUsed = receipt ? Number(hexToDecimal(receipt.gasUsed ?? '0x0')) : null;
      const feeWei = gasUsed ? BigInt(gasUsed) * gasPriceWei : null;
      const blockNum = tx.blockNumber ? Number(hexToDecimal(tx.blockNumber)) : null;
      const status = receipt ? (receipt.status === '0x1' ? 'success' : 'failed') : 'pending';

      return new Response(
        JSON.stringify({
          hash: tx.hash,
          status,
          blockNumber: blockNum,
          from: tx.from,
          to: tx.to,
          value: {
            wei: valueWei.toString(),
            eth: weiToEth(valueWei),
          },
          gasPrice: {
            wei: gasPriceWei.toString(),
            gwei: weiToGwei(gasPriceWei),
          },
          gasLimit,
          gasUsed,
          fee: feeWei ? { wei: feeWei.toString(), eth: weiToEth(feeWei) } : null,
          nonce: tx.nonce ? Number(hexToDecimal(tx.nonce)) : null,
          input: tx.input === '0x' ? null : tx.input,
          contractAddress: receipt?.contractAddress ?? null,
          isContractCreation: !tx.to,
          fetchedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── GET GAS PRICE / NETWORK STATUS ────────────────────────────────────
    if (action === 'getNetworkStatus') {
      const [gasPriceHex, blockNumberHex, latestBlock] = await Promise.all([
        rpcCall('eth_gasPrice', []),
        rpcCall('eth_blockNumber', []),
        rpcCall('eth_getBlockByNumber', ['latest', false]),
      ]) as [string, string, Record<string, string>];

      const gasPriceWei = hexToDecimal(gasPriceHex);
      const blockNumber = Number(hexToDecimal(blockNumberHex));
      const baseFeeWei = latestBlock?.baseFeePerGas ? hexToDecimal(latestBlock.baseFeePerGas) : null;
      const txCount = latestBlock?.transactions ? (latestBlock.transactions as unknown as string[]).length : 0;
      const timestamp = latestBlock?.timestamp ? Number(hexToDecimal(latestBlock.timestamp)) * 1000 : Date.now();

      // EIP-1559 priority fee estimate (1.5 gwei default)
      const priorityFeeGwei = 1.5;
      const baseFeeGwei = baseFeeWei ? Number(baseFeeWei) / 1e9 : Number(gasPriceWei) / 1e9;
      const fastFeeGwei = baseFeeGwei * 1.2 + priorityFeeGwei;
      const normalFeeGwei = baseFeeGwei * 1.1 + priorityFeeGwei;
      const slowFeeGwei = baseFeeGwei + priorityFeeGwei;

      return new Response(
        JSON.stringify({
          network: 'mainnet',
          chainId: 1,
          blockNumber,
          blockTimestamp: new Date(timestamp).toISOString(),
          blockTxCount: txCount,
          gasPrice: {
            wei: gasPriceWei.toString(),
            gwei: weiToGwei(gasPriceWei),
          },
          baseFee: baseFeeWei ? {
            wei: baseFeeWei.toString(),
            gwei: (Number(baseFeeWei) / 1e9).toFixed(2),
          } : null,
          feeEstimates: {
            fast:   { gwei: fastFeeGwei.toFixed(2),   label: '~15s',    usd: (fastFeeGwei * 21000 * 1e-9 * 3840).toFixed(4) },
            normal: { gwei: normalFeeGwei.toFixed(2), label: '~1 min',  usd: (normalFeeGwei * 21000 * 1e-9 * 3840).toFixed(4) },
            slow:   { gwei: slowFeeGwei.toFixed(2),   label: '~5 min',  usd: (slowFeeGwei * 21000 * 1e-9 * 3840).toFixed(4) },
          },
          fetchedAt: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── RESOLVE ENS NAME ──────────────────────────────────────────────────
    if (action === 'resolveENS') {
      const { address } = body;
      if (!address) {
        return new Response(
          JSON.stringify({ error: 'ENS name or address required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ENS Registry: 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
      // namehash + resolver lookup — simplified: use eth_call on ENS PublicResolver
      // For reverse lookup (address → ENS): use reverse registrar
      const isAddress = isValidEthAddress(address);
      
      if (isAddress) {
        // Reverse ENS lookup
        const node = address.slice(2).toLowerCase() + '.addr.reverse';
        // Simplified: return the address as-is for now with a note
        return new Response(
          JSON.stringify({
            input: address,
            type: 'address',
            ensName: null,
            note: 'Reverse ENS lookup requires additional resolver calls',
            fetchedAt: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'ENS forward resolution requires Alchemy ENS API' }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        error: `Unknown action: ${action}`,
        availableActions: ['getBalance', 'getTokenBalances', 'getTransaction', 'getNetworkStatus', 'resolveENS'],
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[eth-blockchain] error:', msg);
    return new Response(
      JSON.stringify({ error: `Ethereum: ${msg}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
