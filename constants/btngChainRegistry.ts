/**
 * BTNG SOVEREIGN ENGINE — FULL ALL-IN-ONE ENGINE FILE
 * Chain Registry JSON · Unified RPC Router · Wallet Engine Blueprint
 * Bituncoin OpenAPI Spec · Full Sovereign Banking OS Architecture
 *
 * John Kojo Zi — Bituncoin Gold Bank
 * EKUYE DIGITAL GATEWAY TRUST LTD · Reg. CS099020624
 */

// ─── API KEY ──────────────────────────────────────────────────────────────────
export const BTNG_ALCHEMY_API_KEY = '9t-STp4iCxqd9fuagVuu8';

// ─── 1. BTNG CHAIN REGISTRY JSON (FULL MULTI-CHAIN FABRIC) ───────────────────

export type ChainType = 'evm' | 'solana' | 'move' | 'utxo' | 'cairo' | 'custom';

export interface ChainEndpoint {
  mainnet:        string;
  testnet?:       string;
  devnet?:        string;
  sepolia?:       string;
  amoy?:          string;
  signet?:        string;
  testnet4?:      string;
  cardona?:       string;
  hoodi?:         string;
  beacon_mainnet?: string;
  beacon_sepolia?: string;
  zkevm_mainnet?: string;
  zkevm_cardona?: string;
  type:           ChainType;
}

export interface BTNGChainRegistry {
  api_key: string;
  chains:  Record<string, ChainEndpoint>;
}

export const BTNG_CHAIN_REGISTRY: BTNGChainRegistry = {
  api_key: BTNG_ALCHEMY_API_KEY,
  chains: {
    solana: {
      mainnet: `https://solana-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      devnet:  `https://solana-devnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'solana',
    },
    ethereum: {
      mainnet:        `https://eth-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      sepolia:        `https://eth-sepolia.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      hoodi:          `https://eth-hoodi.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      beacon_mainnet: `https://eth-mainnetbeacon.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      beacon_sepolia: `https://eth-sepoliabeacon.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'evm',
    },
    polygon: {
      mainnet:        `https://polygon-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      amoy:           `https://polygon-amoy.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      zkevm_mainnet:  `https://polygonzkevm-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      zkevm_cardona:  `https://polygonzkevm-cardona.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'evm',
    },
    arbitrum: {
      mainnet: `https://arb-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      sepolia: `https://arb-sepolia.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'evm',
    },
    optimism: {
      mainnet: `https://opt-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      sepolia: `https://opt-sepolia.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'evm',
    },
    base: {
      mainnet: `https://base-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      sepolia: `https://base-sepolia.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'evm',
    },
    zksync: {
      mainnet: `https://zksync-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      sepolia: `https://zksync-sepolia.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'evm',
    },
    starknet: {
      mainnet: `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/${BTNG_ALCHEMY_API_KEY}`,
      sepolia: `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/${BTNG_ALCHEMY_API_KEY}`,
      type: 'cairo',
    },
    sui: {
      mainnet: `https://sui-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      testnet: `https://sui-testnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'move',
    },
    aptos: {
      mainnet: `https://aptos-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      testnet: `https://aptos-testnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'move',
    },
    bitcoin: {
      mainnet:  `https://bitcoin-mainnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      testnet:  `https://bitcoin-testnet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      signet:   `https://bitcoin-signet.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      testnet4: `https://bitcoin-testnet4.g.alchemy.com/v2/${BTNG_ALCHEMY_API_KEY}`,
      type: 'utxo',
    },
  },
};

// ─── 2. UNIFIED RPC ROUTER CONFIG ─────────────────────────────────────────────

export interface BTNGRpcRouter {
  routing_rules:  Record<ChainType | string, string[]>;
  default_engine: string;
}

export const BTNG_RPC_ROUTER: BTNGRpcRouter = {
  routing_rules: {
    evm:    ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'zksync', 'scroll', 'linea', 'mantle', 'metis', 'mode', 'boba', 'gnosis', 'celo'],
    solana: ['solana'],
    move:   ['sui', 'aptos'],
    utxo:   ['bitcoin', 'litecoin', 'dogecoin', 'bitcoincash'],
    cairo:  ['starknet'],
    custom: ['tron', 'injective', 'sei', 'moonbeam', 'worldchain', 'berachain', 'apechain', 'anime', 'sonic'],
  },
  default_engine: 'evm_engine',
};

// ─── 3. BTNG WALLET ENGINE BLUEPRINT ─────────────────────────────────────────

