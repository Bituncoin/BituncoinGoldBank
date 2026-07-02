// BTNG Gold — Blog Hook
import { useState, useEffect, useCallback } from 'react';
import {
  fetchArticles,
  fetchUserBookmarks,
  addBookmark,
  removeBookmark,
  incrementViews,
  BlogArticle,
} from '@/services/blogService';

export function useBlog(userId?: string) {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('All');

  // Load articles
  const loadArticles = useCallback(async (cat: string = 'All') => {
    setLoading(true);
    const { data, error: err } = await fetchArticles(cat === 'All' ? undefined : cat);
    setArticles(data);
    setError(err);
    setLoading(false);
  }, []);

  // Load bookmarks for authenticated users
  const loadBookmarks = useCallback(async () => {
    if (!userId) return;
    const { data } = await fetchUserBookmarks(userId);
    setBookmarkedIds(new Set(data));
  }, [userId]);

  useEffect(() => {
    loadArticles(category);
  }, [category]);

  useEffect(() => {
    loadBookmarks();
  }, [userId]);

  const changeCategory = useCallback((cat: string) => {
    setCategory(cat);
  }, []);

  const toggleBookmark = useCallback(async (articleId: string) => {
    if (!userId) return;
    const isBookmarked = bookmarkedIds.has(articleId);

    // Optimistic update
    setBookmarkedIds(prev => {
      const next = new Set(prev);
      if (isBookmarked) next.delete(articleId);
      else next.add(articleId);
      return next;
    });

    if (isBookmarked) {
      const { error: err } = await removeBookmark(userId, articleId);
      if (err) {
        // Revert
        setBookmarkedIds(prev => { const n = new Set(prev); n.add(articleId); return n; });
      }
    } else {
      const { error: err } = await addBookmark(userId, articleId);
      if (err) {
        setBookmarkedIds(prev => { const n = new Set(prev); n.delete(articleId); return n; });
      }
    }
  }, [userId, bookmarkedIds]);

  const trackView = useCallback((articleId: string) => {
    incrementViews(articleId);
    // Optimistic local update
    setArticles(prev =>
      prev.map(a => a.id === articleId ? { ...a, views: a.views + 1 } : a)
    );
  }, []);

  const refresh = useCallback(() => {
    loadArticles(category);
    loadBookmarks();
  }, [category, loadArticles, loadBookmarks]);

  const featured = articles.filter(a => a.featured);
  const regular = articles.filter(a => !a.featured);

  return {
    articles,
    featured,
    regular,
    loading,
    error,
    category,
    changeCategory,
    bookmarkedIds,
    toggleBookmark,
    trackView,
    refresh,
  };
}
