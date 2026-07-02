/**
 * Shared TypeScript interfaces and types used across contexts, hooks, and services.
 * Import from here to avoid duplicate definitions and type drift.
 */
import type { BtngAccount } from '@/services/btngWalletService';

// ── Exchange Rates ────────────────────────────────────────────────────────────
export interface UseExchangeRatesResult {
  rates: Record<string, number>;
  loading: boolean;
  error: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
  /** Resolve how many units of `code` equal 1 USD (live then static fallback) */
  getRate: (code: string) => number;
}

// ── BTNG Genesis Wallet ───────────────────────────────────────────────────────
/** Phase of the genesis wallet lifecycle */
export type WalletPhase = 'loading' | 'none' | 'genesis' | 'existing' | 'import';

/** Full state object returned by useBtngWallet */
export interface BtngWalletState {
  phase: WalletPhase;
  /** Active account wallet address */
  address: string | null;
  derivationPath: string | null;
  createdAt: string | null;
  /** All derived sub-accounts */
  accounts: BtngAccount[];
  activeIndex: number;
  /** BIP-39 mnemonic — only present after genesis, cleared on backup confirm */
  mnemonic: string | null;
  error: string | null;
  working: boolean;
}

// ── Copy Trading ─────────────────────────────────────────────────────────────
/** A trader profile available for copy-trading */
export interface CopyTrader {
  id: string;
  display_name: string;
  avatar: string;
  country: string;
  bio: string | null;
  speciality: string;
  win_rate: number;
  monthly_pnl: number;
  total_pnl: number;
  aum: number;
  follower_count: number;
  trade_count: number;
  avg_trade_duration: string;
  risk_level: 'Low' | 'Medium' | 'High';
  verified: boolean;
  min_copy_amount: number;
  profit_share_pct: number;
  badges: string[];
}

/** A user's active copy-trading subscription */
export interface CopySubscription {
  id: string;
  trader_id: string;
  copy_amount: number;
  is_active: boolean;
  total_pnl: number;
  total_pnl_pct: number;
  trades_copied: number;
  started_at: string;
}

// ── BTNG Sovereign Equity Balance ─────────────────────────────────────────────
/** Computed equity balance built from wallet + identity + loan data */
export interface EquityBalance {
  // Identity
  btng_id: string;
  wallet_address: string;
  sovereign_status: string;
  // Equity breakdown (BTNGG)
  total_equity: number;
  asset_backed_equity: number;
  liquid_equity: number;
  loan_eligible_equity: number;
  // Gold reserve
  gold_backed_ghs: number;
  gold_oz_troy: number;
  usd_value: number;
  // Metadata
  tier: string;
  verified_at: string;
  document_id: string;
  equity_hash: string;
  // Import/Export account
  import_export_account_id: string;
  on_chain_tx_hash: string;
}
