// BTNG Product Engine Hook

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserRole,
  getProductCredits,
  getCreditHistory,
  setUserRole,
  mintIdentity,
  mintSignupCredits,
  approveLoanAndMintCertificate,
  calculateDiscount,
  runSignupProductEngine,
  UserRoleRecord,
  ProductCredits,
  CreditTransaction,
  LoanProduct,
  LoanApprovalResult,
  UserRole,
} from '@/services/productEngineService';
import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

export interface ProductEngineState {
  roleRecord: UserRoleRecord | null;
  credits: ProductCredits | null;
  creditHistory: CreditTransaction[];
  certificates: any[];
  loans: any[];
  loading: boolean;
  error: string | null;
}

export function useProductEngine() {
  const { user } = useAuth();
  const [state, setState] = useState<ProductEngineState>({
    roleRecord: null,
    credits: null,
    creditHistory: [],
    certificates: [],
    loans: [],
    loading: true,
    error: null,
  });

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [roleRes, creditsRes, histRes, certsRes, loansRes] = await Promise.all([
        getUserRole(user.id),
        getProductCredits(user.id),
        getCreditHistory(user.id),
        supabase.from('btng_certificates').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('btng_loans').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);
      setState({
        roleRecord: roleRes.data,
        credits: creditsRes.data,
        creditHistory: histRes.data,
        certificates: certsRes.data ?? [],
        loans: loansRes.data ?? [],
        loading: false,
        error: null,
      });
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e?.message ?? 'Load failed' }));
    }
  }, [user?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const setupRole = useCallback(async (role: UserRole, walletAddress: string, referralCode?: string) => {
    if (!user?.id) return { success: false, error: 'Not logged in' };
    const result = await runSignupProductEngine(user.id, walletAddress, role, referralCode);
    await loadAll();
    return {
      success: result.roleSet && result.identityMinted,
      creditsGranted: result.creditsGranted,
      nftId: result.nftId,
      error: result.error,
    };
  }, [user?.id, loadAll]);

  const applyForLoan = useCallback(async (
    product: LoanProduct,
    principal: number,
    walletAddress: string,
    renewedFromCertId?: string
  ): Promise<LoanApprovalResult> => {
    if (!user?.id) return { success: false, loanId: null, certId: null, certNftId: null, interestAmount: 0, totalDue: 0, dueDate: '', error: 'Not logged in' };
    const ownerName = user.full_name ?? user.username ?? user.email ?? 'BTNG User';
    const result = await approveLoanAndMintCertificate(user.id, walletAddress, product, principal, ownerName, renewedFromCertId);
    if (result.success) await loadAll();
    return result;
  }, [user, loadAll]);

  const getDiscount = useCallback(async (feeAmount: number) => {
    if (!user?.id) return { discountBps: 0, discountAmount: 0, finalAmount: feeAmount, eligible: false };
    return calculateDiscount(user.id, feeAmount);
  }, [user?.id]);

  return {
    ...state,
    reload: loadAll,
    setupRole,
    applyForLoan,
    getDiscount,
    hasIdentity: !!state.roleRecord?.identity_minted,
    hasCredits: !!state.credits && state.credits.balance > 0,
    discountEligible: !!state.roleRecord?.discount_eligible,
    discountPct: state.roleRecord ? state.roleRecord.discount_bps / 100 : 0,
    userRole: state.roleRecord?.role ?? null,
    activeCerts: state.certificates.filter(c => c.status === 'active'),
  };
}
