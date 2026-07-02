// BTNG Gold — Blog Service (Supabase backend)
import { getSupabaseClient } from '@/template';

export interface BlogArticle {
  id: string;
  category: string;
  title: string;
  summary: string;
  content: string;
  author: string;
  author_avatar: string;
  date: string;
  read_time: string;
  image: string;
  image_color: string;
  tags: string[];
  views: number;
  featured: boolean;
  published: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export interface CreateArticlePayload {
  category: string;
  title: string;
  summary: string;
  content: string;
  author: string;
  author_avatar: string;
  date: string;
  read_time: string;
  image: string;
  image_color: string;
  tags: string[];
  featured: boolean;
  published: boolean;
}

// ── Fetch published articles (with optional category filter)
export async function fetchArticles(category?: string): Promise<{ data: BlogArticle[]; error: string | null }> {
  const client = getSupabaseClient();
  let query = client
    .from('blog_articles')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (category && category !== 'All') {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  return { data: (data as BlogArticle[]) ?? [], error: error?.message ?? null };
}

// ── Fetch all articles (admin only — includes unpublished)
export async function fetchAllArticlesAdmin(): Promise<{ data: BlogArticle[]; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('blog_articles')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: (data as BlogArticle[]) ?? [], error: error?.message ?? null };
}

// ── Fetch a single article by ID
export async function fetchArticleById(id: string): Promise<{ data: BlogArticle | null; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('blog_articles')
    .select('*')
    .eq('id', id)
    .single();
  return { data: data as BlogArticle | null, error: error?.message ?? null };
}

// ── Increment view count (fire-and-forget)
export async function incrementViews(id: string): Promise<void> {
  const client = getSupabaseClient();
  await client.rpc('increment_article_views', { article_id: id }).catch(() => {
    // Fallback: manual increment
    client
      .from('blog_articles')
      .select('views')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          client
            .from('blog_articles')
            .update({ views: (data.views ?? 0) + 1 })
            .eq('id', id);
        }
      });
  });
}

// ── Check if a user has bookmarked an article
export async function fetchUserBookmarks(userId: string): Promise<{ data: string[]; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('blog_bookmarks')
    .select('article_id')
    .eq('user_id', userId);
  return {
    data: (data ?? []).map((b: any) => b.article_id as string),
    error: error?.message ?? null,
  };
}

// ── Add a bookmark
export async function addBookmark(userId: string, articleId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('blog_bookmarks')
    .upsert({ user_id: userId, article_id: articleId }, { onConflict: 'user_id,article_id' });
  return { error: error?.message ?? null };
}

// ── Remove a bookmark
export async function removeBookmark(userId: string, articleId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('blog_bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq('article_id', articleId);
  return { error: error?.message ?? null };
}

// ── Admin: Create article
export async function createArticle(payload: CreateArticlePayload): Promise<{ data: BlogArticle | null; error: string | null }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('blog_articles')
    .insert(payload)
    .select()
    .single();
  return { data: data as BlogArticle | null, error: error?.message ?? null };
}

// ── Admin: Update article
export async function updateArticle(id: string, updates: Partial<CreateArticlePayload>): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('blog_articles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error?.message ?? null };
}

// ── Admin: Delete article
export async function deleteArticle(id: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('blog_articles')
    .delete()
    .eq('id', id);
  return { error: error?.message ?? null };
}

// ── Admin: Toggle publish status
export async function togglePublished(id: string, published: boolean): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client
    .from('blog_articles')
    .update({ published, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error?.message ?? null };
}
