import { useState, useCallback } from 'react';
import {
  BTNGCertificate,
  CreateCertificateInput,
  fetchCertificates,
  createCertificate,
  deleteCertificate,
} from '@/services/btngCertificatesService';

export function useBtngCertificates(userId: string | undefined) {
  const [certificates, setCertificates] = useState<BTNGCertificate[]>([]);
  const [loading, setLoading]           = useState(false);
  const [creating, setCreating]         = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchCertificates(userId);
    setLoading(false);
    if (err) { setError(err); return; }
    setCertificates(data ?? []);
  }, [userId]);

  const create = useCallback(async (input: Omit<CreateCertificateInput, 'user_id'> & { renewed_from_cert_id?: string | null }): Promise<BTNGCertificate | null> => {
    if (!userId) return null;
    setCreating(true);
    setError(null);
    const { data, error: err } = await createCertificate({ ...input, user_id: userId });
    setCreating(false);
    if (err) { setError(err); return null; }
    if (data) setCertificates(prev => [data, ...prev]);
    return data;
  }, [userId]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const { error: err } = await deleteCertificate(id);
    if (err) { setError(err); return false; }
    setCertificates(prev => prev.filter(c => c.id !== id));
    return true;
  }, []);

  return { certificates, loading, creating, error, load, create, remove };
}
