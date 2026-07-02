// BTNG Gold — Admin Blog Hook
import { useState, useEffect, useCallback } from 'react';
import {
  fetchAllArticlesAdmin,
  createArticle,
  updateArticle,
  deleteArticle,
  togglePublished,
  BlogArticle,
  CreateArticlePayload,
} from '@/services/blogService';

export function useAdminBlog() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await fetchAllArticlesAdmin();
    setArticles(data);
    setError(err);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const publish = useCallback(async (payload: CreateArticlePayload): Promise<{ error: string | null }> => {
    setSaving(true);
    const { data, error: err } = await createArticle(payload);
    if (!err && data) {
      setArticles(prev => [data, ...prev]);
    }
    setSaving(false);
    return { error: err };
  }, []);

  const edit = useCallback(async (id: string, updates: Partial<CreateArticlePayload>): Promise<{ error: string | null }> => {
    setSaving(true);
    const { error: err } = await updateArticle(id, updates);
    if (!err) {
      setArticles(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    }
    setSaving(false);
    return { error: err };
  }, []);

  const remove = useCallback(async (id: string): Promise<{ error: string | null }> => {
    setSaving(true);
    const { error: err } = await deleteArticle(id);
    if (!err) {
      setArticles(prev => prev.filter(a => a.id !== id));
    }
    setSaving(false);
    return { error: err };
  }, []);

  const toggleStatus = useCallback(async (id: string, published: boolean): Promise<{ error: string | null }> => {
    const { error: err } = await togglePublished(id, published);
    if (!err) {
      setArticles(prev => prev.map(a => a.id === id ? { ...a, published } : a));
    }
    return { error: err };
  }, []);

  return {
    articles,
    loading,
    saving,
    error,
    publish,
    edit,
    remove,
    toggleStatus,
    refresh: load,
  };
}
