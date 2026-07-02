import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Platform, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import {
  getWalletAsync, loanQuoteAsync, activateCardAsync, registerIdentityAsync,
  fetchWalletHistory, fetchLoanHistory, fetchCardHistory, fetchIdentityHistory,
  deleteHistoryRecord,
  processWalletEvent, evaluateRisk, formatGHS, formatBTNGG, formatShortDate, formatShortTime,
  setBTNGBankBaseURL, BTNG_BANK_BASE_URL,
  BTNG_GOLD_SYMBOL, BTNG_CHAIN_PREFIX, BASE_RATE_APR, MAX_LTV, PLATFORM_HEADER,
  UBL_VERSION, UBL_ENDPOINTS, UBL_PLATFORMS,
  BTNGWalletOut, BTNGLoanQuoteOut, BTNGCardActivateOut, BTNGTransactionEvent,
  BTNGWalletRecord, BTNGLoanRecord, BTNGCardRecord, BTNGIdentityRecord,
} from '@/services/btngBankEngine';

// ─────────────────────────────────────────────────────────────────────────────
// Section Card
// ─────────────────────────────────────────────────────────────────────────────
function SectionCard({ title, icon, accent = false, children, badge }: {
  title: string; icon: string; accent?: boolean; children: React.ReactNode; badge?: string;
}) {
  const [open, setOpen] = useState(true);
  const rotAnim = useRef(new Animated.Value(1)).current;
  const toggle = () => {
    setOpen(v => {
      Animated.timing(rotAnim, { toValue: v ? 0 : 1, duration: 200, useNativeDriver: true }).start();
      return !v;
    });
  };
  const rot = rotAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <View style={[sc.card, accent && sc.cardAccent]}>
      <TouchableOpacity style={sc.header} onPress={toggle} activeOpacity={0.85}>
        <View style={[sc.iconWrap, accent && sc.iconWrapAccent]}>
          <MaterialIcons name={icon as any} size={18} color={accent ? Colors.primary : Colors.warning} />
        </View>
        <Text style={sc.title}>{title}</Text>
        {badge ? (
          <View style={sc.badge}><Text style={sc.badgeText}>{badge}</Text></View>
        ) : null}
        <Animated.View style={{ transform: [{ rotate: rot }] }}>
          <MaterialIcons name="expand-more" size={18} color={Colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      {open && <View style={sc.body}>{children}</View>}
    </View>
  );
}
const sc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  cardAccent: { borderColor: Colors.primary + '55' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '55', alignItems: 'center', justifyContent: 'center' },
  iconWrapAccent: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' },
  title: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  badge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '55', marginRight: 4 },
  badgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  body: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, paddingTop: 2, gap: Spacing.sm },
});

