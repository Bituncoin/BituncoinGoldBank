import { getSupabaseClient } from '@/template';

export type CertType =
  | 'property'
  | 'vehicle'
  | 'land'
  | 'business'
  | 'stock'
  | 'minerals'
  | 'intellectual_property'
  | 'music_album'
  | 'import_export';

export interface BTNGCertificate {
  id: string;
  user_id: string;
  cert_type: CertType;
  cert_id: string;
  owner_name: string;
  asset_description: string | null;
  asset_value: number;
  equity_grade: string;
  fingerprint: string;
  issued_at: string;
  expires_at: string | null;
  status: string;
  metadata: Record<string, any> | null;
  renewed_from_cert_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCertificateInput {
  user_id: string;
  cert_type: CertType;
  owner_name: string;
  asset_description?: string;
  asset_value: number;
  metadata?: Record<string, any>;
  renewed_from_cert_id?: string | null;
}

// ─── Equity grade from asset value ───────────────────────────────────────────
export function computeEquityGrade(value: number): string {
  if (value >= 100000) return 'A+';
  if (value >= 50000)  return 'A';
  if (value >= 10000)  return 'B';
  if (value >= 1000)   return 'C';
  return 'D';
}

// ─── Pseudo SHA-256 fingerprint ───────────────────────────────────────────────
export function generateFingerprint(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Expand to 64-char hex
  const base = Math.abs(hash).toString(16).padStart(8, '0');
  const segments: string[] = [];
  const chars = '0123456789abcdef';
  let seed = Math.abs(hash);
  for (let i = 0; i < 8; i++) {
    let seg = '';
    for (let j = 0; j < 8; j++) {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      seg += chars[Math.abs(seed) % 16];
    }
    segments.push(seg);
  }
  return segments.join('');
}

// ─── Generate unique cert ID ─────────────────────────────────────────────────
export function generateCertId(certType: CertType): string {
  const prefixes: Record<CertType, string> = {
    property: 'PROP',
    vehicle: 'VEH',
    land: 'LAND',
    business: 'BIZ',
    stock: 'STK',
    minerals: 'MIN',
    intellectual_property: 'IP',
    music_album: 'MUS',
    import_export: 'IEGW',
  };
  const prefix = prefixes[certType] ?? 'CERT';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BTNG-${prefix}-${date}-${rand}`;
}

// ─── Supabase CRUD ─────────────────────────────────────────────────────────
export async function fetchCertificates(userId: string): Promise<{ data: BTNGCertificate[] | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('btng_certificates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as BTNGCertificate[], error: null };
}

export async function createCertificate(input: CreateCertificateInput): Promise<{ data: BTNGCertificate | null; error: string | null }> {
  const supabase = getSupabaseClient();

  const certId = generateCertId(input.cert_type);
  const grade  = computeEquityGrade(input.asset_value);
  const fpSrc  = `${certId}-${input.owner_name}-${input.asset_value}-${Date.now()}`;
  const fingerprint = generateFingerprint(fpSrc);
  const issuedAt = new Date().toISOString().slice(0, 10);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const row = {
    user_id: input.user_id,
    cert_type: input.cert_type,
    cert_id: certId,
    owner_name: input.owner_name,
    asset_description: input.asset_description ?? null,
    asset_value: input.asset_value,
    equity_grade: grade,
    fingerprint,
    issued_at: issuedAt,
    expires_at: expiresAt,
    status: 'active',
    metadata: input.metadata ?? null,
    renewed_from_cert_id: input.renewed_from_cert_id ?? null,
  };

  const { data, error } = await supabase
    .from('btng_certificates')
    .insert(row)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as BTNGCertificate, error: null };
}

export async function deleteCertificate(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('btng_certificates')
    .delete()
    .eq('id', id);
  return { error: error ? error.message : null };
}