export interface WalletEngineMethods {
  methods: string[];
}

export interface BTNGWalletEngine {
  evm:     WalletEngineMethods;
  solana:  WalletEngineMethods;
  move:    WalletEngineMethods;
  utxo:    WalletEngineMethods;
  cairo:   WalletEngineMethods;
  custom:  Record<string, string[]>;
}

export const BTNG_WALLET_ENGINE: BTNGWalletEngine = {
  evm: {
    methods: ['eth_sendTransaction', 'eth_call', 'eth_getBalance', 'eth_getBlockByNumber'],
  },
  solana: {
    methods: ['getBalance', 'sendTransaction', 'getAccountInfo'],
  },
  move: {
    methods: ['sui_getBalance', 'sui_executeTransactionBlock', 'aptos_getAccount', 'aptos_submitTransaction'],
  },
  utxo: {
    methods: ['listunspent', 'sendrawtransaction', 'getrawtransaction'],
  },
  cairo: {
    methods: ['starknet_call', 'starknet_addInvokeTransaction'],
  },
  custom: {
    tron:     ['tron_getAccount', 'tron_sendTransaction'],
    injective:['injective_getBalance', 'injective_broadcastTransaction'],
  },
};

// ─── 4. BITUNCOIN OPENAPI SPEC (Structured) ───────────────────────────────────

export interface OpenApiEndpoint {
  method:  'GET' | 'POST' | 'PUT' | 'DELETE';
  path:    string;
  summary: string;
  tag:     string;
  auth:    boolean;
}

export const BTNG_OPENAPI_SPEC = {
  openapi: '3.1.0',
  info: {
    title:   'Bituncoin Sovereign Banking OS API',
    version: '1.0.0',
    server:  'https://api.bituncoin.io',
  },
  endpoints: [
    { method: 'POST', path: '/rpc/{chain}/{network}',   summary: 'Unified RPC passthrough',          tag: 'RPC',      auth: false },
    { method: 'POST', path: '/wallet/{chain}/send',     summary: 'Send transaction on any chain',    tag: 'Wallet',   auth: true  },
    { method: 'GET',  path: '/wallet/{chain}/balance',  summary: 'Get balance on any chain',         tag: 'Wallet',   auth: true  },
    { method: 'POST', path: '/ledger/gold/sync',        summary: 'Sync BTNG gold ledger across chains', tag: 'Ledger', auth: true },
    { method: 'GET',  path: '/oracle/price',            summary: 'BTNG/USD live oracle price',       tag: 'Oracle',   auth: false },
    { method: 'GET',  path: '/explorer/block/:id',      summary: 'Block lookup by height or hash',   tag: 'Explorer', auth: false },
    { method: 'GET',  path: '/identity/{btng_id}',      summary: 'Sovereign identity lookup',        tag: 'Identity', auth: true  },
    { method: 'POST', path: '/loan/quote',              summary: 'Gold-backed loan calculator',      tag: 'Lending',  auth: true  },
    { method: 'POST', path: '/card/activate',           summary: 'Activate BTNG card',               tag: 'Cards',    auth: true  },
    { method: 'GET',  path: '/health',                  summary: 'Node health and version',          tag: 'System',   auth: false },
  ] as OpenApiEndpoint[],
};

// ─── 5. FULL SOVEREIGN BANKING OS ARCHITECTURE ───────────────────────────────

export interface ArchLayer {
  id:       number;
  name:     string;
  icon:     string;
  color:    string;
  desc:     string;
  items:    string[];
}

