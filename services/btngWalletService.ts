// BTNG Gold Coin — Genesis Wallet Service
// Uses ethers v6 HD wallet + expo-secure-store (Expo-compatible secure storage)
// Derivation base: m/44'/9999'/0'/0/{index}  — up to 5 sub-accounts (index 0–4)

import { ethers } from 'ethers';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SECURE_KEY = 'btng_genesis_wallet_v2'; // bumped to v2 for multi-account schema
const BTNG_BASE_PATH = "m/44'/9999'/0'/0";
const NUM_ACCOUNTS = 5;

export interface BtngAccount {
  index: number;
  derivationPath: string;
  address: string;
}

export interface BtngWalletInfo {
  accounts: BtngAccount[];
  activeIndex: number;
  mnemonic: string;
  createdAt: string;
}

interface StoredAccount {
  index: number;
  derivationPath: string;
  privateKey: string;
  address: string;
}

interface StoredWallet {
  mnemonic: string;
  accounts: StoredAccount[];
  activeIndex: number;
  createdAt: string;
}

// ── Internal: derive N accounts from a mnemonic ───────────────────────────
function deriveAccounts(mnemonicObj: ethers.Mnemonic, count: number): StoredAccount[] {
  return Array.from({ length: count }, (_, i) => {
    const path = `${BTNG_BASE_PATH}/${i}`;
    const hdWallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, path);
    return {
      index: i,
      derivationPath: path,
      privateKey: hdWallet.privateKey,
      address: hdWallet.address,
    };
  });
}

// ── Create brand-new Genesis Wallet with 5 sub-accounts ───────────────────
export async function createBtngWallet(): Promise<BtngWalletInfo> {
  const entropy = ethers.randomBytes(32);
  const mnemonicObj = ethers.Mnemonic.fromEntropy(entropy);
  const phrase = mnemonicObj.phrase;
  const createdAt = new Date().toISOString();

  const accounts = deriveAccounts(mnemonicObj, NUM_ACCOUNTS);

  const stored: StoredWallet = {
    mnemonic: phrase,
    accounts,
    activeIndex: 0,
    createdAt,
  };
  await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(stored));

  return {
    accounts: accounts.map(({ index, derivationPath, address }) => ({ index, derivationPath, address })),
    activeIndex: 0,
    mnemonic: phrase,
    createdAt,
  };
}

// ── Load existing wallet — returns public info only ───────────────────────
export async function loadBtngWallet(): Promise<{
  accounts: BtngAccount[];
  activeIndex: number;
  address: string;
  derivationPath: string;
  createdAt: string;
} | null> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_KEY);
    if (!raw) return null;
    const stored: StoredWallet = JSON.parse(raw);
    const active = stored.accounts[stored.activeIndex] ?? stored.accounts[0];
    return {
      accounts: stored.accounts.map(({ index, derivationPath, address }) => ({ index, derivationPath, address })),
      activeIndex: stored.activeIndex,
      address: active.address,
      derivationPath: active.derivationPath,
      createdAt: stored.createdAt,
    };
  } catch {
    return null;
  }
}

// ── Switch the active sub-account index ───────────────────────────────────
export async function setActiveAccountIndex(index: number): Promise<{ address: string; derivationPath: string } | { error: string }> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_KEY);
    if (!raw) return { error: 'No wallet found' };
    const stored: StoredWallet = JSON.parse(raw);
    if (index < 0 || index >= stored.accounts.length) return { error: 'Invalid account index' };
    stored.activeIndex = index;
    await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(stored));
    const account = stored.accounts[index];
    return { address: account.address, derivationPath: account.derivationPath };
  } catch (e: any) {
    return { error: e?.message ?? 'Failed to switch account' };
  }
}

// ── Restore wallet from mnemonic phrase ───────────────────────────────────
export async function importBtngWallet(phrase: string): Promise<{ accounts: BtngAccount[]; activeIndex: number; address: string } | { error: string }> {
  try {
    const trimmed = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
    const mnemonicObj = ethers.Mnemonic.fromPhrase(trimmed);
    const createdAt = new Date().toISOString();
    const accounts = deriveAccounts(mnemonicObj, NUM_ACCOUNTS);

    const stored: StoredWallet = {
      mnemonic: trimmed,
      accounts,
      activeIndex: 0,
      createdAt,
    };
    await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(stored));

    return {
      accounts: accounts.map(({ index, derivationPath, address }) => ({ index, derivationPath, address })),
      activeIndex: 0,
      address: accounts[0].address,
    };
  } catch {
    return { error: 'Invalid recovery phrase. Please check all 24 words and try again.' };
  }
}

// ── Sign a payload with the active account ────────────────────────────────
export async function signBtngPayload(payload: string): Promise<{ signature: string } | { error: string }> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_KEY);
    if (!raw) return { error: 'No wallet found' };
    const stored: StoredWallet = JSON.parse(raw);
    const active = stored.accounts[stored.activeIndex] ?? stored.accounts[0];
    const wallet = new ethers.Wallet(active.privateKey);
    const signature = await wallet.signMessage(payload);
    return { signature };
  } catch (e: any) {
    return { error: e?.message ?? 'Signing failed' };
  }
}

