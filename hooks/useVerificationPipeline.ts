// BTNG Verification Pipeline Hook

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  VerificationStage,
  VerificationStageStatus,
  VerificationInput,
  DocumentRecord,
  HashResult,
  OracleCheckResult,
  KycUpdateResult,
  CertIssuanceResult,
  EquityActivationResult,
  VerificationReceipt,
  captureDocument,
  hashDocument,
  oracleCrossCheck,
  updateKycStatus,
  issueCertificate,
  activateEquityPool,
  syncAutopilot,
  getVerificationHistory,
  getVerificationCertificates,
  getCurrentKycStatus,
} from '@/services/verificationPipelineService';

function mkId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}

// ── Initial stages ────────────────────────────────────────────────────────

const INITIAL_STAGES: VerificationStage[] = [
  {
    id: 'upload',
    label: 'Document Upload',
    desc: 'Capture document data · Prepare for verification engine',
    status: 'idle',
  },
  {
    id: 'hash',
    label: 'Hash Fingerprinting',
    desc: 'BTNG-HASH-256 · Generate tamper-proof document fingerprint',
    status: 'idle',
  },
  {
    id: 'oracle',
    label: 'Oracle Cross-Check',
    desc: 'BTNG Verification Oracle · Identity confidence analysis',
    status: 'idle',
  },
  {
    id: 'kyc',
    label: 'KYC Status Update',
    desc: 'Write to kyc_submissions · Update user verification level',
    status: 'idle',
  },
  {
    id: 'cert',
    label: 'Certificate Issuance',
    desc: 'Mint BTNG Verification Certificate NFT to btng_certificates',
    status: 'idle',
  },
  {
    id: 'equity',
    label: 'Equity Pool Activation',
    desc: 'Activate verified equity position in btng_equity_pool',
    status: 'idle',
  },
  {
    id: 'autopilot',
    label: 'Autopilot Sync',
    desc: 'Sync verification state · Pre-load next verification parameters',
    status: 'idle',
  },
];

export interface VerificationPipelineState {
  stages: VerificationStage[];
  running: boolean;
  complete: boolean;
  failed: boolean;
  currentStageIndex: number;
  receipt: VerificationReceipt | null;
  error: string | null;
  // Intermediate
  doc: DocumentRecord | null;
  hashResult: HashResult | null;
  oracle: OracleCheckResult | null;
  kyc: KycUpdateResult | null;
  cert: CertIssuanceResult | null;
  equityResult: EquityActivationResult | null;
}

