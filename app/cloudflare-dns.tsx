
/**
 * app/cloudflare-dns.tsx
 * Cloudflare DNS Record Manager
 * Manages DNS records for bituncoin.world and bituncoin.cloud
 * via Cloudflare API v4
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform,
  Modal, Switch, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import {
  saveCFToken, getCFToken, clearCFToken, verifyCFToken,
  listZones, listDNSRecords, createDNSRecord, updateDNSRecord, deleteDNSRecord,
  DNS_TYPE_CONFIG, MAIN_RECORD_TYPES,
  type CloudflareZone, type CloudflareDNSRecord, type DNSRecordType, type CreateDNSRecordInput,
} from '@/services/cloudflareService';

// ─── Constants ─────────────────────────────────────────────────────────────────
const KNOWN_DOMAINS = ['bituncoin.world', 'bituncoin.cloud'] as const;
type KnownDomain = typeof KNOWN_DOMAINS[number];

const DOMAIN_CFG: Record<KnownDomain, { color: string; emoji: string }> = {
  'bituncoin.world': { color: '#D4A017', emoji: '🌍' },
  'bituncoin.cloud': { color: '#3B82F6', emoji: '☁️' },
};

const FILTER_TYPES: (DNSRecordType | 'ALL')[] = ['ALL', 'A', 'CNAME', 'TXT', 'MX', 'NS', 'AAAA'];

const TTL_OPTIONS = [
  { label: 'Auto', value: 1 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '30 min', value: 1800 },
  { label: '1 hr', value: 3600 },
  { label: '4 hr', value: 14400 },
  { label: '12 hr', value: 43200 },
  { label: '1 day', value: 86400 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatTTL(ttl: number): string {
  if (ttl === 1) return 'Auto';
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.round(ttl / 60)}m`;
  if (ttl < 86400) return `${Math.round(ttl / 3600)}h`;
  return `${Math.round(ttl / 86400)}d`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.9, duration: 850, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1, duration: 850, useNativeDriver: true }),
    ]));
    loop.start(); return () => loop.stop();
  }, [p]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.25, transform: [{ scale: p }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

function TypeBadge({ type, sm }: { type: DNSRecordType; sm?: boolean }) {
  const cfg = DNS_TYPE_CONFIG[type] ?? DNS_TYPE_CONFIG['A'];
  return (
    <View style={[tb.wrap, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={[tb.text, { color: cfg.color, fontSize: sm ? 8 : 10 }]}>{type}</Text>
    </View>
  );
}
const tb = StyleSheet.create({
  wrap: { borderRadius: 5, paddingHorizontal: 0, paddingVertical: 2, borderWidth: 1, alignSelf: 'flex-start' },
  text: { fontWeight: '800' as any, includeFontPadding: false, paddingHorizontal: 6 },
});

// ─── Add / Edit Record Form ────────────────────────────────────────────────────
interface RecordFormState {
  type: DNSRecordType;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority: string;
  comment: string;
}

const BLANK_FORM: RecordFormState = {
  type: 'A', name: '', content: '', ttl: 1, proxied: false, priority: '', comment: '',
};

function RecordFormModal({
  visible,
  editRecord,
  zoneName,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  editRecord: CloudflareDNSRecord | null;
  zoneName: string;
  onClose: () => void;
  onSave: (form: RecordFormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RecordFormState>(BLANK_FORM);
  const [showTtl, setShowTtl] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (editRecord) {
      setForm({
        type: editRecord.type,
        name: editRecord.name.replace('.' + zoneName, '').replace('@.' + zoneName, '@'),
        content: editRecord.content,
        ttl: editRecord.ttl,
        proxied: editRecord.proxied,
        priority: editRecord.priority?.toString() ?? '',
        comment: editRecord.comment ?? '',
      });
    } else {
      setForm(BLANK_FORM);
    }
    setShowTtl(false);
  }, [editRecord, visible, zoneName]);

  const cfg = DNS_TYPE_CONFIG[form.type] ?? DNS_TYPE_CONFIG['A'];
  const isEdit = !!editRecord;

  const update = (key: keyof RecordFormState, val: any) =>
    setForm(prev => ({ ...prev, [key]: val }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={fm.overlay}>
        <View style={[fm.sheet, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', paddingVertical: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border }} />
            </View>

            {/* Header */}
            <View style={fm.header}>
              <View style={[fm.icon, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                <MaterialIcons name={cfg.icon as any} size={22} color={cfg.color} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={fm.title}>{isEdit ? 'Edit Record' : 'Add DNS Record'}</Text>
                <Text style={fm.sub}>{zoneName}</Text>
              </View>
              <TouchableOpacity style={fm.close} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Type selector */}
            {!isEdit && (
              <View style={{ gap: Spacing.sm }}>
                <Text style={s.label}>RECORD TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    {MAIN_RECORD_TYPES.map(t => {
                      const c = DNS_TYPE_CONFIG[t];
                      const active = form.type === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[fm.typeBtn, { borderColor: active ? c.color : Colors.border, backgroundColor: active ? c.bg : Colors.bgElevated }]}
                          onPress={() => update('type', t)}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons name={c.icon as any} size={14} color={active ? c.color : Colors.textMuted} />
                          <Text style={[fm.typeBtnText, { color: active ? c.color : Colors.textMuted }]}>{t}</Text>
                          {active && <View style={[fm.typeDot, { backgroundColor: c.color }]} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>{cfg.desc}</Text>
              </View>
            )}

            {/* Name */}
            <View style={{ gap: 5 }}>
              <Text style={s.label}>NAME *</Text>
              <TextInput
                style={[s.input, { borderColor: cfg.border }]}
                value={form.name}
                onChangeText={v => update('name', v)}
                placeholder={`@ or subdomain (without .${zoneName})`}
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
              />
            </View>

            {/* Content / Value */}
            <View style={{ gap: 5 }}>
              <Text style={s.label}>{form.type === 'MX' ? 'MAIL SERVER' : form.type === 'CNAME' ? 'TARGET' : 'CONTENT'} *</Text>
              <TextInput
                style={[s.input, { borderColor: cfg.border, minHeight: form.type === 'TXT' ? 72 : 48 }]}
                value={form.content}
                onChangeText={v => update('content', v)}
                placeholder={
                  form.type === 'A' ? '203.0.113.1' :
                    form.type === 'AAAA' ? '2001:db8::1' :
                      form.type === 'CNAME' ? 'target.example.com' :
                        form.type === 'TXT' ? 'v=spf1 include:_spf.example.com ~all' :
                          form.type === 'MX' ? 'mail.example.com' :
                            form.type === 'NS' ? 'ns1.example.com' :
                              'Record value'
                }
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                multiline={form.type === 'TXT'}
                numberOfLines={form.type === 'TXT' ? 3 : 1}
                editable={!saving}
              />
            </View>

            {/* Priority (MX / SRV) */}
            {cfg.needsPriority && (
              <View style={{ gap: 5 }}>
                <Text style={s.label}>PRIORITY *</Text>
                <TextInput
                  style={[s.input, { borderColor: cfg.border }]}
                  value={form.priority}
                  onChangeText={v => update('priority', v.replace(/[^0-9]/g, ''))}
                  placeholder="10"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  editable={!saving}
                />
              </View>
            )}

            {/* TTL */}
            <View style={{ gap: 5 }}>
              <Text style={s.label}>TTL</Text>
              <TouchableOpacity
                style={[s.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                onPress={() => setShowTtl(prev => !prev)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false }}>
                  {TTL_OPTIONS.find(t => t.value === form.ttl)?.label ?? `${form.ttl}s`}
                </Text>
                <MaterialIcons name={showTtl ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} color={Colors.textMuted} />
              </TouchableOpacity>
              {showTtl && (
                <View style={fm.ttlGrid}>
                  {TTL_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[fm.ttlBtn, form.ttl === opt.value && { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow }]}
                      onPress={() => { update('ttl', opt.value); setShowTtl(false); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[fm.ttlBtnText, form.ttl === opt.value && { color: Colors.primary }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Proxied toggle */}
            {cfg.proxiable && (
              <View style={fm.toggleRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={fm.toggleLabel}>Cloudflare Proxy</Text>
                  <Text style={fm.toggleSub}>Orange cloud — traffic routed through Cloudflare CDN + DDoS protection</Text>
                </View>
                <Switch
                  value={form.proxied}
                  onValueChange={v => update('proxied', v)}
                  trackColor={{ false: Colors.border, true: '#F6821F55' }}
                  thumbColor={form.proxied ? '#F6821F' : Colors.bgElevated}
                  disabled={saving}
                />
              </View>
            )}

            {/* Comment */}
            <View style={{ gap: 5 }}>
              <Text style={s.label}>COMMENT (OPTIONAL)</Text>
              <TextInput
                style={[s.input, { borderColor: Colors.border }]}
                value={form.comment}
                onChangeText={v => update('comment', v)}
                placeholder="Internal note for this record"
                placeholderTextColor={Colors.textMuted}
                editable={!saving}
              />
            </View>

            {/* Preview */}
            <View style={[fm.preview, { borderColor: cfg.border, backgroundColor: cfg.bg }]}>
              <MaterialIcons name="preview" size={13} color={cfg.color} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[fm.previewType, { color: cfg.color }]}>{form.type} RECORD PREVIEW</Text>
                <Text style={fm.previewLine} numberOfLines={2}>
                  {form.name || '<name>'}{form.name && form.name !== '@' ? '.' : ''}{zoneName} → {form.content || '<content>'}
                  {cfg.needsPriority && form.priority ? ` (priority ${form.priority})` : ''}
                  {' '}TTL: {TTL_OPTIONS.find(t => t.value === form.ttl)?.label ?? `${form.ttl}s`}
                  {form.proxied ? ' 🟠 Proxied' : ''}
                </Text>
              </View>
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: cfg.color, shadowColor: cfg.color }, saving && { opacity: 0.45 }]}
              onPress={() => onSave(form)}
              disabled={saving || !form.name.trim() || !form.content.trim()}
              activeOpacity={0.87}
            >
              {saving
                ? <ActivityIndicator size="small" color={Colors.bg} />
                : <MaterialIcons name={isEdit ? 'save' : 'add-circle'} size={18} color={Colors.bg} />}
              <Text style={s.saveBtnText}>{saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : `Create ${form.type} Record`)}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const fm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.93)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: Spacing.sm, paddingHorizontal: Spacing.xl, maxHeight: '94%', borderTopWidth: 1, borderTopColor: Colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  icon: { width: 46, height: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  close: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8, position: 'relative', overflow: 'hidden' },
  typeBtnText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  typeDot: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5 },
  ttlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  ttlBtn: { borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgElevated },
  ttlBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  toggleLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  toggleSub: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 15, includeFontPadding: false },
  preview: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 3 },
  previewType: { fontSize: 9, fontWeight: '800' as any, letterSpacing: 0.5, includeFontPadding: false },
  previewLine: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
});

