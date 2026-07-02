import React, { useState, useEffect, useCallback, useMemo, Component, useRef, ErrorInfo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Dimensions, Share, TextInput, ActivityIndicator, Animated, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useAlert } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGButton } from '@/components';
import { useCurrency } from '@/contexts/CurrencyContext';
import { getSupabaseClient } from '@/template';
import * as Clipboard from 'expo-clipboard';
import { generateBtngWalletMobile, type BtngWalletMobile } from '@/services/btngWalletCrypto';

// ── Error Boundary ─────────────────────────────────────────────────────────────
class SafeSection extends Component<{ children: React.ReactNode; fallback?: React.ReactNode }, { hasError: boolean; errorMsg: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error: Error) { return { hasError: true, errorMsg: error?.message ?? '' }; }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn('[SafeSection] Caught:', error?.message);
  }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

// ── Wallet Status Dot ──────────────────────────────────────────────────────────
function WalletStatusDotInner() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    try {
      import('@/services/btngWalletService')
        .then(mod => {
          if (typeof mod?.hasBtngWallet !== 'function') return;
          return mod.hasBtngWallet();
        })
        .then((exists: boolean | undefined) => {
          if (!cancelled && exists === true) setActive(true);
        })
        .catch(() => {});
    } catch (_) {}
    return () => { cancelled = true; };
  }, []);
  if (!active) return null;
  return <View style={styles.walletActiveDot} />;
}
function WalletStatusDot() {
  return (
    <SafeSection fallback={null}>
      <WalletStatusDotInner />
    </SafeSection>
  );
}

// ─── Main styles (defined before sub-components that reference them) ───────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg },
  headerTablet: { paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.xl },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  adminBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  adminBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  profileCard: { marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', marginBottom: Spacing.xl, gap: Spacing.sm },
  profileCardTablet: { padding: Spacing.xl, marginHorizontal: 0 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: Colors.primary },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: Colors.bg, borderRadius: 12, padding: 2, borderWidth: 1, borderColor: Colors.primary },
  userName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, maxWidth: '90%', textAlign: 'center' },
  userEmail: { fontSize: FontSize.sm, color: Colors.textSecondary, includeFontPadding: false },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary },
  tierIcon: { fontSize: 14 },
  tierText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  statsRow: { flexDirection: 'row', width: '100%', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4, minWidth: 0 },
  statValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flexShrink: 1 },
  statLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  statDivider: { width: 1, backgroundColor: Colors.border },
  referralCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '40' },
  referralLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginBottom: 2 },
  referralCode: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },
  referralShare: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary },
  adminBanner: { marginHorizontal: Spacing.xl, marginBottom: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 2, borderColor: Colors.primary + '66', padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  adminBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  adminBannerIconWrap: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary + '88', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  adminBannerText: { flex: 1, gap: 4 },
  adminBannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  adminBannerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  adminLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '55' },
  adminLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  adminLiveBadgeText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  adminBannerSub: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 16 },
  adminBannerArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  menuSection: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.lg },
  menuSectionTablet: { paddingHorizontal: 0 },
  sectionTitle: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.5, marginBottom: Spacing.sm, includeFontPadding: false },
  menuCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, minHeight: 56 },
  menuItemTablet: { paddingVertical: Spacing.xl, minHeight: 72 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center' },
  menuIconGold: { backgroundColor: Colors.primaryGlow40, borderWidth: 1, borderColor: Colors.primary + '55' },
  menuLabelWrap: { flex: 1, gap: 2 },
  menuLabel: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium, includeFontPadding: false, flexShrink: 1 },
  menuSubLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  genesisRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walletActiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  menuBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  menuBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  currencyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary },
  currencyChipFlag: { fontSize: 14 },
  currencyChipCode: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  creatorRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: Spacing.sm, marginBottom: Spacing.lg },
  creatorCard: { flex: 1, minWidth: 0, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, paddingVertical: Spacing.sm + 4, paddingHorizontal: Spacing.sm, borderWidth: 1.5, alignItems: 'center', gap: 4 },
  creatorIconWrap: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  creatorTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  creatorSub: { fontSize: 8, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  creatorBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, marginTop: 1 },
  creatorBadgeText: { fontSize: 7, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  sovereignRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: 6, marginBottom: Spacing.lg },
  sovereignCard: { flex: 1, minWidth: 0, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: 8, paddingHorizontal: 4, borderWidth: 1, alignItems: 'center', gap: 3 },
  sovereignEmoji: { fontSize: 16 },
  sovereignLabel: { fontSize: 7.5, fontWeight: FontWeight.heavy, textAlign: 'center', includeFontPadding: false },
  sovereignSub: { fontSize: 6.5, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  btngOsBanner: { marginHorizontal: Spacing.xl, marginTop: Spacing.md, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 2, borderColor: Colors.primary + '77', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 10 },
  btngOsBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  btngOsCoinWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  btngOsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  btngOsTitle: { fontSize: 17, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.3 },
  btngOsLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '55' },
  btngOsLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  btngOsLiveBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },
  btngOsSub: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false, marginTop: 1 },
  btngOsTagline: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  btngOsStatsCol: { gap: 5, flexShrink: 0 },
  btngOsStatRow: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: Colors.border },
  btngOsStatText: { fontSize: 7, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  osLaunchScroll: { marginBottom: Spacing.sm },
  osLaunchStrip: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: 8, alignItems: 'flex-start', paddingRight: Spacing.xl },
  osLaunchBtn: { alignItems: 'center', gap: 4, width: 60, flexShrink: 0 },
  osLaunchIconWrap: { width: 42, height: 42, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  osLaunchEmoji: { fontSize: 18 },
  osLaunchLabel: { fontSize: 7, fontWeight: FontWeight.bold, textAlign: 'center', includeFontPadding: false, lineHeight: 10 },
  buildStrip: { marginHorizontal: Spacing.xl, marginBottom: Spacing.lg, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  buildStripLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buildLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  buildText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  buildSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  logoutSection: { paddingHorizontal: Spacing.xl, gap: Spacing.md, alignItems: 'center', marginBottom: Spacing.lg },
  versionText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center' },
  // HD Vault
  vaultSection: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.lg },
  vaultHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: Spacing.sm },
  vaultHeaderTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  vaultHeaderBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  vaultHeaderBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  vaultCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  vaultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  vaultTypeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0, minWidth: 52, justifyContent: 'center' },
  vaultTypeText: { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.3, includeFontPadding: false },
  vaultMeta: { flex: 1, gap: 2, minWidth: 0 },
  vaultCardNum: { fontSize: FontSize.xs, color: Colors.textPrimary, fontFamily: 'monospace' as any, includeFontPadding: false },
  vaultDate: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  vaultCopyBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '44', flexShrink: 0 },
  vaultCopyBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  vaultEmptyWrap: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 7 },
  vaultEmptyText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  vaultEmptySub: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false, lineHeight: 14 },
  vaultShowMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderTopWidth: 1, borderTopColor: Colors.border },
  vaultShowMoreText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  vaultNickname: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false, marginBottom: 1 },
  nicknameEditRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '66', paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  nicknameInput: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false, paddingVertical: 4 },
  nicknameSaveBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nicknameCancelBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  nicknamePresetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nicknamePresetChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  nicknamePresetChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '66' },
  nicknamePresetText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  nicknamePresetTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  nicknameDisplayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 1 },
  nicknameDisplayText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  nicknameDisplayPlaceholder: { color: Colors.textMuted, fontWeight: FontWeight.normal, fontStyle: 'italic' },
  vaultDeleteBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EF444414', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EF444433', flexShrink: 0 },
  filterScroll: { marginBottom: Spacing.sm },
  filterStrip: { flexDirection: 'row', gap: 7, paddingVertical: 4, alignItems: 'center' },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1.5, flexShrink: 0 },
  filterPillText: { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.3, includeFontPadding: false },
  filterPillCount: { borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
  filterPillCountText: { fontSize: 8, fontWeight: FontWeight.heavy, includeFontPadding: false },
  vaultDetailPanel: { borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgElevated, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: Spacing.sm },
  vaultDetailLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  vaultDetailAddrBox: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '33', padding: Spacing.sm },
  vaultDetailAddr: { flex: 1, fontSize: 8, color: Colors.primary, fontFamily: 'monospace' as any, includeFontPadding: false, lineHeight: 11 },
  vaultDetailCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44', flexShrink: 0 },
  vaultDetailCopyText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  vaultDetailMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  vaultDetailMetaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  vaultDetailMetaLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  vaultDetailMetaValue: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, marginTop: 1 },
  vaultDetailDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  vaultTierBadge: { marginTop: 1, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44', alignSelf: 'flex-start' },
  vaultTierText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  vaultExportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  vaultExportBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  vaultExportText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.3, includeFontPadding: false },
  vaultSortBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '44' },
  vaultSortText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.3, includeFontPadding: false },
  vaultQrToggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm + 1, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', backgroundColor: Colors.primaryGlow },
  vaultQrToggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  vaultQrToggleText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  vaultQrBox: { alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33' },
  vaultQrInner: { borderRadius: Radius.lg, overflow: 'hidden', padding: 6, backgroundColor: Colors.primary, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  vaultQrLabel: { fontSize: 10, color: Colors.textMuted, fontFamily: 'monospace' as any, textAlign: 'center', includeFontPadding: false, marginTop: 2 },
  vaultQrBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  vaultQrBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  vaultShareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm + 1, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: '#3B82F655', backgroundColor: '#3B82F618' },
  vaultShareBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#3B82F6', includeFontPadding: false },
});