// ─────────────────────────────────────────────────────────────────────────────
// History Panel — reusable collapsible history list
// ─────────────────────────────────────────────────────────────────────────────
function HistoryPanel<T extends { id: string; created_at: string }>({
  title, icon, records, loading, onRefresh, onDelete, renderRow,
}: {
  title: string; icon: string; records: T[]; loading: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  renderRow: (item: T, idx: number) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rotAnim = useRef(new Animated.Value(0)).current;
  const rot = rotAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const toggle = () => {
    const next = !open;
    Animated.timing(rotAnim, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
    setOpen(next);
    if (next) onRefresh();
  };

  return (
    <View style={hp.wrap}>
      <TouchableOpacity style={hp.header} onPress={toggle} activeOpacity={0.85}>
        <View style={hp.iconWrap}>
          <MaterialIcons name={icon as any} size={14} color={Colors.textMuted} />
        </View>
        <Text style={hp.title}>{title}</Text>
        <View style={hp.countBadge}>
          <Text style={hp.countText}>{records.length}</Text>
        </View>
        <TouchableOpacity onPress={onRefresh} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 4 }}>
          <MaterialIcons name="refresh" size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <Animated.View style={{ transform: [{ rotate: rot }] }}>
          <MaterialIcons name="expand-more" size={14} color={Colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>
      {open && (
        <View style={hp.body}>
          {loading ? (
            <View style={hp.loadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={hp.loadingText}>Loading history…</Text>
            </View>
          ) : records.length === 0 ? (
            <Text style={hp.emptyText}>No records yet — run a query above.</Text>
          ) : (
            records.map((item, idx) => (
              <View key={item.id} style={hp.row}>
                {renderRow(item, idx)}
                <TouchableOpacity
                  style={hp.deleteBtn}
                  onPress={() => onDelete(item.id)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <MaterialIcons name="delete-outline" size={13} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}
const hp = StyleSheet.create({
  wrap: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3 },
  iconWrap: { width: 24, height: 24, borderRadius: 7, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  countBadge: { backgroundColor: Colors.bgCard, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border, minWidth: 20, alignItems: 'center' },
  countText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  body: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, gap: 4 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  loadingText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  emptyText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md, includeFontPadding: false },
  row: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.bgCard, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  deleteBtn: { width: 24, height: 24, borderRadius: 6, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.error + '33', alignItems: 'center', justifyContent: 'center', marginLeft: 4, flexShrink: 0, marginTop: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Field Row
// ─────────────────────────────────────────────────────────────────────────────
function FieldRow({ label, value, mono = false, onCopy }: {
  label: string; value: string; mono?: boolean; onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (onCopy) { onCopy(); return; }
    Clipboard.setStringAsync(value).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <View style={fr.row}>
      <Text style={fr.label}>{label}</Text>
      <View style={fr.valueRow}>
        <Text style={[fr.value, mono && fr.valueMono]} numberOfLines={2} selectable>{value}</Text>
        <TouchableOpacity onPress={handleCopy} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={[fr.copyBtn, copied && fr.copyBtnDone]}>
          <MaterialIcons name={copied ? 'check' : 'copy-all'} size={11} color={copied ? Colors.success : Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const fr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 4 },
  label: { width: 108, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, paddingTop: 1, flexShrink: 0, includeFontPadding: false },
  valueRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  value: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  valueMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 },
  copyBtn: { width: 22, height: 22, borderRadius: 6, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  copyBtnDone: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Labelled Input
// ─────────────────────────────────────────────────────────────────────────────
function LabelledInput({ label, icon, value, onChange, placeholder, keyboardType = 'default', prefix, required, hint }: {
  label: string; icon: string; value: string; onChange: (v: string) => void;
  placeholder: string; keyboardType?: any; prefix?: string; required?: boolean; hint?: string;
}) {
  return (
    <View style={li.group}>
      <View style={li.labelRow}>
        <MaterialIcons name={icon as any} size={11} color={required ? Colors.warning : Colors.textMuted} />
        <Text style={li.label}>{label}{required ? <Text style={li.req}> *</Text> : ''}</Text>
      </View>
      <View style={[li.inputWrap, required && value ? li.inputWrapFilled : null]}>
        {prefix ? <View style={li.prefix}><Text style={li.prefixText}>{prefix}</Text></View> : null}
        <TextInput
          style={[li.input, prefix ? li.inputWithPrefix : null]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {hint ? <Text style={li.hint}>{hint}</Text> : null}
    </View>
  );
}
const li = StyleSheet.create({
  group: { gap: 5 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  req: { color: Colors.warning },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  inputWrapFilled: { borderColor: Colors.primary + '66' },
  prefix: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, backgroundColor: Colors.warningBg, borderRightWidth: 1, borderRightColor: Colors.warning + '44' },
  prefixText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  input: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, includeFontPadding: false },
  inputWithPrefix: { paddingLeft: Spacing.sm },
  hint: { fontSize: 9, color: Colors.textMuted, marginLeft: 2, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Risk Badge
// ─────────────────────────────────────────────────────────────────────────────
function RiskBadge({ level, color }: { level: string; color: string }) {
  return (
    <View style={[rb.wrap, { backgroundColor: color + '18', borderColor: color + '55' }]}>
      <View style={[rb.dot, { backgroundColor: color }]} />
      <Text style={[rb.text, { color }]}>{level}</Text>
    </View>
  );
}
const rb = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Stat Chip
// ─────────────────────────────────────────────────────────────────────────────
function StatChip({ label, value, color = Colors.primary }: { label: string; value: string; color?: string }) {
  return (
    <View style={scc.chip}>
      <Text style={[scc.val, { color }]}>{value}</Text>
      <Text style={scc.label}>{label}</Text>
    </View>
  );
}
const scc = StyleSheet.create({
  chip: { flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.border },
  val: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, textAlign: 'center', includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Source Badge
// ─────────────────────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source: 'live' | 'local' }) {
  const isLive = source === 'live';
  return (
    <View style={[src.badge, isLive ? src.badgeLive : src.badgeLocal]}>
      <View style={[src.dot, { backgroundColor: isLive ? Colors.success : Colors.warning }]} />
      <Text style={[src.text, { color: isLive ? Colors.success : Colors.warning }]}>
        {isLive ? 'Live Engine' : 'Local Engine'}
      </Text>
    </View>
  );
}
const src = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  badgeLive: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  badgeLocal: { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '44' },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  text: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Saved Badge
// ─────────────────────────────────────────────────────────────────────────────
function SavedBadge() {
  return (
    <View style={svd.badge}>
      <MaterialIcons name="cloud-done" size={10} color={Colors.success} />
      <Text style={svd.text}>Saved to cloud</Text>
    </View>
  );
}
const svd = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  text: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// History row renderers
// ─────────────────────────────────────────────────────────────────────────────
function WalletHistoryRow({ item }: { item: BTNGWalletRecord }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={hrStyles.btngId} numberOfLines={1}>{item.btng_id}</Text>
        <View style={[hrStyles.tierBadge, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
          <Text style={[hrStyles.tierText, { color: Colors.primary }]}>{item.tier}</Text>
        </View>
      </View>
      <Text style={hrStyles.addr} numberOfLines={1}>{item.wallet_address}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={hrStyles.amount}>{formatBTNGG(item.balance)} BTNGG</Text>
        <Text style={hrStyles.date}>{formatShortDate(item.created_at)} · {formatShortTime(item.created_at)}</Text>
      </View>
    </View>
  );
}

function LoanHistoryRow({ item }: { item: BTNGLoanRecord }) {
  const risk = evaluateRisk(item.principal);
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={hrStyles.btngId} numberOfLines={1}>{item.btng_id}</Text>
        <View style={[hrStyles.tierBadge, { backgroundColor: risk.color + '18', borderColor: risk.color + '44' }]}>
          <Text style={[hrStyles.tierText, { color: risk.color }]}>{risk.label}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <Text style={hrStyles.subLabel}>Principal</Text>
        <Text style={hrStyles.subVal}>GHS {formatGHS(item.principal)}</Text>
        <Text style={hrStyles.subLabel}>Max Borrow</Text>
        <Text style={[hrStyles.subVal, { color: Colors.primary }]}>GHS {formatGHS(item.max_borrow)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={hrStyles.subLabel}>Due {formatShortDate(item.due_date)}</Text>
        <Text style={hrStyles.date}>{formatShortDate(item.created_at)} · {formatShortTime(item.created_at)}</Text>
      </View>
    </View>
  );
}

function CardHistoryRow({ item }: { item: BTNGCardRecord }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={hrStyles.btngId} numberOfLines={1}>{item.btng_id}</Text>
        <View style={[hrStyles.tierBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
          <Text style={[hrStyles.tierText, { color: Colors.success }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={hrStyles.addr}>{item.card_number_masked}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={hrStyles.subLabel}>Tier: {item.tier} · Exp: {item.expires.slice(0, 7)}</Text>
        <Text style={hrStyles.date}>{formatShortDate(item.created_at)} · {formatShortTime(item.created_at)}</Text>
      </View>
    </View>
  );
}

function IdentityHistoryRow({ item }: { item: BTNGIdentityRecord }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={hrStyles.btngId} numberOfLines={1}>{item.btng_id}</Text>
        <View style={[hrStyles.tierBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
          <Text style={[hrStyles.tierText, { color: Colors.success }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={hrStyles.addr} numberOfLines={1}>{item.wallet_address}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={hrStyles.subLabel}>Expires: {item.expires}</Text>
        <Text style={hrStyles.date}>{formatShortDate(item.created_at)} · {formatShortTime(item.created_at)}</Text>
      </View>
    </View>
  );
}

const hrStyles = StyleSheet.create({
  btngId: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, flex: 1, marginRight: 6 },
  addr: { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  amount: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  date: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  tierBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  tierText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  subLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  subVal: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BTNGBankScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const userId = user?.id;

  // ── UBL Backend URL ─────────────────────────────────────────────────────
  const [backendUrl, setBackendUrl] = useState(BTNG_BANK_BASE_URL);
  const [urlSaved, setUrlSaved] = useState(false);
  const [engineMode, setEngineMode] = useState<'local' | 'live'>('local');
  const [connStatus, setConnStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [connLatency, setConnLatency] = useState<number | null>(null);
  const [connVersion, setConnVersion] = useState<string | null>(null);
  const [connError, setConnError] = useState<string | null>(null);

  const handleTestConnection = useCallback(async () => {
    const url = backendUrl.trim();
    if (!url) { showAlert('No URL', 'Enter a backend URL before testing.'); return; }
    setConnStatus('testing');
    setConnLatency(null);
    setConnVersion(null);
    setConnError(null);
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${url}/health`, {
        headers: { 'X-BTNG-Client': PLATFORM_HEADER, 'X-BTNG-UBL': UBL_VERSION },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latency = Date.now() - t0;
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setConnStatus('ok');
        setConnLatency(latency);
        setConnVersion(json?.engine ?? json?.version ?? 'UBL-1.0');
      } else {
        setConnStatus('error');
        setConnLatency(Date.now() - t0);
        setConnError(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      setConnStatus('error');
      setConnLatency(Date.now() - t0);
      setConnError(err?.name === 'AbortError' ? 'Timeout (8s)' : err?.message ?? 'Unreachable');
    }
  }, [backendUrl, showAlert]);

  const handleSaveURL = useCallback(() => {
    setBTNGBankBaseURL(backendUrl);
    setEngineMode(backendUrl.trim() ? 'live' : 'local');
    setUrlSaved(true);
    setTimeout(() => setUrlSaved(false), 2200);
  }, [backendUrl]);

  // ── Wallet ──────────────────────────────────────────────────────────────
  const [walletId, setWalletId] = useState(user?.id?.slice(0, 12).toUpperCase() ?? 'BTNG-0001');
  const [walletBalance, setWalletBalance] = useState('');
  const [walletResult, setWalletResult] = useState<BTNGWalletOut | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSaved, setWalletSaved] = useState(false);
  const [walletHistory, setWalletHistory] = useState<BTNGWalletRecord[]>([]);
  const [walletHistoryLoading, setWalletHistoryLoading] = useState(false);

  // ── Loan ────────────────────────────────────────────────────────────────
  const [loanBtngId, setLoanBtngId] = useState(user?.id?.slice(0, 12).toUpperCase() ?? 'BTNG-0001');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanDays, setLoanDays] = useState('90');
  const [loanResult, setLoanResult] = useState<BTNGLoanQuoteOut | null>(null);
  const [loanLoading, setLoanLoading] = useState(false);
  const [loanSaved, setLoanSaved] = useState(false);
  const [loanHistory, setLoanHistory] = useState<BTNGLoanRecord[]>([]);
  const [loanHistoryLoading, setLoanHistoryLoading] = useState(false);

  // ── Card ────────────────────────────────────────────────────────────────
  const [cardBtngId, setCardBtngId] = useState(user?.id?.slice(0, 12).toUpperCase() ?? 'BTNG-0001');
  const [cardWallet, setCardWallet] = useState('');
  const [cardExpires, setCardExpires] = useState('');
  const [cardResult, setCardResult] = useState<BTNGCardActivateOut | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardSaved, setCardSaved] = useState(false);
  const [cardHistory, setCardHistory] = useState<BTNGCardRecord[]>([]);
  const [cardHistoryLoading, setCardHistoryLoading] = useState(false);

  // ── Identity ────────────────────────────────────────────────────────────
  const [idBtngId, setIdBtngId] = useState(user?.id?.slice(0, 12).toUpperCase() ?? 'BTNG-0001');
  const [idWallet, setIdWallet] = useState('');
  const [idExpires, setIdExpires] = useState('2027-12-31');
  const [idResult, setIdResult] = useState<{ status: string; btng_id: string; wallet: string; expires: string; registered_at: string } | null>(null);
  const [idLoading, setIdLoading] = useState(false);
  const [idSaved, setIdSaved] = useState(false);
  const [idHistory, setIdHistory] = useState<BTNGIdentityRecord[]>([]);
  const [idHistoryLoading, setIdHistoryLoading] = useState(false);

  // ── Event log ───────────────────────────────────────────────────────────
  const [eventLog, setEventLog] = useState<BTNGTransactionEvent[]>([]);
  const [showLog, setShowLog] = useState(false);
  const appendLog = (evt: BTNGTransactionEvent) =>
    setEventLog(prev => [evt, ...prev].slice(0, 20));

  // ── History loaders ─────────────────────────────────────────────────────
  const loadWalletHistory = useCallback(async () => {
    if (!userId) return;
    setWalletHistoryLoading(true);
    const data = await fetchWalletHistory(userId);
    setWalletHistory(data);
    setWalletHistoryLoading(false);
  }, [userId]);

  const loadLoanHistory = useCallback(async () => {
    if (!userId) return;
    setLoanHistoryLoading(true);
    const data = await fetchLoanHistory(userId);
    setLoanHistory(data);
    setLoanHistoryLoading(false);
  }, [userId]);

  const loadCardHistory = useCallback(async () => {
    if (!userId) return;
    setCardHistoryLoading(true);
    const data = await fetchCardHistory(userId);
    setCardHistory(data);
    setCardHistoryLoading(false);
  }, [userId]);

  const loadIdHistory = useCallback(async () => {
    if (!userId) return;
    setIdHistoryLoading(true);
    const data = await fetchIdentityHistory(userId);
    setIdHistory(data);
    setIdHistoryLoading(false);
  }, [userId]);

  // ── Delete helpers ──────────────────────────────────────────────────────
  const handleDeleteWallet = useCallback(async (id: string) => {
    await deleteHistoryRecord('btng_wallets', id);
    setWalletHistory(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleDeleteLoan = useCallback(async (id: string) => {
    await deleteHistoryRecord('btng_loans', id);
    setLoanHistory(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleDeleteCard = useCallback(async (id: string) => {
    await deleteHistoryRecord('btng_cards', id);
    setCardHistory(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleDeleteId = useCallback(async (id: string) => {
    await deleteHistoryRecord('btng_identities', id);
    setIdHistory(prev => prev.filter(r => r.id !== id));
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleGetWallet = useCallback(async () => {
    if (!walletId.trim()) { showAlert('Required', 'Enter a BTNG ID.'); return; }
    setWalletLoading(true);
    setWalletSaved(false);
    try {
      const balGHS = parseFloat(walletBalance) || 0;
      const result = await getWalletAsync(walletId.trim(), balGHS, userId);
      setWalletResult(result);
      setWalletSaved(!!userId);
      appendLog(processWalletEvent(walletId.trim(), 'WALLET_LOOKUP', balGHS, BTNG_GOLD_SYMBOL));
      if (userId) {
        const data = await fetchWalletHistory(userId);
        setWalletHistory(data);
      }
    } finally { setWalletLoading(false); }
  }, [walletId, walletBalance, showAlert, userId]);

  const handleLoanQuote = useCallback(async () => {
    const principal = parseFloat(loanPrincipal);
    const days = parseInt(loanDays, 10);
    if (!loanBtngId.trim()) { showAlert('Required', 'Enter a BTNG ID.'); return; }
    if (isNaN(principal) || principal <= 0) { showAlert('Invalid', 'Enter a valid principal amount.'); return; }
    if (isNaN(days) || days < 1) { showAlert('Invalid', 'Enter a valid loan term in days.'); return; }
    setLoanLoading(true);
    setLoanSaved(false);
    try {
      const result = await loanQuoteAsync({ btng_id: loanBtngId.trim(), principal, days }, userId);
      setLoanResult(result);
      setLoanSaved(!!userId);
      appendLog(processWalletEvent(loanBtngId.trim(), 'LOAN_QUOTE', principal, BTNG_GOLD_SYMBOL));
      if (userId) {
        const data = await fetchLoanHistory(userId);
        setLoanHistory(data);
      }
    } finally { setLoanLoading(false); }
  }, [loanBtngId, loanPrincipal, loanDays, showAlert, userId]);

  const handleActivateCard = useCallback(async () => {
    if (!cardBtngId.trim() || !cardWallet.trim()) { showAlert('Required', 'Enter BTNG ID and wallet address.'); return; }
    setCardLoading(true);
    setCardSaved(false);
    try {
      const result = await activateCardAsync(cardBtngId.trim(), cardWallet.trim(), cardExpires.trim() || undefined, userId);
      setCardResult(result);
      setCardSaved(!!userId);
      appendLog(processWalletEvent(cardBtngId.trim(), 'CARD_ACTIVATE', 0, 'BTNG_CARD'));
      if (userId) {
        const data = await fetchCardHistory(userId);
        setCardHistory(data);
      }
    } finally { setCardLoading(false); }
  }, [cardBtngId, cardWallet, cardExpires, showAlert, userId]);

  const handleRegisterIdentity = useCallback(async () => {
    if (!idBtngId.trim() || !idWallet.trim()) { showAlert('Required', 'Enter BTNG ID and wallet.'); return; }
    setIdLoading(true);
    setIdSaved(false);
    try {
      const result = await registerIdentityAsync({ btng_id: idBtngId.trim(), wallet: idWallet.trim(), expires: idExpires.trim() || '2027-12-31' }, userId);
      setIdResult(result);
      setIdSaved(!!userId);
      appendLog(processWalletEvent(idBtngId.trim(), 'IDENTITY_REGISTER', 0, 'BTNG_IDENTITY'));
      if (userId) {
        const data = await fetchIdentityHistory(userId);
        setIdHistory(data);
      }
    } finally { setIdLoading(false); }
  }, [idBtngId, idWallet, idExpires, showAlert, userId]);

  const statusColor = (s: string) => s === 'ACTIVE' || s === 'OK' ? Colors.success : Colors.warning;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>

        {/* ── Top Bar ──────────────────────────────────────────── */}
        <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.topTitle}>BTNG Banking Engine</Text>
            <Text style={styles.topSub}>Sovereign Finance · Ghana & Africa</Text>
          </View>
          <TouchableOpacity style={styles.logBtn} onPress={() => setShowLog(v => !v)}>
            <MaterialIcons name="terminal" size={18} color={showLog ? Colors.primary : Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── UBL Version Banner ────────────────────────────────── */}
        <View style={styles.ublBanner}>
          <View style={styles.ublLeft}>
            <View style={[styles.ublModeBadge, engineMode === 'live' ? styles.ublModeLive : styles.ublModeLocal]}>
              <View style={[styles.ublModeDot, { backgroundColor: engineMode === 'live' ? Colors.success : Colors.warning }]} />
              <Text style={[styles.ublModeText, { color: engineMode === 'live' ? Colors.success : Colors.warning }]}>
                {engineMode === 'live' ? 'LIVE ENGINE' : 'LOCAL ENGINE'}
              </Text>
            </View>
            <Text style={styles.ublVersionText}>{UBL_VERSION}</Text>
          </View>
          <View style={styles.ublRight}>
            {userId ? (
              <View style={styles.cloudBadge}>
                <MaterialIcons name="cloud-done" size={11} color={Colors.success} />
                <Text style={styles.cloudBadgeText}>Cloud Sync ON</Text>
              </View>
            ) : (
              <View style={[styles.cloudBadge, { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '44' }]}>
                <MaterialIcons name="cloud-off" size={11} color={Colors.warning} />
                <Text style={[styles.cloudBadgeText, { color: Colors.warning }]}>Login to sync</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Hero Card ────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <View style={styles.heroCoin}><Text style={styles.heroCoinSymbol}>₿</Text></View>
            <View>
              <Text style={styles.heroTitle}>BTNG Gold Coin</Text>
              <Text style={styles.heroSubtitle}>{BTNG_GOLD_SYMBOL} · {BTNG_CHAIN_PREFIX}…</Text>
            </View>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.heroPlatformBadge}>
              <MaterialIcons name="smartphone" size={11} color={Colors.primary} />
              <Text style={styles.heroPlatformText}>{PLATFORM_HEADER}</Text>
            </View>
            <View style={styles.heroRateBadge}>
              <Text style={styles.heroRateText}>{(BASE_RATE_APR * 100).toFixed(0)}% APR</Text>
            </View>
            <View style={styles.heroLTVBadge}>
              <Text style={styles.heroLTVText}>{(MAX_LTV * 100).toFixed(0)}% LTV</Text>
            </View>
          </View>
        </View>

        {/* ── Engine Architecture Strip ────────────────────────── */}
        <View style={styles.archStrip}>
          {[
            { icon: 'memory', label: 'eCPU', sub: 'Tx Decisions' },
            { icon: 'bar-chart', label: 'eGPU', sub: 'Pattern AI' },
            { icon: 'account-balance', label: 'Ledger', sub: 'Asset Core' },
            { icon: 'cloud', label: 'Supabase', sub: 'Cloud Sync' },
          ].map(item => (
            <View key={item.label} style={styles.archItem}>
              <View style={styles.archIconWrap}>
                <MaterialIcons name={item.icon as any} size={14} color={Colors.primary} />
              </View>
              <Text style={styles.archLabel}>{item.label}</Text>
              <Text style={styles.archSub}>{item.sub}</Text>
            </View>
          ))}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">

          {/* ── 1. Wallet Lookup ─────────────────────────────────── */}
          <SectionCard title="Wallet Lookup" icon="account-balance-wallet" accent
            badge={walletHistory.length > 0 ? `${walletHistory.length} saved` : undefined}>
            <LabelledInput label="BTNG ID" icon="tag" value={walletId} onChange={setWalletId}
              placeholder="BTNG-1234-5678" required hint="Sovereign identity identifier" />
            <LabelledInput label="Balance (GHS)" icon="payments" value={walletBalance}
              onChange={v => setWalletBalance(v.replace(/[^0-9.]/g, ''))}
              placeholder="0.00" keyboardType="decimal-pad" prefix="GHS"
              hint="Optional · used to compute BTNGG gold balance" />
            <TouchableOpacity style={[styles.actionBtn, !walletId.trim() && { opacity: 0.5 }]}
              onPress={handleGetWallet} disabled={!walletId.trim() || walletLoading} activeOpacity={0.8}>
              {walletLoading ? <ActivityIndicator size="small" color={Colors.bg} />
                : <MaterialIcons name="search" size={16} color={Colors.bg} />}
              <Text style={styles.actionBtnText}>{walletLoading ? 'Looking up…' : 'Get Wallet'}</Text>
            </TouchableOpacity>
            {walletResult && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <MaterialIcons name="check-circle" size={14} color={Colors.success} />
                  <Text style={styles.resultHeaderText}>Wallet Found</Text>
                  <SourceBadge source={walletResult.source} />
                  {walletSaved && <SavedBadge />}
                </View>
                <FieldRow label="BTNG ID" value={walletResult.btng_id} mono />
                <FieldRow label="Wallet Addr." value={walletResult.wallet} mono />
                <FieldRow label="BTNGG Balance" value={`${formatBTNGG(walletResult.balance)} ${BTNG_GOLD_SYMBOL}`} mono />
                <FieldRow label="Gold-backed" value={`GHS ${formatGHS(walletResult.gold_backed_ghs)}`} />
                <FieldRow label="Tier" value={walletResult.tier} />
                <View style={styles.resultChipRow}>
                  <StatChip label="BTNGG" value={formatBTNGG(walletResult.balance)} color={Colors.primary} />
                  <StatChip label="GHS" value={formatGHS(walletResult.gold_backed_ghs)} color={Colors.success} />
                  <StatChip label="Tier" value={walletResult.tier} color={Colors.warning} />
                </View>
              </View>
            )}
            {/* Wallet History */}
            <HistoryPanel
              title="Lookup History"
              icon="history"
              records={walletHistory}
              loading={walletHistoryLoading}
              onRefresh={loadWalletHistory}
              onDelete={handleDeleteWallet}
              renderRow={(item) => <WalletHistoryRow item={item} />}
            />
          </SectionCard>

          {/* ── 2. Loan Quote ────────────────────────────────────── */}
          <SectionCard title="Loan Quote Engine" icon="request-quote"
            badge={loanHistory.length > 0 ? `${loanHistory.length} saved` : undefined}>
            <LabelledInput label="BTNG ID" icon="tag" value={loanBtngId} onChange={setLoanBtngId}
              placeholder="BTNG-1234-5678" required />
            <LabelledInput label="Principal (GHS)" icon="payments" value={loanPrincipal}
              onChange={v => setLoanPrincipal(v.replace(/[^0-9.]/g, ''))}
              placeholder="10000.00" keyboardType="decimal-pad" prefix="GHS" required
              hint="Collateral value — max borrow = 70% LTV" />
            <LabelledInput label="Loan Term" icon="schedule" value={loanDays}
              onChange={v => setLoanDays(v.replace(/[^0-9]/g, ''))}
              placeholder="90" keyboardType="number-pad" prefix="Days"
              hint="1 – 365 days · 8% APR sovereign rate" />
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnAmber, (!loanBtngId.trim() || !loanPrincipal.trim()) && { opacity: 0.5 }]}
              onPress={handleLoanQuote} disabled={!loanBtngId.trim() || !loanPrincipal.trim() || loanLoading} activeOpacity={0.8}>
              {loanLoading ? <ActivityIndicator size="small" color={Colors.bg} />
                : <MaterialIcons name="calculate" size={16} color={Colors.bg} />}
              <Text style={styles.actionBtnText}>{loanLoading ? 'Computing…' : 'Get Loan Quote'}</Text>
            </TouchableOpacity>
            {loanResult && (() => {
              const risk = evaluateRisk(loanResult.principal);
              const dueDate = new Date(loanResult.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
              return (
                <View style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <MaterialIcons name="receipt-long" size={14} color={Colors.warning} />
                    <Text style={styles.resultHeaderText}>Loan Quote · {BTNG_GOLD_SYMBOL}</Text>
                    <RiskBadge level={risk.label} color={risk.color} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <SourceBadge source={loanResult.source} />
                    {loanSaved && <SavedBadge />}
                  </View>
                  <View style={styles.loanAmountBlock}>
                    <Text style={styles.loanAmountLabel}>MAX BORROW</Text>
                    <Text style={styles.loanAmountValue}>GHS {formatGHS(loanResult.max_borrow)}</Text>
                    <Text style={styles.loanAmountSub}>({(MAX_LTV * 100).toFixed(0)}% of GHS {formatGHS(loanResult.principal)} principal)</Text>
                  </View>
                  <View style={styles.resultDivider} />
                  <FieldRow label="Principal" value={`GHS ${formatGHS(loanResult.principal)}`} />
                  <FieldRow label="Interest" value={`GHS ${formatGHS(loanResult.interest)}`} />
                  <FieldRow label="Total Due" value={`GHS ${formatGHS(loanResult.total_due)}`} />
                  <FieldRow label="Due Date" value={dueDate} />
                  <FieldRow label="APR" value={`${(loanResult.rate_apr * 100).toFixed(1)}%`} />
                  <View style={styles.resultChipRow}>
                    <StatChip label="Borrow" value={`GHS ${formatGHS(loanResult.max_borrow)}`} color={Colors.primary} />
                    <StatChip label="Interest" value={`GHS ${formatGHS(loanResult.interest)}`} color={Colors.warning} />
                    <StatChip label="Total Due" value={`GHS ${formatGHS(loanResult.total_due)}`} color={Colors.error} />
                  </View>
                </View>
              );
            })()}
            {/* Loan History */}
            <HistoryPanel
              title="Quote History"
              icon="history"
              records={loanHistory}
              loading={loanHistoryLoading}
              onRefresh={loadLoanHistory}
              onDelete={handleDeleteLoan}
              renderRow={(item) => <LoanHistoryRow item={item} />}
            />
          </SectionCard>

          {/* ── 3. Card Activation ──────────────────────────────── */}
          <SectionCard title="Card Activation" icon="credit-card" accent
            badge={cardHistory.length > 0 ? `${cardHistory.length} saved` : undefined}>
            <LabelledInput label="BTNG ID" icon="tag" value={cardBtngId} onChange={setCardBtngId}
              placeholder="BTNG-1234-5678" required />
            <LabelledInput label="Wallet Address" icon="account-balance-wallet" value={cardWallet} onChange={setCardWallet}
              placeholder={`${BTNG_CHAIN_PREFIX}xyz1234`} required hint="btng1… sovereign wallet address" />
            <LabelledInput label="Expiry (opt.)" icon="event" value={cardExpires} onChange={setCardExpires}
              placeholder="2027-12-31" hint="ISO date · auto-set to 3 years if blank" />
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnGreen, (!cardBtngId.trim() || !cardWallet.trim()) && { opacity: 0.5 }]}
              onPress={handleActivateCard} disabled={!cardBtngId.trim() || !cardWallet.trim() || cardLoading} activeOpacity={0.8}>
              {cardLoading ? <ActivityIndicator size="small" color={Colors.bg} />
                : <MaterialIcons name="nfc" size={16} color={Colors.bg} />}
              <Text style={styles.actionBtnText}>{cardLoading ? 'Activating…' : 'Activate Card'}</Text>
            </TouchableOpacity>
            {cardResult && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <MaterialIcons name="credit-card" size={14} color={statusColor(cardResult.status)} />
                  <Text style={styles.resultHeaderText}>Card Activation</Text>
                  <SourceBadge source={cardResult.source} />
                  {cardSaved && <SavedBadge />}
                </View>
                <View style={styles.cardVisual}>
                  <View style={styles.cardChip}><MaterialIcons name="memory" size={16} color={Colors.warning} /></View>
                  <Text style={styles.cardNumber}>{cardResult.card_number_masked}</Text>
                  <View style={styles.cardBottomRow}>
                    <View>
                      <Text style={styles.cardExpLabel}>EXPIRES</Text>
                      <Text style={styles.cardExpValue}>{cardResult.expires.slice(0, 7)}</Text>
                    </View>
                    <View style={styles.cardTierBadge}>
                      <Text style={styles.cardTierText}>{cardResult.tier}</Text>
                    </View>
                    <View style={styles.cardLogo}><Text style={styles.cardLogoText}>BTNG</Text></View>
                  </View>
                </View>
                <FieldRow label="BTNG ID" value={cardResult.btng_id} mono />
                <FieldRow label="Wallet" value={cardResult.wallet} mono />
                <FieldRow label="Activated" value={new Date(cardResult.activated_at).toLocaleString('en-GB')} />
              </View>
            )}
            {/* Card History */}
            <HistoryPanel
              title="Activation History"
              icon="history"
              records={cardHistory}
              loading={cardHistoryLoading}
              onRefresh={loadCardHistory}
              onDelete={handleDeleteCard}
              renderRow={(item) => <CardHistoryRow item={item} />}
            />
          </SectionCard>

          {/* ── 4. Identity Registry ─────────────────────────────── */}
          <SectionCard title="Identity Registry" icon="fingerprint"
            badge={idHistory.length > 0 ? `${idHistory.length} saved` : undefined}>
            <LabelledInput label="BTNG ID" icon="tag" value={idBtngId} onChange={setIdBtngId}
              placeholder="BTNG-1234-5678" required />
            <LabelledInput label="Wallet Address" icon="account-balance-wallet" value={idWallet} onChange={setIdWallet}
              placeholder={`${BTNG_CHAIN_PREFIX}xyz1234`} required />
            <LabelledInput label="Expires" icon="event" value={idExpires} onChange={setIdExpires}
              placeholder="2027-12-31" hint="ISO date format · identity expiry" />
            <TouchableOpacity
              style={[styles.actionBtn, (!idBtngId.trim() || !idWallet.trim()) && { opacity: 0.5 }]}
              onPress={handleRegisterIdentity} disabled={!idBtngId.trim() || !idWallet.trim() || idLoading} activeOpacity={0.8}>
              {idLoading ? <ActivityIndicator size="small" color={Colors.bg} />
                : <MaterialIcons name="how-to-reg" size={16} color={Colors.bg} />}
              <Text style={styles.actionBtnText}>{idLoading ? 'Registering…' : 'Register Identity'}</Text>
            </TouchableOpacity>
            {idResult && (
              <View style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <MaterialIcons name="verified-user" size={14} color={Colors.success} />
                  <Text style={styles.resultHeaderText}>Identity Registered</Text>
                  {idSaved && <SavedBadge />}
                </View>
                <FieldRow label="BTNG ID" value={idResult.btng_id} mono />
                <FieldRow label="Wallet" value={idResult.wallet} mono />
                <FieldRow label="Expires" value={idResult.expires} />
                <FieldRow label="Registered" value={new Date(idResult.registered_at).toLocaleString('en-GB')} />
              </View>
            )}
            {/* Identity History */}
            <HistoryPanel
              title="Registration History"
              icon="history"
              records={idHistory}
              loading={idHistoryLoading}
              onRefresh={loadIdHistory}
              onDelete={handleDeleteId}
              renderRow={(item) => <IdentityHistoryRow item={item} />}
            />
          </SectionCard>

          {/* ── 5. UBL Backend URL Configuration ─────────────────── */}
          <SectionCard title="UBL Backend URL Configuration" icon="cloud" accent>
            <View style={styles.urlConfigNote}>
              <MaterialIcons name="info-outline" size={12} color={Colors.info} />
              <Text style={styles.urlConfigNoteText}>
                Deploy the FastAPI backend and paste its URL below to switch from local to live engine. Leave blank for offline / demo mode.
              </Text>
            </View>
            <LabelledInput
              label="Backend URL"
              icon="dns"
              value={backendUrl}
              onChange={setBackendUrl}
              placeholder="https://btng-bank.yourdomain.com"
              hint="No trailing slash · uvicorn main:app --host 0.0.0.0 --port 8080"
            />
            <View style={styles.urlBtnRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { flex: 1 }, urlSaved && styles.actionBtnGreen]}
                onPress={handleSaveURL}
                activeOpacity={0.8}
              >
                <MaterialIcons name={urlSaved ? 'check-circle' : 'save'} size={16} color={Colors.bg} />
                <Text style={styles.actionBtnText}>{urlSaved ? 'Saved!' : 'Save & Connect'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnTest, connStatus === 'testing' && { opacity: 0.7 }]}
                onPress={handleTestConnection}
                disabled={connStatus === 'testing'}
                activeOpacity={0.8}
              >
                {connStatus === 'testing'
                  ? <ActivityIndicator size="small" color={Colors.bg} />
                  : <MaterialIcons name="wifi-tethering" size={16} color={Colors.bg} />}
                <Text style={styles.actionBtnText}>{connStatus === 'testing' ? 'Pinging…' : 'Test'}</Text>
              </TouchableOpacity>
            </View>

            {/* Connection Result */}
            {connStatus !== 'idle' && connStatus !== 'testing' && (
              <View style={[styles.connResult, connStatus === 'ok' ? styles.connResultOk : styles.connResultErr]}>
                <View style={styles.connResultLeft}>
                  <View style={[styles.connDot, { backgroundColor: connStatus === 'ok' ? Colors.success : Colors.error }]} />
                  <MaterialIcons
                    name={connStatus === 'ok' ? 'check-circle' : 'error-outline'}
                    size={15}
                    color={connStatus === 'ok' ? Colors.success : Colors.error}
                  />
                  <Text style={[styles.connStatusText, { color: connStatus === 'ok' ? Colors.success : Colors.error }]}>
                    {connStatus === 'ok' ? 'Connected' : 'Unreachable'}
                  </Text>
                </View>
                <View style={styles.connResultRight}>
                  {connLatency !== null && (
                    <View style={[styles.connBadge, connStatus === 'ok' ? styles.connBadgeOk : styles.connBadgeErr]}>
                      <MaterialIcons name="speed" size={10} color={connStatus === 'ok' ? Colors.success : Colors.error} />
                      <Text style={[styles.connBadgeText, { color: connStatus === 'ok' ? Colors.success : Colors.error }]}>
                        {connLatency}ms
                      </Text>
                    </View>
                  )}
                  {connVersion && connStatus === 'ok' && (
                    <View style={styles.connVersionBadge}>
                      <MaterialIcons name="verified" size={10} color={Colors.primary} />
                      <Text style={styles.connVersionText}>{connVersion}</Text>
                    </View>
                  )}
                  {connError && connStatus === 'error' && (
                    <View style={styles.connErrBadge}>
                      <Text style={styles.connErrText} numberOfLines={1}>{connError}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View style={styles.engineStatusRow}>
              <View style={[styles.engineStatusDot, { backgroundColor: engineMode === 'live' ? Colors.success : Colors.warning }]} />
              <Text style={styles.engineStatusText}>
                {engineMode === 'live'
                  ? `Live engine active — ${backendUrl}`
                  : 'Local computation mode — no backend URL set'}
              </Text>
            </View>
          </SectionCard>

          {/* ── 6. UBL-1.0 SDK & Platform Reference ──────────────── */}
          <SectionCard title={`${UBL_VERSION} · SDK & Platform Reference`} icon="code">
            <View style={styles.sdkGrid}>
              {UBL_PLATFORMS.map(p => (
                <View key={p.platform} style={[styles.sdkCard, { borderColor: p.color + '44' }]}>
                  <View style={[styles.sdkIconWrap, { backgroundColor: p.color + '18' }]}>
                    <MaterialIcons name={p.icon as any} size={16} color={p.color} />
                  </View>
                  <Text style={styles.sdkPlatform}>{p.platform}</Text>
                  <Text style={[styles.sdkLang, { color: p.color }]}>{p.lang}</Text>
                  <Text style={styles.sdkNote}>{p.note}</Text>
                </View>
              ))}
            </View>

            <View style={styles.endpointBlock}>
              <Text style={styles.endpointTitle}>Engine Endpoints · FastAPI</Text>
              {UBL_ENDPOINTS.map(e => (
                <View key={e.path} style={styles.endpointRow}>
                  <View style={[styles.methodBadge, { backgroundColor: e.method === 'GET' ? Colors.successBg : Colors.primaryGlow, borderColor: e.method === 'GET' ? Colors.success + '44' : Colors.primary + '44' }]}>
                    <Text style={[styles.methodText, { color: e.method === 'GET' ? Colors.success : Colors.primary }]}>{e.method}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.endpointPath}>{e.path}</Text>
                    <Text style={styles.endpointDesc}>{e.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </SectionCard>

          {/* ── 7. Engine Log ───────────────────────────────────── */}
          {(showLog || eventLog.length > 0) && (
            <SectionCard title={`Engine Log · ${eventLog.length} events`} icon="terminal">
              {eventLog.length === 0
                ? <Text style={styles.logEmpty}>No events yet — run a query above.</Text>
                : eventLog.map((evt, idx) => (
                  <View key={idx} style={styles.logEntry}>
                    <View style={styles.logEntryHeader}>
                      <View style={styles.logEventType}>
                        <Text style={styles.logEventTypeText}>{evt.event_type}</Text>
                      </View>
                      <Text style={styles.logTime}>{new Date(evt.timestamp).toLocaleTimeString('en-GB')}</Text>
                    </View>
                    <Text style={styles.logLine} numberOfLines={2}>{evt.decision}</Text>
                    <Text style={styles.logLine} numberOfLines={1}>{evt.pattern}</Text>
                    <View style={styles.logRiskRow}>
                      <MaterialIcons name="shield" size={9} color={Colors.textMuted} />
                      <Text style={styles.logRiskText}>Risk: {evt.risk} · Asset: {evt.asset}</Text>
                    </View>
                  </View>
                ))}
              {eventLog.length > 0 && (
                <TouchableOpacity style={styles.clearLogBtn} onPress={() => setEventLog([])} activeOpacity={0.8}>
                  <MaterialIcons name="delete-sweep" size={13} color={Colors.error} />
                  <Text style={styles.clearLogText}>Clear log</Text>
                </TouchableOpacity>
              )}
            </SectionCard>
          )}

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topCenter: { flex: 1, alignItems: 'center' },
  topTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topSub: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  logBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },

  ublBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  ublLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ublRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ublModeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  ublModeLive: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  ublModeLocal: { backgroundColor: Colors.warningBg, borderColor: Colors.warning + '44' },
  ublModeDot: { width: 6, height: 6, borderRadius: 3 },
  ublModeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 0.5 },
  ublVersionText: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  cloudBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  cloudBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },

  heroCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: '#100800', borderRadius: Radius.xl, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  heroCoin: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  heroCoinSymbol: { fontSize: 22, color: Colors.primary, includeFontPadding: false },
  heroTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.5, includeFontPadding: false },
  heroSubtitle: { fontSize: FontSize.xs, color: Colors.warning + 'aa', includeFontPadding: false, marginTop: 2 },
  heroRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 180 },
  heroPlatformBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroPlatformText: { fontSize: 9, color: Colors.primary, fontWeight: FontWeight.bold, includeFontPadding: false },
  heroRateBadge: { backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.warning + '44' },
  heroRateText: { fontSize: 9, color: Colors.warning, fontWeight: FontWeight.heavy, includeFontPadding: false },
  heroLTVBadge: { backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44' },
  heroLTVText: { fontSize: 9, color: Colors.success, fontWeight: FontWeight.heavy, includeFontPadding: false },

  archStrip: { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.border },
  archItem: { flex: 1, alignItems: 'center', gap: 3 },
  archIconWrap: { width: 28, height: 28, borderRadius: 9, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  archLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  archSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },

  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  actionBtnAmber: { backgroundColor: Colors.warning, shadowColor: Colors.warning },
  actionBtnGreen: { backgroundColor: Colors.success, shadowColor: Colors.success },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  resultCard: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '33', gap: 3 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: Spacing.sm, flexWrap: 'wrap' },
  resultHeaderText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, minWidth: 80 },
  resultDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  resultChipRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },

  loanAmountBlock: { alignItems: 'center', paddingVertical: Spacing.md, gap: 4, backgroundColor: Colors.bgCard, borderRadius: Radius.md },
  loanAmountLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, letterSpacing: 2, includeFontPadding: false },
  loanAmountValue: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  loanAmountSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  cardVisual: { backgroundColor: '#1A0A00', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.primary + '66', gap: Spacing.sm, marginVertical: Spacing.sm, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  cardChip: { width: 32, height: 24, borderRadius: 4, backgroundColor: Colors.warningBg, borderWidth: 1, borderColor: Colors.warning + '66', alignItems: 'center', justifyContent: 'center' },
  cardNumber: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  cardBottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  cardExpLabel: { fontSize: 8, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  cardExpValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardTierBadge: { backgroundColor: Colors.warning, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  cardTierText: { fontSize: 9, fontWeight: FontWeight.heavy, color: '#100800', includeFontPadding: false },
  cardLogo: { backgroundColor: Colors.primaryGlow, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '55' },
  cardLogoText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.5, includeFontPadding: false },

  sdkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  sdkCard: { width: '30%', minWidth: 80, alignItems: 'center', gap: 4, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: 4, borderWidth: 1 },
  sdkIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sdkPlatform: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false, textAlign: 'center' },
  sdkLang: { fontSize: 8, fontWeight: FontWeight.semibold, includeFontPadding: false, textAlign: 'center' },
  sdkNote: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false, textAlign: 'center', opacity: 0.8 },
  endpointBlock: { backgroundColor: '#0A0A0A', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  endpointTitle: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, marginBottom: 2, includeFontPadding: false },
  endpointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  methodBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, minWidth: 40, alignItems: 'center', marginTop: 1 },
  methodText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  endpointPath: { fontSize: 10, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  endpointDesc: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },

  urlBtnRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtnTest: { backgroundColor: '#3B82F6', shadowColor: '#3B82F6', paddingHorizontal: Spacing.md },
  connResult: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, gap: Spacing.sm },
  connResultOk: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  connResultErr: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' },
  connResultLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connResultRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connDot: { width: 7, height: 7, borderRadius: 3.5 },
  connStatusText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  connBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  connBadgeOk: { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' },
  connBadgeErr: { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' },
  connBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, includeFontPadding: false },
  connVersionBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  connVersionText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  connErrBadge: { backgroundColor: Colors.errorBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.error + '44' },
  connErrText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  urlConfigNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)' },
  urlConfigNoteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  engineStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  engineStatusDot: { width: 7, height: 7, borderRadius: 3.5 },
  engineStatusText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  logEmpty: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md, includeFontPadding: false },
  logEntry: { backgroundColor: '#0A0A0A', borderRadius: Radius.md, padding: Spacing.sm + 3, gap: 4, borderWidth: 1, borderColor: Colors.border },
  logEntryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  logEventType: { backgroundColor: Colors.primaryGlow, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  logEventTypeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  logTime: { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  logLine: { fontSize: 9, color: Colors.success, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 13 },
  logRiskRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  logRiskText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  clearLogBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.md, paddingVertical: Spacing.sm + 2, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.error + '44', marginTop: Spacing.sm },
  clearLogText: { fontSize: FontSize.xs, color: Colors.error, fontWeight: FontWeight.bold, includeFontPadding: false },
});