// ─── DNS Record Card ───────────────────────────────────────────────────────────
function DNSRecordCard({
  record,
  onEdit,
  onDelete,
}: {
  record: CloudflareDNSRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const cfg = DNS_TYPE_CONFIG[record.type] ?? DNS_TYPE_CONFIG['A'];
  const isProxied = record.proxied;

  const handleCopy = () => {
    Clipboard.setStringAsync(record.content).catch(()=>{});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[rc.card, { borderLeftColor: cfg.color, borderLeftWidth: 3 }]}>
      <View style={rc.header}>
        {/* Type badge */}
        <View style={[rc.typeBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
          <Text style={[rc.typeText, { color: cfg.color }]}>{record.type}</Text>
        </View>

        {/* Name */}
        <Text style={rc.name} numberOfLines={1}>{record.name}</Text>

        {/* Proxy badge */}
        {isProxied && (
          <View style={rc.proxyBadge}>
            <Text style={rc.proxyBadgeText}>🟠 CDN</Text>
          </View>
        )}

        {/* Actions */}
        <View style={rc.actions}>
          <TouchableOpacity style={rc.actionBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="edit" size={15} color={cfg.color} />
          </TouchableOpacity>
          <TouchableOpacity style={[rc.actionBtn, { borderColor: Colors.error + '44' }]} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={[rc.content, { borderColor: cfg.border + '88', backgroundColor: cfg.bg }]}>
        <MaterialIcons name="arrow-forward" size={11} color={cfg.color} style={{ flexShrink: 0 }} />
        <Text style={[rc.contentText, { color: cfg.color }]} selectable numberOfLines={2} ellipsizeMode="middle">
          {record.priority !== undefined ? `[${record.priority}] ` : ''}{record.content}
        </Text>
        <TouchableOpacity
          style={[rc.copyBtn, copied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}
          onPress={handleCopy}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialIcons name={copied ? 'check' : 'content-copy'} size={11} color={copied ? Colors.success : cfg.color} />
        </TouchableOpacity>
      </View>

      {/* Meta */}
      <View style={rc.meta}>
        <MaterialIcons name="timer" size={10} color={Colors.textMuted} />
        <Text style={rc.metaText}>TTL {formatTTL(record.ttl)}</Text>
        <View style={rc.dot} />
        <Text style={rc.metaText} numberOfLines={1} ellipsizeMode="middle">
          {record.id.slice(0, 16)}…
        </Text>
        {record.comment ? (
          <>
            <View style={rc.dot} />
            <MaterialIcons name="comment" size={10} color={Colors.textMuted} />
            <Text style={rc.metaText} numberOfLines={1}>{record.comment}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const rc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  typeText: { fontSize: 11, fontWeight: '800' as any, includeFontPadding: false },
  name: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  proxyBadge: { backgroundColor: '#F6821F15', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#F6821F44', flexShrink: 0 },
  proxyBadgeText: { fontSize: 8, fontWeight: '800' as any, color: '#F6821F', includeFontPadding: false },
  actions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  actionBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.sm + 3, paddingVertical: Spacing.sm },
  contentText: { flex: 1, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 15 },
  copyBtn: { width: 24, height: 24, borderRadius: 7, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function CloudflareDNSScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [apiToken, setApiToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tokenError, setTokenError] = useState('');

  // ── Zone state ─────────────────────────────────────────────────────────────
  const [zones, setZones] = useState<CloudflareZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [selectedZone, setSelectedZone] = useState<CloudflareZone | null>(null);

  // ── DNS Records state ──────────────────────────────────────────────────────
  const [records, setRecords] = useState<CloudflareDNSRecord[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [filterType, setFilterType] = useState<DNSRecordType | 'ALL'>('ALL');
  const [searchQ, setSearchQ] = useState('');

  // ── Form/modal state ───────────────────────────────────────────────────────
  const [formVisible, setFormVisible] = useState(false);
  const [editRecord, setEditRecord] = useState<CloudflareDNSRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const typeStats = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1; return acc;
  }, {});

  // Restore token on mount
  useEffect(() => {
    (async () => {
      const saved = await getCFToken();
      if (saved) {
        setApiToken(saved);
        setConnected(true);
        loadZones(saved);
      }
    })();
  }, [loadZones]);

  // Load zones for known domains when connected
  const loadZones = useCallback(async (token: string) => {
    setZonesLoading(true);
    const { data, error } = await listZones(token);
    setZonesLoading(false);
    if (error) { showAlert('Zones Error', error); return; }
    if (!data) return;
    // Filter to our known domains first, then show all
    const known = data.filter(z => KNOWN_DOMAINS.includes(z.name as KnownDomain));
    const rest = data.filter(z => !KNOWN_DOMAINS.includes(z.name as KnownDomain));
    const sorted = [...known, ...rest];
    setZones(sorted);
    if (!selectedZone && sorted.length > 0) setSelectedZone(sorted[0]);
  }, [showAlert, selectedZone]);

  // Load DNS records for selected zone
  const loadRecords = useCallback(async (zone: CloudflareZone, token: string) => {
    setRecLoading(true);
    setRecords([]);
    const { data, error } = await listDNSRecords(zone.id, token);
    setRecLoading(false);
    if (error) { showAlert('DNS Error', error); return; }
    if (data) setRecords(data);
  }, [showAlert]);

  useEffect(() => {
    if (selectedZone && apiToken) loadRecords(selectedZone, apiToken);
  }, [selectedZone, apiToken, loadRecords]);

  // Connect token
  const handleConnect = useCallback(async () => {
    const tok = tokenInput.trim();
    if (!tok) { setTokenError('Paste your Cloudflare API Token.'); return; }
    setVerifying(true); setTokenError('');
    const { valid, error } = await verifyCFToken(tok);
    setVerifying(false);
    if (!valid) { setTokenError(error ?? 'Token verification failed.'); return; }
    await saveCFToken(tok);
    setApiToken(tok);
    setConnected(true);
    setTokenInput('');
    loadZones(tok);
  }, [tokenInput, loadZones]);

  const handleDisconnect = useCallback(async () => {
    showAlert('Disconnect?', 'Remove stored Cloudflare API token from this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive', onPress: async () => {
          await clearCFToken();
          setApiToken(''); setConnected(false); setZones([]); setSelectedZone(null); setRecords([]);
        }
      },
    ]);
  }, [showAlert]);

  // CRUD
  const handleSave = useCallback(async (form: RecordFormState) => {
    if (!selectedZone || !apiToken) return;
    setSaving(true);
    const input: CreateDNSRecordInput = {
      type: form.type,
      name: form.name.trim(),
      content: form.content.trim(),
      ttl: form.ttl,
      proxied: form.proxied,
      ...(form.priority.trim() ? { priority: Number(form.priority) } : {}),
      ...(form.comment.trim() ? { comment: form.comment.trim() } : {}),
    };
    try {
      if (editRecord) {
        const { error } = await updateDNSRecord(selectedZone.id, editRecord.id, input, apiToken);
        if (error) { showAlert('Update Failed', error); return; }
        showAlert('Updated', `${form.type} record updated.`);
      } else {
        const { error } = await createDNSRecord(selectedZone.id, input, apiToken);
        if (error) { showAlert('Create Failed', error); return; }
        showAlert('Created', `${form.type} record created.`);
      }
      setFormVisible(false);
      setEditRecord(null);
      await loadRecords(selectedZone, apiToken);
    } finally { setSaving(false); }
  }, [selectedZone, apiToken, editRecord, loadRecords, showAlert]);

  const handleDelete = useCallback((record: CloudflareDNSRecord) => {
    const cfg = DNS_TYPE_CONFIG[record.type] ?? DNS_TYPE_CONFIG['A'];
    showAlert(
      `Delete ${record.type} record?`,
      `"${record.name}" → "${record.content}" will be permanently removed from ${selectedZone?.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            if (!selectedZone || !apiToken) return;
            setDeleting(record.id);
            const { error } = await deleteDNSRecord(selectedZone.id, record.id, apiToken);
            setDeleting(null);
            if (error) { showAlert('Delete Failed', error); return; }
            setRecords(prev => prev.filter(r => r.id !== record.id));
          }
        },
      ],
    );
  }, [selectedZone, apiToken, showAlert]);

  // Filtered / searched records
  const filteredRecords = records.filter(r => {
    const matchType = filterType === 'ALL' || r.type === filterType;
    const q = searchQ.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || r.content.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const domainCfg = (name: string) => DOMAIN_CFG[name as KnownDomain] ?? { color: Colors.primary, emoji: '🌐' };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={st.topBar}>
        <TouchableOpacity style={st.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={st.topCenter}>
          <Text style={st.topTitle}>Cloudflare DNS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={connected ? Colors.success : Colors.warning} size={5} />
            <Text style={[st.topSub, { color: connected ? Colors.success : Colors.warning }]}>
              {connected ? `${zones.length} zone${zones.length !== 1 ? 's' : ''} · bituncoin.io` : 'Not connected'}
            </Text>
          </View>
        </View>
        {connected ? (
          <TouchableOpacity
            style={[st.iconBtn, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}
            onPress={handleDisconnect}
            activeOpacity={0.8}
          >
            <MaterialIcons name="logout" size={18} color={Colors.success} />
          </TouchableOpacity>
        ) : (
          <View style={[st.iconBtn, { backgroundColor: Colors.bgCard }]}>
            <MaterialIcons name="cloud-off" size={18} color={Colors.textMuted} />
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.scroll, !connected && { justifyContent: 'flex-start' }]}
      >
        {/* ── NOT CONNECTED ──────────────────────────────────────────────── */}
        {!connected && (
          <>
            {/* Hero */}
            <View style={st.authHero}>
              <View style={st.authHeroIcon}>
                <Text style={{ fontSize: 42 }}>☁️</Text>
              </View>
              <Text style={st.authHeroTitle}>Connect Cloudflare</Text>
              <Text style={st.authHeroSub}>
                Connect your Cloudflare API token to manage DNS records for{' '}
                <Text style={{ color: '#D4A017', fontWeight: FontWeight.bold }}>bituncoin.world</Text>
                {' '}and{' '}
                <Text style={{ color: '#3B82F6', fontWeight: FontWeight.bold }}>bituncoin.cloud</Text>.
              </Text>
            </View>

            {/* Token input */}
            <View style={st.card}>
              <View style={st.cardHeader}>
                <MaterialIcons name="vpn-key" size={16} color={Colors.warning} />
                <Text style={[st.cardTitle, { color: Colors.warning }]}>Cloudflare API Token</Text>
              </View>
              <Text style={st.cardDesc}>
                Create a token at{' '}
                <Text style={{ color: Colors.primary, fontWeight: FontWeight.bold }}>dash.cloudflare.com → My Profile → API Tokens</Text>
                . Requires DNS Read+Edit permission for your zones.
              </Text>

              {/* Feature list */}
              <View style={st.featureList}>
                {[
                  { icon: 'dns', text: 'View & manage A, CNAME, MX, TXT, NS records' },
                  { icon: 'add-circle', text: 'Create new DNS records with full type support' },
                  { icon: 'edit', text: 'Edit existing records including TTL & proxy' },
                  { icon: 'delete', text: 'Delete records from Cloudflare registry' },
                  { icon: 'search', text: 'Search & filter records by type or content' },
                ].map((f, i) => (
                  <View key={i} style={st.featureRow}>
                    <View style={st.featureIcon}>
                      <MaterialIcons name={f.icon as any} size={12} color={Colors.primary} />
                    </View>
                    <Text style={st.featureText}>{f.text}</Text>
                  </View>
                ))}
              </View>

              <Text style={st.inputLabel}>API TOKEN</Text>
              <TextInput
                style={[st.input, { borderColor: tokenError ? Colors.error + '66' : Colors.warning + '55' }]}
                value={tokenInput}
                onChangeText={v => { setTokenInput(v); setTokenError(''); }}
                placeholder="Paste your Cloudflare API token here"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={false}
              />
              {tokenError !== '' && (
                <View style={st.errBox}>
                  <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                  <Text style={st.errText}>{tokenError}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[st.btn, { backgroundColor: Colors.warning, shadowColor: Colors.warning }, (verifying || !tokenInput.trim()) && { opacity: 0.45 }]}
                onPress={handleConnect}
                disabled={verifying || !tokenInput.trim()}
                activeOpacity={0.87}
              >
                {verifying
                  ? <ActivityIndicator size="small" color={Colors.bg} />
                  : <MaterialIcons name="cloud-done" size={17} color={Colors.bg} />}
                <Text style={st.btnText}>{verifying ? 'Verifying token…' : 'Connect to Cloudflare'}</Text>
              </TouchableOpacity>
              <View style={st.note}>
                <MaterialIcons name="security" size={11} color={Colors.textMuted} />
                <Text style={st.noteText}>Token stored on-device only. Never sent to any third-party server.</Text>
              </View>
            </View>

            {/* Account info from dashboard */}
            <View style={st.card}>
              <View style={st.cardHeader}>
                <MaterialIcons name="info-outline" size={15} color={Colors.primary} />
                <Text style={st.cardTitle}>Account Overview</Text>
              </View>
              <TouchableOpacity
                style={[st.btn, { backgroundColor: '#F6821F', shadowColor: '#F6821F', marginTop: 4 }]}
                onPress={() => router.push('/cloudflare-dashboard' as any)}
                activeOpacity={0.87}
              >
                <MaterialIcons name="dashboard" size={16} color={Colors.bg} />
                <Text style={st.btnText}>Open Analytics Dashboard</Text>
                <MaterialIcons name="arrow-forward-ios" size={12} color={Colors.bg} />
              </TouchableOpacity>
              <View style={{ gap: Spacing.sm }}> {/* This View was missing */}
                {[
                  { label: 'Account', value: 'info@bituncoin.com', color: Colors.primary },
                  { label: 'Account ID', value: 'e2d017e4674fbc13224b06b65209ebe1', color: Colors.textMuted },
                  { label: 'Domain 1', value: 'bituncoin.world', color: '#D4A017' },
                  { label: 'Domain 2', value: 'bituncoin.cloud', color: '#3B82F6' },
                  { label: 'Workers', value: '4 deployed', color: Colors.success },
                ].map(row => (
                  <View key={row.label} style={st.summaryRow}>
                    <Text style={st.summaryLabel}>{row.label}</Text>
                    <Text style={[st.summaryValue, { color: row.color }]} numberOfLines={1}>{row.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ── CONNECTED ─────────────────────────────────────────────────── */}
        {connected && (
          <>
            {/* Zone Switcher */}
            {zones.length > 0 ? (
              <View style={st.zoneSwitcher}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: 2, paddingVertical: 2 }}>
                    {zones.map(z => {
                      const dc = domainCfg(z.name);
                      const isActive = selectedZone?.id === z.id;
                      return (
                        <TouchableOpacity
                          key={z.id}
                          style={[st.zoneBtn, isActive && { backgroundColor: dc.color, borderColor: dc.color }]}
                          onPress={() => { setSelectedZone(z); setFilterType('ALL'); setSearchQ(''); }}
                          activeOpacity={0.85}
                        >
                          <Text style={{ fontSize: 14 }}>{dc.emoji}</Text>
                          <Text style={[st.zoneBtnText, isActive && { color: Colors.bg }]}>{z.name}</Text>
                          <View style={[st.zoneStatusDot, { backgroundColor: z.status === 'active' ? Colors.success : Colors.warning }]} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                {zonesLoading && <ActivityIndicator size="small" color={Colors.primary} />}
              </View>
            ) : (
              zonesLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: 2, paddingVertical: Spacing.sm }}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={{ fontSize: FontSize.sm, color: Colors.textMuted }}>Loading zones…</Text>
                </View>
              ) : null
            )}

            {selectedZone && (
              <>
                {/* Zone header card */}
                {(() => {
                  const dc = domainCfg(selectedZone.name);
                  return (
                    <View style={[st.card, { borderColor: dc.color + '55', padding: 0, overflow: 'hidden' }]}>
                      <View style={[st.zoneCardBanner, { backgroundColor: dc.color + '12' }]}>
                        <Text style={{ fontSize: 28 }}>{dc.emoji}</Text>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={[st.zoneCardDomain, { color: dc.color }]}>{selectedZone.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <View style={[st.statusPill, { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}>
                              <LiveDot color={Colors.success} size={5} />
                              <Text style={[st.statusPillText, { color: Colors.success }]}>{selectedZone.status.toUpperCase()}</Text>
                            </View>
                            {!selectedZone.paused && (
                              <View style={[st.statusPill, { backgroundColor: '#F6821F18', borderColor: '#F6821F44' }]}>
                                <Text style={{ fontSize: 10 }}>🟠</Text>
                                <Text style={[st.statusPillText, { color: '#F6821F' }]}>PROXY ON</Text>
                              </View>
                            )}
                            <View style={[st.statusPill, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                              <MaterialIcons name="dns" size={10} color={Colors.textMuted} />
                              <Text style={[st.statusPillText, { color: Colors.textMuted }]}>{records.length} records</Text>
                            </View>
                          </View>
                        </View>
                        {/* Refresh + Add */}
                        <View style={{ gap: Spacing.sm }}>
                          <TouchableOpacity
                            style={[st.miniBtn, { borderColor: dc.color + '55', backgroundColor: dc.color + '12' }]}
                            onPress={() => loadRecords(selectedZone, apiToken)}
                            activeOpacity={0.8}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            {recLoading
                              ? <ActivityIndicator size="small" color={dc.color} />
                              : <MaterialIcons name="refresh" size={16} color={dc.color} />}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[st.miniBtn, { borderColor: dc.color, backgroundColor: dc.color }]}
                            onPress={() => { setEditRecord(null); setFormVisible(true); }}
                            activeOpacity={0.8}
                          >
                            <MaterialIcons name="add" size={16} color={Colors.bg} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Stats row */}
                      {Object.keys(typeStats).length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                          style={{ borderTopWidth: 1, borderTopColor: Colors.border + '55' }}
                          contentContainerStyle={{ flexDirection: 'row', gap: 0 }}>
                          {Object.entries(typeStats).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                            const c = DNS_TYPE_CONFIG[type as DNSRecordType] ?? DNS_TYPE_CONFIG['A'];
                            return (
                              <TouchableOpacity
                                key={type}
                                style={[st.statChip, { borderRightWidth: 1, borderRightColor: Colors.border + '44' },
                                filterType === type && { backgroundColor: c.bg }]}
                                onPress={() => setFilterType(filterType === type ? 'ALL' : type as DNSRecordType)}
                                activeOpacity={0.8}
                              >
                                <Text style={[st.statChipType, { color: c.color }]}>{type}</Text>
                                <Text style={st.statChipCount}>{count}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  );
                })()}

                {/* Search + Filter */}
                <View style={{ gap: Spacing.sm }}>
                  <View style={st.searchRow}>
                    <MaterialIcons name="search" size={18} color={Colors.textMuted} style={{ flexShrink: 0 }} />
                    <TextInput
                      style={st.searchInput}
                      value={searchQ}
                      onChangeText={setSearchQ}
                      placeholder="Search by name, content, or type…"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {searchQ !== '' && (
                      <TouchableOpacity onPress={() => setSearchQ('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialIcons name="close" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                      {FILTER_TYPES.map(ft => {
                        const active = filterType === ft;
                        const c = ft === 'ALL' ? null : DNS_TYPE_CONFIG[ft];
                        return (
                          <TouchableOpacity
                            key={ft}
                            style={[st.filterChip,
                            active && (c
                              ? { borderColor: c.color, backgroundColor: c.bg }
                              : { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow })]}
                            onPress={() => setFilterType(ft)}
                            activeOpacity={0.8}
                          >
                            {ft !== 'ALL' && c && (
                              <MaterialIcons name={c.icon as any} size={11} color={active ? c.color : Colors.textMuted} />
                            )}
                            <Text style={[st.filterChipText, active && (c ? { color: c.color } : { color: Colors.primary })]}>
                              {ft === 'ALL' ? `All (${records.length})` : `${ft} (${typeStats[ft] ?? 0})`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>

                {/* Records list */}
                {recLoading && records.length === 0 ? (
                  <View style={st.loadWrap}>
                    <ActivityIndicator size="large" color={domainCfg(selectedZone.name).color} />
                    <Text style={st.loadText}>Loading DNS records…</Text>
                  </View>
                ) : !recLoading && records.length === 0 ? (
                  <View style={st.emptyWrap}>
                    <Text style={{ fontSize: 48 }}>📭</Text>
                    <Text style={st.emptyTitle}>No DNS Records</Text>
                    <Text style={st.emptySub}>No records found for {selectedZone.name}. Add your first record below.</Text>
                    <TouchableOpacity
                      style={[st.btn, { backgroundColor: domainCfg(selectedZone.name).color }]}
                      onPress={() => { setEditRecord(null); setFormVisible(true); }}
                      activeOpacity={0.85}
                    >
                      <MaterialIcons name="add-circle" size={17} color={Colors.bg} />
                      <Text style={st.btnText}>Add First Record</Text>
                    </TouchableOpacity>
                  </View>
                ) : filteredRecords.length === 0 ? (
                  <View style={st.emptyWrap}>
                    <Text style={{ fontSize: 40 }}>🔍</Text>
                    <Text style={st.emptyTitle}>No matching records</Text>
                    <Text style={st.emptySub}>Try a different filter or search term.</Text>
                    <TouchableOpacity onPress={() => { setFilterType('ALL'); setSearchQ(''); }} activeOpacity={0.8} style={[st.btn, { backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border }]}>
                      <MaterialIcons name="clear" size={16} color={Colors.textPrimary} />
                      <Text style={[st.btnText, { color: Colors.textPrimary }]}>Clear filters</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {/* Results summary */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <MaterialIcons name="dns" size={13} color={Colors.textMuted} />
                      <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false }}>
                        {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
                        {filterType !== 'ALL' ? ` · filtered to ${filterType}` : ''}
                        {searchQ ? ` · "${searchQ}"` : ''}
                      </Text>
                    </View>

                    {filteredRecords.map(record => (
                      <View key={record.id} style={deleting === record.id ? { opacity: 0.4 } : undefined}>
                        <DNSRecordCard
                          record={record}
                          onEdit={() => { setEditRecord(record); setFormVisible(true); }}
                          onDelete={() => handleDelete(record)}
                        />
                      </View>
                    ))}
                  </>
                )}

                {/* Add Record FAB-like card */}
                <TouchableOpacity
                  style={[st.addCard, { borderColor: domainCfg(selectedZone.name).color + '55', backgroundColor: domainCfg(selectedZone.name).color + '08' }]}
                  onPress={() => { setEditRecord(null); setFormVisible(true); }}
                  activeOpacity={0.85}
                >
                  <View style={[st.addCardIcon, { backgroundColor: domainCfg(selectedZone.name).color + '18', borderColor: domainCfg(selectedZone.name).color + '44' }]}>
                    <MaterialIcons name="add-circle" size={22} color={domainCfg(selectedZone.name).color} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[st.addCardTitle, { color: domainCfg(selectedZone.name).color }]}>Add DNS Record</Text>
                    <Text style={st.addCardSub}>A, AAAA, CNAME, TXT, MX, NS, SRV, CAA and more</Text>
                  </View>
                  <MaterialIcons name="arrow-forward-ios" size={13} color={domainCfg(selectedZone.name).color} />
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* Add / Edit Record Form Modal */}
      <RecordFormModal
        visible={formVisible}
        editRecord={editRecord}
        zoneName={selectedZone?.name ?? ''}
        onClose={() => { setFormVisible(false); setEditRecord(null); }}
        onSave={handleSave}
        saving={saving}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter: { flex: 1, alignItems: 'center', gap: 2 },
  topTitle: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.4 },
  topSub: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },

  authHero: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', gap: Spacing.md },
  authHeroIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#3B82F618', borderWidth: 2, borderColor: '#3B82F644', alignItems: 'center', justifyContent: 'center' },
  authHeroTitle: { fontSize: FontSize.xxl ?? 24, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  authHeroSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, includeFontPadding: false },

  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cardDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },

  inputLabel: { fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  input: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4 },
  btnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4, marginTop: Spacing.sm },
  saveBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  errBox: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.error + '44', backgroundColor: Colors.errorBg, padding: Spacing.sm + 2 },
  errText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  note: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  noteText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  featureList: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  featureIcon: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  featureText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  summaryValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false, maxWidth: '60%', textAlign: 'right' },

  // Zone switcher
  zoneSwitcher: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  zoneBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3 },
  zoneBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textMuted, includeFontPadding: false },
  zoneStatusDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },

  // Zone card
  zoneCardBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
  zoneCardDomain: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  statusPillText: { fontSize: 9, fontWeight: '800' as any, letterSpacing: 0.5, includeFontPadding: false },
  miniBtn: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  statChip: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 2 },
  statChipType: { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  statChipCount: { fontSize: 14, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  filterChipText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },

  // States
  loadWrap: { alignItems: 'center', paddingVertical: 48, gap: Spacing.md },
  loadText: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, paddingHorizontal: Spacing.lg, includeFontPadding: false },

  // Add card
  addCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1.5, borderStyle: 'dashed', padding: Spacing.md },
  addCardIcon: { width: 46, height: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  addCardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  addCardSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },

  // Form reuse
  label: { fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
});

// Shared form input style (used in RecordFormModal)
const s = StyleSheet.create({
  label: { fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  input: { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 7, elevation: 4, marginTop: Spacing.sm },
  saveBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
});
