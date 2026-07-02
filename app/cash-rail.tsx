// BTNG Cash Rail — MTN MoMo Merchant Gateway
// Transaction history · Stats · Add · Export CSV · Status management
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Animated, Platform,
  Modal, KeyboardAvoidingView, ScrollView, Share,
} from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAlert } from '@/template';
import { useCashRail } from '@/hooks/useCashRail';
import {
  CashRailTransaction, StatusFilter, TransactionStatus,
  formatGHS, formatCompactGHS, insertCashRailTransaction, batchUpdateTransactionStatus,
} from '@/services/cashRailService';
import { BTNG_MERCHANT } from '@/constants/merchantConfig';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<TransactionStatus, { label: string; color: string; bg: string; icon: string }> = {
  completed: { label: 'Completed', color: Colors.success, bg: Colors.successBg, icon: 'check-circle' },
  pending:   { label: 'Pending',   color: Colors.warning, bg: Colors.warningBg, icon: 'access-time' },
  failed:    { label: 'Failed',    color: Colors.error,   bg: Colors.errorBg,   icon: 'cancel' },
};

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'pending',   label: 'Pending' },
  { key: 'failed',    label: 'Failed' },
];

function formatDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

function maskMsisdn(msisdn: string): string {
  const digits = msisdn.replace(/\D/g, '');
  if (digits.length < 7) return msisdn;
  const visible = digits.slice(-4);
  const mask = '•'.repeat(digits.length - 4);
  return `+${mask}${visible}`;
}

