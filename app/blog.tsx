import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useBlog } from '@/hooks/useBlog';
import { BlogArticle } from '@/services/blogService';

const CATEGORIES = ['All', 'BTNG', 'Market', 'Ghana', 'DeFi'];

const CATEGORY_COLORS: Record<string, string> = {
  BTNG: Colors.primary,
  Market: '#F7931A',
  Ghana: '#2E7D32',
  DeFi: '#9945FF',
  All: Colors.textMuted,
};

export default function BlogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const {
    featured, regular, loading, error,
    category, changeCategory,
    bookmarkedIds, toggleBookmark,
    trackView, refresh,
  } = useBlog(user?.id);

  const [search, setSearch] = useState('');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);

  const filteredFeatured = useMemo(() => {
    return featured.filter(a => {
      const matchSearch = a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.summary.toLowerCase().includes(search.toLowerCase());
      const matchBookmark = showBookmarksOnly ? bookmarkedIds.has(a.id) : true;
      return matchSearch && matchBookmark;
    });
  }, [featured, search, showBookmarksOnly, bookmarkedIds]);

  const filteredRegular = useMemo(() => {
    return regular.filter(a => {
      const matchSearch = a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.summary.toLowerCase().includes(search.toLowerCase());
      const matchBookmark = showBookmarksOnly ? bookmarkedIds.has(a.id) : true;
      return matchSearch && matchBookmark;
    });
  }, [regular, search, showBookmarksOnly, bookmarkedIds]);

  const totalFiltered = filteredFeatured.length + filteredRegular.length;
  const allArticles = [...featured, ...regular];

  const handleArticle = (article: BlogArticle) => {
    trackView(article.id);
    router.push({ pathname: '/blog-article', params: { id: article.id } });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Blog & News</Text>
          <Text style={styles.subtitle}>BTNG + African Crypto Intelligence</Text>
        </View>
        <TouchableOpacity
          style={[styles.bookmarkFilterBtn, showBookmarksOnly && styles.bookmarkFilterBtnActive]}
          onPress={() => setShowBookmarksOnly(v => !v)}
        >
          <MaterialIcons
            name={showBookmarksOnly ? 'bookmark' : 'bookmark-border'}
            size={20}
            color={showBookmarksOnly ? Colors.bg : Colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search articles..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Filter */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.catScroll} contentContainerStyle={styles.catContent}
      >
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, cat === category && { backgroundColor: CATEGORY_COLORS[cat] || Colors.primary, borderColor: CATEGORY_COLORS[cat] || Colors.primary }]}
            onPress={() => changeCategory(cat)}
          >
            <Text style={[styles.catText, cat === category && styles.catTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading articles...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorState}>
          <MaterialIcons name="cloud-off" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Failed to load articles</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refresh}>
            <MaterialIcons name="refresh" size={16} color={Colors.bg} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Stats Strip */}
          <View style={styles.statsStrip}>
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{allArticles.length}</Text>
              <Text style={styles.statLabel}>Articles</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{bookmarkedIds.size}</Text>
              <Text style={styles.statLabel}>Saved</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statVal}>{totalFiltered}</Text>
              <Text style={styles.statLabel}>Showing</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statVal, { color: Colors.primary }]}>
                {(allArticles.reduce((s, a) => s + a.views, 0) / 1000).toFixed(0)}K
              </Text>
              <Text style={styles.statLabel}>Total Views</Text>
            </View>
          </View>

          {/* Featured */}
          {filteredFeatured.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionDot} />
                <Text style={styles.sectionTitle}>Featured</Text>
              </View>
              {filteredFeatured.map(article => (
                <FeaturedCard
                  key={article.id}
                  article={article}
                  isBookmarked={bookmarkedIds.has(article.id)}
                  onToggleBookmark={() => toggleBookmark(article.id)}
                  onPress={() => handleArticle(article)}
                />
              ))}
            </>
          )}

          {/* Latest */}
          {filteredRegular.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: Colors.textSecondary }]} />
                <Text style={styles.sectionTitle}>Latest</Text>
              </View>
              {filteredRegular.map(article => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  isBookmarked={bookmarkedIds.has(article.id)}
                  onToggleBookmark={() => toggleBookmark(article.id)}
                  onPress={() => handleArticle(article)}
                />
              ))}
            </>
          )}

          {/* Empty State */}
          {totalFiltered === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📰</Text>
              <Text style={styles.emptyTitle}>
                {showBookmarksOnly ? 'No bookmarked articles' : 'No articles found'}
              </Text>
              <Text style={styles.emptyDesc}>
                {showBookmarksOnly
                  ? 'Bookmark articles to save them for later reading.'
                  : 'Try a different search term or category.'}
              </Text>
            </View>
          )}

          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </View>
  );
}

