// BTNG Minting Pipeline Hook

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  PipelineStage,
  PipelineStageStatus,
  EquityAsset,
  CapabilitiesProfile,
  RiskProfile,
  MintIntent,
  MintReceipt,
  createMintIntent,
  validateEquity,
  scanCapabilities,
  evaluateRisk,
  enforceLtv,
  buildMintIntent,
  runPreExecutionChecks,
  executeMint,
  writeMintLedger,
  getUserEquityPool,
  getMintHistory,
  addEquityToPool,
} from '@/services/mintingPipelineService';

// ── Pipeline stage definitions ────────────────────────────────────────────

const INITIAL_STAGES: PipelineStage[] = [
  { id: 'intent',       label: 'Intent Capture',        desc: 'btng.intent("mint") → kernel receives request',      status: 'idle' },
  { id: 'equity',       label: 'Equity Validation',      desc: 'Equity Engine loads value, risk tier, method',       status: 'idle' },
  { id: 'caps',         label: 'Capability & Policy',    desc: 'Auto-Decoding Engine reads device, region, tier',    status: 'idle' },
  { id: 'risk',         label: 'Risk Evaluation',        desc: 'Risk Engine computes RiskProfile & max mintable',    status: 'idle' },
  { id: 'ltv',          label: 'LTV Enforcement',        desc: 'Monetary Governor enforces sovereign LTV caps',      status: 'idle' },
  { id: 'intent_build', label: 'MintIntent Construction','desc': 'Kernel builds MintIntent object for execution',    status: 'idle' },
  { id: 'precheck',     label: 'Pre-Execution Checks',   desc: 'Document · Certificate · Wallet · Region · Device', status: 'idle' },
  { id: 'execution',    label: 'Execution Pipeline',     desc: 'Auth · Sign · Mint BTNG · Update wallet',           status: 'idle' },
  { id: 'ledger',       label: 'Ledger Update',          desc: 'Ledger Engine writes mint event, updates supply',    status: 'idle' },
  { id: 'autopilot',    label: 'Autopilot Prediction',   desc: 'Autopilot pre-loads next minting parameters',       status: 'idle' },
];

export interface MintingPipelineState {
  stages: PipelineStage[];
  running: boolean;
  complete: boolean;
  failed: boolean;
  currentStageIndex: number;
  receipt: MintReceipt | null;
  error: string | null;
  // Intermediate data
  equity: EquityAsset | null;
  caps: CapabilitiesProfile | null;
  risk: RiskProfile | null;
  intent: MintIntent | null;
  enforcedAmount: number | null;
  maxMintable: number | null;
  ltvPct: number | null;
  capped: boolean;
  preChecks: { name: string; passed: boolean; note: string }[];
}