// ── BTNG Wallet Generator Card ─────────────────────────────────────────────────
const BTNG_WALLET_ASYNC_KEY = 'btng_goldcoin_last_wallet_v1';

// Full persisted wallet record (public fields only — no private key stored)
interface PersistedWallet {
  address: string;
  evmAddress: string;
  publicKey: string;
  publicKeyCompressed: string;
  mnemonic?: string; // NOT persisted — only kept in memory during session
  derivationPath: string;
  chainId: string;
  network: string;
  createdAt: string;
}

const wgc = StyleSheet.create({
  wrap:             { marginHorizontal: Spacing.xl, marginBottom: Spacing.lg, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', gap: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  header:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap:         { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:            { fontSize: FontSize.sm + 1, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  subtitle:         { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, fontFamily: 'monospace' as any },
  liveBadge:        { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  liveDot:          { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.primary },
  liveBadgeText:    { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  fieldLabel:       { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false, marginBottom: 3 },
  fieldBox:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm },
  prefixBadge:      { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, flexShrink: 0 },
  prefixText:       { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false, fontFamily: 'monospace' as any },
  fieldText:        { flex: 1, fontSize: 10, fontWeight: FontWeight.semibold, fontFamily: 'monospace' as any, includeFontPadding: false },
  copyBtn:          { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  noWalletHint:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  noWalletText:     { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  specRow:          { flexDirection: 'row', gap: 5 },
  specCell:         { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.sm - 1, paddingHorizontal: 4, alignItems: 'center', gap: 2 },
  specCellLabel:    { fontSize: 6.5, color: Colors.textMuted, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  specCellValue:    { fontSize: 7, fontWeight: FontWeight.heavy, includeFontPadding: false, textAlign: 'center' },
  actionBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 4, borderWidth: 1 },
  actionBtnText:    { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  pkLockRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EF444410', borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: '#EF444433' },
  pkLockText:       { flex: 1, fontSize: 10, color: '#EF4444', fontWeight: FontWeight.semibold, includeFontPadding: false },
  divider:          { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  sectionLabel:     { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  outputSection:    { gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm + 2 },
});

function BTNGWalletGeneratorCard() {
  const router       = useRouter();
  const { showAlert }= useAlert();

  // Full wallet output (kept in component state only — private key never persisted)
  const [wallet,        setWallet]        = useState<BtngWalletMobile | null>(null);
  const [persisted,     setPersisted]     = useState<PersistedWallet | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [generating,    setGenerating]    = useState(false);
  const [showSuccess,   setShowSuccess]   = useState(false);
  const [copiedField,   setCopiedField]   = useState<string | null>(null);
  const [backupModal,   setBackupModal]   = useState(false);
  const [backupAgreed,  setBackupAgreed]  = useState(false);
  const [pkVisible,     setPkVisible]     = useState(false);
  const [copyAllDone,   setCopyAllDone]   = useState(false);

  const copyField = (value: string, key: string) => {
    Clipboard.setStringAsync(value).catch(() => {});
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Load last public wallet data from AsyncStorage on mount ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BTNG_WALLET_ASYNC_KEY);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as PersistedWallet;
          if (parsed?.address) setPersisted(parsed);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── SECTION 6 — generateBtngWalletMobile() wired inline ──
  // Pure-JS secp256k1: S2 hash160 → S3 checksum → S4 safeBase58 → S5 btng1g…35
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setShowSuccess(false);
    try {
      // SECTION 6 — direct synchronous call, no dynamic import
      const w = generateBtngWalletMobile();
      if (w.error || !w.address || w.address.length < 10) {
        throw new Error(w.message ?? 'Engine returned empty address — check btngWalletCrypto.ts');
      }
      setWallet(w);
      // Persist public-safe fields only — private key stays in memory
      const pub: PersistedWallet = {
        address:             w.address,
        evmAddress:          w.evmAddress ?? '',
        publicKey:           w.publicKey  ?? '',
        publicKeyCompressed: w.publicKey ? (w.publicKey.length > 66 ? w.publicKey.slice(0, 66) : w.publicKey) : '',
        derivationPath:      `m/44'/9999'/0'/0/0`,
        chainId:             'BTNG-MAINNET-9999',
        network:             'BTNG Gold Chain · Mainnet',
        createdAt:           w.createdAt,
      };
      await AsyncStorage.setItem(BTNG_WALLET_ASYNC_KEY, JSON.stringify(pub));
      setPersisted(pub);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3500);
    } catch (e: any) {
      showAlert('Generation Error', `Could not generate wallet.\n\n${e?.message ?? String(e)}`);
    } finally {
      setGenerating(false);
    }
  }, [showAlert]);

  // Active display: prefer live session wallet, fall back to persisted
  const addr      = wallet?.address      ?? persisted?.address      ?? null;
  const evmAddr   = wallet?.evmAddress   ?? persisted?.evmAddress   ?? null;
  const pubKey    = wallet?.publicKey    ?? persisted?.publicKey    ?? null;
  const pubKeyC   = pubKey ? pubKey.slice(0, 66) : persisted?.publicKeyCompressed ?? null;
  const chainId   = persisted?.chainId   ?? 'BTNG-MAINNET-9999';
  const network   = persisted?.network   ?? 'BTNG Gold Chain · Mainnet';
  const derPath   = persisted?.derivationPath ?? `m/44'/9999'/0'/0/0`;
  const createdAt = wallet?.createdAt    ?? persisted?.createdAt    ?? null;

  const handleCopyAll = useCallback(() => {
    if (!addr) return;
    const lines = [
      '═══ BTNG GoldCoin Wallet — Public Summary ═══',
      `BTNG ADDRESS : ${addr}`,
      evmAddr  ? `EVM ADDRESS  : ${evmAddr}`  : null,
      pubKey   ? `PUBLIC KEY   : ${pubKey}`   : null,
      `CHAIN ID     : ${chainId}`,
      `NETWORK      : ${network}`,
      `BIP-44 PATH  : ${derPath}`,
      createdAt ? `GENERATED    : ${new Date(createdAt).toLocaleString()}` : null,
      '─────────────────────────────────────────────',
      'BTNG Sovereign Chain · btng1g… · BTNG-MAINNET-9999',
      'DO NOT share your private key.',
    ].filter(Boolean).join('\n');
    Clipboard.setStringAsync(lines).catch(() => {});
    setCopyAllDone(true);
    setTimeout(() => setCopyAllDone(false), 2000);
  }, [addr, evmAddr, pubKey, chainId, network, derPath, createdAt]);

  return (
    <View style={wgc.wrap}>

      {/* ── HEADER ── */}
      <View style={wgc.header}>
        <View style={wgc.iconWrap}>
          <Text style={{ fontSize: 22 }}>🔐</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={wgc.title}>BTNG Wallet Generator</Text>
            <View style={[wgc.liveBadge, showSuccess && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
              <View style={[wgc.liveDot, showSuccess && { backgroundColor: Colors.success }]} />
              <Text style={[wgc.liveBadgeText, showSuccess && { color: Colors.success }]}>
                {showSuccess ? 'GENERATED!' : 'secp256k1'}
              </Text>
            </View>
          </View>
          <Text style={wgc.subtitle}>Sovereign GoldCoin Address · btng1g… · BTNG-MAINNET-9999</Text>
        </View>
      </View>

      {/* ── SECTION 2-5 OUTPUT DISPLAY ── */}
      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
      ) : addr ? (
        <View style={wgc.outputSection}>
          <Text style={wgc.sectionLabel}>ENGINE OUTPUT · COMPLETE WALLET</Text>

          {/* S5 — BTNG Address (btng1g… 35 chars) */}
          <View>
            <Text style={wgc.fieldLabel}>BTNG GOLDCOIN ADDRESS (S5 · btng1g… · 35 chars)</Text>
            <View style={[wgc.fieldBox, { borderColor: Colors.primary + '44' }]}>
              <View style={[wgc.prefixBadge, { backgroundColor: Colors.primary }]}>
                <Text style={wgc.prefixText}>btng1g</Text>
              </View>
              <Text style={[wgc.fieldText, { color: Colors.primary }]} numberOfLines={1} ellipsizeMode="middle" selectable>{addr}</Text>
              <TouchableOpacity style={[wgc.copyBtn, copiedField === 'addr' && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]} onPress={() => copyField(addr, 'addr')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
                <MaterialIcons name={copiedField === 'addr' ? 'check' : 'content-copy'} size={13} color={copiedField === 'addr' ? Colors.success : Colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* EVM Address */}
          {evmAddr ? (
            <View>
              <Text style={wgc.fieldLabel}>EVM ADDRESS (Ethereum · Polygon · BNB compatible)</Text>
              <View style={[wgc.fieldBox, { borderColor: '#627EEA44', backgroundColor: '#627EEA06' }]}>
                <View style={[wgc.prefixBadge, { backgroundColor: '#627EEA' }]}>
                  <Text style={wgc.prefixText}>EVM</Text>
                </View>
                <Text style={[wgc.fieldText, { color: '#627EEA' }]} numberOfLines={1} ellipsizeMode="middle" selectable>{evmAddr}</Text>
                <TouchableOpacity style={[wgc.copyBtn, { borderColor: '#627EEA44', backgroundColor: '#627EEA14' }, copiedField === 'evm' && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]} onPress={() => copyField(evmAddr, 'evm')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
                  <MaterialIcons name={copiedField === 'evm' ? 'check' : 'content-copy'} size={13} color={copiedField === 'evm' ? Colors.success : '#627EEA'} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Public Key */}
          {pubKey ? (
            <View>
              <Text style={wgc.fieldLabel}>PUBLIC KEY (S2 input · secp256k1 · 65 bytes uncompressed)</Text>
              <View style={[wgc.fieldBox, { borderColor: Colors.success + '44', backgroundColor: Colors.success + '06' }]}>
                <View style={[wgc.prefixBadge, { backgroundColor: Colors.success }]}>
                  <Text style={wgc.prefixText}>PUB</Text>
                </View>
                <Text style={[wgc.fieldText, { color: Colors.success, fontSize: 9 }]} numberOfLines={1} ellipsizeMode="middle" selectable>{pubKey}</Text>
                <TouchableOpacity style={[wgc.copyBtn, { borderColor: Colors.success + '44', backgroundColor: Colors.success + '14' }, copiedField === 'pub' && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]} onPress={() => copyField(pubKey, 'pub')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.8}>
                  <MaterialIcons name={copiedField === 'pub' ? 'check' : 'content-copy'} size={13} color={Colors.success} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Meta row: chain / path / created */}
          <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 100, backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 5, gap: 1 }}>
              <Text style={{ fontSize: 7, color: Colors.textMuted, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false }}>CHAIN ID</Text>
              <Text style={{ fontSize: 8, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false, fontFamily: 'monospace' as any }} numberOfLines={1}>{chainId}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 100, backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 5, gap: 1 }}>
              <Text style={{ fontSize: 7, color: Colors.textMuted, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false }}>BIP-44 PATH</Text>
              <Text style={{ fontSize: 8, color: '#8247E5', fontWeight: FontWeight.bold, includeFontPadding: false, fontFamily: 'monospace' as any }} numberOfLines={1}>{derPath}</Text>
            </View>
            {createdAt ? (
              <View style={{ flex: 1, minWidth: 100, backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: 5, gap: 1 }}>
                <Text style={{ fontSize: 7, color: Colors.textMuted, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false }}>GENERATED</Text>
                <Text style={{ fontSize: 8, color: Colors.textSecondary, fontWeight: FontWeight.bold, includeFontPadding: false }} numberOfLines={1}>{new Date(createdAt).toLocaleDateString()}</Text>
              </View>
            ) : null}
          </View>

          {/* Private Key — locked, navigates to full screen */}
          <TouchableOpacity style={wgc.pkLockRow} onPress={() => router.push('/btng-wallet-generate' as any)} activeOpacity={0.85}>
            <MaterialIcons name="lock" size={14} color="#EF4444" />
            <Text style={wgc.pkLockText}>PRIVATE KEY — tap Full Keys to view securely</Text>
            <View style={{ backgroundColor: '#EF444418', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: '#EF444433' }}>
              <Text style={{ fontSize: 8, fontWeight: FontWeight.heavy, color: '#EF4444', includeFontPadding: false }}>SECURED</Text>
            </View>
          </TouchableOpacity>

          {/* Backup Private Key — only shown when wallet is in memory (current session) */}
          {wallet ? (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F59E0B10', borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: '#F59E0B44' }}
              onPress={() => { setBackupModal(true); setBackupAgreed(false); setPkVisible(false); }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="backup" size={14} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: FontWeight.bold, color: '#F59E0B', includeFontPadding: false }}>Backup Private Key</Text>
                <Text style={{ fontSize: 8, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 }}>Session only · Confirm identity before revealing</Text>
              </View>
              <MaterialIcons name="chevron-right" size={14} color="#F59E0B" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={wgc.noWalletHint}>
          <MaterialIcons name="touch-app" size={13} color={Colors.textMuted} />
          <Text style={wgc.noWalletText}>Tap <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>Generate Now</Text> — produces privateKey + publicKey + btng1g… address instantly</Text>
        </View>
      )}

      {/* ── CRYPTO SPEC GRID (Sections 1-5) ── */}
      <View style={wgc.specRow}>
        {[
          { icon: 'lock',            label: 'S1 Curve',    value: 'secp256k1',   color: Colors.primary },
          { icon: 'fingerprint',     label: 'S2 Hash',     value: 'SHA256+RMD',  color: '#627EEA' },
          { icon: 'check-circle',    label: 'S3 Checksum', value: '2xSHA256',    color: '#F7931A' },
          { icon: 'code',            label: 'S4 Encode',   value: 'Base58Check', color: '#8247E5' },
          { icon: 'place',           label: 'S5 Prefix',   value: 'btng1g…35',  color: Colors.success },
          { icon: 'account-balance', label: 'S6 Network',  value: 'BTNG-9999',   color: Colors.warning },
        ].map(spec => (
          <View key={spec.label} style={wgc.specCell}>
            <MaterialIcons name={spec.icon as any} size={9} color={spec.color} />
            <Text style={wgc.specCellLabel}>{spec.label}</Text>
            <Text style={[wgc.specCellValue, { color: spec.color }]} numberOfLines={1}>{spec.value}</Text>
          </View>
        ))}
      </View>

      {/* ── ACTION BUTTONS ── */}
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <TouchableOpacity
          style={[wgc.actionBtn, { flex: 2, borderColor: Colors.primary, backgroundColor: Colors.primary }, generating && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={generating}
          activeOpacity={0.85}
        >
          {generating
            ? <ActivityIndicator size="small" color={Colors.bg} />
            : <MaterialIcons name="add-circle" size={15} color={Colors.bg} />}
          <Text style={[wgc.actionBtnText, { color: Colors.bg }]}>
            {generating ? 'Generating…' : addr ? 'Generate New' : 'Generate Now'}
          </Text>
        </TouchableOpacity>
        {addr ? (
          <TouchableOpacity
            style={[wgc.actionBtn, { flex: 1, borderColor: copyAllDone ? Colors.success + '66' : '#3B82F655', backgroundColor: copyAllDone ? Colors.successBg : '#3B82F614' }]}
            onPress={handleCopyAll}
            activeOpacity={0.85}
          >
            <MaterialIcons name={copyAllDone ? 'check-circle' : 'copy-all'} size={15} color={copyAllDone ? Colors.success : '#3B82F6'} />
            <Text style={[wgc.actionBtnText, { color: copyAllDone ? Colors.success : '#3B82F6', fontSize: 11 }]}>
              {copyAllDone ? 'Copied!' : 'Copy All'}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[wgc.actionBtn, { flex: 1, borderColor: Colors.success + '55', backgroundColor: Colors.successBg }]}
          onPress={() => router.push('/btng-wallet-generate' as any)}
          activeOpacity={0.85}
        >
          <MaterialIcons name="vpn-key" size={15} color={Colors.success} />
          <Text style={[wgc.actionBtnText, { color: Colors.success }]}>Full Keys</Text>
        </TouchableOpacity>
      </View>

      {/* ── BACKUP PRIVATE KEY MODAL ── */}
      <Modal visible={backupModal} transparent animationType="fade" onRequestClose={() => setBackupModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(6,6,8,0.93)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl }}>
          <View style={{ backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, width: '100%', maxWidth: 380, borderWidth: 1.5, borderColor: '#F59E0B55', gap: Spacing.md }}>

            {/* Icon + Title */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: '#F59E0B18', borderWidth: 1.5, borderColor: '#F59E0B55', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="backup" size={30} color="#F59E0B" />
              </View>
              <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: '#F59E0B', includeFontPadding: false }}>Backup Private Key</Text>
              <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, includeFontPadding: false }}>
                Your private key grants full control of this wallet. Keep it secret and store it offline.
              </Text>
            </View>

            {/* Warning bullets */}
            <View style={{ backgroundColor: '#EF444410', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#EF444433', padding: Spacing.sm + 2, gap: 5 }}>
              {['Never share your private key with anyone', 'BTNG support will NEVER ask for it', 'Store it offline — paper or hardware wallet', 'Anyone with this key controls all your funds'].map((tip, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <MaterialIcons name="warning" size={10} color="#EF4444" style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontSize: 9, color: '#FCA5A5', includeFontPadding: false, lineHeight: 14 }}>{tip}</Text>
                </View>
              ))}
            </View>

            {/* Checkbox toggle */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: backupAgreed ? Colors.primaryGlow : Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 3, borderWidth: 1.5, borderColor: backupAgreed ? Colors.primary + '66' : Colors.border }}
              onPress={() => { setBackupAgreed(v => !v); setPkVisible(false); }}
              activeOpacity={0.8}
            >
              <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: backupAgreed ? Colors.primary : Colors.textMuted, backgroundColor: backupAgreed ? Colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {backupAgreed ? <MaterialIcons name="check" size={13} color={Colors.bg} /> : null}
              </View>
              <Text style={{ flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: backupAgreed ? Colors.primary : Colors.textSecondary, includeFontPadding: false, lineHeight: 17 }}>
                I understand this is secret and I am solely responsible for keeping it safe
              </Text>
            </TouchableOpacity>

            {/* Private key reveal (only when agreed) */}
            {backupAgreed && (
              <View style={{ gap: 6 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: pkVisible ? '#EF444466' : Colors.primary + '55', backgroundColor: pkVisible ? '#EF444414' : Colors.primaryGlow }}
                  onPress={() => setPkVisible(v => !v)}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name={pkVisible ? 'visibility-off' : 'visibility'} size={15} color={pkVisible ? '#EF4444' : Colors.primary} />
                  <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: pkVisible ? '#EF4444' : Colors.primary, includeFontPadding: false }}>
                    {pkVisible ? 'Hide Private Key' : 'Reveal Private Key'}
                  </Text>
                </TouchableOpacity>

                {pkVisible && wallet ? (
                  <View style={{ backgroundColor: '#EF444410', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#EF444455', padding: Spacing.sm + 2, gap: 6 }}>
                    <Text style={{ fontSize: 8, fontWeight: FontWeight.heavy, color: '#EF4444', letterSpacing: 1, includeFontPadding: false }}>PRIVATE KEY (hex · 32 bytes)</Text>
                    <Text style={{ fontSize: 9, color: '#FCA5A5', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14, includeFontPadding: false }} selectable>{wallet.privateKey}</Text>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#EF444420', borderRadius: Radius.md, paddingVertical: 6, borderWidth: 1, borderColor: '#EF444444' }}
                      onPress={() => { Clipboard.setStringAsync(wallet.privateKey).catch(() => {}); }}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="content-copy" size={12} color="#EF4444" />
                      <Text style={{ fontSize: 10, fontWeight: FontWeight.bold, color: '#EF4444', includeFontPadding: false }}>Copy Private Key</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )}

            {/* Full Seed Backup CTA */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 6, borderWidth: 1, borderColor: Colors.primary }}
              onPress={() => { setBackupModal(false); router.push('/btng-wallet-generate' as any); }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="vpn-key" size={16} color={Colors.bg} />
              <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false }}>Full Seed Backup on Wallet Screen</Text>
            </TouchableOpacity>

            {/* Close */}
            <TouchableOpacity
              style={{ alignItems: 'center', paddingVertical: 6 }}
              onPress={() => setBackupModal(false)}
              activeOpacity={0.75}
            >
              <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>Close</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* ── SUCCESS FLASH ── */}
      {showSuccess ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.successBg, borderRadius: Radius.lg, padding: Spacing.sm + 1, borderWidth: 1, borderColor: Colors.success + '44' }}>
          <MaterialIcons name="check-circle" size={14} color={Colors.success} />
          <Text style={{ flex: 1, fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false }}>
            Wallet generated · privateKey + publicKey + btng1g… address ready · Tap Full Keys to back up seed phrase
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── HD Vault Cards ─────────────────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  w: { label: 'Wallet',    icon: 'account-balance-wallet', color: Colors.primary },
  v: { label: 'Validator', icon: 'hub',                   color: '#22C55E'       },
  m: { label: 'Merchant',  icon: 'store',                  color: '#3B82F6'       },
  e: { label: 'Enterprise',icon: 'business',               color: '#9945FF'       },
  g: { label: 'Gov',       icon: 'account-balance',        color: '#F59E0B'       },
  t: { label: 'Treasury',  icon: 'savings',                color: '#D4A017'       },
  c: { label: 'Coin',      icon: 'monetization-on',        color: '#EF4444'       },
};

interface VaultCard {
  id: string;
  btng_id: string;
  wallet_address: string;
  card_number_masked: string;
  activated_at: string;
  expires: string;
  tier: string;
  status: string;
  nickname?: string;
}

function HDVaultCards({ userId }: { userId?: string }) {
  const [cards, setCards]           = useState<VaultCard[]>([]);
  const [loading, setLoading]       = useState(false);
  const [expanded, setExpanded]     = useState(false);
  const [copied, setCopied]         = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedFull, setCopiedFull] = useState<string | null>(null);
  const [qrVisibleId, setQrVisibleId] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingNicknameId, setEditingNicknameId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'az'>('newest');
  const { showAlert } = useAlert();
  const PREVIEW_COUNT = 3;

  const SORT_META: Record<'newest' | 'oldest' | 'az', { icon: string; label: string }> = {
    newest: { icon: 'arrow-downward', label: 'Newest' },
    oldest: { icon: 'arrow-upward',   label: 'Oldest' },
    az:     { icon: 'sort-by-alpha',  label: 'A–Z'    },
  };
  const cycleSortMode = () => setSortMode(prev => prev === 'newest' ? 'oldest' : prev === 'oldest' ? 'az' : 'newest');

  const detectType = (btngId: string): string => {
    const match = btngId.match(/^BTNG\d+[A-Z]([wmegtvco])/i);
    return match ? match[1].toLowerCase() : 'w';
  };

  const fetchCards = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb
        .from('btng_cards')
        .select('id,btng_id,wallet_address,card_number_masked,activated_at,expires,tier,status,nickname')
        .eq('user_id', userId)
        .eq('source', 'hd_derive')
        .order('created_at', { ascending: false });
      if (!error && data) setCards(data as VaultCard[]);
    } catch (_) {}
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  // Use standard useEffect instead of useFocusEffect to avoid navigation context issues
  useEffect(() => { fetchCards(); }, [fetchCards]);

  const handleSaveNickname = useCallback(async (card: VaultCard) => {
    setSavingNickname(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from('btng_cards').update({ nickname: nicknameInput.trim() || null }).eq('id', card.id);
      if (error) {
        showAlert('Save Failed', error.message);
      } else {
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, nickname: nicknameInput.trim() || undefined } : c));
        setEditingNicknameId(null);
      }
    } catch (err: any) {
      showAlert('Error', err?.message ?? 'Failed to save nickname.');
    } finally {
      setSavingNickname(false);
    }
  }, [nicknameInput, showAlert]);

  const handleDelete = useCallback((card: VaultCard) => {
    const typeKey  = detectType(card.btng_id);
    const typeMeta = TYPE_META[typeKey] ?? TYPE_META['w'];
    const masked   = card.card_number_masked || `${card.btng_id.slice(0, 8)}****${card.btng_id.slice(-4)}`;
    showAlert('Delete Vault Card', `Remove ${typeMeta.label} address\n${masked}\nfrom your HD Vault? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeletingId(card.id);
        try {
          const sb = getSupabaseClient();
          const { error } = await sb.from('btng_cards').delete().eq('id', card.id);
          if (error) { showAlert('Delete Failed', error.message); }
          else {
            setCards(prev => prev.filter(c => c.id !== card.id));
            setExpandedId(prev => prev === card.id ? null : prev);
            setQrVisibleId(prev => prev === card.id ? null : prev);
          }
        } catch (err: any) {
          showAlert('Error', err?.message ?? 'Failed to delete card.');
        } finally {
          setDeletingId(null);
        }
      }},
    ]);
  }, [showAlert]);

  const handleCopy = (addr: string, id: string) => { Clipboard.setStringAsync(addr).catch(() => {}); setCopied(id); setTimeout(() => setCopied(null), 2000); };
  const handleCopyFull = (addr: string, id: string) => { Clipboard.setStringAsync(addr).catch(() => {}); setCopiedFull(id); setTimeout(() => setCopiedFull(null), 2000); };

  const handleExport = useCallback(() => {
    if (cards.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    const lines = ['BTNG HD Vault Cards Export', `Generated: ${date}`, `Total: ${cards.length}`, '---'];
    cards.forEach((card, idx) => {
      const tKey = card.btng_id.match(/^BTNG\d+[A-Z]([wmegtvco])/i)?.[1]?.toLowerCase() ?? 'w';
      const masked = card.card_number_masked || `${card.btng_id.slice(0, 8)}****${card.btng_id.slice(-4)}`;
      lines.push(`${idx + 1}. [${tKey.toUpperCase()}] ${(TYPE_META[tKey] ?? TYPE_META['w']).label} | ${masked} | ${card.activated_at} | ${card.tier}`);
    });
    Clipboard.setStringAsync(lines.join('\n')).catch(() => {});
    setExportDone(true);
    setTimeout(() => setExportDone(false), 2500);
  }, [cards]);

  const handleShare = async (card: VaultCard) => {
    const tKey  = detectType(card.btng_id);
    const tMeta = TYPE_META[tKey] ?? TYPE_META['w'];
    const masked = card.card_number_masked || `${card.btng_id.slice(0, 8)}****${card.btng_id.slice(-4)}`;
    const message = [`BTNG Sovereign Address`, `Type: ${tMeta.label}`, `Address: ${card.wallet_address}`, `Masked: ${masked}`, `Tier: ${card.tier}`, ``, `BTNG Sovereign Chain · 54 Africa Nations`].join('\n');
    try { await Share.share({ message, title: `BTNG ${tMeta.label} Address` }); } catch (_) {}
  };

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const filtered = selectedType === 'all' ? cards : cards.filter(card => detectType(card.btng_id) === selectedType);
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortMode === 'oldest') return arr.reverse();
    if (sortMode === 'az') return arr.sort((a, b) => detectType(a.btng_id).localeCompare(detectType(b.btng_id)));
    return arr;
  }, [filtered, sortMode]);
  const visible = expanded ? sorted : sorted.slice(0, PREVIEW_COUNT);

  return (
    <View style={styles.vaultSection}>
      <View style={styles.vaultHeader}>
        <MaterialIcons name="account-tree" size={15} color={Colors.primary} />
        <Text style={styles.vaultHeaderTitle}>My HD Vault Cards</Text>
        {cards.length > 0 && (
          <View style={styles.vaultHeaderBadge}>
            <MaterialIcons name="security" size={9} color={Colors.primary} />
            <Text style={styles.vaultHeaderBadgeText}>{cards.length} SAVED</Text>
          </View>
        )}
        {cards.length > 0 && (
          <TouchableOpacity style={styles.vaultSortBtn} onPress={cycleSortMode} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.75}>
            <MaterialIcons name={SORT_META[sortMode].icon as any} size={11} color={Colors.primary} />
            <Text style={styles.vaultSortText}>{SORT_META[sortMode].label}</Text>
          </TouchableOpacity>
        )}
        {cards.length > 0 && (
          <TouchableOpacity style={[styles.vaultExportBtn, exportDone && styles.vaultExportBtnDone]} onPress={handleExport} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.75}>
            <MaterialIcons name={exportDone ? 'check' : 'file-download'} size={12} color={exportDone ? Colors.success : Colors.primary} />
            <Text style={[styles.vaultExportText, exportDone && { color: Colors.success }]}>{exportDone ? 'Copied!' : 'Export'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={fetchCards}>
          <MaterialIcons name="refresh" size={16} color={loading ? Colors.textMuted : Colors.primary} />
        </TouchableOpacity>
      </View>

      {cards.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterStrip}>
          {(['all', 'w', 'v', 'm', 'e', 'g', 't', 'c'] as const).map(type => {
            const isAll  = type === 'all';
            const meta   = isAll ? null : (TYPE_META[type] ?? null);
            const active = selectedType === type;
            const color  = isAll ? Colors.primary : (meta?.color ?? Colors.primary);
            const count  = isAll ? cards.length : cards.filter(c => detectType(c.btng_id) === type).length;
            if (!isAll && count === 0) return null;
            return (
              <TouchableOpacity key={type} style={[styles.filterPill, active ? { backgroundColor: color, borderColor: color } : { backgroundColor: color + '14', borderColor: color + '44' }]} onPress={() => { setSelectedType(type); setExpanded(false); }} activeOpacity={0.75}>
                {!isAll && <MaterialIcons name={(meta?.icon ?? 'fingerprint') as any} size={11} color={active ? '#fff' : color} />}
                <Text style={[styles.filterPillText, { color: active ? '#fff' : color }]}>{isAll ? 'All' : type.toUpperCase()}</Text>
                <View style={[styles.filterPillCount, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : color + '22' }]}>
                  <Text style={[styles.filterPillCountText, { color: active ? '#fff' : color }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.vaultCard}>
        {filtered.length === 0 && !loading && cards.length > 0 ? (
          <View style={styles.vaultEmptyWrap}>
            <MaterialIcons name="filter-list" size={24} color={Colors.textMuted} />
            <Text style={styles.vaultEmptyText}>No {TYPE_META[selectedType]?.label ?? selectedType.toUpperCase()} addresses saved</Text>
            <Text style={styles.vaultEmptySub}>Select a different filter or save more HD addresses</Text>
          </View>
        ) : cards.length === 0 && !loading ? (
          <View style={styles.vaultEmptyWrap}>
            <MaterialIcons name="account-tree" size={28} color={Colors.textMuted} />
            <Text style={styles.vaultEmptyText}>No HD Vault Cards yet</Text>
            <Text style={styles.vaultEmptySub}>Use the AI Private Banker → Generate HD Addresses → Save to Vault</Text>
          </View>
        ) : loading && cards.length === 0 ? (
          <View style={styles.vaultEmptyWrap}>
            <MaterialIcons name="hourglass-top" size={22} color={Colors.textMuted} />
            <Text style={styles.vaultEmptyText}>Loading vault…</Text>
          </View>
        ) : (
          <>
            {visible.map((card, idx) => {
              const typeKey  = detectType(card.btng_id);
              const typeMeta = TYPE_META[typeKey] ?? TYPE_META['w'];
              const isCopied = copied === card.id;
              const isLast   = idx === visible.length - 1 && !(cards.length > PREVIEW_COUNT && !expanded);
              const isExp    = expandedId === card.id;
              return (
                <View key={card.id}>
                  <TouchableOpacity style={[styles.vaultRow, isLast && !isExp && { }, deletingId === card.id && { opacity: 0.45 }]} onPress={() => toggleExpand(card.id)} onLongPress={() => handleDelete(card)} delayLongPress={500} activeOpacity={0.75}>
                    <View style={[styles.vaultTypeChip, { backgroundColor: typeMeta.color + '18', borderColor: typeMeta.color + '44' }]}>
                      <MaterialIcons name={typeMeta.icon as any} size={12} color={typeMeta.color} />
                      <Text style={[styles.vaultTypeText, { color: typeMeta.color }]}>{typeKey.toUpperCase()}</Text>
                    </View>
                    <View style={styles.vaultMeta}>
                      {card.nickname ? <Text style={styles.vaultNickname} numberOfLines={1}>{card.nickname}</Text> : null}
                      <Text style={styles.vaultCardNum} numberOfLines={1}>{card.card_number_masked || `${card.btng_id.slice(0, 10)}…${card.btng_id.slice(-4)}`}</Text>
                      <Text style={styles.vaultDate}>Activated {card.activated_at} · {card.tier}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <TouchableOpacity style={[styles.vaultCopyBtn, isCopied && styles.vaultCopyBtnDone]} onPress={(e) => { e.stopPropagation?.(); handleCopy(card.wallet_address, card.id); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name={isCopied ? 'check-circle' : 'content-copy'} size={14} color={isCopied ? Colors.success : Colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.vaultDeleteBtn} onPress={(e) => { e.stopPropagation?.(); handleDelete(card); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                      <MaterialIcons name={isExp ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={16} color={isExp ? Colors.primary : Colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                  {isExp && (
                    <View style={[styles.vaultDetailPanel, isLast && { borderBottomWidth: 0 }]}>
                      <Text style={styles.vaultDetailLabel}>NICKNAME / LABEL</Text>
                      {editingNicknameId === card.id ? (
                        <View style={{ gap: 6 }}>
                          <View style={styles.nicknameEditRow}>
                            <TextInput style={styles.nicknameInput} value={nicknameInput} onChangeText={setNicknameInput} placeholder="e.g. Main Wallet, Savings, Merchant" placeholderTextColor={Colors.textMuted} autoFocus maxLength={40} returnKeyType="done" onSubmitEditing={() => handleSaveNickname(card)} />
                            <TouchableOpacity style={[styles.nicknameSaveBtn, savingNickname && { opacity: 0.6 }]} onPress={() => handleSaveNickname(card)} disabled={savingNickname}>
                              <MaterialIcons name={savingNickname ? 'hourglass-top' : 'check'} size={14} color={Colors.bg} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.nicknameCancelBtn} onPress={() => setEditingNicknameId(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                            </TouchableOpacity>
                          </View>
                          <View style={styles.nicknamePresetRow}>
                            {['Main Wallet', 'Savings', 'Trading', 'Merchant'].map(preset => (
                              <TouchableOpacity key={preset} style={[styles.nicknamePresetChip, nicknameInput === preset && styles.nicknamePresetChipActive]} onPress={() => setNicknameInput(preset)} activeOpacity={0.75}>
                                <Text style={[styles.nicknamePresetText, nicknameInput === preset && styles.nicknamePresetTextActive]}>{preset}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.nicknameDisplayRow} onPress={() => { setEditingNicknameId(card.id); setNicknameInput(card.nickname ?? ''); }} activeOpacity={0.75}>
                          <MaterialIcons name="label-outline" size={13} color={card.nickname ? Colors.primary : Colors.textMuted} />
                          <Text style={[styles.nicknameDisplayText, !card.nickname && styles.nicknameDisplayPlaceholder]}>{card.nickname || 'Tap to add a label…'}</Text>
                          <MaterialIcons name="edit" size={12} color={Colors.textMuted} />
                        </TouchableOpacity>
                      )}
                      <Text style={styles.vaultDetailLabel}>FULL WALLET ADDRESS</Text>
                      <View style={styles.vaultDetailAddrBox}>
                        <Text style={styles.vaultDetailAddr} selectable numberOfLines={3}>{card.wallet_address}</Text>
                        <TouchableOpacity style={[styles.vaultDetailCopyBtn, copiedFull === card.id && styles.vaultCopyBtnDone]} onPress={() => handleCopyFull(card.wallet_address, card.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <MaterialIcons name={copiedFull === card.id ? 'check-circle' : 'content-copy'} size={15} color={copiedFull === card.id ? Colors.success : Colors.primary} />
                          <Text style={[styles.vaultDetailCopyText, copiedFull === card.id && { color: Colors.success }]}>{copiedFull === card.id ? 'Copied!' : 'Copy'}</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity style={styles.vaultShareBtn} onPress={() => handleShare(card)} activeOpacity={0.8}>
                        <MaterialIcons name="share" size={15} color="#3B82F6" />
                        <Text style={styles.vaultShareBtnText}>Share Address</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.vaultQrToggleBtn, qrVisibleId === card.id && styles.vaultQrToggleBtnActive]} onPress={() => setQrVisibleId(qrVisibleId === card.id ? null : card.id)} activeOpacity={0.8}>
                        <MaterialIcons name={qrVisibleId === card.id ? 'qr-code-2' : 'qr-code'} size={15} color={qrVisibleId === card.id ? Colors.bg : Colors.primary} />
                        <Text style={[styles.vaultQrToggleText, qrVisibleId === card.id && { color: Colors.bg }]}>{qrVisibleId === card.id ? 'Hide QR' : 'Show QR'}</Text>
                      </TouchableOpacity>
                      {qrVisibleId === card.id && (
                        <View style={styles.vaultQrBox}>
                          <View style={[styles.vaultQrInner, { paddingHorizontal: 16, paddingVertical: 12 }]}>
                            <MaterialIcons name="account-balance-wallet" size={40} color={Colors.bg} />
                          </View>
                          <Text style={styles.vaultQrLabel} numberOfLines={2}>{card.wallet_address.slice(0, 20)}…{card.wallet_address.slice(-8)}</Text>
                          <View style={styles.vaultQrBadge}>
                            <MaterialIcons name="security" size={9} color={Colors.primary} />
                            <Text style={styles.vaultQrBadgeText}>BTNG Sovereign Address</Text>
                          </View>
                        </View>
                      )}
                      <View style={styles.vaultDetailMetaRow}>
                        <View style={styles.vaultDetailMetaItem}>
                          <MaterialIcons name="event" size={12} color={Colors.textMuted} />
                          <View><Text style={styles.vaultDetailMetaLabel}>EXPIRES</Text><Text style={styles.vaultDetailMetaValue}>{card.expires || '—'}</Text></View>
                        </View>
                        <View style={styles.vaultDetailDivider} />
                        <View style={styles.vaultDetailMetaItem}>
                          <MaterialIcons name="workspace-premium" size={12} color={Colors.primary} />
                          <View><Text style={styles.vaultDetailMetaLabel}>TIER</Text><View style={styles.vaultTierBadge}><Text style={styles.vaultTierText}>{card.tier}</Text></View></View>
                        </View>
                        <View style={styles.vaultDetailDivider} />
                        <View style={styles.vaultDetailMetaItem}>
                          <MaterialIcons name="security" size={12} color={Colors.success} />
                          <View><Text style={styles.vaultDetailMetaLabel}>STATUS</Text><Text style={[styles.vaultDetailMetaValue, { color: Colors.success }]}>{card.status}</Text></View>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
            {filtered.length > PREVIEW_COUNT && (
              <TouchableOpacity style={styles.vaultShowMoreBtn} onPress={() => setExpanded(v => !v)} activeOpacity={0.75}>
                <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={16} color={Colors.primary} />
                <Text style={styles.vaultShowMoreText}>{expanded ? 'Show Less' : `Show All ${filtered.length}${selectedType !== 'all' ? ` ${TYPE_META[selectedType]?.label ?? ''}` : ''} Cards`}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ── Menu Sections ──────────────────────────────────────────────────────────────
const MENU_SECTIONS: {
  title: string;
  items: { icon: string; label: string; route: string | null; badge?: string; badgeColor?: string; toggle?: boolean }[];
}[] = [
  {
    title: 'Account',
    items: [
      { icon: 'edit', label: 'Edit Profile', route: '/edit-profile' },
      { icon: 'verified-user', label: 'KYC Verification', route: '/kyc', badge: 'Verified', badgeColor: '#22C55E' },
      { icon: 'security', label: '2FA Security', route: '/two-factor', toggle: true },
      { icon: 'lock', label: 'Change Password', route: '/edit-profile' },
      { icon: 'phone', label: 'Phone Verification', route: '/kyc', badge: 'Active', badgeColor: '#22C55E' },
      { icon: 'notifications', label: 'Notifications', route: '/notifications' },
    ],
  },
  {
    title: '🔐 Sovereign Engine',
    items: [
      { icon: 'security', label: 'Sovereign Engine Masterpiece v2.0', route: '/btng-sovereign-engine', badge: 'Triple-Key', badgeColor: '#9945FF' },
    ],
  },
  {
    title: '⚡ Product Engine',
    items: [
      { icon: 'auto-awesome', label: 'BTNG Product Engine', route: '/btng-product-engine', badge: 'Auto Machine', badgeColor: Colors.primary },
      { icon: 'whatshot', label: 'BTNG Minting Pipeline', route: '/btng-minting-pipeline', badge: 'btngd v1.0', badgeColor: '#D4A017' },
      { icon: 'verified-user', label: 'Verification Pipeline', route: '/btng-verification-pipeline', badge: 'Identity KYC', badgeColor: '#3B82F6' },
      { icon: 'hub', label: 'Pipeline Hub', route: '/btng-pipeline-hub', badge: '3 Kernels', badgeColor: '#9945FF' },
    ],
  },
  {
    title: '🌍 BTNG Sovereign Platform',
    items: [
      { icon: 'monetization-on', label: 'BTNG Genesis Wallet', route: '/btng-genesis', badge: 'Sovereign', badgeColor: '#D4A017' },
      { icon: 'account-balance-wallet', label: 'BTNG3 Wallet Generator', route: '/btng3-wallet', badge: 'Base58Check', badgeColor: '#22C55E' },
      { icon: 'dashboard', label: 'Sovereign Dashboard', route: '/btng-sovereign-dashboard', badge: 'All-in-One', badgeColor: Colors.primary },
      { icon: 'account-balance', label: 'BTNG Banking Engine', route: '/btng-bank', badge: 'Live', badgeColor: '#22C55E' },
      { icon: 'hub', label: 'Sovereign Node Dashboard', route: '/btng-node', badge: 'MAINNET', badgeColor: '#22C55E' },
      { icon: 'history', label: 'MTN MoMo Cash Rail', route: '/cash-rail', badge: 'Live Rail', badgeColor: '#22C55E' },
      { icon: 'description', label: 'Sovereign Documents', route: '/btng-sovereign-docs', badge: 'Certificates', badgeColor: '#D4A017' },
      { icon: 'qr-code-scanner', label: 'Certificate Scanner', route: '/cert-scanner', badge: 'Verify', badgeColor: '#3B82F6' },
      { icon: 'auto-awesome', label: 'Eternal Service', route: '/btng-eternal-service', badge: '♾️ Active', badgeColor: '#D4A017' },
      { icon: 'gavel', label: 'Governance Charter', route: '/btng-governance', badge: 'Circle', badgeColor: '#3B82F6' },
      { icon: 'developer-mode', label: 'BTNG SDK Package', route: '/btng-sdk', badge: 'UBL-1.0', badgeColor: '#3DDC84' },
      { icon: 'grid-on', label: 'BTNG Block', route: '/btng-sovereign-dashboard', badge: 'Block #0', badgeColor: '#D4A017' },
      { icon: 'workspace-premium', label: 'Proof of Value · Official Doc', route: '/btng-proof-of-value', badge: 'POV-2026', badgeColor: '#D4A017' },
      { icon: 'explore', label: 'BTNG Block Explorer', route: '/btng-explorer', badge: 'Live', badgeColor: '#22C55E' },
      { icon: 'rocket-launch', label: 'Node Deployment Guide', route: '/btng-deploy', badge: 'VPS Setup', badgeColor: '#3B82F6' },
      { icon: 'vpn-key', label: 'API Key Manager', route: '/btng-api-manager', badge: 'Credentials', badgeColor: '#F59E0B' },
      { icon: 'device-hub', label: 'Node Engine · BTNG + AFN', route: '/btng-node-engine', badge: 'Two-Token', badgeColor: '#9945FF' },
      { icon: 'code', label: 'Contract Deploy Package', route: '/btng-contract-deploy', badge: '3 Contracts', badgeColor: '#22C55E' },
      { icon: 'whatshot', label: 'Mobile Miner · Music Mining', route: '/btng-miner', badge: 'Block Truck', badgeColor: Colors.kenteGold },
      { icon: 'hub', label: 'Node Generator · 3 Tiers', route: '/btng-node-generator', badge: 'Light · Med · Heavy', badgeColor: '#3B82F6' },
      { icon: 'key', label: 'API Key Generator · On-chain', route: '/btng-api-key-generator', badge: '6 Scopes', badgeColor: Colors.primary },
      { icon: 'extension', label: 'API Extension · OAuth2 + SDK', route: '/btng-api-extension', badge: 'OAuth2 · Hooks', badgeColor: '#9945FF' },
    ],
  },
  {
    title: '🤖 AI & Intelligence',
    items: [
      { icon: 'psychology', label: 'AI Private Banker · 54 Nations', route: '/btng-private-banker', badge: 'Africa', badgeColor: '#22C55E' },
      { icon: 'smart-toy', label: 'AI Creator Studio', route: '/ai-creator', badge: 'Live', badgeColor: '#9945FF' },
      { icon: 'analytics', label: 'BTNG Global Panel', route: '/btng-global-panel', badge: 'FXOracle', badgeColor: '#3B82F6' },
      { icon: 'public', label: 'Africa Value Engine', route: '/africa-value-engine', badge: '$59.5T Sovereign', badgeColor: '#22C55E' },
      { icon: 'storefront', label: 'Africa Free Trade Zone', route: '/africa-free-trade', badge: 'AfCFTA · 54 Nations', badgeColor: '#22C55E' },
      { icon: 'show-chart', label: 'BTNG Global Terminal', route: '/btng-terminal', badge: 'Market', badgeColor: '#D4A017' },
    ],
  },
  {
    title: '🎨 NFT & Digital Assets',
    items: [
      { icon: 'collections', label: 'NFT Creator Studio', route: '/nft-creator', badge: 'Mint', badgeColor: '#9945FF' },
      { icon: 'workspace-premium', label: 'Reserve Certificate', route: '/cert-scanner', badge: 'Official', badgeColor: '#D4A017' },
      { icon: 'card-membership', label: 'BTNG ID Card', route: '/btng-card', badge: 'Identity', badgeColor: '#3B82F6' },
      { icon: 'credit-card', label: 'BTNG Gold Card', route: '/btng-card', badge: 'Active', badgeColor: '#22C55E' },
      { icon: 'military-tech', label: 'Equity Certificates', route: '/btng-sovereign-docs', badge: 'A–Z Tiers', badgeColor: '#22C55E' },
    ],
  },
  {
    title: '💹 Trading & Finance',
    items: [
      { icon: 'science', label: 'Practice Wallet', route: '/practice' },
      { icon: 'people', label: 'Copy Trading', route: '/copy-trading' },
      { icon: 'call-split', label: 'Binary Trading', route: '/binary-trading', badge: 'PRO', badgeColor: '#9945FF' },
      { icon: 'swap-horiz', label: 'P2P Marketplace', route: '/p2p' },
      { icon: 'calculate', label: 'Fee Calculator', route: '/fee-calculator' },
      { icon: 'bookmark', label: 'Watchlist & Alerts', route: '/watchlist' },
      { icon: 'currency-exchange', label: 'FX Converter', route: '/fx-converter' },
    ],
  },
  {
    title: '🧑‍💻 Developer Workspace',
    items: [
      { icon: 'construction', label: 'App Builder · Admin Center', route: '/app-builder', badge: 'Edit & Publish', badgeColor: Colors.primary },
      { icon: 'security', label: 'Sovereign Engine v2.0', route: '/btng-sovereign-engine', badge: 'Triple-Key', badgeColor: '#9945FF' },
      { icon: 'code', label: 'Developer Library', route: '/developer', badge: 'BTNG Dev', badgeColor: Colors.primary },
      { icon: 'developer-mode', label: 'Dev Settings', route: '/admin', badge: 'Admin Only', badgeColor: Colors.warning },
      { icon: 'bug-report', label: 'API Manager', route: '/btng-api-manager', badge: 'Credentials', badgeColor: '#F59E0B' },
      { icon: 'source', label: 'BTNG SDK Package', route: '/btng-sdk', badge: 'UBL-1.0', badgeColor: '#3DDC84' },
    ],
  },
  {
    title: '',
    items: [
      { icon: 'credit-card', label: 'BTNG Gold Card', route: '/btng-card', badge: '4 Cards', badgeColor: Colors.primary },
      { icon: 'payments', label: 'BTNG Pay Gateway', route: '/btng-pay', badge: 'Live', badgeColor: '#22C55E' },
      { icon: 'arrow-downward', label: 'Deposit Funds', route: '/deposit' },
      { icon: 'arrow-upward', label: 'Withdraw Funds', route: '/withdraw' },
      { icon: 'swap-horiz', label: 'Transfer', route: '/transfer' },
    ],
  },
  {
    title: '👥 Community & Referral',
    items: [
      { icon: 'share', label: 'Referral Program', route: '/referral' },
      { icon: 'card-giftcard', label: 'My Rewards', route: '/referral' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { icon: 'language', label: 'Display Currency', route: '/currency-selector' },
    ],
  },
  {
    title: 'Support',
    items: [
      { icon: 'help-outline', label: 'Help Center', route: '/support-chat' },
      { icon: 'article', label: 'Blog & News', route: '/blog' },
      { icon: 'contact-support', label: 'Contact Us', route: '/contact' },
      { icon: 'privacy-tip', label: 'Privacy Policy', route: '/privacy-policy' },
      { icon: 'gavel', label: 'Terms of Service', route: '/terms' },
    ],
  },
];

// ── Main Profile Screen ────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, isAdmin } = useAuth();
  const { showAlert } = useAlert();
  const [dims, setDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub?.remove();
  }, []);
  const isTablet = dims.width >= 768;
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const { selectedCurrency } = useCurrency();

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    try {
      import('@/services/twoFactorService')
        .then(mod => { if (typeof mod?.fetchTwoFA !== 'function') return; return mod.fetchTwoFA(user.id!); })
        .then((res: any) => { if (!cancelled && res?.data?.enabled) setTwoFAEnabled(true); })
        .catch(() => {});
    } catch (_) {}
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleLogout = () => {
    showAlert('Sign Out', 'Are you sure you want to sign out of BTNG?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => { logout(); router.replace('/login'); } },
    ]);
  };

  const handleMenuPress = (item: any) => {
    if (item.route) { router.push(item.route as any); return; }
    showAlert(item.label, 'This feature is coming soon in the next BTNG update.');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: isTablet ? Spacing.xl : 0 }}>

        {/* BituncoinOS Identity Banner */}
        <View style={styles.btngOsBanner}>
          <View style={styles.btngOsBannerLeft}>
            <View style={styles.btngOsCoinWrap}>
              <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.btngOsTitleRow}>
                <Text style={styles.btngOsTitle}>BituncoinOS</Text>
                <View style={styles.btngOsLiveBadge}>
                  <View style={styles.btngOsLiveDot} />
                  <Text style={styles.btngOsLiveBadgeText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.btngOsSub}>Sovereign Banking Operating System</Text>
              <Text style={styles.btngOsTagline}>Ghana · 54 Africa Nations · Global Diaspora</Text>
            </View>
          </View>
          <View style={styles.btngOsStatsCol}>
            <View style={styles.btngOsStatRow}><MaterialIcons name="account-balance" size={10} color={Colors.primary} /><Text style={styles.btngOsStatText}>$59.5T Sovereign</Text></View>
            <View style={styles.btngOsStatRow}><MaterialIcons name="public" size={10} color={Colors.africanGreen} /><Text style={[styles.btngOsStatText, { color: Colors.africanGreen }]}>AfCFTA · 54 Nations</Text></View>
            <View style={styles.btngOsStatRow}><MaterialIcons name="memory" size={10} color="#9945FF" /><Text style={[styles.btngOsStatText, { color: '#9945FF' }]}>A.I.A Engine v1.0</Text></View>
          </View>
        </View>

        {/* OS Quick-Launch Strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.osLaunchStrip} style={styles.osLaunchScroll}>
          {[
            { emoji: '🏦', label: 'Genesis\nWallet', color: Colors.primary, route: '/btng-genesis' },
            { emoji: '₿3', label: 'BTNG3\nWallet', color: '#22C55E', route: '/btng3-wallet' },
            { emoji: '🔐', label: 'BTNG\nWallet', color: '#D4A017', route: '/btng-wallet-generate' },
            { emoji: '🏧', label: 'MB\nBanking', color: '#22C55E', route: '/btng-mobile-banking' },
            { emoji: '💳', label: 'Gold\nCard', color: '#D4A017', route: '/btng-card' },
            { emoji: '🌍', label: 'Free\nTrade', color: '#22C55E', route: '/africa-free-trade' },
            { emoji: '🔗', label: 'Block\nExplorer', color: '#3B82F6', route: '/btng-explorer' },
            { emoji: '💰', label: 'Cash\nRail', color: '#F59E0B', route: '/cash-rail' },
            { emoji: '🤖', label: 'AI\nBanker', color: '#9945FF', route: '/btng-private-banker' },
            { emoji: '⚡', label: 'Product\nEngine', color: Colors.primary, route: '/btng-product-engine' },
            { emoji: '⛏', label: 'Minting\nPipeline', color: '#D4A017', route: '/btng-minting-pipeline' },
            { emoji: '🔐', label: 'Verify\nID', color: '#3B82F6', route: '/btng-verification-pipeline' },
            { emoji: '🛰️', label: 'Pipeline\nHub', color: '#9945FF', route: '/btng-pipeline-hub' },
            { emoji: '🛡️', label: 'Sovereign\nEngine', color: '#9945FF', route: '/btng-sovereign-engine' },
          ].map(item => (
            <TouchableOpacity key={item.label} style={styles.osLaunchBtn} onPress={() => router.push(item.route as any)} activeOpacity={0.8}>
              <View style={[styles.osLaunchIconWrap, { borderColor: item.color + '55', backgroundColor: item.color + '15' }]}>
                <Text style={styles.osLaunchEmoji}>{item.emoji}</Text>
              </View>
              <Text style={[styles.osLaunchLabel, { color: item.color }]} numberOfLines={2}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          {isAdmin && (
            <TouchableOpacity style={styles.adminBtn} onPress={() => router.push('/admin')}>
              <MaterialIcons name="admin-panel-settings" size={16} color={Colors.primary} />
              <Text style={styles.adminBtnText}>Admin</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Profile Card */}
        <View style={[styles.profileCard, isTablet && styles.profileCardTablet]}>
          <View style={styles.avatarContainer}>
            {user?.avatar_url && user.avatar_url.startsWith('http')
              ? <Image source={{ uri: user.avatar_url }} style={styles.avatar} contentFit="cover" transition={200} />
              : user?.avatar_url && !user.avatar_url.startsWith('http')
                ? <View style={[styles.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgElevated }]}><Text style={{ fontSize: 38 }}>{user.avatar_url}</Text></View>
                : <Image source={require('@/assets/images/btng_coin_logo.jpg')} style={styles.avatar} contentFit="cover" transition={200} />
            }
            <View style={styles.avatarBadge}>
              <MaterialIcons name="verified" size={14} color={Colors.primary} />
            </View>
          </View>
          <Text style={styles.userName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{user?.full_name ?? user?.username ?? 'BTNG User'}</Text>
          <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
          <View style={styles.tierBadge}>
            <Text style={styles.tierIcon}>🥇</Text>
            <Text style={styles.tierText}>{(user as any)?.tier ?? 'Gold'} Member</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}><Text style={styles.statValue} numberOfLines={1}>{(user as any)?.referralCount ?? 0}</Text><Text style={styles.statLabel}>Referrals</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>${((user as any)?.referralEarned ?? 0).toLocaleString()}</Text><Text style={styles.statLabel}>Earned</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={[styles.statValue, { color: Colors.success }]} numberOfLines={1}>+{(user as any)?.totalPnLPct ?? 0}%</Text><Text style={styles.statLabel}>All PnL</Text></View>
          </View>
          <TouchableOpacity style={styles.referralCard} onPress={() => showAlert('Referral Code', `Your code: ${(user as any)?.referralCode ?? 'BTNG-2024'}\nShare and earn 2% of every trade your friends make.`)}>
            <View>
              <Text style={styles.referralLabel}>Your Referral Code</Text>
              <Text style={styles.referralCode}>{(user as any)?.referralCode ?? 'BTNG-2024'}</Text>
            </View>
            <View style={styles.referralShare}><MaterialIcons name="share" size={18} color={Colors.primary} /></View>
          </TouchableOpacity>
        </View>

        {/* Admin Banner */}
        {isAdmin && (
          <TouchableOpacity style={styles.adminBanner} onPress={() => router.push('/admin')} activeOpacity={0.85}>
            <View style={styles.adminBannerLeft}>
              <View style={styles.adminBannerIconWrap}><MaterialIcons name="admin-panel-settings" size={28} color={Colors.primary} /></View>
              <View style={styles.adminBannerText}>
                <View style={styles.adminBannerTitleRow}>
                  <Text style={styles.adminBannerTitle}>Admin Dashboard</Text>
                  <View style={styles.adminLiveBadge}><View style={styles.adminLiveDot} /><Text style={styles.adminLiveBadgeText}>BANK MANAGER</Text></View>
                </View>
                <Text style={styles.adminBannerSub}>John Kojo Zi · Bituncoin Gold Bank Manager</Text>
              </View>
            </View>
            <View style={styles.adminBannerArrow}><MaterialIcons name="arrow-forward-ios" size={16} color={Colors.primary} /></View>
          </TouchableOpacity>
        )}

        {/* Creator Row */}
        <View style={styles.creatorRow}>
          {[
            { icon: 'collections', label: 'NFT', sub: 'Creator Studio', color: '#9945FF', route: '/nft-creator', badge: 'MINT' },
            { icon: 'smart-toy',   label: 'AI',  sub: 'Private Banker', color: Colors.primary, route: '/btng-private-banker', badge: '54 NATIONS' },
            { icon: 'all-inclusive', label: '♾️', sub: 'Eternal Service', color: '#22C55E', route: '/btng-eternal-service', badge: 'ACTIVE' },
          ].map(c => (
            <TouchableOpacity key={c.label} style={[styles.creatorCard, { borderColor: c.color + '55' }]} onPress={() => router.push(c.route as any)} activeOpacity={0.85}>
              <View style={[styles.creatorIconWrap, { backgroundColor: c.color + '18', borderColor: c.color + '44' }]}>
                <MaterialIcons name={c.icon as any} size={26} color={c.color} />
              </View>
              <Text style={[styles.creatorTitle, { color: c.color }]}>{c.label}</Text>
              <Text style={styles.creatorSub}>{c.sub}</Text>
              <View style={[styles.creatorBadge, { backgroundColor: c.color + '18', borderColor: c.color + '44' }]}>
                <Text style={[styles.creatorBadgeText, { color: c.color }]}>{c.badge}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sovereign Row */}
        <View style={styles.sovereignRow}>
          {[
            { emoji: '🌍', label: 'Global Panel', sub: 'FXOracle · BRICS · Africa', color: '#3B82F6', route: '/btng-global-panel' },
            { emoji: '💎', label: 'Value Engine', sub: '$59.5T · 54 Nations', color: '#22C55E', route: '/africa-value-engine' },
            { emoji: '📊', label: 'Terminal', sub: 'Spot · List · Market', color: Colors.primary, route: '/btng-terminal' },
            { emoji: '🔗', label: 'Reserve API', sub: '/btng-reserve-status', color: '#9945FF', route: '/btng-node' },
            { emoji: '🏦', label: 'Sovereign Chain', sub: 'Genesis · Feb 2026', color: '#D4A017', route: '/btng-sovereign-dashboard' },
          ].map(item => (
            <TouchableOpacity key={item.label} style={[styles.sovereignCard, { borderColor: item.color + '44' }]} onPress={() => router.push(item.route as any)} activeOpacity={0.8}>
              <Text style={styles.sovereignEmoji}>{item.emoji}</Text>
              <Text style={[styles.sovereignLabel, { color: item.color }]}>{item.label}</Text>
              <Text style={styles.sovereignSub} numberOfLines={1}>{item.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* HD Vault Cards */}
        <SafeSection fallback={null}>
          <HDVaultCards userId={user?.id} />
        </SafeSection>

        {/* BTNG Wallet Generator Card */}
        <SafeSection fallback={null}>
          <BTNGWalletGeneratorCard />
        </SafeSection>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section, si) => (
          <View key={section.title + si} style={[styles.menuSection, isTablet && styles.menuSectionTablet]}>
            {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
            <View style={styles.menuCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label + idx}
                  style={[styles.menuItem, idx < section.items.length - 1 && styles.menuItemBorder, isTablet && styles.menuItemTablet]}
                  onPress={() => handleMenuPress(item)}
                  activeOpacity={0.75}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={[styles.menuIcon, (item.label === 'BTNG Genesis Wallet' || item.label === 'BTNG Block') && styles.menuIconGold]}>
                      <MaterialIcons name={item.icon as any} size={18} color={Colors.primary} />
                    </View>
                    <View style={styles.menuLabelWrap}>
                      <Text style={[styles.menuLabel, (item.label === 'BTNG Genesis Wallet' || item.label === 'BTNG Block') && { color: Colors.primary }]}>{item.label}</Text>
                      {item.label === 'BTNG Genesis Wallet' && <Text style={styles.menuSubLabel}>Sovereign Wallet</Text>}
                      {item.label === 'BTNG Block' && <Text style={styles.menuSubLabel}>Genesis Block #0 · BTNG Chain</Text>}
                    </View>
                  </View>
                  {(item.label === 'BTNG Genesis Wallet' || item.label === 'BTNG Block') ? (
                    <View style={styles.genesisRight}>
                      {item.label === 'BTNG Genesis Wallet' && <SafeSection fallback={<View />}><WalletStatusDot /></SafeSection>}
                      <MaterialIcons name="chevron-right" size={18} color={Colors.primary} />
                    </View>
                  ) : item.label === 'Display Currency' ? (
                    <View style={styles.currencyChip}>
                      <Text style={styles.currencyChipFlag}>{selectedCurrency.flag}</Text>
                      <Text style={styles.currencyChipCode}>{selectedCurrency.code}</Text>
                    </View>
                  ) : item.toggle ? (
                    <Switch value={twoFAEnabled} onValueChange={setTwoFAEnabled} trackColor={{ false: Colors.bgElevated, true: Colors.primary }} thumbColor="#fff" />
                  ) : item.badge ? (
                    <View style={[styles.menuBadge, { backgroundColor: (item.badgeColor ?? Colors.primary) + '22', borderColor: (item.badgeColor ?? Colors.primary) + '44' }]}>
                      <Text style={[styles.menuBadgeText, { color: item.badgeColor ?? Colors.primary }]}>{item.badge}</Text>
                    </View>
                  ) : (
                    <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Version Strip */}
        <View style={styles.buildStrip}>
          <View style={styles.buildStripLeft}>
            <View style={styles.buildLiveDot} />
            <Text style={styles.buildText}>BTNG Gold Coin v2.0.0</Text>
          </View>
          <Text style={styles.buildSub}>Ghana · 54 Africa Nations · BTNG Mainnet</Text>
        </View>

        {/* Logout */}
        <View style={styles.logoutSection}>
          <BTNGButton title="Sign Out" onPress={handleLogout} variant="outline" size="lg" fullWidth />
          <Text style={styles.versionText}>© 2024–2026 EKUYE DIGITAL GATEWAY TRUST LTD · Reg. CS099020624</Text>
        </View>

      </ScrollView>
    </View>
  );
}
