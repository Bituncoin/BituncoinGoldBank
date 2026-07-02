import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAlert } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { fetchArticleById, fetchArticles, addBookmark, removeBookmark, fetchUserBookmarks, BlogArticle } from '@/services/blogService';

const CATEGORY_COLORS: Record<string, string> = {
  BTNG: Colors.primary,
  Market: '#F7931A',
  Ghana: '#2E7D32',
  DeFi: '#9945FF',
};

function ArticleBody({ content }: { content: string }) {
  const paragraphs = content.split('\n').filter(line => line.trim().length > 0);
  return (
    <View style={bodyStyles.container}>
      {paragraphs.map((para, idx) => {
        const isHeading = para === para.toUpperCase() && para.length > 4 && para.length < 80 && !para.includes('$') && !para.includes('%');
        const isBullet = para.trim().startsWith('-');
        const isNumbered = /^\d+\./.test(para.trim());
        const isQuote = para.startsWith('"') && para.includes('" —');

        if (isHeading) {
          return (
            <View key={idx} style={bodyStyles.headingWrap}>
              <View style={bodyStyles.headingBar} />
              <Text style={bodyStyles.heading}>{para}</Text>
            </View>
          );
        }
        if (isQuote) {
          return (
            <View key={idx} style={bodyStyles.quoteBlock}>
              <View style={bodyStyles.quoteBar} />
              <Text style={bodyStyles.quoteText}>{para}</Text>
            </View>
          );
        }
        if (isBullet) {
          return (
            <View key={idx} style={bodyStyles.bulletRow}>
              <View style={bodyStyles.bulletDot} />
              <Text style={bodyStyles.bulletText}>{para.replace(/^-\s*/, '')}</Text>
            </View>
          );
        }
        if (isNumbered) {
          const numMatch = para.match(/^(\d+)\.\s*(.*)/);
          if (numMatch) {
            return (
              <View key={idx} style={bodyStyles.numberedRow}>
                <View style={bodyStyles.numCircle}>
                  <Text style={bodyStyles.numText}>{numMatch[1]}</Text>
                </View>
                <Text style={bodyStyles.numberedText}>{numMatch[2]}</Text>
              </View>
            );
          }
        }
        return <Text key={idx} style={bodyStyles.paragraph}>{para}</Text>;
      })}
    </View>
  );
}

const bodyStyles = StyleSheet.create({
  container: { gap: Spacing.md },
  heading: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  headingWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  headingBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: Colors.primary },
  paragraph: { fontSize: FontSize.sm + 1, color: Colors.textSecondary, lineHeight: 24, includeFontPadding: false },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingLeft: Spacing.sm },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, marginTop: 8 },
  bulletText: { flex: 1, fontSize: FontSize.sm + 1, color: Colors.textSecondary, lineHeight: 22, includeFontPadding: false },
  numberedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingLeft: Spacing.sm },
  numCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  numText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  numberedText: { flex: 1, fontSize: FontSize.sm + 1, color: Colors.textSecondary, lineHeight: 22, includeFontPadding: false },
  quoteBlock: { flexDirection: 'row', backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '33' },
  quoteBar: { width: 3, borderRadius: 2, backgroundColor: Colors.primary },
  quoteText: { flex: 1, fontSize: FontSize.sm, color: Colors.primary, fontStyle: 'italic', lineHeight: 20, includeFontPadding: false },
});