// ── Permanently delete wallet ─────────────────────────────────────────────
export async function clearBtngWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEY);
}

// ── Balance via EVM JSON-RPC ─────────────────────────────────────────────
// Configure your BTNG node RPC endpoint here.
// Any EVM-compatible JSON-RPC endpoint (eth_getBalance) is supported.
export const BTNG_RPC_URL = 'https://rpc.btng.gold'; // ← swap to your deployed node
const RPC_TIMEOUT_MS = 8_000;
const RPC_URL_STORAGE_KEY = 'btng_custom_rpc_url';

/** Retrieve the user-overridden RPC URL, falling back to the default. */
export async function getRpcUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(RPC_URL_STORAGE_KEY);
    return saved?.trim() || BTNG_RPC_URL;
  } catch {
    return BTNG_RPC_URL;
  }
}

/** Persist a custom RPC URL. Pass empty string to revert to default. */
export async function saveRpcUrl(url: string): Promise<void> {
  try {
    if (!url.trim()) {
      await AsyncStorage.removeItem(RPC_URL_STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(RPC_URL_STORAGE_KEY, url.trim());
    }
  } catch {
    // best-effort
  }
}

export interface RpcTestResult {
  latencyMs: number;
  blockHeight: string;
  balance: string;
  rpcUrl: string;
}

/**
 * Test the RPC connection by sending a batch request for eth_blockNumber
 * and eth_getBalance, measuring round-trip latency.
 * Falls back to individual requests if the node does not support batching.
 */
export async function testRpcConnection(
  address: string,
  rpcUrl: string
): Promise<RpcTestResult | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  const start = Date.now();
  try {
    // Attempt JSON-RPC batch request
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
        { jsonrpc: '2.0', id: 2, method: 'eth_getBalance', params: [address, 'latest'] },
      ]),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    if (!res.ok) return { error: `HTTP ${res.status} — check the RPC URL` };

    const json = await res.json();

    // Handle both batch array and single-object responses
    const blockRes = Array.isArray(json)
      ? json.find((r: any) => r.id === 1)
      : json.id === 1 ? json : null;
    const balRes = Array.isArray(json)
      ? json.find((r: any) => r.id === 2)
      : json.id === 2 ? json : null;

    if (!blockRes || blockRes.error) {
      return { error: blockRes?.error?.message ?? 'Node returned an error for eth_blockNumber' };
    }

    const blockHeight = parseInt(blockRes.result as string, 16).toLocaleString('en-US');

    let balance = '—';
    if (balRes && !balRes.error) {
      try {
        const wei = BigInt(balRes.result as string);
        const whole = wei / BigInt('1000000000000000000');
        const frac = wei % BigInt('1000000000000000000');
        const fracStr = frac.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '') || '0';
        balance = `${whole.toLocaleString('en-US')}.${fracStr} BTNG`;
      } catch {
        balance = '—';
      }
    }

    return { latencyMs, blockHeight, balance, rpcUrl };
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') return { error: 'Timeout (8 s) — node unreachable or too slow' };
    return { error: e?.message ?? 'Connection failed' };
  }
}

export interface BtngBalance {
  address: string;
  /** Human-readable BTNG amount (18-decimal formatted) */
  balance: string;
  /** Raw wei string */
  balanceWei: string;
  /** Timestamp of last successful fetch */
  fetchedAt: string;
}

/**
 * Fetch the on-chain BTNG balance for a single address via eth_getBalance.
 * Falls back gracefully if the RPC is unreachable.
 */
export async function fetchBtngBalance(
  address: string,
  rpcUrl: string = BTNG_RPC_URL
): Promise<BtngBalance | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { error: `RPC HTTP ${res.status}` };
    const json = await res.json();
    if (json.error) return { error: json.error.message ?? 'RPC error' };
    const wei = BigInt(json.result as string);
    // Format with 18 decimals (standard EVM wei → ether)
    const wholePart = wei / BigInt('1000000000000000000');
    const fracPart = wei % BigInt('1000000000000000000');
    const fracStr = fracPart.toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '') || '0';
    const balance = `${wholePart.toLocaleString('en-US')}.${fracStr}`;
    return {
      address,
      balance,
      balanceWei: wei.toString(),
      fetchedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') return { error: 'RPC timeout' };
    return { error: e?.message ?? 'Network error' };
  }
}

/**
 * Fetch balances for all provided addresses in parallel.
 * Always resolves — errors are stored per-address.
 */
export async function fetchAllAccountBalances(
  addresses: string[],
  rpcUrl: string = BTNG_RPC_URL
): Promise<Record<string, BtngBalance | { error: string }>> {
  const results = await Promise.allSettled(
    addresses.map(addr => fetchBtngBalance(addr, rpcUrl))
  );
  const out: Record<string, BtngBalance | { error: string }> = {};
  addresses.forEach((addr, i) => {
    const r = results[i];
    out[addr] = r.status === 'fulfilled' ? r.value : { error: 'Fetch failed' };
  });
  return out;
}