export const BTNG_OS_ARCHITECTURE: ArchLayer[] = [
  {
    id:    1,
    name:  'Sovereign Identity Layer',
    icon:  'fingerprint',
    color: '#D4A017',
    desc:  'BTNG Registry · BTNG Gold Ledger · BTNG Coin Engine',
    items: ['BTNG Registry', 'BTNG Gold Ledger', 'BTNG Coin Engine', 'KYC Verification'],
  },
  {
    id:    2,
    name:  'Multi-Chain Fabric Layer',
    icon:  'device-hub',
    color: '#3B82F6',
    desc:  'Unified RPC Router · Chain Registry · EVM, Solana, Move, UTXO, Cairo',
    items: ['Unified RPC Router', 'Chain Registry (11 chains)', 'EVM Engine', 'Solana Engine', 'Move Engine', 'UTXO Engine', 'Cairo Engine'],
  },
  {
    id:    3,
    name:  'Wallet Engine Layer',
    icon:  'account-balance-wallet',
    color: '#22C55E',
    desc:  'Unified Wallet API · Multi-chain signing · BTNG MoMo · Gold settlement',
    items: ['Unified Wallet API', 'Multi-chain signing', 'BTNG MoMo integration', 'BTNG Gold settlement', 'Triple-Key Architecture'],
  },
  {
    id:    4,
    name:  'Settlement Layer',
    icon:  'swap-horiz',
    color: '#9945FF',
    desc:  'Cross-chain swaps · BTNG → BTC → ETH → SOL routing · Sovereign liquidity',
    items: ['Cross-chain swaps', 'BTNG → BTC → ETH → SOL routing', 'Sovereign liquidity engine', 'Atomic escrow'],
  },
  {
    id:    5,
    name:  'Developer Layer',
    icon:  'code',
    color: '#06B6D4',
    desc:  'Bituncoin OpenAPI · SDKs (Android/iOS/Web) · Explorer · Smart Websockets',
    items: ['Bituncoin OpenAPI 3.1.0', 'Android SDK (Kotlin)', 'iOS SDK (Swift)', 'Web SDK (JS)', 'Smart Websockets'],
  },
  {
    id:    6,
    name:  'Sovereign Security Layer',
    icon:  'security',
    color: '#EF4444',
    desc:  'Mempool monitoring · Fraud detection · Ledger integrity · Quantum-safe vault',
    items: ['Mempool monitoring', 'Fraud detection engine', 'Ledger integrity checks', 'Quantum-safe vault (QuantumVault.sol)'],
  },
  {
    id:    7,
    name:  'Sovereign Intelligence Layer',
    icon:  'psychology',
    color: '#F59E0B',
    desc:  'Bituncoin.AI Box · BTNG Memory Box · BTNG Brain Router · Engine fusion',
    items: ['Bituncoin.AI Box', 'BTNG Memory Box', 'BTNG Brain Router', 'ECPU + EGPU cognitive engines', 'PrivateBanker Agent'],
  },
];

// ─── CHAIN UI METADATA (icons, colors, labels for display) ───────────────────

export interface ChainMeta {
  id:     string;
  label:  string;
  emoji:  string;
  color:  string;
  type:   ChainType;
  ticker: string;
}

export const CHAIN_META: ChainMeta[] = [
  { id: 'ethereum', label: 'Ethereum',  emoji: '⟠', color: '#627EEA', type: 'evm',    ticker: 'ETH'  },
  { id: 'polygon',  label: 'Polygon',   emoji: '⬡', color: '#8247E5', type: 'evm',    ticker: 'POL'  },
  { id: 'arbitrum', label: 'Arbitrum',  emoji: '🔵', color: '#28A0F0', type: 'evm',    ticker: 'ARB'  },
  { id: 'optimism', label: 'Optimism',  emoji: '🔴', color: '#FF0420', type: 'evm',    ticker: 'OP'   },
  { id: 'base',     label: 'Base',      emoji: '🔷', color: '#0052FF', type: 'evm',    ticker: 'ETH'  },
  { id: 'zksync',   label: 'zkSync',    emoji: '⚡', color: '#8C8DFC', type: 'evm',    ticker: 'ETH'  },
  { id: 'solana',   label: 'Solana',    emoji: '◎', color: '#9945FF', type: 'solana', ticker: 'SOL'  },
  { id: 'bitcoin',  label: 'Bitcoin',   emoji: '₿', color: '#F7931A', type: 'utxo',   ticker: 'BTC'  },
  { id: 'sui',      label: 'Sui',       emoji: '🌊', color: '#6FBCF0', type: 'move',   ticker: 'SUI'  },
  { id: 'aptos',    label: 'Aptos',     emoji: '🎯', color: '#00D4AA', type: 'move',   ticker: 'APT'  },
  { id: 'starknet', label: 'StarkNet',  emoji: '🌟', color: '#EC796B', type: 'cairo',  ticker: 'STRK' },
];

export const TYPE_COLORS: Record<ChainType, string> = {
  evm:    '#627EEA',
  solana: '#9945FF',
  move:   '#00D4AA',
  utxo:   '#F7931A',
  cairo:  '#EC796B',
  custom: '#6B7280',
};

export const TYPE_LABELS: Record<ChainType, string> = {
  evm:    'EVM',
  solana: 'Solana VM',
  move:   'Move VM',
  utxo:   'UTXO',
  cairo:  'Cairo VM',
  custom: 'Custom',
};