export function useVerificationPipeline() {
  const { user } = useAuth();

  const [pipelineState, setPipelineState] = useState<VerificationPipelineState>({
    stages: INITIAL_STAGES,
    running: false,
    complete: false,
    failed: false,
    currentStageIndex: -1,
    receipt: null,
    error: null,
    doc: null,
    hashResult: null,
    oracle: null,
    kyc: null,
    cert: null,
    equityResult: null,
  });

  const [verificationHistory, setVerificationHistory] = useState<any[]>([]);
  const [verificationCerts, setVerificationCerts] = useState<any[]>([]);
  const [kycStatus, setKycStatus] = useState<{ status: string; level: number; submissionId: string | null }>({
    status: 'pending',
    level: 1,
    submissionId: null,
  });
  const [dataLoading, setDataLoading] = useState(false);

  // ── Update stage ──────────────────────────────────────────────────────
  const setStageStatus = useCallback((
    stageId: string,
    status: VerificationStageStatus,
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

  // ── Load data ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setDataLoading(true);
    const [history, certs, kyc] = await Promise.all([
      getVerificationHistory(user.id),
      getVerificationCertificates(user.id),
      getCurrentKycStatus(user.id),
    ]);
    setVerificationHistory(history);
    setVerificationCerts(certs);
    setKycStatus(kyc);
    setDataLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Reset ─────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setPipelineState({
      stages: INITIAL_STAGES.map(s => ({ ...s, status: 'idle', result: undefined, error: undefined })),
      running: false,
      complete: false,
      failed: false,
      currentStageIndex: -1,
      receipt: null,
      error: null,
      doc: null,
      hashResult: null,
      oracle: null,
      kyc: null,
      cert: null,
      equityResult: null,
    });
  }, []);

  // ── Execute pipeline ──────────────────────────────────────────────────
  const executePipeline = useCallback(async (input: VerificationInput) => {
    if (!user?.id) return;
    reset();
    await new Promise(r => setTimeout(r, 80));

    const verificationId = mkId('BTNG-VER');
    setPipelineState(prev => ({ ...prev, running: true, failed: false, complete: false }));

    // ─ Stage 1: Document Upload ───────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 0 }));
    setStageStatus('upload', 'running');
    const t1 = Date.now();
    const { doc, error: docError } = await captureDocument(user.id, input);
    const d1 = Date.now() - t1;
    if (docError || !doc) {
      setStageStatus('upload', 'failed', undefined, d1, docError ?? 'Document capture failed');
      setPipelineState(prev => ({ ...prev, running: false, failed: true, error: docError ?? 'Document capture failed' }));
      return;
    }
    setPipelineState(prev => ({ ...prev, doc }));
    setStageStatus(
      'upload', 'done',
      `${input.docType.replace(/_/g, ' ').toUpperCase()} · ID: ${doc.idNumber} · Owner: ${doc.ownerName} · ${doc.country}`,
      d1
    );
    await new Promise(r => setTimeout(r, 300));

    // ─ Stage 2: Hash Fingerprinting ───────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 1 }));
    setStageStatus('hash', 'running');
    const t2 = Date.now();
    const hashResult = await hashDocument(doc);
    const d2 = Date.now() - t2;
    setPipelineState(prev => ({ ...prev, hashResult }));
    setStageStatus(
      'hash', 'done',
      `Algorithm: ${hashResult.algorithm} · Fingerprint: ${hashResult.fingerprint.slice(0, 16)}… · Hash: ${hashResult.inputHash}`,
      d2
    );
    await new Promise(r => setTimeout(r, 250));

    // ─ Stage 3: Oracle Cross-Check ────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 2 }));
    setStageStatus('oracle', 'running');
    const t3 = Date.now();
    const oracle = await oracleCrossCheck(user.id, doc, hashResult);
    const d3 = Date.now() - t3;
    setPipelineState(prev => ({ ...prev, oracle }));
    const flagsStr = oracle.flags.length > 0 ? ` · Flags: ${oracle.flags.join(', ')}` : ' · No flags';
    if (!oracle.passed) {
      setStageStatus(
        'oracle', 'failed', undefined, d3,
        `Trust score too low: ${oracle.trustScore}/100${flagsStr}`
      );
      setPipelineState(prev => ({
        ...prev,
        running: false,
        failed: true,
        error: `Oracle check failed — Trust score: ${oracle.trustScore}/100. Please provide stronger identity documents.`,
      }));
      return;
    }
    setStageStatus(
      'oracle', 'done',
      `Trust Score: ${oracle.trustScore}/100 · Confidence: ${oracle.identityConfidence}% · Region: ${oracle.region} · Oracle: ${oracle.oracleId}${flagsStr}`,
      d3
    );
    await new Promise(r => setTimeout(r, 300));

    // ─ Stage 4: KYC Status Update ─────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 3 }));
    setStageStatus('kyc', 'running');
    const t4 = Date.now();
    const kyc = await updateKycStatus(user.id, doc, hashResult, oracle);
    const d4 = Date.now() - t4;
    setPipelineState(prev => ({ ...prev, kyc }));
    setStageStatus(
      'kyc', 'done',
      `Status: ${kyc.status.toUpperCase()} · KYC Level: ${kyc.kycLevel} · Submission: ${kyc.submissionId?.slice(0, 8) ?? 'new'}`,
      d4
    );
    await new Promise(r => setTimeout(r, 250));

    // ─ Stage 5: Certificate Issuance ─────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 4 }));
    setStageStatus('cert', 'running');
    const t5 = Date.now();
    const { cert, error: certError } = await issueCertificate(
      user.id, doc, hashResult, oracle, kyc, input.assetValue
    );
    const d5 = Date.now() - t5;
    if (certError || !cert) {
      setStageStatus('cert', 'failed', undefined, d5, certError ?? 'Certificate issuance failed');
      setPipelineState(prev => ({
        ...prev,
        running: false,
        failed: true,
        error: certError ?? 'Certificate issuance failed',
      }));
      return;
    }
    setPipelineState(prev => ({ ...prev, cert }));
    setStageStatus(
      'cert', 'done',
      `NFT: ${cert.certNftId} · Grade: ${cert.equityGrade} · Value: ${cert.assetValue.toLocaleString()} BTNGG · Expires: ${cert.expiresAt}`,
      d5
    );
    await new Promise(r => setTimeout(r, 250));

    // ─ Stage 6: Equity Pool Activation ───────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 5 }));
    setStageStatus('equity', 'running');
    const t6 = Date.now();
    const { result: equityResult, error: equityError } = input.activateEquity && input.assetValue > 0
      ? await activateEquityPool(user.id, cert.certNftId, input.assetValue, oracle.trustScore)
      : { result: { equityId: '', activated: false, adjustedValue: 0, riskTier: 'LOW' as const, ltvAvailable: 0 }, error: null };
    const d6 = Date.now() - t6;
    if (equityError) {
      setStageStatus('equity', 'failed', undefined, d6, equityError);
      setPipelineState(prev => ({
        ...prev,
        running: false,
        failed: true,
        error: equityError,
      }));
      return;
    }
    setPipelineState(prev => ({ ...prev, equityResult }));
    setStageStatus(
      'equity',
      equityResult?.activated ? 'done' : 'skipped',
      equityResult?.activated
        ? `Equity ID: ${equityResult.equityId} · Adj: ${equityResult.adjustedValue.toLocaleString()} BTNGG · Risk: ${equityResult.riskTier} · LTV available: ${equityResult.ltvAvailable.toLocaleString()}`
        : 'Equity activation skipped — no asset value provided',
      d6
    );
    await new Promise(r => setTimeout(r, 250));

    // ─ Stage 7: Autopilot Sync ────────────────────────────────────────
    setPipelineState(prev => ({ ...prev, currentStageIndex: 6 }));
    setStageStatus('autopilot', 'running');
    await new Promise(r => setTimeout(r, 600));

    const partialReceipt = {
      verificationId,
      fingerprint: hashResult.fingerprint,
      trustScore: oracle.trustScore,
      kycStatus: kyc.status,
      kycLevel: kyc.kycLevel,
      certId: `VCERT-${hashResult.fingerprint.slice(0, 12)}`,
      certNftId: cert.certNftId,
      equityId: equityResult?.equityId ?? null,
      equityActivated: equityResult?.activated ?? false,
      equityValue: input.assetValue,
      timestamp: new Date().toISOString(),
      ownerName: doc.ownerName,
      docType: doc.docType,
      region: oracle.region,
    };

    const autopilot = await syncAutopilot(user.id, verificationId, partialReceipt);

    setStageStatus(
      'autopilot', 'done',
      `Next verification: ${autopilot.nextVerificationDue} · Trend: ${autopilot.trustTrend.toUpperCase()} · Action: ${autopilot.nextRecommendedAction.slice(0, 60)}…`
    );

    const finalReceipt: VerificationReceipt = { ...partialReceipt, autopilot };
    setPipelineState(prev => ({
      ...prev,
      receipt: finalReceipt,
      running: false,
      complete: true,
      currentStageIndex: -1,
    }));

    await loadData();
  }, [user, reset, setStageStatus, loadData]);

  return {
    ...pipelineState,
    verificationHistory,
    verificationCerts,
    kycStatus,
    dataLoading,
    executePipeline,
    reset,
    reload: loadData,
  };
}
