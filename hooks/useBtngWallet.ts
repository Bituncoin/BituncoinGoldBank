// BTNG Gold Coin — Genesis Wallet Hook (multi-account)
import { useState, useEffect, useCallback } from 'react';
import {
  createBtngWallet,
  loadBtngWallet,
  clearBtngWallet,
  importBtngWallet,
  setActiveAccountIndex,
  hasBtngWallet,
  BtngAccount,
} from '@/services/btngWalletService';
import type { WalletPhase, BtngWalletState } from '@/constants/types';

// Re-export so existing imports from this hook continue to work
export type { WalletPhase, BtngWalletState };

const INITIAL_STATE: BtngWalletState = {
  phase: 'loading',
  address: null,
  derivationPath: null,
  createdAt: null,
  accounts: [],
  activeIndex: 0,
  mnemonic: null,
  error: null,
  working: false,
};

export function useBtngWallet() {
  const [state, setState] = useState<BtngWalletState>(INITIAL_STATE);

  // ── Boot: load existing wallet ────────────────────────────────────────
  const boot = useCallback(async () => {
    setState(s => ({ ...s, phase: 'loading', error: null }));
    try {
      const existing = await loadBtngWallet();
      if (existing) {
        setState(s => ({
          ...s,
          phase: 'existing',
          address: existing.address,
          derivationPath: existing.derivationPath,
          createdAt: existing.createdAt,
          accounts: existing.accounts,
          activeIndex: existing.activeIndex,
          mnemonic: null,
        }));
      } else {
        setState(s => ({ ...s, phase: 'none', accounts: [], activeIndex: 0 }));
      }
    } catch {
      setState(s => ({ ...s, phase: 'none' }));
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  // ── Generate new Genesis Wallet (5 accounts) ──────────────────────────
  const generateWallet = useCallback(async () => {
    setState(s => ({ ...s, working: true, error: null }));
    try {
      const info = await createBtngWallet();
      const active = info.accounts[0];
      setState(s => ({
        ...s,
        phase: 'genesis',
        address: active.address,
        derivationPath: active.derivationPath,
        createdAt: info.createdAt,
        accounts: info.accounts,
        activeIndex: 0,
        mnemonic: info.mnemonic,
        working: false,
      }));
    } catch (e: any) {
      setState(s => ({ ...s, working: false, error: e?.message ?? 'Failed to create wallet' }));
    }
  }, []);

  // ── Switch active sub-account ─────────────────────────────────────────
  const switchAccount = useCallback(async (index: number) => {
    setState(s => ({ ...s, working: true, error: null }));
    const result = await setActiveAccountIndex(index);
    if ('error' in result) {
      setState(s => ({ ...s, working: false, error: result.error }));
      return;
    }
    setState(s => ({
      ...s,
      activeIndex: index,
      address: result.address,
      derivationPath: result.derivationPath,
      working: false,
    }));
  }, []);

  // ── Confirm backup (clears mnemonic from memory) ──────────────────────
  const confirmBackup = useCallback(() => {
    setState(s => ({ ...s, mnemonic: null, phase: 'existing' }));
  }, []);

  // ── Import from recovery phrase ───────────────────────────────────────
  const importWallet = useCallback(async (phrase: string): Promise<boolean> => {
    setState(s => ({ ...s, working: true, error: null }));
    const result = await importBtngWallet(phrase);
    if ('error' in result) {
      setState(s => ({ ...s, working: false, error: result.error }));
      return false;
    }
    // Reload from store to get createdAt etc.
    const existing = await loadBtngWallet();
    setState(s => ({
      ...s,
      phase: 'existing',
      address: result.address,
      accounts: result.accounts,
      activeIndex: result.activeIndex,
      derivationPath: existing?.derivationPath ?? null,
      createdAt: existing?.createdAt ?? null,
      mnemonic: null,
      working: false,
      error: null,
    }));
    return true;
  }, []);

  // ── Delete wallet ─────────────────────────────────────────────────────
  const deleteWallet = useCallback(async () => {
    setState(s => ({ ...s, working: true }));
    await clearBtngWallet();
    setState({ ...INITIAL_STATE, phase: 'none' });
  }, []);

  return {
    ...state,
    generateWallet,
    switchAccount,
    confirmBackup,
    importWallet,
    deleteWallet,
    reload: boot,
  };
}
