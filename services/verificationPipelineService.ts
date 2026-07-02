// BTNG Verification Pipeline Service — v1
// Sovereign Identity Kernel: Document → Hash → Oracle → KYC → Certificate → Equity

import { getSupabaseClient } from '@/template';

const supabase = getSupabaseClient();

// ── Helpers ────────────────────────────────────────────────────────────────

export function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type VerificationStageStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped';

export interface VerificationStage {
  id: string;
  label: string;
  desc: string;
  status: VerificationStageStatus;
  result?: string;
  duration?: number;
  error?: string;
}

export type DocumentType =
  | 'national_id'
  | 'passport'
  | 'drivers_license'
  | 'birth_certificate'
  | 'utility_bill'
  | 'bank_statement';

export interface VerificationInput {
  docType: DocumentType;
  idNumber: string;
  ownerName: string;
  dateOfBirth: string;
  country: string;
  assetValue: number;
  activateEquity: boolean;
}

export interface DocumentRecord {
  docType: DocumentType;
  idNumber: string;
  ownerName: string;
  dateOfBirth: string;
  country: string;
  uploadedAt: string;
}

export interface HashResult {
  fingerprint: string;
  algorithm: string;
  inputHash: string;
  timestamp: string;
}

export interface OracleCheckResult {
  passed: boolean;
  trustScore: number;       // 0–100
  identityConfidence: number;
  flags: string[];
  region: string;
  oracleId: string;
}

export interface KycUpdateResult {
  submissionId: string | null;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  kycLevel: number;       // 1 = basic, 2 = enhanced, 3 = full
}

export interface CertIssuanceResult {
  certId: string;
  certNftId: string;
  equityGrade: string;
  assetValue: number;
  issuedAt: string;
  expiresAt: string;
}

export interface EquityActivationResult {
  equityId: string;
  activated: boolean;
  adjustedValue: number;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH';
  ltvAvailable: number;
}

export interface VerificationReceipt {
  verificationId: string;
  fingerprint: string;
  trustScore: number;
  kycStatus: string;
  kycLevel: number;
  certId: string | null;
  certNftId: string | null;
  equityId: string | null;
  equityActivated: boolean;
  equityValue: number;
  timestamp: string;
  ownerName: string;
  docType: DocumentType;
  region: string;
  autopilot: {
    nextVerificationDue: string;
    documentExpiry: string;
    trustTrend: 'improving' | 'stable' | 'declining';
    nextRecommendedAction: string;
  };
}

// ── Document Type Labels ───────────────────────────────────────────────────

