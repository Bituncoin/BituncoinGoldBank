// BTNG Gold — KYC Hook
import { useState, useEffect, useCallback } from 'react';
import {
  fetchMyKyc,
  submitKyc,
  fetchAllKycSubmissions,
  approveKyc,
  rejectKyc,
  markUnderReview,
  getSignedUrl,
  KycSubmission,
  KycSubmissionWithUser,
  KycFormData,
  KycStatus,
} from '@/services/kycService';
import { insertNotification } from '@/hooks/useNotifications';

// ── User KYC hook
export function useMyKyc(userId?: string) {
  const [submission, setSubmission] = useState<KycSubmission | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error: err } = await fetchMyKyc(userId);
    setSubmission(data);
    if (err) setError(err);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = useCallback(async (form: KycFormData): Promise<{ error: string | null }> => {
    if (!userId) return { error: 'Not authenticated' };
    setSubmitting(true);
    setError(null);

    const { error: err } = await submitKyc(userId, form, (step) => setProgress(step));
    setSubmitting(false);
    setProgress('');

    if (err) {
      setError(err);
      return { error: err };
    }

    // Refresh
    await load();
    return { error: null };
  }, [userId, load]);

  return {
    submission,
    loading,
    submitting,
    progress,
    error,
    submit,
    refresh: load,
  };
}

// ── Admin KYC hook
export function useAdminKyc(userId?: string) {
  const [submissions, setSubmissions] = useState<KycSubmissionWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [filter, setFilter] = useState<KycStatus | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await fetchAllKycSubmissions(
      filter === 'all' ? undefined : filter
    );
    setSubmissions(data);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = useCallback(async (submissionId: string, submissionUserId: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: 'Not authenticated' };
    setActing(submissionId);
    const { error } = await approveKyc(submissionId, submissionUserId, userId);
    setActing(null);
    if (!error) {
      await load();
      await insertNotification({
        userId: submissionUserId,
        type: 'success',
        category: 'kyc',
        title: 'KYC Verified',
        message: 'Congratulations! Your identity verification (KYC) has been approved. You now have full access to all BTNG Gold trading features.',
      });
    }
    return { error };
  }, [userId, load]);

  const reject = useCallback(async (submissionId: string, submissionUserId: string, reason: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: 'Not authenticated' };
    setActing(submissionId);
    const { error } = await rejectKyc(submissionId, submissionUserId, userId, reason);
    setActing(null);
    if (!error) {
      await load();
      await insertNotification({
        userId: submissionUserId,
        type: 'error',
        category: 'kyc',
        title: 'KYC Rejected',
        message: `Your identity verification was not approved. Reason: ${reason}. Please re-submit with corrected documents.`,
      });
    }
    return { error };
  }, [userId, load]);

  const review = useCallback(async (submissionId: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: 'Not authenticated' };
    setActing(submissionId);
    const { error } = await markUnderReview(submissionId, userId);
    setActing(null);
    if (!error) await load();
    return { error };
  }, [userId, load]);

  const pendingCount = submissions.filter(s => s.status === 'pending').length;
  const underReviewCount = submissions.filter(s => s.status === 'under_review').length;
  const verifiedCount = submissions.filter(s => s.status === 'verified').length;
  const rejectedCount = submissions.filter(s => s.status === 'rejected').length;

  return {
    submissions,
    loading,
    acting,
    filter,
    setFilter,
    approve,
    reject,
    review,
    refresh: load,
    pendingCount,
    underReviewCount,
    verifiedCount,
    rejectedCount,
  };
}
