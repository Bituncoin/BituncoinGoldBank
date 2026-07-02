// BTNG Gold — Notifications Screen
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications, Notification, NotifFilter } from '@/hooks/useNotifications';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const TYPE_CONFIG = {
  success: { icon: 'check-circle', color: Colors.success, bg: '#22C55E11' },
  error:   { icon: 'cancel',       color: '#EF4444',      bg: '#EF444411' },
  warning: { icon: 'warning',      color: '#F59E0B',      bg: '#F59E0B11' },
  info:    { icon: 'info',         color: '#3B82F6',      bg: '#3B82F611' },
};

const CAT_ICONS: Record<string, string> = {
  kyc:     'verified-user',
  deposit: 'arrow-downward',
  withdraw:'arrow-upward',
  system:  'settings',
  general: 'notifications',
  trade:   'swap-horiz',
  payment: 'payment',
};

const FILTERS: { key: NotifFilter; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'unread',   label: 'Unread' },
  { key: 'trade',    label: 'Trades' },
  { key: 'kyc',      label: 'KYC' },
  { key: 'deposit',  label: 'Deposits' },
  { key: 'withdraw', label: 'Withdrawals' },
  { key: 'system',   label: 'System' },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const {
    notifications,
    allNotifications,
    loading,
    filter,
    setFilter,
    unreadCount,
    refresh,
    markRead,
    markAllRead,
    deleteNotification,
  } = useNotifications(user?.id);

  const [markingAll, setMarkingAll] = useState(false);
  const [markAllDone, setMarkAllDone] = useState(false);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    await markAllRead();
    setMarkingAll(false);
    setMarkAllDone(true);
    setTimeout(() => setMarkAllDone(false), 2500);
  }, [markingAll, markAllRead, unreadCount]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.title}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity onPress={refresh} style={styles.iconBtn} disabled={loading}>
            <MaterialIcons name="refresh" size={18} color={loading ? Colors.textMuted : Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.markAllBtn,
              unreadCount === 0 && styles.markAllBtnDisabled,
              markAllDone && styles.markAllBtnDone,
            ]}
            onPress={handleMarkAllRead}
            disabled={markingAll || unreadCount === 0}
            activeOpacity={0.8}
          >
            {markingAll ? (
              <ActivityIndicator size={13} color={Colors.primary} />
            ) : (
              <MaterialIcons
                name={markAllDone ? 'check-circle' : 'done-all'}
                size={15}
                color={markAllDone ? Colors.success : unreadCount === 0 ? Colors.textMuted : Colors.primary}
              />
            )}
            <Text style={[
              styles.markAllText,
              unreadCount === 0 && { color: Colors.textMuted },
              markAllDone && { color: Colors.success },
            ]}>
              {markAllDone ? 'All read!' : 'Mark all read'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map(f => {
          const isActive = filter === f.key;
          const badge = f.key === 'unread' && unreadCount > 0 ? unreadCount : null;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {f.label}
              </Text>
              {badge ? (
                <View style={[styles.filterBadge, isActive && { backgroundColor: Colors.bg + '44' }]}>
                  <Text style={[styles.filterBadgeText, isActive && { color: Colors.bg }]}>{badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {allNotifications.length} total · {unreadCount} unread
        </Text>
        {notifications.length > 0 && (
          <Text style={styles.summaryCount}>{notifications.length} shown</Text>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="notifications-none" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {filter === 'unread' ? 'All caught up!' : 'No notifications'}
          </Text>
          <Text style={styles.emptySub}>
            {filter === 'unread'
              ? 'You have no unread notifications.'
              : filter === 'all'
                ? 'Notifications from deposits, trades, KYC, and system events will appear here.'
                : filter === 'trade'
                  ? 'No trade or payment notifications yet. They appear here when BTNG Pay transactions or orders are processed.'
                  : `No ${filter} notifications yet.`}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        >
          {notifications.map((n, idx) => (
            <NotifCard
              key={n.id}
              notification={n}
              onRead={markRead}
              onDelete={deleteNotification}
            />
          ))}
          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

function NotifCard({
  notification: n,
  onRead,
  onDelete,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info;
  const catIcon = CAT_ICONS[n.category] ?? 'notifications';

  return (
    <TouchableOpacity
      style={[styles.card, !n.is_read && styles.cardUnread]}
      onPress={() => { if (!n.is_read) onRead(n.id); }}
      activeOpacity={0.8}
    >
      {/* Unread indicator */}
      {!n.is_read && <View style={styles.unreadDot} />}

      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
        <MaterialIcons name={cfg.icon as any} size={20} color={cfg.color} />
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        <View style={styles.cardTopRow}>
          <View style={styles.catChip}>
            <MaterialIcons name={catIcon as any} size={10} color={Colors.textMuted} />
            <Text style={styles.catChipText}>{n.category}</Text>
          </View>
          <Text style={styles.timeText}>{timeAgo(n.created_at)}</Text>
        </View>
        <Text style={[styles.cardTitle, !n.is_read && { color: Colors.textPrimary, fontWeight: FontWeight.bold }]}>
          {n.title}
        </Text>
        <Text style={styles.cardMessage} numberOfLines={3}>{n.message}</Text>
      </View>

      {/* Delete */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => onDelete(n.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name="close" size={14} color={Colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  topBarCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  unreadBadge: {
    backgroundColor: Colors.primary, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primaryGlow, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.primary + '55',
    minWidth: 100, justifyContent: 'center',
  },
  markAllBtnDisabled: {
    backgroundColor: Colors.bgCard,
    borderColor: Colors.border,
    opacity: 0.6,
  },
  markAllBtnDone: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.success + '55',
  },
  markAllText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  filterScroll: { maxHeight: 48 },
  filterContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, height: 34,
    borderRadius: Radius.full, backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, includeFontPadding: false },
  filterChipTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  filterBadge: {
    backgroundColor: Colors.primary + 'DD', borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },

  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
  },
  summaryText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  summaryCount: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xxl },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, includeFontPadding: false },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, includeFontPadding: false },

  listContent: { paddingHorizontal: Spacing.xl, gap: Spacing.sm, paddingTop: Spacing.sm },

  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.bgCard, borderRadius: Radius.xl,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md,
    position: 'relative',
  },
  cardUnread: { borderColor: Colors.primary + '44', backgroundColor: Colors.primaryGlow },
  unreadDot: {
    position: 'absolute', top: 14, left: -1,
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary,
    borderWidth: 2, borderColor: Colors.bg,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardContent: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.full,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border,
  },
  catChipText: { fontSize: 10, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  timeText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },
  cardMessage: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  deleteBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border, flexShrink: 0,
  },
});
