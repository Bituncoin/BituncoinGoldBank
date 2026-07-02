// BTNG Gold — KYC Service (Supabase Storage + DB)
import { getSupabaseClient } from '@/template';
import { Platform } from 'react-native';

export type KycStatus = 'pending' | 'under_review' | 'verified' | 'rejected';
export type IdType = 'national_id' | 'passport' | 'drivers_license';

export interface KycSubmission {
  id: string;
  user_id: string;
  status: KycStatus;
  id_type: IdType;
  id_front_path: string | null;
  id_back_path: string | null;
  selfie_path: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  country: string;
  id_number: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface KycSubmissionWithUser extends KycSubmission {
  user_profiles?: {
    username: string;
    email: string;
    full_name: string;
    tier: string;
  };
}

export interface KycFormData {
  fullName: string;
  dateOfBirth: string;
  country: string;
  idNumber: string;
  idType: IdType;
  idFrontUri: string | null;
  idBackUri: string | null;
  selfieUri: string | null;
}

const BUCKET = 'kyc-documents';

// ── Upload a single file to Supabase Storage
async function uploadFile(
  userId: string,
  slot: 'id_front' | 'id_back' | 'selfie',
  fileUri: string
): Promise<{ path: string | null; error: string | null }> {
  const client = getSupabaseClient();
  const ext = fileUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf',
  };
  const mime = mimeMap[ext] ?? 'image/jpeg';
  const path = `${userId}/${slot}_${Date.now()}.${ext}`;

  try {
    let uploadData: Uint8Array | Blob;

    if (Platform.OS === 'web') {
      // Web: fetch blob
      const response = await fetch(fileUri);
      uploadData = await response.blob();
    } else {
      // Mobile: convert to base64 arraybuffer
      const base64Response = await fetch(fileUri);
      const blob = await base64Response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      uploadData = new Uint8Array(arrayBuffer);
    }

    const { error } = await client.storage
      .from(BUCKET)
      .upload(path, uploadData, {
        contentType: mime,
        upsert: true,
      });

    if (error) return { path: null, error: error.message };
    return { path, error: null };
  } catch (err: any) {
    return { path: null, error: err?.message ?? 'Upload failed' };
  }
}

// ── Get a signed URL for a stored file (valid 1 hour)
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  if (!storagePath) return null;
  const client = getSupabaseClient();
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

// ── Submit KYC with file uploads
export async function submitKyc(
  userId: string,
  form: KycFormData,
  onProgress?: (step: string) => void
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();

  // Upload ID front
  let idFrontPath: string | null = null;
  if (form.idFrontUri) {
    onProgress?.('Uploading ID front...');
    const { path, error } = await uploadFile(userId, 'id_front', form.idFrontUri);
    if (error) return { error: `ID front: ${error}` };
    idFrontPath = path;
  }

  // Upload ID back
  let idBackPath: string | null = null;
  if (form.idBackUri) {
    onProgress?.('Uploading ID back...');
    const { path, error } = await uploadFile(userId, 'id_back', form.idBackUri);
    if (error) return { error: `ID back: ${error}` };
    idBackPath = path;
  }

  // Upload selfie
  let selfiePath: string | null = null;
  if (form.selfieUri) {
    onProgress?.('Uploading selfie...');
    const { path, error } = await uploadFile(userId, 'selfie', form.selfieUri);
    if (error) return { error: `Selfie: ${error}` };
    selfiePath = path;
  }

  onProgress?.('Saving submission...');

  // Check for existing submission
  const { data: existing } = await client
    .from('kyc_submissions')
    .select('id, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const submissionData = {
    user_id: userId,
    status: 'pending' as KycStatus,
    id_type: form.idType,
    id_front_path: idFrontPath,
    id_back_path: idBackPath,
    selfie_path: selfiePath,
    full_name: form.fullName,
    date_of_birth: form.dateOfBirth,
    country: form.country,
    id_number: form.idNumber,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rejection_reason: null,
  };

  if (existing && (existing.status === 'rejected' || existing.status === 'pending')) {
    // Update existing rejected/pending submission
    const { error } = await client
      .from('kyc_submissions')
      .update(submissionData)
      .eq('id', existing.id);
    if (error) return { error: error.message };
  } else if (!existing) {
    // Create new submission
    const { error } = await client
      .from('kyc_submissions')
      .insert(submissionData);
    if (error) return { error: error.message };
  }

  // Update user profile kyc_status
  await client
    .from('user_profiles')
    .update({ kyc_status: 'pending' })
    .eq('id', userId);

  return { error: null };
}

// ── Fetch the user's latest KYC submission
export async function fetchMyKyc(userId: string): Promise<{ data: KycSubmission | null; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('kyc_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return { data: data as KycSubmission | null, error: error?.code === 'PGRST116' ? null : (error?.message ?? null) };
}

// ── ADMIN: Fetch all KYC submissions with user info
export async function fetchAllKycSubmissions(status?: KycStatus): Promise<{ data: KycSubmissionWithUser[]; error: string | null }> {
  const client = getSupabaseClient();
  let query = client
    .from('kyc_submissions')
    .select(`*, user_profiles(username, email, full_name, tier)`)
    .order('submitted_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  return { data: (data as KycSubmissionWithUser[]) ?? [], error: error?.message ?? null };
}

// ── ADMIN: Approve a KYC submission
export async function approveKyc(
  submissionId: string,
  userId: string,
  reviewerId: string
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();

  const { error: subError } = await client
    .from('kyc_submissions')
    .update({
      status: 'verified',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  if (subError) return { error: subError.message };

  // Update user profile
  await client
    .from('user_profiles')
    .update({ kyc_status: 'verified', tier: 'Silver' })
    .eq('id', userId);

  return { error: null };
}

// ── ADMIN: Reject a KYC submission
export async function rejectKyc(
  submissionId: string,
  userId: string,
  reviewerId: string,
  reason: string
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();

  const { error: subError } = await client
    .from('kyc_submissions')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  if (subError) return { error: subError.message };

  await client
    .from('user_profiles')
    .update({ kyc_status: 'rejected' })
    .eq('id', userId);

  return { error: null };
}

// ── ADMIN: Set submission to under_review
export async function markUnderReview(
  submissionId: string,
  reviewerId: string
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('kyc_submissions')
    .update({
      status: 'under_review',
      reviewed_by: reviewerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
  return { error: error?.message ?? null };
}