// ── Verify an EIP-191 signature ─────────────────────────────────────────
/**
 * Verify that `signature` was produced by signing `message` with the private
 * key of `address`.  Uses ethers.verifyMessage() which recovers the signer
 * and compares it to the expected address (case-insensitive).
 */
export async function verifyBtngSignature(
  address: string,
  message: string,
  signature: string
): Promise<{ valid: boolean; recoveredAddress: string } | { error: string }> {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    const valid = recovered.toLowerCase() === address.toLowerCase();
    return { valid, recoveredAddress: recovered };
  } catch (e: any) {
    return { error: e?.message ?? 'Verification failed — check signature format' };
  }
}

// ── Export active account private key (handle with extreme care) ──────────
export async function getActivePrivateKey(): Promise<{ privateKey: string } | { error: string }> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_KEY);
    if (!raw) return { error: 'No wallet found' };
    const stored: StoredWallet = JSON.parse(raw);
    const active = stored.accounts[stored.activeIndex] ?? stored.accounts[0];
    return { privateKey: active.privateKey };
  } catch (e: any) {
    return { error: e?.message ?? 'Could not retrieve private key' };
  }
}

// ── PIN helpers (fallback when biometrics unavailable) ──────────────────────
const BTNG_PIN_KEY = 'btng_genesis_pin_v1';

export async function saveBtngPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(BTNG_PIN_KEY, pin);
}

export async function loadBtngPin(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(BTNG_PIN_KEY);
  } catch {
    return null;
  }
}

export async function clearBtngPin(): Promise<void> {
  try { await SecureStore.deleteItemAsync(BTNG_PIN_KEY); } catch { /* no-op */ }
}

// ── PIN attempt lockout ─────────────────────────────────────────────────────
const PIN_ATTEMPTS_KEY = 'btng_pin_attempts_v1';

export interface PinAttemptData {
  /** Consecutive wrong attempts since last success or lockout expiry */
  count: number;
  /** Unix timestamp (ms) until which entry is locked; null if not locked */
  lockedUntil: number | null;
}

export async function loadPinAttempts(): Promise<PinAttemptData> {
  try {
    const raw = await SecureStore.getItemAsync(PIN_ATTEMPTS_KEY);
    if (!raw) return { count: 0, lockedUntil: null };
    return JSON.parse(raw) as PinAttemptData;
  } catch {
    return { count: 0, lockedUntil: null };
  }
}

export async function savePinAttempts(data: PinAttemptData): Promise<void> {
  try {
    await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, JSON.stringify(data));
  } catch { /* best-effort */ }
}

export async function clearPinAttempts(): Promise<void> {
  try { await SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY); } catch { /* no-op */ }
}

// ── Account nicknames (AsyncStorage) ──────────────────────────────────────
const ACCOUNT_NICKNAMES_KEY = 'btng_account_nicknames_v1';

/** Returns a map of account index → nickname. Missing entries mean no nickname set. */
export async function loadAccountNicknames(): Promise<Record<number, string>> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNT_NICKNAMES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<number, string>;
  } catch {
    return {};
  }
}

/** Save or clear the nickname for a single account index. */
export async function saveAccountNickname(index: number, nickname: string): Promise<void> {
  try {
    const current = await loadAccountNicknames();
    if (nickname.trim()) {
      current[index] = nickname.trim();
    } else {
      delete current[index];
    }
    await AsyncStorage.setItem(ACCOUNT_NICKNAMES_KEY, JSON.stringify(current));
  } catch { /* best-effort */ }
}

/** Clear all account nicknames (e.g. on wallet delete). */
export async function clearAccountNicknames(): Promise<void> {
  try { await AsyncStorage.removeItem(ACCOUNT_NICKNAMES_KEY); } catch { /* no-op */ }
}

// ── Bulk Payment QR History ────────────────────────────────────────────────
const BULK_HISTORY_KEY = 'btng_bulk_qr_history_v1';
const MAX_BULK_HISTORY = 20;

export interface BulkHistoryPayer {
  name: string;
  amount: string;
}

export interface BulkHistoryEntry {
  id: string;
  timestamp: string; // ISO string
  payerCount: number;
  totalGHS: number;
  payers: BulkHistoryPayer[];
}

export async function loadBulkHistory(): Promise<BulkHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(BULK_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BulkHistoryEntry[];
  } catch {
    return [];
  }
}

export async function saveBulkHistoryEntry(entry: BulkHistoryEntry): Promise<void> {
  try {
    const existing = await loadBulkHistory();
    const updated = [entry, ...existing].slice(0, MAX_BULK_HISTORY);
    await AsyncStorage.setItem(BULK_HISTORY_KEY, JSON.stringify(updated));
  } catch { /* best-effort */ }
}

export async function clearBulkHistory(): Promise<void> {
  try { await AsyncStorage.removeItem(BULK_HISTORY_KEY); } catch { /* no-op */ }
}

// ── Check if wallet exists ────────────────────────────────────────────────
export async function hasBtngWallet(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(SECURE_KEY);
    return !!raw;
  } catch {
    return false;
  }
}