export const DOC_TYPE_META: Record<DocumentType, { label: string; icon: string; color: string; kycLevel: number }> = {
  national_id:       { label: 'National ID',       icon: 'badge',            color: '#3B82F6', kycLevel: 2 },
  passport:          { label: 'Passport',           icon: 'flight',           color: '#D4A017', kycLevel: 3 },
  drivers_license:   { label: "Driver's License",   icon: 'directions-car',   color: '#22C55E', kycLevel: 1 },
  birth_certificate: { label: 'Birth Certificate',  icon: 'child-care',       color: '#9945FF', kycLevel: 1 },
  utility_bill:      { label: 'Utility Bill',       icon: 'receipt',          color: '#F59E0B', kycLevel: 1 },
  bank_statement:    { label: 'Bank Statement',     icon: 'account-balance',  color: '#EF4444', kycLevel: 2 },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Deterministic-looking fingerprint from document fields (simulated SHA-256) */
function computeFingerprint(doc: DocumentRecord): HashResult {
  const raw = `${doc.docType}|${doc.idNumber}|${doc.ownerName}|${doc.dateOfBirth}|${doc.country}|${doc.uploadedAt}`;
  // Build a hex-style fingerprint from char codes
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  const hex1 = Math.abs(hash).toString(16).padStart(8, '0');
  const hex2 = (Math.abs(hash) ^ 0xDEADBEEF).toString(16).padStart(8, '0');
  const hex3 = Date.now().toString(16).slice(-8);
  const hex4 = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
  const fingerprint = `${hex1}${hex2}${hex3}${hex4}`.toUpperCase();

  return {
    fingerprint,
    algorithm: 'BTNG-HASH-256',
    inputHash: `0x${hex1}${hex2}`,
    timestamp: new Date().toISOString(),
  };
}

// ── Stage 1: Document Upload & Capture ────────────────────────────────────

export async function captureDocument(
  userId: string,
  input: VerificationInput
): Promise<{ doc: DocumentRecord | null; error: string | null }> {
  if (!input.idNumber.trim()) {
    return { doc: null, error: 'Document ID number is required' };
  }
  if (!input.ownerName.trim()) {
    return { doc: null, error: 'Owner name is required' };
  }

  const doc: DocumentRecord = {
    docType: input.docType,
    idNumber: input.idNumber.trim().toUpperCase(),
    ownerName: input.ownerName.trim(),
    dateOfBirth: input.dateOfBirth,
    country: input.country,
    uploadedAt: new Date().toISOString(),
  };

  return { doc, error: null };
}

// ── Stage 2: Hash Fingerprinting ───────────────────────────────────────────

export async function hashDocument(doc: DocumentRecord): Promise<HashResult> {
  await new Promise(r => setTimeout(r, 300)); // Simulate hash computation
  return computeFingerprint(doc);
}

// ── Stage 3: Oracle Cross-Check ────────────────────────────────────────────

export async function oracleCrossCheck(
  userId: string,
  doc: DocumentRecord,
  hash: HashResult
): Promise<OracleCheckResult> {
  // Check if a previous submission exists for this user
  const { data: prevSubmission } = await supabase
    .from('kyc_submissions')
    .select('status, id_type, country')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Check if user has verified identity previously
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('kyc_status, tier, country')
    .eq('id', userId)
    .maybeSingle();

  // Compute trust score based on available data
  let trustScore = 60; // base
  if (prevSubmission?.status === 'approved') trustScore += 20;
  if (profile?.kyc_status === 'verified') trustScore += 10;
  if (doc.country === 'Ghana' || doc.country === profile?.country) trustScore += 5;
  if (doc.dateOfBirth && doc.dateOfBirth.length > 0) trustScore += 5;
  trustScore = Math.min(100, trustScore);

  const flags: string[] = [];
  if (!doc.dateOfBirth) flags.push('DOB_MISSING');
  if (prevSubmission?.status === 'rejected') flags.push('PREVIOUS_REJECTION');
  if (trustScore < 70) flags.push('LOW_TRUST');

  const oracleId = generateId('ORACLE');

  return {
    passed: trustScore >= 55,
    trustScore,
    identityConfidence: Math.min(100, trustScore + 5),
    flags,
    region: doc.country === 'Ghana' ? 'GH-MAINNET' : 'GLOBAL',
    oracleId,
  };
}

// ── Stage 4: KYC Status Update ─────────────────────────────────────────────

export async function updateKycStatus(
  userId: string,
  doc: DocumentRecord,
  hash: HashResult,
  oracle: OracleCheckResult
): Promise<KycUpdateResult> {
  const kycMeta = DOC_TYPE_META[doc.docType];
  const kycLevel = kycMeta.kycLevel;
  const status = oracle.trustScore >= 75 ? 'approved'
    : oracle.trustScore >= 55 ? 'under_review'
    : 'pending';

  // Check if a pending/rejected submission exists to update
  const { data: existing } = await supabase
    .from('kyc_submissions')
    .select('id, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let submissionId: string | null = null;

  if (existing) {
    // Update existing
    await supabase
      .from('kyc_submissions')
      .update({
        id_type: doc.docType,
        full_name: doc.ownerName,
        date_of_birth: doc.dateOfBirth,
        country: doc.country,
        id_number: doc.idNumber,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    submissionId = existing.id;
  } else {
    // Create new
    const { data: newSub, error } = await supabase
      .from('kyc_submissions')
      .insert({
        user_id: userId,
        id_type: doc.docType,
        full_name: doc.ownerName,
        date_of_birth: doc.dateOfBirth,
        country: doc.country,
        id_number: doc.idNumber,
        status,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!error && newSub) submissionId = (newSub as any).id;
  }

  // Update user_profiles kyc_status if approved
  if (status === 'approved') {
    await supabase
      .from('user_profiles')
      .update({ kyc_status: 'verified' })
      .eq('id', userId);
  }

  return { submissionId, status: status as KycUpdateResult['status'], kycLevel };
}

// ── Stage 5: Certificate Issuance ─────────────────────────────────────────

export async function issueCertificate(
  userId: string,
  doc: DocumentRecord,
  hash: HashResult,
  oracle: OracleCheckResult,
  kyc: KycUpdateResult,
  assetValue: number
): Promise<{ cert: CertIssuanceResult | null; error: string | null }> {
  const certNftId = generateId('BTNG-VCERT');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const equityGrade =
    oracle.trustScore >= 90 ? 'A' :
    oracle.trustScore >= 75 ? 'B' :
    oracle.trustScore >= 60 ? 'C' : 'D';

  const { error } = await supabase.from('btng_certificates').insert({
    user_id: userId,
    cert_type: 'BTNG_VERIFICATION',
    cert_id: certNftId,
    owner_name: doc.ownerName,
    asset_description: `Verification Certificate · ${DOC_TYPE_META[doc.docType].label} · ${doc.country} · Trust Score: ${oracle.trustScore}`,
    asset_value: assetValue,
    equity_grade: equityGrade,
    fingerprint: hash.fingerprint,
    issued_at: now.toISOString().split('T')[0],
    expires_at: expiresAt.toISOString().split('T')[0],
    status: 'active',
    metadata: {
      doc_type: doc.docType,
      oracle_id: oracle.oracleId,
      trust_score: oracle.trustScore,
      kyc_level: kyc.kycLevel,
      kyc_status: kyc.status,
      hash_algorithm: hash.algorithm,
      tradeable: assetValue > 0,
      verification_pipeline: true,
    },
  });

  if (error) return { cert: null, error: error.message };

  return {
    cert: {
      certId: `VCERT-${hash.fingerprint.slice(0, 12)}`,
      certNftId,
      equityGrade,
      assetValue,
      issuedAt: now.toISOString().split('T')[0],
      expiresAt: expiresAt.toISOString().split('T')[0],
    },
    error: null,
  };
}

// ── Stage 6: Equity Pool Activation ───────────────────────────────────────

export async function activateEquityPool(
  userId: string,
  certId: string,
  assetValue: number,
  trustScore: number
): Promise<{ result: EquityActivationResult | null; error: string | null }> {
  if (assetValue <= 0) {
    return {
      result: {
        equityId: '',
        activated: false,
        adjustedValue: 0,
        riskTier: 'LOW',
        ltvAvailable: 0,
      },
      error: null,
    };
  }

  const equityId = generateId('EQ-VER');
  const haircut = trustScore >= 80 ? 0.03 : trustScore >= 65 ? 0.05 : 0.10;
  const adjustedValue = assetValue * (1 - haircut);
  const riskTier: EquityActivationResult['riskTier'] =
    trustScore >= 80 ? 'LOW' : trustScore >= 65 ? 'MEDIUM' : 'HIGH';
  const ltv = riskTier === 'LOW' ? 0.75 : riskTier === 'MEDIUM' ? 0.60 : 0.45;
  const ltvAvailable = adjustedValue * ltv;

  const { error } = await supabase.from('btng_equity_pool').insert({
    user_id: userId,
    equity_id: equityId,
    equity_type: 'gold_cert',
    base_value: assetValue,
    adjusted_value: parseFloat(adjustedValue.toFixed(4)),
    valuation_method: 'BTNG_VERIFICATION_ORACLE',
    risk_tier: riskTier,
    verified: true,
    verified_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    metadata: {
      cert_id: certId,
      source: 'verification_pipeline',
      haircut_pct: (haircut * 100).toFixed(1),
      ltv_pct: (ltv * 100).toFixed(0),
    },
  });

  if (error) return { result: null, error: error.message };

  return {
    result: {
      equityId,
      activated: true,
      adjustedValue: parseFloat(adjustedValue.toFixed(4)),
      riskTier,
      ltvAvailable: parseFloat(ltvAvailable.toFixed(4)),
    },
    error: null,
  };
}

// ── Stage 7: Autopilot Sync ────────────────────────────────────────────────

export async function syncAutopilot(
  userId: string,
  verificationId: string,
  receipt: Omit<VerificationReceipt, 'autopilot'>
): Promise<VerificationReceipt['autopilot']> {
  const nextDue = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  const docExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const trustTrend: VerificationReceipt['autopilot']['trustTrend'] =
    receipt.trustScore >= 80 ? 'improving' :
    receipt.trustScore >= 60 ? 'stable' : 'declining';

  const nextAction =
    receipt.trustScore >= 80 ? 'Maintain equity position and renew before expiry' :
    receipt.trustScore >= 65 ? 'Upload passport for higher KYC level to improve trust score' :
    'Complete enhanced KYC for Level 3 verification and higher LTV access';

  // Write receipt to DB
  await supabase.from('btng_verification_receipts').insert({
    user_id: userId,
    verification_id: verificationId,
    doc_type: receipt.docType,
    owner_name: receipt.ownerName,
    fingerprint: receipt.fingerprint,
    kyc_submission_id: null,
    cert_id: receipt.certNftId,
    equity_id: receipt.equityId,
    kyc_status: receipt.kycStatus,
    equity_activated: receipt.equityActivated,
    equity_value: receipt.equityValue,
    trust_score: receipt.trustScore,
    status: 'completed',
    pipeline_stages: [],
  });

  return {
    nextVerificationDue: nextDue.toISOString().split('T')[0],
    documentExpiry: docExpiry.toISOString().split('T')[0],
    trustTrend,
    nextRecommendedAction: nextAction,
  };
}

// ── History ────────────────────────────────────────────────────────────────

export async function getVerificationHistory(userId: string): Promise<any[]> {
  const { data } = await supabase
    .from('btng_verification_receipts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  return data ?? [];
}

export async function getVerificationCertificates(userId: string): Promise<any[]> {
  const { data } = await supabase
    .from('btng_certificates')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5);
  return data ?? [];
}

export async function getCurrentKycStatus(userId: string): Promise<{
  status: string;
  level: number;
  submissionId: string | null;
}> {
  const [{ data: profile }, { data: submission }] = await Promise.all([
    supabase.from('user_profiles').select('kyc_status').eq('id', userId).maybeSingle(),
    supabase.from('kyc_submissions').select('id, status').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const status = profile?.kyc_status ?? 'pending';
  const level = status === 'verified' ? 2 : 1;
  return { status, level, submissionId: submission?.id ?? null };
}