export function useMintingPipeline() {
  const { user } = useAuth();

  const [pipelineState, setPipelineState] = useState<MintingPipelineState>({
    stages: INITIAL_STAGES,
    running: false,
    complete: false,
    failed: false,
    currentStageIndex: -1,
    receipt: null,
    error: null,
    equity: null,
    caps: null,
    risk: null,
    intent: null,
    enforcedAmount: null,
    maxMintable: null,
    ltvPct: null,
    capped: false,
    preChecks: [],
  });

  const [equityPool, setEquityPool] = useState<EquityAsset[]>([]);
  const [mintHistory, setMintHistory] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // ── Update a stage's status ────────────────────────────────────────────
  const setStageStatus = useCallback((
    stageId: string,
    status: PipelineStageStatus,
    result?: string,
    duration?: number,
    error?: string
  ) => {
    setPipelineState(prev => ({
      ...prev,
      stages: prev.stages.map(s =>
        s.id === stageId ? { ...s, status, result, duration, error } : s
      ),
    }));
  }, []);

  // ── Load equity pool + history ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setDataLoading(true);
    const [pool, history] = await Promise.all([
      getUserEquityPool(user.id),
      getMintHistory(user.id),
    ]);
    setEquityPool(pool);
    setMintHistory(history);
    setDataLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Reset pipeline to idle ─────────────────────────────────────────────
  const reset = useCallback(() => {
    setPipelineState({
      stages: INITIAL_STAGES.map(s => ({ ...s, status: 'idle', result: undefined, error: undefined })),
      running: false, complete: false, failed: false,
      currentStageIndex: -1, receipt: null, error: null,
      equity: null, caps: null, risk: null, intent: null,
      enforcedAmount: null, maxMintable: null, ltvPct: null,
      capped: false, preChecks: [],
    });
  }, []);

  // ── Execute the full minting pipeline ─────────────────────────────────
  const executePipeline = useCallback(async (
    equityId: string,
    requestedAmount: number
  ) => {
    if (!user?.id) return;
    reset();
    await new Promise(r => setTimeout(r, 80));

    setPipelineState(prev => ({ ...prev, running: true, failed: false, complete: false }));

    const ownerName = user.full_name ?? user.username ?? user.email ?? 'BTNG User';

    // ─ Stage 1: Intent Capture ────────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 0 }));
    setStageStatus('intent', 'running');
    await new Promise(r => setTimeout(r, 500));
    const rawIntent = createMintIntent(equityId, requestedAmount);
    setStageStatus('intent', 'done', `Intent ${rawIntent.intentId} · Equity: ${equityId} · Amount: ${requestedAmount} BTNGG`);
    await new Promise(r => setTimeout(r, 200));

    // ─ Stage 2: Equity Validation ─────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 1 }));
    setStageStatus('equity', 'running');
    const t2 = Date.now();
    const { equity, error: equityError } = await validateEquity(user.id, equityId);
    const d2 = Date.now() - t2;
    if (equityError || !equity) {
      setStageStatus('equity', 'failed', undefined, d2, equityError ?? 'Equity not found');
      setPipelineState(prev => ({ ...prev, running: false, failed: true, error: equityError ?? 'Equity validation failed' }));
      return;
    }
    setPipelineState(prev => ({ ...prev, equity }));
    setStageStatus('equity', 'done', `Base: ${equity.baseValue.toLocaleString()} · Adj: ${equity.adjustedValue.toLocaleString()} · ${equity.riskTier} risk · ${equity.verified ? 'Verified' : 'Unverified'}`, d2);
    await new Promise(r => setTimeout(r, 180));

    // ─ Stage 3: Capabilities & Policy ────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 2 }));
    setStageStatus('caps', 'running');
    const t3 = Date.now();
    const caps = await scanCapabilities(user.id);
    const d3 = Date.now() - t3;
    setPipelineState(prev => ({ ...prev, caps }));
    setStageStatus('caps', 'done', `Device: ${caps.deviceSecurity} · Region: ${caps.regionPolicy} · Network: ${caps.networkTier} · Tier: ${caps.userTier}`, d3);
    await new Promise(r => setTimeout(r, 180));

    // ─ Stage 4: Risk Evaluation ───────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 3 }));
    setStageStatus('risk', 'running');
    await new Promise(r => setTimeout(r, 400));
    const risk = evaluateRisk(equity, caps);
    setPipelineState(prev => ({ ...prev, risk }));
    const flagsStr = risk.flags.length > 0 ? ` · Flags: ${risk.flags.join(', ')}` : ' · No flags';
    setStageStatus('risk', 'done', `User: ${risk.userRiskTier} · Device: ${risk.deviceRiskTier} · Region: ${risk.regionRiskTier} · Multiplier: ${(risk.maxMintMultiplier * 100).toFixed(0)}%${flagsStr}`);
    await new Promise(r => setTimeout(r, 180));

    // ─ Stage 5: LTV Enforcement ───────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 4 }));
    setStageStatus('ltv', 'running');
    await new Promise(r => setTimeout(r, 350));
    const ltvResult = enforceLtv(equity, requestedAmount, risk, caps);
    setPipelineState(prev => ({
      ...prev,
      enforcedAmount: ltvResult.enforcedAmount,
      maxMintable: ltvResult.maxMintable,
      ltvPct: ltvResult.ltvPct,
      capped: ltvResult.capped,
    }));
    const cappedNote = ltvResult.capped ? ` ⚠ Rewritten from ${requestedAmount} → ${ltvResult.enforcedAmount}` : ' ✓ Within limit';
    setStageStatus('ltv', 'done', `LTV: ${ltvResult.ltvPct.toFixed(1)}% · Max: ${ltvResult.maxMintable.toLocaleString()} · Enforced: ${ltvResult.enforcedAmount.toLocaleString()}${cappedNote}`);
    await new Promise(r => setTimeout(r, 180));

    // ─ Stage 6: MintIntent Construction ──────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 5 }));
    setStageStatus('intent_build', 'running');
    await new Promise(r => setTimeout(r, 300));
    const mintIntent = buildMintIntent(equityId, ltvResult.enforcedAmount, risk, ltvResult.maxMintable, ltvResult.ltvPct);
    setPipelineState(prev => ({ ...prev, intent: mintIntent }));
    setStageStatus('intent_build', 'done', `${mintIntent.intentId} · Amount: ${mintIntent.amount} BTNGG · Requires verification: ${mintIntent.requiresVerification ? 'YES' : 'NO'}`);
    await new Promise(r => setTimeout(r, 180));

    // ─ Stage 7: Pre-Execution Checks ─────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 6 }));
    setStageStatus('precheck', 'running');
    const t7 = Date.now();
    const { passed, checks } = await runPreExecutionChecks(user.id, equity, mintIntent);
    const d7 = Date.now() - t7;
    setPipelineState(prev => ({ ...prev, preChecks: checks }));
    if (!passed) {
      const failedCheck = checks.find(c => !c.passed);
      setStageStatus('precheck', 'failed', undefined, d7, `Check failed: ${failedCheck?.name} — ${failedCheck?.note}`);
      setPipelineState(prev => ({ ...prev, running: false, failed: true, error: `Pre-execution check failed: ${failedCheck?.name}` }));
      return;
    }
    setStageStatus('precheck', 'done', `${checks.length}/${checks.length} checks passed`, d7);
    await new Promise(r => setTimeout(r, 180));

    // ─ Stage 8: Execution ─────────────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 7 }));
    setStageStatus('execution', 'running');
    const t8 = Date.now();
    const { receipt, error: execError } = await executeMint(user.id, mintIntent, equity, caps, risk, ownerName);
    const d8 = Date.now() - t8;
    if (execError || !receipt) {
      setStageStatus('execution', 'failed', undefined, d8, execError ?? 'Execution failed');
      setPipelineState(prev => ({ ...prev, running: false, failed: true, error: execError ?? 'Execution failed' }));
      return;
    }
    setPipelineState(prev => ({ ...prev, receipt }));
    setStageStatus('execution', 'done', `MintID: ${receipt.mintId} · ${receipt.amountMinted.toLocaleString()} BTNGG minted · Wallet updated`, d8);
    await new Promise(r => setTimeout(r, 180));

    // ─ Stage 9: Ledger Write ──────────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 8 }));
    setStageStatus('ledger', 'running');
    const t9 = Date.now();
    await writeMintLedger(user.id, receipt, equity);
    const d9 = Date.now() - t9;
    setStageStatus('ledger', 'done', `Mint event recorded · Supply updated · LTV ${receipt.ltvUsed.toFixed(1)}% · Region ${receipt.regionPolicy}`, d9);
    await new Promise(r => setTimeout(r, 180));

    // ─ Stage 10: Autopilot Prediction ────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 9 }));
    setStageStatus('autopilot', 'running');
    await new Promise(r => setTimeout(r, 600));
    const ap = receipt.autopilot!;
    setStageStatus('autopilot', 'done', `Next amount: ~${ap.nextLikelyAmount.toLocaleString()} · Depth: ${ap.nextVerificationDepth} · Mode: ${ap.nextSettlementMode}`);

    // ─ Complete ───────────────────────────────────────────────────────
    setPipelineState(prev => ({ ...prev, running: false, complete: true, currentStageIndex: -1 }));
    await loadData();

  }, [user, reset, setStageStatus, loadData]);

  const addEquity = useCallback(async (equity: Omit<EquityAsset, 'status'>) => {
    if (!user?.id) return { error: 'Not logged in' };
    const result = await addEquityToPool(user.id, equity);
    if (!result.error) await loadData();
    return result;
  }, [user?.id, loadData]);

  return {
    ...pipelineState,
    equityPool,
    mintHistory,
    dataLoading,
    executePipeline,
    reset,
    addEquity,
    reload: loadData,
  };
}