function FeaturedCard({
  article, isBookmarked, onToggleBookmark, onPress,
}: {
  article: BlogArticle;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onPress: () => void;
}) {
  const catColor = CATEGORY_COLORS[article.category] || Colors.primary;
  return (
    <TouchableOpacity style={styles.featuredCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.featuredHero, { backgroundColor: catColor + '18' }]}>
        <View style={[styles.featuredHeroBorder, { borderColor: catColor + '40' }]} />
        <Text style={styles.featuredEmoji}>{article.image}</Text>
        <View style={[styles.featuredTag, { backgroundColor: catColor + '22', borderColor: catColor + '44' }]}>
          <Text style={[styles.featuredTagText, { color: catColor }]}>{article.category}</Text>
        </View>
      </View>
      <View style={styles.featuredContent}>
        <Text style={styles.featuredTitle} numberOfLines={2}>{article.title}</Text>
        <Text style={styles.featuredSummary} numberOfLines={3}>{article.summary}</Text>
        <View style={styles.articleMeta}>
          <Text style={styles.articleAuthorAvatar}>{article.author_avatar}</Text>
          <Text style={styles.articleAuthor}>{article.author}</Text>
          <View style={styles.metaDot} />
          <Text style={styles.articleDate}>{article.date}</Text>
          <View style={styles.metaDot} />
          <MaterialIcons name="access-time" size={11} color={Colors.textMuted} />
          <Text style={styles.articleReadTime}>{article.read_time}</Text>
        </View>
        <View style={styles.articleFooter}>
          <View style={styles.articleViews}>
            <MaterialIcons name="visibility" size={13} color={Colors.textMuted} />
            <Text style={styles.articleViewsText}>{article.views.toLocaleString()}</Text>
          </View>
          <View style={styles.tagRow}>
            {(article.tags || []).slice(0, 2).map(tag => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.bookmarkBtn, isBookmarked && styles.bookmarkBtnActive]}
            onPress={onToggleBookmark}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons
              name={isBookmarked ? 'bookmark' : 'bookmark-border'}
              size={18}
              color={isBookmarked ? Colors.primary : Colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ArticleCard({
  article, isBookmarked, onToggleBookmark, onPress,
}: {
  article: BlogArticle;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onPress: () => void;
}) {
  const catColor = CATEGORY_COLORS[article.category] || Colors.primary;
  return (
    <TouchableOpacity style={styles.articleCard} onPress={onPress} activeOpacity={0.82}>
      <View style={[styles.articleEmojiBox, { backgroundColor: catColor + '18', borderColor: catColor + '33' }]}>
        <Text style={styles.articleEmoji}>{article.image}</Text>
      </View>
      <View style={styles.articleInfo}>
        <View style={styles.articleTopRow}>
          <View style={[styles.articleCatChip, { backgroundColor: catColor + '18', borderColor: catColor + '33' }]}>
            <Text style={[styles.articleCatText, { color: catColor }]}>{article.category}</Text>
          </View>
          <Text style={styles.articleReadTime}>{article.read_time}</Text>
        </View>
        <Text style={styles.articleTitle} numberOfLines={2}>{article.title}</Text>
        <View style={styles.articleMeta}>
          <Text style={styles.articleAuthorAvatar}>{article.author_avatar}</Text>
          <Text style={styles.articleAuthor}>{article.author}</Text>
          <View style={styles.metaDot} />
          <Text style={styles.articleDate}>{article.date}</Text>
        </View>
        <View style={styles.articleFooter}>
          <View style={styles.articleViews}>
            <MaterialIcons name="visibility" size={12} color={Colors.textMuted} />
            <Text style={styles.articleViewsText}>{article.views.toLocaleString()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.bookmarkBtnSm, isBookmarked && styles.bookmarkBtnActive]}
            onPress={onToggleBookmark}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons
              name={isBookmarked ? 'bookmark' : 'bookmark-border'}
              size={16}
              color={isBookmarked ? Colors.primary : Colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, textAlign: 'center', includeFontPadding: false },
  bookmarkFilterBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary },
  bookmarkFilterBtnActive: { backgroundColor: Colors.primary },
  searchRow: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, gap: Spacing.sm, height: 44 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  catScroll: { marginBottom: Spacing.md },
  catContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  catChip: { paddingHorizontal: Spacing.md, height: 34, justifyContent: 'center', borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  catText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  catTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  scrollContent: { paddingHorizontal: Spacing.xl, gap: Spacing.md },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.md, includeFontPadding: false },
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  retryBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  statsStrip: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  statDivider: { width: 1, backgroundColor: Colors.border },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.sm },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  featuredCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  featuredHero: { height: 140, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  featuredHeroBorder: { ...StyleSheet.absoluteFillObject, borderWidth: 1 },
  featuredEmoji: { fontSize: 56 },
  featuredTag: { position: 'absolute', top: Spacing.md, left: Spacing.md, paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  featuredTagText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  featuredContent: { padding: Spacing.lg, gap: Spacing.sm },
  featuredTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 26, includeFontPadding: false },
  featuredSummary: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  articleCard: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  articleEmojiBox: { width: 70, height: 70, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  articleEmoji: { fontSize: 32 },
  articleInfo: { flex: 1, gap: 5 },
  articleTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  articleCatChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  articleCatText: { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  articleTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 19, includeFontPadding: false },
  articleMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  articleAuthorAvatar: { fontSize: 12 },
  articleAuthor: { fontSize: 10, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  articleDate: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  articleReadTime: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  articleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 },
  articleViews: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  articleViewsText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  tagRow: { flexDirection: 'row', gap: 5, flex: 1, marginLeft: Spacing.sm },
  tagChip: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  tagText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  bookmarkBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  bookmarkBtnSm: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  bookmarkBtnActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 260, includeFontPadding: false },
});