// ── Stats Row ─────────────────────────────────────────────────────────────────
function StatsRow({ stats, loading }: { stats: ReturnType<typeof useCashRail>['stats']; loading: boolean }) {
  if (loading || !stats) {
    return (
      <View style={crStyles.statsLoading}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={crStyles.statsLoadingText}>Loading stats…</Text>
      </View>
    );
  }
  const items = [
    { label: 'Total Vol.',   value: `GHS ${formatCompactGHS(stats.completedVolumeGHS)}`, color: Colors.success,  icon: 'trending-up'    as const },
    { label: 'Transactions', value: String(stats.total),                                  color: Colors.primary,  icon: 'receipt-long'   as const },
    { label: 'Pending',      value: String(stats.pending),                                color: Colors.warning,  icon: 'access-time'    as const },
    { label: 'Failed',       value: String(stats.failed),                                 color: Colors.error,    icon: 'error-outline'  as const },
  ];
  return (
    <View style={crStyles.statsRow}>
      {items.map(item => (
        <View key={item.label} style={crStyles.statCard}>
          <View style={[crStyles.statIconWrap, { backgroundColor: item.color + '20' }]}>
            <MaterialIcons name={item.icon} size={14} color={item.color} />
          </View>
          <Text style={[crStyles.statValue, { color: item.color }]}>{item.value}</Text>
          <Text style={crStyles.statLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Merchant Badge Card (replaces QR — no native lib needed) ──────────────────
function MerchantBadgeCard() {
  const { showAlert } = useAlert();
  const msisdn = BTNG_MERCHANT.msisdn;
  const merchantId = BTNG_MERCHANT.merchantId;
  const [expanded, setExpanded] = useState(false);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: [
          '🏦 BTNG MTN MoMo Merchant',
          '',
          `Merchant: ${BTNG_MERCHANT.legalName}`,
          `Merchant ID: ${merchantId}`,
          `MSISDN: ${msisdn}`,
          `Currency: ${BTNG_MERCHANT.currency}`,
          `Network: MTN MoMo · Ghana`,
          '',
          'To pay: Open MTN MoMo → Pay Merchant → enter ID above',
          '',
          'Powered by BTNG · Ekuye Digital Gateway Trust Ltd',
        ].join('\n'),
        title: 'BTNG Merchant Details',
      });
    } catch { /* cancelled */ }
  }, [msisdn, merchantId]);

  const handleCopyMerchantId = useCallback(() => {
    ExpoClipboard.setStringAsync(merchantId).catch(()=>{});
    showAlert('Copied', `Merchant ID ${merchantId} copied to clipboard.`);
  }, [merchantId, showAlert]);

  const handleCopyMsisdn = useCallback(() => {
    ExpoClipboard.setStringAsync(msisdn).catch(()=>{});
    showAlert('Copied', `MSISDN ${msisdn} copied to clipboard.`);
  }, [msisdn, showAlert]);

  return (
    <View style={mqStyles.card}>
      <TouchableOpacity style={mqStyles.headerRow} onPress={() => setExpanded(v => !v)} activeOpacity={0.85}>
        <View style={mqStyles.headerLeft}>
          <View style={mqStyles.iconWrap}>
            <MaterialIcons name="store" size={20} color={Colors.warning} />
          </View>
          <View>
            <Text style={mqStyles.cardTitle}>Merchant Details</Text>
            <Text style={mqStyles.cardSub}>MTN MoMo · Tap to expand · Share with payers</Text>
          </View>
        </View>
        <View style={mqStyles.headerRight}>
          <View style={mqStyles.livePill}>
            <View style={mqStyles.liveDot} />
            <Text style={mqStyles.livePillText}>ACTIVE</Text>
          </View>
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={mqStyles.body}>
          {/* Branded card */}
          <View style={mqStyles.brandCard}>
            {/* Header */}
            <View style={mqStyles.brandHeader}>
              <View style={mqStyles.brandLogoRow}>
                <View style={mqStyles.coinCircle}>
                  <Text style={mqStyles.coinSymbol}>₿</Text>
                </View>
                <View>
                  <Text style={mqStyles.brandName}>BITUNCOIN GOLD</Text>
                  <Text style={mqStyles.brandTag}>BTNG · Sovereign Digital Currency</Text>
                </View>
              </View>
              <Text style={mqStyles.ghsFlag}>🇬🇭</Text>
            </View>

            {/* Merchant name */}
            <View style={mqStyles.merchantSection}>
              <Text style={mqStyles.merchantLabel}>VERIFIED MERCHANT</Text>
              <Text style={mqStyles.merchantLegalName}>{BTNG_MERCHANT.legalName}</Text>
            </View>

            {/* IDs */}
            <View style={mqStyles.idsSection}>
              <View style={mqStyles.idRow}>
                <View style={mqStyles.idLabelWrap}>
                  <MaterialIcons name="tag" size={12} color={Colors.warning} />
                  <Text style={mqStyles.idLabel}>Merchant ID</Text>
                </View>
                <View style={mqStyles.idValueWrap}>
                  <Text style={mqStyles.idValue}>{merchantId}</Text>
                  <TouchableOpacity style={mqStyles.copyBtn} onPress={handleCopyMerchantId} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <MaterialIcons name="content-copy" size={12} color={Colors.warning} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[mqStyles.idRow, { borderTopWidth: 1, borderTopColor: Colors.warning + '22' }]}>
                <View style={mqStyles.idLabelWrap}>
                  <MaterialIcons name="phone" size={12} color={Colors.warning} />
                  <Text style={mqStyles.idLabel}>MSISDN</Text>
                </View>
                <View style={mqStyles.idValueWrap}>
                  <Text style={mqStyles.idValue}>{msisdn}</Text>
                  <TouchableOpacity style={mqStyles.copyBtn} onPress={handleCopyMsisdn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <MaterialIcons name="content-copy" size={12} color={Colors.warning} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={[mqStyles.idRow, { borderTopWidth: 1, borderTopColor: Colors.warning + '22' }]}>
                <View style={mqStyles.idLabelWrap}>
                  <MaterialIcons name="cell-tower" size={12} color={Colors.warning} />
                  <Text style={mqStyles.idLabel}>Network</Text>
                </View>
                <Text style={[mqStyles.idValue, { color: Colors.warning }]}>MTN MoMo · Ghana</Text>
              </View>

              <View style={[mqStyles.idRow, { borderTopWidth: 1, borderTopColor: Colors.warning + '22' }]}>
                <View style={mqStyles.idLabelWrap}>
                  <MaterialIcons name="payments" size={12} color={Colors.warning} />
                  <Text style={mqStyles.idLabel}>Currency</Text>
                </View>
                <Text style={[mqStyles.idValue, { color: Colors.success }]}>{BTNG_MERCHANT.currency} (Ghanaian Cedi)</Text>
              </View>
            </View>

            {/* Instructions */}
            <View style={mqStyles.instructionBox}>
              <MaterialIcons name="info-outline" size={13} color={Colors.primary} />
              <Text style={mqStyles.instructionText}>
                Open MTN MoMo → Pay Merchant → Enter Merchant ID <Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>{merchantId}</Text> → Enter amount → Confirm
              </Text>
            </View>

            {/* Sovereign bar */}
            <View style={mqStyles.sovereignBar}>
              <MaterialIcons name="verified" size={11} color={Colors.success} />
              <Text style={mqStyles.sovereignText}>Verified Merchant · Ekuye Digital Gateway Trust Ltd · Ghana</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={mqStyles.actionsRow}>
            <TouchableOpacity style={mqStyles.actionBtn} onPress={handleShare} activeOpacity={0.8}>
              <MaterialIcons name="share" size={16} color={Colors.primary} />
              <Text style={mqStyles.actionBtnText}>Share Details</Text>
            </TouchableOpacity>
            <View style={mqStyles.actionDivider} />
            <TouchableOpacity style={mqStyles.actionBtn} onPress={handleCopyMerchantId} activeOpacity={0.8}>
              <MaterialIcons name="content-copy" size={16} color={Colors.warning} />
              <Text style={[mqStyles.actionBtnText, { color: Colors.warning }]}>Copy ID</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const mqStyles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.warning + '55', overflow: 'hidden', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardSub: { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  livePillText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },
  body: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.warning + '33', paddingTop: Spacing.md },
  brandCard: { backgroundColor: '#100800', borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.warning + '77', overflow: 'hidden' },
  brandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, backgroundColor: Colors.warning + '18', borderBottomWidth: 1, borderBottomColor: Colors.warning + '33' },
  brandLogoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  coinCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  coinSymbol: { fontSize: 18, color: Colors.primary, includeFontPadding: false },
  brandName: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.5, includeFontPadding: false },
  brandTag: { fontSize: 9, color: Colors.warning + 'aa', includeFontPadding: false, marginTop: 1 },
  ghsFlag: { fontSize: 22 },
  merchantSection: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, gap: 4, borderBottomWidth: 1, borderBottomColor: Colors.warning + '22' },
  merchantLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 1.5, includeFontPadding: false },
  merchantLegalName: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  idsSection: { paddingHorizontal: Spacing.md },
  idRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm + 3 },
  idLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  idLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  idValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  idValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  copyBtn: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '44', alignItems: 'center', justifyContent: 'center' },
  instructionBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.primaryGlow, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderTopWidth: 1, borderTopColor: Colors.warning + '22' },
  instructionText: { flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  sovereignBar: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center', backgroundColor: Colors.successBg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.success + '22' },
  sovereignText: { fontSize: 9, fontWeight: FontWeight.semibold, color: Colors.success, includeFontPadding: false },
  actionsRow: { flexDirection: 'row', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: Spacing.md },
  actionDivider: { width: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
});