export default function BlogArticleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [article, setArticle] = useState<BlogArticle | null>(null);
  const [related, setRelated] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [likes, setLikes] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetchArticleById(id),
      user ? fetchUserBookmarks(user.id) : Promise.resolve({ data: [], error: null }),
    ]).then(([articleResult, bookmarkResult]) => {
      if (articleResult.data) {
        setArticle(articleResult.data);
        setLikes(Math.floor(articleResult.data.views * 0.12));
        // Load related
        fetchArticles(articleResult.data.category).then(({ data: relData }) => {
          setRelated(relData.filter(a => a.id !== id).slice(0, 3));
        });
      }
      setIsBookmarked(bookmarkResult.data.includes(id));
      setLoading(false);
    });
  }, [id, user?.id]);

  const handleToggleBookmark = async () => {
    if (!user) {
      showAlert('Sign In Required', 'Please sign in to bookmark articles.');
      return;
    }
    if (bookmarkLoading) return;
    setBookmarkLoading(true);
    const newState = !isBookmarked;
    setIsBookmarked(newState);
    if (newState) {
      await addBookmark(user.id, id);
    } else {
      await removeBookmark(user.id, id);
    }
    setBookmarkLoading(false);
  };

  const handleShare = async () => {
    if (!article) return;
    try {
      await Share.share({
        message: `${article.title}\n\nRead more on BTNG Gold News: https://btng.gold/news/${article.id}`,
        title: article.title,
      });
    } catch {
      showAlert('Share', article.title);
    }
  };

  const handleLike = () => {
    if (!hasLiked) { setLikes(l => l + 1); setHasLiked(true); }
    else { setLikes(l => l - 1); setHasLiked(false); }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.md }}>Loading article...</Text>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <MaterialIcons name="article" size={48} color={Colors.textMuted} />
        <Text style={{ color: Colors.textMuted, fontSize: FontSize.md, marginTop: Spacing.md }}>Article not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: Spacing.md }}>
          <Text style={{ color: Colors.primary, fontSize: FontSize.md }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const catColor = CATEGORY_COLORS[article.category] || Colors.primary;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={[styles.catBadge, { backgroundColor: catColor + '22', borderColor: catColor + '44' }]}>
          <Text style={[styles.catBadgeText, { color: catColor }]}>{article.category}</Text>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={[styles.actionBtn, isBookmarked && styles.actionBtnActive]}
            onPress={handleToggleBookmark}
            disabled={bookmarkLoading}
          >
            {bookmarkLoading
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <MaterialIcons name={isBookmarked ? 'bookmark' : 'bookmark-border'} size={20} color={isBookmarked ? Colors.primary : Colors.textSecondary} />
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <MaterialIcons name="share" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: catColor + '14', borderColor: catColor + '33' }]}>
          <Text style={styles.heroEmoji}>{article.image}</Text>
        </View>

        {/* Article Header */}
        <View style={styles.articleHeader}>
          <Text style={styles.articleTitle}>{article.title}</Text>
          <View style={styles.authorRow}>
            <View style={[styles.authorAvatar, { backgroundColor: catColor + '22', borderColor: catColor + '44' }]}>
              <Text style={styles.authorAvatarText}>{article.author_avatar}</Text>
            </View>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{article.author}</Text>
              <View style={styles.authorMeta}>
                <Text style={styles.articleDate}>{article.date}</Text>
                <View style={styles.metaDot} />
                <MaterialIcons name="access-time" size={12} color={Colors.textMuted} />
                <Text style={styles.readTime}>{article.read_time}</Text>
              </View>
            </View>
            <View style={styles.viewsChip}>
              <MaterialIcons name="visibility" size={12} color={Colors.textMuted} />
              <Text style={styles.viewsText}>{article.views.toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.tagsRow}>
            {(article.tags || []).map(tag => (
              <View key={tag} style={[styles.tagChip, { borderColor: catColor + '33', backgroundColor: catColor + '11' }]}>
                <Text style={[styles.tagText, { color: catColor }]}>{tag}</Text>
              </View>
            ))}
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <MaterialIcons name="format-quote" size={18} color={Colors.primary} />
            </View>
            <Text style={styles.summaryText}>{article.summary}</Text>
          </View>
        </View>

        <View style={styles.divider} />
        <View style={styles.bodySection}><ArticleBody content={article.content} /></View>
        <View style={styles.divider} />

        {/* Engagement */}
        <View style={styles.engagementBar}>
          <TouchableOpacity style={[styles.likeBtn, hasLiked && styles.likeBtnActive]} onPress={handleLike} activeOpacity={0.75}>
            <MaterialIcons name={hasLiked ? 'thumb-up' : 'thumb-up-off-alt'} size={20} color={hasLiked ? Colors.bg : Colors.textSecondary} />
            <Text style={[styles.likeBtnText, hasLiked && { color: Colors.bg }]}>{likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.engBtn} onPress={handleShare}>
            <MaterialIcons name="share" size={18} color={Colors.textSecondary} />
            <Text style={styles.engBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.engBtn, isBookmarked && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary }]}
            onPress={handleToggleBookmark}
          >
            <MaterialIcons name={isBookmarked ? 'bookmark' : 'bookmark-border'} size={18} color={isBookmarked ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.engBtnText, isBookmarked && { color: Colors.primary }]}>{isBookmarked ? 'Saved' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        {/* Related */}
        {related.length > 0 && (
          <>
            <View style={styles.relatedHeader}>
              <View style={styles.relatedDot} />
              <Text style={styles.relatedTitle}>Related Articles</Text>
            </View>
            {related.map(rel => {
              const relColor = CATEGORY_COLORS[rel.category] || Colors.primary;
              return (
                <TouchableOpacity key={rel.id} style={styles.relatedCard}
                  onPress={() => router.push({ pathname: '/blog-article', params: { id: rel.id } })} activeOpacity={0.82}>
                  <View style={[styles.relatedEmoji, { backgroundColor: relColor + '18', borderColor: relColor + '33' }]}>
                    <Text style={styles.relatedEmojiText}>{rel.image}</Text>
                  </View>
                  <View style={styles.relatedInfo}>
                    <View style={[styles.relatedCat, { backgroundColor: relColor + '18', borderColor: relColor + '33' }]}>
                      <Text style={[styles.relatedCatText, { color: relColor }]}>{rel.category}</Text>
                    </View>
                    <Text style={styles.relatedArticleTitle} numberOfLines={2}>{rel.title}</Text>
                    <View style={styles.relatedMeta}>
                      <Text style={styles.relatedDate}>{rel.date}</Text>
                      <View style={styles.metaDot} />
                      <Text style={styles.relatedReadTime}>{rel.read_time}</Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  catBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  catBadgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  topActions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  actionBtnActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  hero: { height: 180, marginHorizontal: Spacing.xl, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden', marginBottom: Spacing.lg },
  heroEmoji: { fontSize: 72 },
  scrollContent: { paddingBottom: Spacing.xxl },
  articleHeader: { paddingHorizontal: Spacing.xl, gap: Spacing.md, marginBottom: Spacing.lg },
  articleTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, lineHeight: 34, includeFontPadding: false },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  authorAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  authorAvatarText: { fontSize: 20 },
  authorInfo: { flex: 1, gap: 3 },
  authorName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  authorMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  articleDate: { fontSize: 11, color: Colors.textMuted, includeFontPadding: false },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  readTime: { fontSize: 11, color: Colors.textMuted, includeFontPadding: false },
  viewsChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  viewsText: { fontSize: 11, color: Colors.textMuted, includeFontPadding: false },
  tagsRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  tagChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  tagText: { fontSize: 11, fontWeight: FontWeight.semibold, includeFontPadding: false },
  summaryCard: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33', gap: Spacing.sm },
  summaryIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '44' },
  summaryText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.xl, marginVertical: Spacing.lg },
  bodySection: { paddingHorizontal: Spacing.xl },
  engagementBar: { flexDirection: 'row', marginHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.lg },
  likeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  likeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  likeBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  engBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border },
  engBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  relatedHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, marginBottom: Spacing.md },
  relatedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  relatedTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  relatedCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  relatedEmoji: { width: 56, height: 56, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  relatedEmojiText: { fontSize: 26 },
  relatedInfo: { flex: 1, gap: 5 },
  relatedCat: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  relatedCatText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  relatedArticleTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, lineHeight: 18, includeFontPadding: false },
  relatedMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  relatedDate: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  relatedReadTime: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});