// ── Transaction Card ──────────────────────────────────────────────────────────
function TransactionCard({
  item, onUpdateStatus, isAdmin,
  selectionMode, isSelected, onLongPress, onToggleSelect,
}: {
  item: CashRailTransaction;
  onUpdateStatus: (id: string, status: TransactionStatus) => Promise<void>;
  isAdmin: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onLongPress: () => void;
  onToggleSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState<'ref' | 'msisdn' | null>(null);
  const [sharing, setSharing] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const checkScaleAnim = useRef(new Animated.Value(0)).current;

  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
  const { date, time } = formatDate(item.created_at);

  React.useEffect(() => {
    Animated.spring(checkScaleAnim, {
      toValue: selectionMode ? 1 : 0,
      useNativeDriver: true,
      tension: 160,
      friction: 10,
    }).start();
  }, [selectionMode, checkScaleAnim]);

  const toggleExpand = useCallback(() => {
    if (selectionMode) { onToggleSelect(); return; }
    const next = !expanded;
    setExpanded(next);
    Animated.timing(rotateAnim, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [expanded, rotateAnim, selectionMode, onToggleSelect]);

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const handleCopy = useCallback((val: string, type: 'ref' | 'msisdn') => {
    ExpoClipboard.setStringAsync(val).catch(()=>{});
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleShareReceipt = useCallback(async () => {
    setSharing(true);
    try {
      const { date: d, time: t } = formatDate(item.created_at);
      await Share.share({
        message: [
          '🏦 BTNG Payment Receipt',
          '━━━━━━━━━━━━━━━━━━━━━━━━',
          `Merchant: ${BTNG_MERCHANT.legalName}`,
          `Merchant ID: ${item.merchant_id}`,
          `MSISDN: ${BTNG_MERCHANT.msisdn}`,
          '━━━━━━━━━━━━━━━━━━━━━━━━',
          `AMOUNT: GHS ${formatGHS(item.amount_ghs)}`,
          `Status: ${item.status.toUpperCase()}`,
          '━━━━━━━━━━━━━━━━━━━━━━━━',
          `Reference: ${item.reference_id}`,
          `Payer: ${item.payer_name || '—'}`,
          `MSISDN: ${item.payer_msisdn}`,
          `Network: ${item.network}`,
          `Date: ${d}, ${t}`,
          ...(item.note ? [`Note: ${item.note}`] : []),
          '━━━━━━━━━━━━━━━━━━━━━━━━',
          'Powered by BTNG · Ekuye Digital Gateway Trust Ltd',
          'Ghana · Africa · Sovereign Finance',
        ].join('\n'),
        title: `BTNG Receipt · ${item.reference_id}`,
      });
    } catch { /* cancelled */ } finally { setSharing(false); }
  }, [item]);

  const handleStatusChange = useCallback(async (newStatus: TransactionStatus) => {
    if (newStatus === item.status) return;
    setUpdating(true);
    await onUpdateStatus(item.id, newStatus);
    setUpdating(false);
  }, [item.id, item.status, onUpdateStatus]);

  const shortRef = item.reference_id.length > 20
    ? `${item.reference_id.slice(0, 18)}…`
    : item.reference_id;

  return (
    <View style={[crStyles.txCard, expanded && !selectionMode && crStyles.txCardExpanded, isSelected && crStyles.txCardSelected]}>
      <TouchableOpacity
        style={[crStyles.txMain, isSelected && crStyles.txMainSelected]}
        onPress={toggleExpand}
        onLongPress={onLongPress}
        delayLongPress={450}
        activeOpacity={0.85}
      >
        <Animated.View style={[crStyles.txCheckboxWrap, { transform: [{ scale: checkScaleAnim }], opacity: checkScaleAnim }]}>
          <TouchableOpacity
            style={[crStyles.txCheckbox, isSelected && crStyles.txCheckboxSelected]}
            onPress={onToggleSelect}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isSelected && <MaterialIcons name="check" size={12} color={Colors.bg} />}
          </TouchableOpacity>
        </Animated.View>

        <View style={[crStyles.txStatusStripe, { backgroundColor: cfg.color }]} />

        <View style={crStyles.txBody}>
          <View style={crStyles.txRow1}>
            <View style={crStyles.txNameWrap}>
              <View style={[crStyles.txAvatarDot, { backgroundColor: cfg.color + '33', borderColor: cfg.color + '66' }]}>
                <MaterialIcons name="phone-android" size={11} color={cfg.color} />
              </View>
              <View style={{ flex: 1 }}>
                {item.payer_name ? <Text style={crStyles.txName} numberOfLines={1}>{item.payer_name}</Text> : null}
                <Text style={crStyles.txMsisdn} numberOfLines={1}>{maskMsisdn(item.payer_msisdn)}</Text>
              </View>
            </View>
            <View style={crStyles.txAmountWrap}>
              <Text style={[crStyles.txAmount, {
                color: item.status === 'failed' ? Colors.error
                  : item.status === 'pending' ? Colors.warning
                  : Colors.success,
              }]}>
                {item.status === 'failed' ? '—' : `+${formatGHS(item.amount_ghs)}`}
              </Text>
              <Text style={crStyles.txCurrency}>GHS</Text>
            </View>
          </View>

          <View style={crStyles.txRow2}>
            <View style={crStyles.txRefChip}>
              <MaterialIcons name="tag" size={9} color={Colors.textMuted} />
              <Text style={crStyles.txRefText} numberOfLines={1}>{shortRef}</Text>
            </View>
            <View style={crStyles.txRow2Right}>
              <View style={[crStyles.txStatusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '55' }]}>
                <MaterialIcons name={cfg.icon as any} size={9} color={cfg.color} />
                <Text style={[crStyles.txStatusText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              <Text style={crStyles.txDate}>{date} · {time}</Text>
            </View>
          </View>
        </View>

        {!selectionMode && (
          <Animated.View style={{ transform: [{ rotate }], marginLeft: 4 }}>
            <MaterialIcons name="expand-more" size={16} color={Colors.textMuted} />
          </Animated.View>
        )}
      </TouchableOpacity>

      {expanded && !selectionMode && (
        <View style={crStyles.txDetail}>
          <View style={crStyles.txDetailDivider} />

          {[
            { label: 'Transaction ID', value: item.id,            mono: true },
            { label: 'Payer MSISDN',   value: item.payer_msisdn,  mono: true, copyKey: 'msisdn' as const },
            { label: 'Reference ID',   value: item.reference_id,  mono: true, copyKey: 'ref'    as const },
            { label: 'Network',        value: item.network },
            { label: 'Merchant ID',    value: item.merchant_id,   mono: true },
            { label: 'Amount',         value: `GHS ${formatGHS(item.amount_ghs)}` },
            ...(item.note ? [{ label: 'Note', value: item.note }] : []),
            { label: 'Created',        value: new Date(item.created_at).toLocaleString('en-GB') },
          ].map(field => (
            <View key={field.label} style={crStyles.detailRow}>
              <Text style={crStyles.detailLabel}>{field.label}</Text>
              <View style={crStyles.detailValueRow}>
                <Text style={[crStyles.detailValue, field.mono && crStyles.detailValueMono]} numberOfLines={2} selectable>
                  {field.value}
                </Text>
                {field.copyKey ? (
                  <TouchableOpacity
                    style={[crStyles.copyChip, copied === field.copyKey && crStyles.copyChipDone]}
                    onPress={() => handleCopy(field.value, field.copyKey!)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MaterialIcons name={copied === field.copyKey ? 'check' : 'copy-all'} size={10} color={copied === field.copyKey ? Colors.success : Colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}

          {/* Share Receipt */}
          <TouchableOpacity
            style={[crStyles.shareReceiptBtn, sharing && { opacity: 0.6 }]}
            onPress={handleShareReceipt}
            disabled={sharing}
            activeOpacity={0.85}
          >
            {sharing
              ? <ActivityIndicator size="small" color={Colors.bg} />
              : <MaterialIcons name="share" size={16} color={Colors.bg} />}
            <Text style={crStyles.shareReceiptText}>{sharing ? 'Sharing…' : 'Share Receipt'}</Text>
          </TouchableOpacity>

          {/* Admin status controls */}
          {isAdmin && (
            <View style={crStyles.statusControls}>
              <View style={crStyles.statusControlsLabel}>
                <MaterialIcons name="admin-panel-settings" size={11} color={Colors.warning} />
                <Text style={crStyles.statusControlsLabelText}>Update Status</Text>
                {updating && <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 6 }} />}
              </View>
              <View style={crStyles.statusBtns}>
                {(['pending', 'completed', 'failed'] as TransactionStatus[]).map(s => {
                  const c = STATUS_CONFIG[s];
                  const isActive = item.status === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[crStyles.statusBtn, { borderColor: c.color + (isActive ? 'aa' : '44') }, isActive && { backgroundColor: c.bg }]}
                      onPress={() => handleStatusChange(s)}
                      disabled={updating || isActive}
                      activeOpacity={0.75}
                    >
                      <MaterialIcons name={c.icon as any} size={12} color={c.color} />
                      <Text style={[crStyles.statusBtnText, { color: c.color }]}>{c.label}</Text>
                      {isActive && <MaterialIcons name="check" size={10} color={c.color} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Floating Selection Bar ────────────────────────────────────────────────────
function FloatingSelectionBar({
  selectedCount, totalCount, onMarkCompleted, onMarkFailed,
  onExportCSV, onSelectAll, onClearSelection, batchLoading, exportingCSV, bottomInset,
}: {
  selectedCount: number; totalCount: number;
  onMarkCompleted: () => void; onMarkFailed: () => void;
  onExportCSV: () => void; onSelectAll: () => void;
  onClearSelection: () => void; batchLoading: boolean;
  exportingCSV: boolean; bottomInset: number;
}) {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const anyBusy = batchLoading || exportingCSV;

  return (
    <View style={[fabBarStyles.container, { paddingBottom: bottomInset + 8 }]}>
      <View style={fabBarStyles.countRow}>
        <View style={fabBarStyles.countBadge}>
          <MaterialIcons name="check-box" size={14} color={Colors.primary} />
          <Text style={fabBarStyles.countText}>{selectedCount} selected</Text>
        </View>
        <View style={fabBarStyles.countActions}>
          <TouchableOpacity
            style={fabBarStyles.selAllBtn}
            onPress={allSelected ? onClearSelection : onSelectAll}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons name={allSelected ? 'deselect' : 'select-all'} size={13} color={Colors.textMuted} />
            <Text style={fabBarStyles.selAllText}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={fabBarStyles.closeSelBtn}
            onPress={onClearSelection}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons name="close" size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={fabBarStyles.actionsRow}>
        <TouchableOpacity
          style={[fabBarStyles.actionBtn, fabBarStyles.actionBtnCompleted, (anyBusy || selectedCount === 0) && { opacity: 0.45 }]}
          onPress={onMarkCompleted}
          disabled={anyBusy || selectedCount === 0}
          activeOpacity={0.8}
        >
          {batchLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="check-circle" size={15} color={Colors.bg} />}
          <Text style={fabBarStyles.actionBtnText}>{batchLoading ? 'Updating…' : 'Mark Completed'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[fabBarStyles.actionBtn, fabBarStyles.actionBtnFailed, (anyBusy || selectedCount === 0) && { opacity: 0.45 }]}
          onPress={onMarkFailed}
          disabled={anyBusy || selectedCount === 0}
          activeOpacity={0.8}
        >
          {batchLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="cancel" size={15} color={Colors.bg} />}
          <Text style={fabBarStyles.actionBtnText}>{batchLoading ? 'Updating…' : 'Mark Failed'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[fabBarStyles.actionBtn, fabBarStyles.actionBtnExport, (anyBusy || selectedCount === 0) && { opacity: 0.45 }]}
          onPress={onExportCSV}
          disabled={anyBusy || selectedCount === 0}
          activeOpacity={0.8}
        >
          {exportingCSV ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="download" size={15} color={Colors.bg} />}
          <Text style={fabBarStyles.actionBtnText}>{exportingCSV ? 'Exporting…' : 'Export CSV'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const fabBarStyles = StyleSheet.create({
  container: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, borderTopWidth: 1.5, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.primary + '66', paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 16, zIndex: 200 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm + 2 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm - 1, borderWidth: 1, borderColor: Colors.primary + '55' },
  countText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  countActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  selAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 3, paddingVertical: Spacing.sm - 1, borderWidth: 1, borderColor: Colors.border },
  selAllText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  closeSelBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 5, elevation: 3 },
  actionBtnText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  actionBtnCompleted: { backgroundColor: Colors.success, shadowColor: Colors.success, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8 },
  actionBtnFailed: { backgroundColor: Colors.error, shadowColor: Colors.error, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8 },
  actionBtnExport: { backgroundColor: Colors.warning, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8 },
});

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ filter, searchQuery }: { filter: StatusFilter; searchQuery: string }) {
  return (
    <View style={crStyles.emptyWrap}>
      <View style={crStyles.emptyIconWrap}>
        <MaterialIcons name="receipt-long" size={36} color={Colors.primary} style={{ opacity: 0.5 }} />
      </View>
      <Text style={crStyles.emptyTitle}>
        {searchQuery.trim() ? 'No results found' : filter === 'all' ? 'No transactions yet' : `No ${filter} transactions`}
      </Text>
      <Text style={crStyles.emptySubtitle}>
        {searchQuery.trim()
          ? `No transactions matching "${searchQuery}"`
          : 'MoMo payments will appear here once processed'}
      </Text>
    </View>
  );
}

// ── Add Transaction Modal ─────────────────────────────────────────────────────
function AddTransactionModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { showAlert } = useAlert();
  const [msisdn, setMsisdn]           = useState('');
  const [payerName, setPayerName]     = useState('');
  const [amount, setAmount]           = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [note, setNote]               = useState('');
  const [saving, setSaving]           = useState(false);

  const reset = useCallback(() => {
    setMsisdn(''); setPayerName(''); setAmount(''); setReferenceId(''); setNote('');
  }, []);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  const handleSave = useCallback(async () => {
    const msisdnTrim = msisdn.trim();
    const amtNum    = parseFloat(amount.trim());
    const refTrim   = referenceId.trim() || `BTNG-${Date.now()}`;
    if (!msisdnTrim) { showAlert('Required', 'Payer MSISDN is required.'); return; }
    if (isNaN(amtNum) || amtNum <= 0) { showAlert('Invalid Amount', 'Enter a valid GHS amount greater than 0.'); return; }
    setSaving(true);
    const { error } = await insertCashRailTransaction({
      merchant_id: '248059', payer_msisdn: msisdnTrim,
      payer_name: payerName.trim() || null, reference_id: refTrim,
      amount_ghs: amtNum, status: 'pending',
      network: 'MTN MoMo', currency: 'GHS',
      note: note.trim() || null, created_by: null,
    });
    setSaving(false);
    if (error) { showAlert('Save Failed', error); return; }
    showAlert('Transaction Added', `Reference: ${refTrim}\nAmount: GHS ${amtNum.toFixed(2)}`);
    reset();
    onSaved();
  }, [msisdn, payerName, amount, referenceId, note, reset, onSaved, showAlert]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={addStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={addStyles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={addStyles.sheet}>
          <View style={addStyles.header}>
            <View style={addStyles.headerLeft}>
              <View style={addStyles.iconWrap}>
                <MaterialIcons name="add-card" size={20} color={Colors.warning} />
              </View>
              <View>
                <Text style={addStyles.title}>Add Transaction</Text>
                <Text style={addStyles.subtitle}>MTN MoMo · Merchant 248059</Text>
              </View>
            </View>
            <TouchableOpacity style={addStyles.closeBtn} onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {[
              { label: 'Payer MSISDN', required: true,  icon: 'phone',  value: msisdn,    onChange: setMsisdn,    placeholder: '+233 XX XXX XXXX', keyboardType: 'phone-pad' as const, autoCapitalize: 'none'  as const },
              { label: 'Payer Name',   required: false, icon: 'person', value: payerName, onChange: setPayerName, placeholder: 'e.g. Kwame Mensah', keyboardType: 'default'   as const, autoCapitalize: 'words' as const },
            ].map(f => (
              <View key={f.label} style={addStyles.fieldGroup}>
                <View style={addStyles.fieldLabelRow}>
                  <MaterialIcons name={f.icon as any} size={12} color={f.required ? Colors.warning : Colors.textMuted} />
                  <Text style={addStyles.fieldLabel}>{f.label}{f.required ? <Text style={addStyles.required}> *</Text> : ' — optional'}</Text>
                </View>
                <TextInput style={addStyles.input} value={f.value} onChangeText={f.onChange} placeholder={f.placeholder} placeholderTextColor={Colors.textMuted} keyboardType={f.keyboardType} autoCapitalize={f.autoCapitalize} returnKeyType="next" />
              </View>
            ))}

            <View style={addStyles.fieldGroup}>
              <View style={addStyles.fieldLabelRow}>
                <MaterialIcons name="payments" size={12} color={Colors.warning} />
                <Text style={addStyles.fieldLabel}>Amount (GHS)<Text style={addStyles.required}> *</Text></Text>
              </View>
              <View style={addStyles.amountRow}>
                <View style={addStyles.amountPrefix}><Text style={addStyles.amountPrefixText}>GHS</Text></View>
                <TextInput style={addStyles.amountInput} value={amount} onChangeText={v => setAmount(v.replace(/[^0-9.]/g, ''))} placeholder="0.00" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" returnKeyType="next" />
              </View>
            </View>

            <View style={addStyles.fieldGroup}>
              <View style={addStyles.fieldLabelRow}>
                <MaterialIcons name="tag" size={12} color={Colors.textMuted} />
                <Text style={addStyles.fieldLabel}>Reference ID — optional (auto-generated if blank)</Text>
              </View>
              <TextInput style={addStyles.input} value={referenceId} onChangeText={setReferenceId} placeholder="BTNG-XXXX-XXXX" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} returnKeyType="next" maxLength={50} />
            </View>

            <View style={addStyles.fieldGroup}>
              <View style={addStyles.fieldLabelRow}>
                <MaterialIcons name="short-text" size={12} color={Colors.textMuted} />
                <Text style={addStyles.fieldLabel}>Note — optional</Text>
              </View>
              <TextInput style={[addStyles.input, addStyles.noteInput]} value={note} onChangeText={setNote} placeholder="e.g. Wallet deposit, invoice reference…" placeholderTextColor={Colors.textMuted} multiline textAlignVertical="top" returnKeyType="done" maxLength={120} />
            </View>

            <View style={addStyles.statusNote}>
              <MaterialIcons name="access-time" size={12} color={Colors.warning} />
              <Text style={addStyles.statusNoteText}>New transactions are recorded with <Text style={{ color: Colors.warning, fontWeight: FontWeight.bold }}>Pending</Text> status. Update manually once confirmed.</Text>
            </View>

            <TouchableOpacity style={[addStyles.saveBtn, (saving || !msisdn.trim() || !amount.trim()) && { opacity: 0.5 }]} onPress={handleSave} disabled={saving || !msisdn.trim() || !amount.trim()} activeOpacity={0.8}>
              {saving ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="save" size={18} color={Colors.bg} />}
              <Text style={addStyles.saveBtnText}>{saving ? 'Saving…' : 'Record Transaction'}</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function CashRailScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const { showAlert } = useAlert();
  const [showSearch, setShowSearch]     = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const isAdmin = true;

  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading]       = useState(false);
  const [exportingSelectedCSV, setExportingSelectedCSV] = useState(false);
  const selectionMode = selectedIds.size > 0;

  const {
    transactions, stats, totalCount, loading, refreshing, statsLoading,
    error, statusFilter, searchQuery, hasMore, lastUpdatedAt,
    setStatusFilter, setSearchQuery, refresh, loadMore, updateStatus,
  } = useCashRail();

  const handleLongPressCard = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.add(id); return next; });
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const handleSelectAll    = useCallback(() => setSelectedIds(new Set(transactions.map(t => t.id))), [transactions]);
  const handleClearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchMarkStatus = useCallback(async (status: TransactionStatus) => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const { updatedCount, error: bErr } = await batchUpdateTransactionStatus(Array.from(selectedIds), status);
      if (bErr) { showAlert('Batch Update Failed', bErr); }
      else {
        showAlert('Status Updated', `${updatedCount} transaction${updatedCount === 1 ? '' : 's'} marked as ${status}.`);
        setSelectedIds(new Set());
        refresh();
      }
    } finally { setBatchLoading(false); }
  }, [selectedIds, showAlert, refresh]);

  const exportCSVToFile = useCallback(async (rows: CashRailTransaction[], label: string) => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      // Fallback: share as text
      const text = rows.map(tx => {
        const d = new Date(tx.created_at).toLocaleString('en-GB');
        return `${d} | ${tx.payer_name || ''} | ${tx.payer_msisdn} | ${tx.reference_id} | GHS ${tx.amount_ghs.toFixed(2)} | ${tx.status}`;
      }).join('\n');
      await Share.share({ message: `BTNG Cash Rail Export\n\n${text}`, title: 'BTNG Cash Rail' });
      return;
    }
    const esc = (val: string | null | undefined): string => {
      if (val == null) return '';
      const s = String(val);
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = 'Date,Payer Name,MSISDN,Reference,Amount GHS,Status,Network,Note';
    const csvRows = rows.map(tx => {
      const d = new Date(tx.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return [esc(d), esc(tx.payer_name), esc(tx.payer_msisdn), esc(tx.reference_id), esc(tx.amount_ghs.toFixed(2)), esc(tx.status), esc(tx.network), esc(tx.note)].join(',');
    });
    const csv     = [header, ...csvRows].join('\n');
    const ts      = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const fileUri = `${FileSystem.cacheDirectory}BTNG_${label}_${ts}.csv`;
    await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: `BTNG Cash Rail Export — ${rows.length} transactions`, UTI: 'public.comma-separated-values-text' });
  }, []);

  const handleExportSelectedCSV = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setExportingSelectedCSV(true);
    try {
      const selected = transactions.filter(t => selectedIds.has(t.id));
      if (!selected.length) { showAlert('Nothing to Export', 'Selected transactions not found.'); return; }
      await exportCSVToFile(selected, `Selected_${selected.length}`);
    } catch (e: any) { showAlert('Export Failed', e?.message ?? 'Could not generate the CSV file.'); }
    finally { setExportingSelectedCSV(false); }
  }, [selectedIds, transactions, showAlert, exportCSVToFile]);

  const handleUpdateStatus = useCallback(async (id: string, status: TransactionStatus) => {
    const err = await updateStatus(id, status);
    if (err) showAlert('Update Failed', err);
  }, [updateStatus, showAlert]);

  const handleExportCSV = useCallback(async () => {
    if (transactions.length === 0) { showAlert('Nothing to Export', 'No transactions match the current filter.'); return; }
    setExportingCSV(true);
    try {
      await exportCSVToFile(transactions, 'CashRail');
    } catch (e: any) { showAlert('Export Failed', e?.message ?? 'Could not generate the CSV file.'); }
    finally { setExportingCSV(false); }
  }, [transactions, showAlert, exportCSVToFile]);

  const handleSearchToggle = useCallback(() => {
    setShowSearch(v => {
      if (!v) setTimeout(() => searchInputRef.current?.focus(), 100);
      else setSearchQuery('');
      return !v;
    });
  }, [setSearchQuery]);

  const renderItem = useCallback(({ item }: { item: CashRailTransaction }) => (
    <TransactionCard
      item={item}
      onUpdateStatus={handleUpdateStatus}
      isAdmin={isAdmin}
      selectionMode={selectionMode}
      isSelected={selectedIds.has(item.id)}
      onLongPress={() => handleLongPressCard(item.id)}
      onToggleSelect={() => handleToggleSelect(item.id)}
    />
  ), [handleUpdateStatus, isAdmin, selectionMode, selectedIds, handleLongPressCard, handleToggleSelect]);

  const renderFooter = useCallback(() => {
    if (!hasMore) return null;
    return (
      <TouchableOpacity style={crStyles.loadMoreBtn} onPress={loadMore} activeOpacity={0.8}>
        {loading
          ? <ActivityIndicator size="small" color={Colors.primary} />
          : <><MaterialIcons name="expand-more" size={16} color={Colors.primary} /><Text style={crStyles.loadMoreText}>Load more</Text></>}
      </TouchableOpacity>
    );
  }, [hasMore, loading, loadMore]);

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    return <EmptyState filter={statusFilter} searchQuery={searchQuery} />;
  }, [loading, statusFilter, searchQuery]);

  const keyExtractor = useCallback((item: CashRailTransaction) => item.id, []);

  return (
    <View style={[crStyles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={crStyles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={crStyles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={crStyles.topCenter}>
          <Text style={crStyles.topTitle}>BTNG Cash Rail</Text>
          <Text style={crStyles.topSub}>MTN MoMo Transaction History</Text>
        </View>
        <View style={crStyles.topActions}>
          <TouchableOpacity style={[crStyles.topActionBtn, exportingCSV && { opacity: 0.5 }]} onPress={handleExportCSV} disabled={exportingCSV} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            {exportingCSV ? <ActivityIndicator size="small" color={Colors.warning} /> : <MaterialIcons name="download" size={18} color={Colors.warning} />}
          </TouchableOpacity>
          <TouchableOpacity style={crStyles.topActionBtn} onPress={handleSearchToggle}>
            <MaterialIcons name={showSearch ? 'close' : 'search'} size={18} color={showSearch ? Colors.primary : Colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Merchant Identity Strip */}
      <View style={crStyles.merchantStrip}>
        <Text style={crStyles.merchantFlag}>🇬🇭</Text>
        <View style={{ flex: 1 }}>
          <Text style={crStyles.merchantName}>{BTNG_MERCHANT.legalName}</Text>
          <Text style={crStyles.merchantMeta}>ID {BTNG_MERCHANT.merchantId} · {BTNG_MERCHANT.msisdn}</Text>
        </View>
        <View style={crStyles.livePill}>
          <View style={crStyles.liveDot} />
          <Text style={crStyles.liveText}>{lastUpdatedAt ?? 'Live'}</Text>
        </View>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={crStyles.searchBar}>
          <MaterialIcons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={crStyles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name, MSISDN, reference…"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.trim() ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={14} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Stats */}
      <View style={crStyles.statsWrap}>
        <StatsRow stats={stats} loading={statsLoading} />
      </View>

      {/* Merchant Badge Card */}
      <MerchantBadgeCard />

      {/* Filter Tabs */}
      <View style={crStyles.filterBar}>
        <View style={crStyles.filterScroll}>
          {FILTER_TABS.map(tab => {
            const isActive = statusFilter === tab.key;
            const cfg      = tab.key !== 'all' ? STATUS_CONFIG[tab.key as TransactionStatus] : null;
            const countVal =
              tab.key === 'all'       ? totalCount             :
              tab.key === 'completed' ? (stats?.completed ?? 0) :
              tab.key === 'pending'   ? (stats?.pending   ?? 0) :
                                        (stats?.failed    ?? 0);
            return (
              <TouchableOpacity
                key={tab.key}
                style={[crStyles.filterTab, isActive && { backgroundColor: cfg ? cfg.bg : Colors.primaryGlow, borderColor: cfg ? cfg.color + '66' : Colors.primary + '66' }]}
                onPress={() => setStatusFilter(tab.key)}
                activeOpacity={0.8}
              >
                {cfg && <View style={[crStyles.filterDot, { backgroundColor: cfg.color }]} />}
                <Text style={[crStyles.filterTabText, isActive && { color: cfg ? cfg.color : Colors.primary, fontWeight: FontWeight.bold }]}>{tab.label}</Text>
                {countVal > 0 && (
                  <View style={[crStyles.filterCount, isActive && { backgroundColor: cfg ? cfg.color + '33' : Colors.primaryGlow }]}>
                    <Text style={[crStyles.filterCountText, isActive && { color: cfg ? cfg.color : Colors.primary }]}>{countVal}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={crStyles.totalLabel}>{totalCount} total</Text>
      </View>

      {/* Error Banner */}
      {error ? (
        <View style={crStyles.errorBanner}>
          <MaterialIcons name="error-outline" size={14} color={Colors.error} />
          <Text style={crStyles.errorBannerText} numberOfLines={2}>{error}</Text>
          <TouchableOpacity onPress={refresh} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <MaterialIcons name="refresh" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Transaction List */}
      {loading && transactions.length === 0 ? (
        <View style={crStyles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={crStyles.loadingText}>Loading transactions…</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={crStyles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
              title="Pull to refresh"
              titleColor={Colors.textMuted}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
        />
      )}

      {/* FAB */}
      {!selectionMode && (
        <TouchableOpacity style={[crStyles.fab, { bottom: insets.bottom + 72 }]} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
          <MaterialIcons name="add" size={26} color={Colors.bg} />
        </TouchableOpacity>
      )}

      {/* Floating Multi-Select Action Bar */}
      {selectionMode && (
        <FloatingSelectionBar
          selectedCount={selectedIds.size}
          totalCount={transactions.length}
          onMarkCompleted={() => handleBatchMarkStatus('completed')}
          onMarkFailed={() => handleBatchMarkStatus('failed')}
          onExportCSV={handleExportSelectedCSV}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          batchLoading={batchLoading}
          exportingCSV={exportingSelectedCSV}
          bottomInset={insets.bottom}
        />
      )}

      {/* Add Transaction Modal */}
      <AddTransactionModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={() => { setShowAddModal(false); refresh(); }}
      />

      {/* Poll note */}
      {!selectionMode && (
        <View style={[crStyles.pollNote, { paddingBottom: insets.bottom + 6 }]}>
          <MaterialIcons name="sync" size={9} color={Colors.textMuted} />
          <Text style={crStyles.pollNoteText}>Auto-refreshes every 30s · Long-press any card to select</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const crStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter: { flex: 1, alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topActionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  merchantStrip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.warning + '44' },
  merchantFlag: { fontSize: 18 },
  merchantName: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  merchantMeta: { fontSize: 10, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false },
  statsWrap: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 3, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: Colors.border },
  statIconWrap: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'center' },
  statsLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: Spacing.md },
  statsLoadingText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, marginBottom: Spacing.sm, gap: Spacing.sm },
  filterScroll: { flex: 1, flexDirection: 'row', gap: Spacing.sm, flexWrap: 'nowrap' },
  filterTab: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 3, paddingVertical: Spacing.sm - 1, borderWidth: 1, borderColor: Colors.border },
  filterDot: { width: 5, height: 5, borderRadius: 2.5 },
  filterTabText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  filterCount: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
  filterCountText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  totalLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, flexShrink: 0 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.errorBg, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.error + '44' },
  errorBannerText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  listContent: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.sm },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontSize: FontSize.md, color: Colors.textMuted, includeFontPadding: false },
  loadMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.md, marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '44' },
  loadMoreText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
  // Transaction cards
  txCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  txCardExpanded: { borderColor: Colors.primary + '55', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  txCardSelected: { borderColor: Colors.primary + '88', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
  txMain: { flexDirection: 'row', alignItems: 'center', paddingRight: Spacing.md, paddingVertical: Spacing.sm + 2 },
  txMainSelected: { backgroundColor: Colors.primaryGlow },
  txCheckboxWrap: { paddingLeft: Spacing.sm, paddingRight: 4, alignSelf: 'center' },
  txCheckbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  txCheckboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  txStatusStripe: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: Spacing.sm + 2, marginLeft: 2 },
  txBody: { flex: 1, gap: 6 },
  txRow1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  txNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 },
  txAvatarDot: { width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  txMsisdn: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  txAmountWrap: { alignItems: 'flex-end' },
  txAmount: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  txCurrency: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  txRow2: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 },
  txRefChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border, maxWidth: 160 },
  txRefText: { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  txRow2Right: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  txStatusText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  txDate: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  txDetail: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  txDetailDivider: { height: 1, backgroundColor: Colors.border, marginBottom: Spacing.sm },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  detailLabel: { width: 90, fontSize: FontSize.xs, color: Colors.textMuted, paddingTop: 1, includeFontPadding: false, flexShrink: 0 },
  detailValueRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  detailValue: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  detailValueMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 },
  copyChip: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  copyChipDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  shareReceiptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 5, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  shareReceiptText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  statusControls: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '33' },
  statusControlsLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusControlsLabelText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.bold, includeFontPadding: false },
  statusBtns: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  statusBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: Spacing.sm + 3, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  statusBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.primary + '33', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, includeFontPadding: false, paddingHorizontal: Spacing.xl },
  pollNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border },
  pollNoteText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  fab: { position: 'absolute', right: Spacing.xl, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.warning, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.warning, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10, zIndex: 99 },
});

const addStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,6,8,0.72)' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, paddingBottom: 0, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.warning + '55', maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  subtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  closeBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  fieldGroup: { gap: 6, marginBottom: Spacing.md },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fieldLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  required: { color: Colors.warning },
  input: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.sm, includeFontPadding: false },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.warning + '66', overflow: 'hidden' },
  amountPrefix: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, backgroundColor: Colors.warningBg, borderRightWidth: 1, borderRightColor: Colors.warning + '44' },
  amountPrefixText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  amountInput: { flex: 1, fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, includeFontPadding: false },
  statusNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.warningBg, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.warning + '44', marginBottom: Spacing.md },
  statusNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.warning, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  saveBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
