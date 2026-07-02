/**
 * app/btng-zone-search.tsx
 * Freename Zone Browser — Whois · Availability · My Zones · Status Management
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, Modal, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';
import { useAuth0Api } from '@/hooks/useAuth0Api';
import {
  getZoneByName, getMyZones, checkZoneAvailability, updateZoneStatus, createZone, transferZone, createZoneRecords,
  type ZoneStatus, type FreenameZoneMgmt, type FreenameZoneInlineRecord, type FreenameContact, type CreateZoneInput,
} from '@/services/freenameManagementService';

// ─── Config ───────────────────────────────────────────────────────────────────

const ALL_STATUSES: ZoneStatus[] = ['OK', 'INACTIVE', 'LOCK', 'PENDING', 'ERROR'];

const ST: Record<ZoneStatus, { color: string; bg: string; border: string; icon: string; label: string }> = {
  OK:       { color: '#22C55E', bg: '#22C55E10', border: '#22C55E44', icon: 'check-circle',  label: 'Active'   },
  INACTIVE: { color: '#9CA3AF', bg: '#9CA3AF10', border: '#9CA3AF44', icon: 'pause-circle',  label: 'Inactive' },
  LOCK:     { color: '#F59E0B', bg: '#F59E0B10', border: '#F59E0B44', icon: 'lock',           label: 'Locked'   },
  PENDING:  { color: '#F97316', bg: '#F9731610', border: '#F9731644', icon: 'pending',        label: 'Pending'  },
  ERROR:    { color: '#EF4444', bg: '#EF444410', border: '#EF444444', icon: 'error-outline',  label: 'Error'    },
};

type TabKey = 'search' | 'myzones';

// ─── LiveDot ──────────────────────────────────────────────────────────────────
function LiveDot({ color = Colors.success, size = 7 }: { color?: string; size?: number }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(p, { toValue: 1.9, duration: 850, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(p, { toValue: 1,   duration: 850, useNativeDriver: true }),
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

// ─── CopyRow ──────────────────────────────────────────────────────────────────
function CopyRow({ label, value, color = Colors.textPrimary, mono = false }: { label: string; value: string; color?: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={cr.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={cr.label}>{label}</Text>
        <Text style={[cr.value, { color }, mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10 }]} selectable numberOfLines={1} ellipsizeMode="middle">{value || '—'}</Text>
      </View>
      <TouchableOpacity style={[cr.btn, copied && { backgroundColor: Colors.successBg, borderColor: Colors.success + '55' }]}
        onPress={() => { ExpoClipboard.setStringAsync(value).catch(()=>{}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name={copied ? 'check' : 'content-copy'} size={13} color={copied ? Colors.success : Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
const cr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  label: { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.bold, includeFontPadding: false },
  value: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  btn:   { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

// ─── StatusPill ───────────────────────────────────────────────────────────────
function StatusPill({ status, sm }: { status: ZoneStatus; sm?: boolean }) {
  const cfg = ST[status] ?? ST.ERROR;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, borderWidth: 1, paddingHorizontal: sm ? 6 : 9, paddingVertical: sm ? 2 : 4, backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <MaterialIcons name={cfg.icon as any} size={sm ? 9 : 11} color={cfg.color} />
      <Text style={{ fontSize: sm ? 8 : 10, fontWeight: '800' as any, color: cfg.color, includeFontPadding: false }}>{cfg.label.toUpperCase()}</Text>
    </View>
  );
}

// ─── RecordRow ────────────────────────────────────────────────────────────────
function RecordRow({ rec, crypto }: { rec: FreenameZoneInlineRecord; crypto: boolean }) {
  const color = crypto ? Colors.primary : Colors.textMuted;
  return (
    <View style={rr.row}>
      <View style={[rr.type, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <Text style={[rr.typeText, { color }]}>{rec.type}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {rec.name && rec.name !== rec.value && <Text style={rr.name} numberOfLines={1}>{rec.name}</Text>}
        <Text style={rr.val} numberOfLines={2} selectable>{rec.value || '—'}</Text>
        {rec.ttl > 0 && <Text style={rr.ttl}>TTL {rec.ttl}s</Text>}
      </View>
      <TouchableOpacity style={rr.copy} onPress={() => ExpoClipboard.setStringAsync(rec.value).catch(()=>{})} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <MaterialIcons name="content-copy" size={12} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
const rr = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  type:     { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 },
  typeText: { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  name:     { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  val:      { fontSize: 10, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, lineHeight: 14 },
  ttl:      { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  copy:     { width: 24, height: 24, borderRadius: 7, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'flex-start' },
});

// ─── ContactBlock ─────────────────────────────────────────────────────────────
function ContactBlock({ title, contact, color = Colors.primary }: { title: string; contact: FreenameContact; color?: string }) {
  return (
    <View style={[cb.wrap, { borderColor: color + '33' }]}>
      <Text style={[cb.title, { color }]}>{title}</Text>
      {contact.name          && <CopyRow label="Name"    value={contact.name}         color={Colors.textPrimary} />}
      {contact.email         && <CopyRow label="Email"   value={contact.email}        color={Colors.textSecondary} />}
      {contact.city          && <CopyRow label="City"    value={`${contact.city}${contact.country ? ', ' + contact.country : ''}`} color={Colors.textMuted} />}
      {contact.walletAddress && <CopyRow label="Wallet"  value={contact.walletAddress} color={color} mono />}
    </View>
  );
}
const cb = StyleSheet.create({
  wrap:  { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 2 },
  title: { fontSize: 10, fontWeight: '800' as any, letterSpacing: 0.4, includeFontPadding: false, marginBottom: 2 },
});

// ─── ZoneCard ─────────────────────────────────────────────────────────────────
function ZoneCard({ zone, onOpen, highlight }: { zone: FreenameZoneMgmt; onOpen: () => void; highlight?: boolean }) {
  const cfg        = ST[zone.status] ?? ST.ERROR;
  const cryptoRecs = (zone.records ?? []).filter(r => !['A','NS','SOA','CNAME','MX','TXT'].includes(r.type.toUpperCase()));
  return (
    <TouchableOpacity
      style={[zc.card, highlight && { borderColor: Colors.primary + '77', borderWidth: 2 }]}
      onPress={onOpen} activeOpacity={0.87}
    >
      <View style={zc.header}>
        <View style={[zc.icon, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <MaterialIcons name="language" size={22} color={cfg.color} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={zc.name} numberOfLines={1}>{zone.name}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusPill status={zone.status} sm />
            {zone.chain ? <View style={[zc.chip, { backgroundColor: '#8247E518', borderColor: '#8247E544' }]}><Text style={[zc.chipText, { color: '#8247E5' }]}>{zone.chain}</Text></View> : null}
            {cryptoRecs.length > 0 ? <View style={[zc.chip, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}><Text style={[zc.chipText, { color: Colors.primary }]}>{cryptoRecs.length} crypto</Text></View> : null}
          </View>
        </View>
        <View style={zc.arrow}>
          <MaterialIcons name="chevron-right" size={18} color={Colors.primary} />
        </View>
      </View>
      <View style={zc.uuid}>
        <MaterialIcons name="fingerprint" size={10} color={Colors.textMuted} />
        <Text style={zc.uuidText} numberOfLines={1} ellipsizeMode="middle">{zone.uuid}</Text>
      </View>
      {(zone.registrationDate || (zone.records?.length ?? 0) > 0) && (
        <View style={zc.meta}>
          {zone.registrationDate ? <><MaterialIcons name="event" size={10} color={Colors.textMuted} /><Text style={zc.metaText}>{new Date(zone.registrationDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</Text></> : null}
          {(zone.records?.length ?? 0) > 0 ? <><Text style={zc.metaDot}>·</Text><MaterialIcons name="dns" size={10} color={Colors.textMuted} /><Text style={zc.metaText}>{zone.records!.length} records</Text></> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}
const zc = StyleSheet.create({
  card:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  header:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  icon:     { width: 46, height: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  chip:     { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  chipText: { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  arrow:    { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'center' },
  uuid:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  uuidText: { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  metaDot:  { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
});

// ─── ZoneDetailSheet ──────────────────────────────────────────────────────────
const RECORD_TYPES = ['ETH', 'BTC', 'MATIC', 'SOL', 'BNB', 'USDT', 'A', 'CNAME'] as const;
type AddRecordType = typeof RECORD_TYPES[number];

const RT_COLOR: Record<string, string> = {
  ETH: '#627EEA', BTC: '#F7931A', MATIC: '#8247E5', SOL: '#9945FF',
  BNB: '#F0B90B', USDT: '#26A17B', A: '#22C55E', CNAME: '#3B82F6',
};

function ZoneDetailSheet({
  zone, onClose, onUpdateStatus, statusUpdating, onTransferZone, transferLoading, transferResult, onAddRecord, addRecordLoading,
}: {
  zone: FreenameZoneMgmt;
  onClose: () => void;
  onUpdateStatus: (uuid: string, st: ZoneStatus) => void;
  statusUpdating: boolean;
  onTransferZone: (uuid: string, registrar: string, registrant: string) => void;
  transferLoading: boolean;
  transferResult: FreenameZoneMgmt | null;
  onAddRecord: (zoneUuid: string, type: string, key: string, value: string) => Promise<boolean>;
  addRecordLoading: boolean;
}) {
  const cfg        = ST[zone.status] ?? ST.ERROR;
  const cryptoRecs = (zone.records ?? []).filter(r => !['A','NS','SOA','CNAME','MX','TXT'].includes(r.type.toUpperCase()));
  const dnsRecs    = (zone.records ?? []).filter(r =>  ['A','NS','SOA','CNAME','MX','TXT'].includes(r.type.toUpperCase()));

  const [txRegistrar,  setTxRegistrar]  = useState('');
  const [txRegistrant, setTxRegistrant] = useState('');

  // Add record state (collapsible)
  const [addOpen,      setAddOpen]      = useState(false);
  const [addType,      setAddType]      = useState<AddRecordType>('ETH');
  const [addKey,       setAddKey]       = useState('');
  const [addValue,     setAddValue]     = useState('');
  const [addError,     setAddError]     = useState('');
  const addColAnim = useRef(new Animated.Value(0)).current;

  const toggleAdd = () => {
    const next = !addOpen;
    setAddOpen(next);
    Animated.timing(addColAnim, { toValue: next ? 1 : 0, duration: 220, useNativeDriver: false }).start();
  };

  const handleSaveRecord = async () => {
    if (!addValue.trim()) { setAddError('Value is required.'); return; }
    setAddError('');
    const key   = addKey.trim() || `token.${addType}.0`;
    const success = await onAddRecord(zone.uuid, addType, key, addValue.trim());
    if (success) { setAddValue(''); setAddKey(''); setAddOpen(false); Animated.timing(addColAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start(); }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.xl }}>
      {/* Handle + Header */}
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border }} />
      </View>
      <View style={ds.header}>
        <View style={[ds.icon, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <MaterialIcons name="language" size={24} color={cfg.color} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={ds.name}>{zone.name}</Text>
          <StatusPill status={zone.status} />
        </View>
        <TouchableOpacity style={ds.close} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="close" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Zone Details */}
      <View style={ds.section}>
        <Text style={ds.sTitle}>Zone Details</Text>
        <CopyRow label="Zone UUID"     value={zone.uuid}          color={Colors.primary}       mono />
        {zone.asciiName        ? <CopyRow label="ASCII Name"  value={zone.asciiName}         color={Colors.textPrimary} /> : null}
        {zone.chain            ? <CopyRow label="Chain"       value={zone.chain}             color="#8247E5" /> : null}
        {zone.registrationDate ? <CopyRow label="Registered"  value={new Date(zone.registrationDate).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })} color={Colors.success} /> : null}
        {zone.expirationDate   ? <CopyRow label="Expires"     value={zone.expirationDate}    color={Colors.warning} /> : null}
        {zone.tld              ? <CopyRow label="TLD"         value={zone.tld}               color={Colors.textSecondary} /> : null}
        {zone.sld              ? <CopyRow label="SLD"         value={zone.sld}               color={Colors.textSecondary} /> : null}
        {zone.profileRegistry  ? <CopyRow label="Registry"    value={zone.profileRegistry.name} color={Colors.primary} /> : null}
      </View>

      {/* Update Status */}
      <View style={ds.section}>
        <Text style={ds.sTitle}>Update Status</Text>
        <Text style={ds.sDesc}>Change zone lifecycle on the Freename registry. LOCK prevents transfers; INACTIVE disables the zone.</Text>
        <View style={ds.statusGrid}>
          {ALL_STATUSES.map(st => {
            const c      = ST[st];
            const active = zone.status === st;
            return (
              <TouchableOpacity
                key={st}
                style={[ds.stBtn, { borderColor: active ? c.color : c.border, backgroundColor: c.bg, borderWidth: active ? 2 : 1 }]}
                onPress={() => !active && onUpdateStatus(zone.uuid, st)}
                disabled={active || statusUpdating}
                activeOpacity={0.8}
              >
                {statusUpdating && !active
                  ? <ActivityIndicator size="small" color={c.color} />
                  : <MaterialIcons name={c.icon as any} size={16} color={c.color} />}
                <Text style={[ds.stText, { color: c.color }]}>{c.label}</Text>
                {active && <View style={[ds.stDot, { backgroundColor: c.color }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Transfer Zone */}
      <View style={ds.section}>
        <Text style={ds.sTitle}>Transfer Zone</Text>
        <Text style={ds.sDesc}>Transfer ownership to a new registrar and/or registrant by providing their Freename UUIDs. This action cannot be undone.</Text>
        <View style={[ds.transferWarn, { borderColor: Colors.warning + '55', backgroundColor: Colors.warningBg }]}>
          <MaterialIcons name="warning" size={13} color={Colors.warning} />
          <Text style={[ds.transferWarnText, { color: Colors.warning }]}>Only proceed if you intend to permanently change zone ownership on the Freename registry.</Text>
        </View>
        <Text style={ds.transferLabel}>NEW REGISTRAR UUID</Text>
        <TextInput
          style={[ds.transferInput, { borderColor: Colors.warning + '55' }]}
          value={txRegistrar}
          onChangeText={setTxRegistrar}
          placeholder="e.g. 1230a773-c74a-48ad-bb9a-fd4781774775"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!transferLoading}
        />
        <Text style={[ds.transferLabel, { marginTop: 6 }]}>NEW REGISTRANT UUID</Text>
        <TextInput
          style={[ds.transferInput, { borderColor: Colors.warning + '55' }]}
          value={txRegistrant}
          onChangeText={setTxRegistrant}
          placeholder="e.g. 5bbbbc79-2ead-4039-9b9d-d565cbbfcb2c"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!transferLoading}
        />
        <TouchableOpacity
          style={[ds.transferBtn, (!txRegistrar.trim() && !txRegistrant.trim() || transferLoading) && { opacity: 0.45 }]}
          onPress={() => onTransferZone(zone.uuid, txRegistrar, txRegistrant)}
          disabled={(!txRegistrar.trim() && !txRegistrant.trim()) || transferLoading}
          activeOpacity={0.85}
        >
          {transferLoading
            ? <ActivityIndicator size="small" color={Colors.bg} />
            : <MaterialIcons name="swap-horiz" size={17} color={Colors.bg} />}
          <Text style={ds.transferBtnText}>{transferLoading ? 'Transferring…' : 'Confirm Transfer'}</Text>
        </TouchableOpacity>
        {transferResult && transferResult.uuid === zone.uuid && (
          <View style={[ds.transferSuccess, { borderColor: Colors.success + '55', backgroundColor: Colors.successBg }]}>
            <MaterialIcons name="check-circle" size={16} color={Colors.success} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[ds.transferSuccessTitle, { color: Colors.success }]}>Transfer Successful</Text>
              {transferResult.registrar?.name
                ? <Text style={ds.transferSuccessSub}>New registrar: {transferResult.registrar.name}</Text>
                : null}
              {transferResult.registrant?.name
                ? <Text style={ds.transferSuccessSub}>New registrant: {transferResult.registrant.name}</Text>
                : null}
              <Text style={ds.transferSuccessSub}>Zone status: {transferResult.status}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Crypto Records */}
      {cryptoRecs.length > 0 && (
        <View style={ds.section}>
          <Text style={ds.sTitle}>Crypto Records ({cryptoRecs.length})</Text>
          {cryptoRecs.map((r, i) => <RecordRow key={r.uuid ?? String(i)} rec={r} crypto />)}
        </View>
      )}

      {/* Add Record — collapsible */}
      <View style={ds.section}>
        <TouchableOpacity style={ds.addRecToggle} onPress={toggleAdd} activeOpacity={0.85}>
          <View style={[ds.addRecIcon, { backgroundColor: addOpen ? Colors.primaryGlow : Colors.bgElevated, borderColor: addOpen ? Colors.primary + '66' : Colors.border }]}>
            <MaterialIcons name={addOpen ? 'remove-circle' : 'add-circle'} size={16} color={addOpen ? Colors.primary : Colors.textMuted} />
          </View>
          <Text style={[ds.addRecToggleText, addOpen && { color: Colors.primary }]}>Add Record to Freename</Text>
          <View style={[ds.addRecPill, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
            <Text style={[ds.addRecPillText, { color: Colors.primary }]}>REGISTRY</Text>
          </View>
          <MaterialIcons name={addOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={16} color={addOpen ? Colors.primary : Colors.textMuted} />
        </TouchableOpacity>

        <Animated.View style={{ opacity: addColAnim, overflow: 'hidden',
          maxHeight: addColAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 480] }) }}>
          <View style={[ds.addRecBody, { borderColor: Colors.primary + '33' }]}>

            {/* Type selector */}
            <Text style={ds.addRecLabel}>RECORD TYPE</Text>
            <View style={ds.addRecTypeRow}>
              {RECORD_TYPES.map(rt => {
                const c = RT_COLOR[rt] ?? Colors.textMuted;
                const active = addType === rt;
                return (
                  <TouchableOpacity
                    key={rt}
                    style={[ds.addRecTypeBtn, { borderColor: active ? c : Colors.border, backgroundColor: active ? c + '18' : Colors.bgElevated }]}
                    onPress={() => setAddType(rt)}
                    activeOpacity={0.8}
                  >
                    <Text style={[ds.addRecTypeBtnText, { color: active ? c : Colors.textMuted }]}>{rt}</Text>
                    {active && <View style={[ds.addRecTypeDot, { backgroundColor: c }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Key input */}
            <Text style={[ds.addRecLabel, { marginTop: 8 }]}>RECORD KEY (OPTIONAL)</Text>
            <TextInput
              style={[ds.addRecInput, { borderColor: Colors.border }]}
              value={addKey}
              onChangeText={setAddKey}
              placeholder={`e.g. token.${addType}.0`}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!addRecordLoading}
            />

            {/* Value input */}
            <Text style={[ds.addRecLabel, { marginTop: 8 }]}>VALUE *</Text>
            <TextInput
              style={[ds.addRecInput, { borderColor: (addError ? Colors.error : Colors.primary) + '66' }]}
              value={addValue}
              onChangeText={v => { setAddValue(v); setAddError(''); }}
              placeholder={addType === 'A' ? '34.22.218.54' : addType === 'CNAME' ? 'cname.example.com' : `0x… or ${addType.toLowerCase()}1…`}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!addRecordLoading}
            />

            {addError !== '' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="error-outline" size={12} color={Colors.error} />
                <Text style={{ fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false, flex: 1 }}>{addError}</Text>
              </View>
            )}

            {/* Save button */}
            <TouchableOpacity
              style={[ds.addRecSaveBtn, (!addValue.trim() || addRecordLoading) && { opacity: 0.45 }]}
              onPress={handleSaveRecord}
              disabled={!addValue.trim() || addRecordLoading}
              activeOpacity={0.87}
            >
              {addRecordLoading
                ? <ActivityIndicator size="small" color={Colors.bg} />
                : <MaterialIcons name="cloud-upload" size={15} color={Colors.bg} />}
              <Text style={ds.addRecSaveBtnText}>{addRecordLoading ? 'Saving…' : `Save ${addType} Record`}</Text>
            </TouchableOpacity>

            <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2, borderColor: Colors.primary + '33', backgroundColor: Colors.primaryGlow }]}>
              <MaterialIcons name="info-outline" size={11} color={Colors.primary} />
              <Text style={{ flex: 1, fontSize: 10, color: Colors.primary, lineHeight: 14, includeFontPadding: false }}>
                Records are saved directly to the Freename registry via the management API. Key defaults to token.{addType}.0 if left blank.
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>

      {/* DNS Records */}
      {dnsRecs.length > 0 && (
        <View style={ds.section}>
          <Text style={ds.sTitle}>DNS Records ({dnsRecs.length})</Text>
          {dnsRecs.map((r, i) => <RecordRow key={r.uuid ?? String(i)} rec={r} crypto={false} />)}
        </View>
      )}

      {/* Registrar */}
      {zone.registrar && Object.keys(zone.registrar).some(k => (zone.registrar as any)[k]) && (
        <View style={ds.section}>
          <Text style={ds.sTitle}>Registrar</Text>
          <ContactBlock title="REGISTRAR" contact={zone.registrar} color={Colors.primary} />
        </View>
      )}

      {/* Registrant */}
      {zone.registrant && Object.keys(zone.registrant).some(k => (zone.registrant as any)[k]) && (
        <View style={ds.section}>
          <Text style={ds.sTitle}>Registrant</Text>
          <ContactBlock title="REGISTRANT" contact={zone.registrant} color="#8247E5" />
        </View>
      )}
    </ScrollView>
  );
}
const ds = StyleSheet.create({
  header:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  transferWarn:   { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  transferWarnText:{ flex: 1, fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },
  transferLabel:  { fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  transferInput:  { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, fontSize: FontSize.xs, color: Colors.textPrimary, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  transferBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.warning, borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowColor: Colors.warning, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 7, elevation: 4 },
  transferBtnText:{ fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  transferSuccess:{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  transferSuccessTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  transferSuccessSub:   { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  icon:           { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:           { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  close:          { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  section:    { gap: Spacing.sm },
  sTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  sDesc:      { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
  addRecToggle:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm - 1 },
  addRecIcon:      { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  addRecToggleText:{ flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  addRecPill:      { flexDirection: 'row', alignItems: 'center', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  addRecPillText:  { fontSize: 8, fontWeight: '800' as any, includeFontPadding: false },
  addRecBody:      { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, marginTop: 4 },
  addRecLabel:     { fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  addRecTypeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  addRecTypeBtn:   { borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 6, position: 'relative', overflow: 'hidden' },
  addRecTypeBtnText:{ fontSize: 10, fontWeight: '800' as any, includeFontPadding: false },
  addRecTypeDot:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2.5 },
  addRecInput:     { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, fontSize: FontSize.xs, color: Colors.textPrimary, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  addRecSaveBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md - 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 3 },
  addRecSaveBtnText:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minWidth: '28%', borderRadius: Radius.lg, paddingVertical: Spacing.sm + 4, paddingHorizontal: Spacing.sm, position: 'relative', overflow: 'hidden' },
  stText:     { fontSize: 10, fontWeight: '800' as any, includeFontPadding: false },
  stDot:      { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function BTNGZoneSearchScreen() {
  const insets        = useSafeAreaInsets();
  const router        = useRouter();
  const { showAlert } = useAlert();

  const {
    isAuthenticated: fAuth, login: fLogin, logout: fLogout,
    operationLoading: fLoading, error: fError, userInfo: fUser, getAccessToken,
  } = useAuth0Api();

  const [tab, setTab] = useState<TabKey>('search');

  // Search state
  const [searchInput,   setSearchInput]   = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult,  setSearchResult]  = useState<FreenameZoneMgmt | null>(null);
  const [searchError,   setSearchError]   = useState('');

  // Availability state
  const [availInput,   setAvailInput]   = useState('');
  const [availLoading, setAvailLoading] = useState(false);
  const [availResult,  setAvailResult]  = useState<boolean | null>(null);
  const [availError,   setAvailError]   = useState('');

  // My Zones state
  const [myZones,        setMyZones]        = useState<FreenameZoneMgmt[]>([]);
  const [zonesLoading,   setZonesLoading]   = useState(false);
  const [zonesError,     setZonesError]     = useState('');
  const [zonesPage,      setZonesPage]      = useState(0);

  // Detail modal
  const [selectedZone,   setSelectedZone]   = useState<FreenameZoneMgmt | null>(null);
  const [detailOpen,     setDetailOpen]     = useState(false);
  const [stUpdating,     setStUpdating]     = useState(false);

  // Transfer zone state
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferResult,  setTransferResult]  = useState<FreenameZoneMgmt | null>(null);

  // Add record state
  const [addRecordLoading, setAddRecordLoading] = useState(false);

  // Login form
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Register zone state
  const [registerOpen,    setRegisterOpen]    = useState(false);
  const [registerName,    setRegisterName]    = useState('');
  const [registerDesc,    setRegisterDesc]    = useState('');
  const [registerChain,   setRegisterChain]   = useState('POLYGON');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerResult,  setRegisterResult]  = useState<FreenameZoneMgmt | null>(null);
  const [registerError,   setRegisterError]   = useState('');
  const [registerDone,    setRegisterDone]    = useState(false);

  useEffect(() => {
    if (fAuth && tab === 'myzones' && myZones.length === 0) loadMyZones(0);
  }, [fAuth, tab]);

  const handleSearch = useCallback(async () => {
    const name = searchInput.trim();
    if (!name) { showAlert('Name Required', 'Enter a zone name to look up.'); return; }
    setSearchLoading(true); setSearchResult(null); setSearchError('');
    try {
      const token = await getAccessToken();
      if (!token) { setSearchError('Connect your Freename account to search zones.'); return; }
      const { zone, error } = await getZoneByName(name, token);
      if (!zone) { setSearchError(error ?? `Zone "${name}" not found.`); return; }
      setSearchResult(zone);
    } catch (e: any) { setSearchError(e?.message ?? 'Search failed.'); }
    finally { setSearchLoading(false); }
  }, [searchInput, getAccessToken, showAlert]);

  const handleAvailability = useCallback(async () => {
    const name = availInput.trim();
    if (!name) { showAlert('Name Required', 'Enter a zone name to check.'); return; }
    setAvailLoading(true); setAvailResult(null); setAvailError('');
    try {
      const { available, error } = await checkZoneAvailability(name);
      if (error) { setAvailError(error); return; }
      setAvailResult(available);
    } catch (e: any) { setAvailError(e?.message ?? 'Check failed.'); }
    finally { setAvailLoading(false); }
  }, [availInput, showAlert]);

  const loadMyZones = useCallback(async (page = 0) => {
    if (!fAuth) return;
    setZonesLoading(true); setZonesError('');
    try {
      const token = await getAccessToken();
      if (!token) { setZonesError('Authentication required.'); return; }
      const zones = await getMyZones(token, page, 25);
      setMyZones(prev => page === 0 ? zones : [...prev, ...zones]);
      setZonesPage(page);
    } catch (e: any) { setZonesError(e?.message ?? 'Failed to load zones.'); }
    finally { setZonesLoading(false); }
  }, [fAuth, getAccessToken]);

  const handleUpdateStatus = useCallback(async (uuid: string, status: ZoneStatus) => {
    const cfg = ST[status];
    showAlert(`Set to ${cfg.label}?`, `Update zone status to ${status} on the Freename registry.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Set ${cfg.label}`, style: status === 'ERROR' ? 'destructive' : 'default', onPress: async () => {
        setStUpdating(true);
        try {
          const token = await getAccessToken();
          if (!token) { showAlert('Auth Error', 'Could not get access token.'); return; }
          const { zone: updated, error } = await updateZoneStatus(uuid, status, token);
          if (error) { showAlert('Update Failed', error); return; }
          if (updated) {
            setSelectedZone(updated);
            setMyZones(prev => prev.map(z => z.uuid === uuid ? { ...z, status } : z));
            showAlert('Updated', `Zone status set to ${status}.`);
          }
        } catch (e: any) { showAlert('Error', e?.message ?? 'Update failed.'); }
        finally { setStUpdating(false); }
      }},
    ]);
  }, [getAccessToken, showAlert]);

  const handleTransferZone = useCallback(async (uuid: string, registrar: string, registrant: string) => {
    showAlert('Confirm Transfer?', `Transfer zone ownership to new registrar/registrant? This action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Transfer', style: 'destructive', onPress: async () => {
        setTransferLoading(true);
        setTransferResult(null);
        try {
          const token = await getAccessToken();
          if (!token) { showAlert('Auth Error', 'Could not get access token.'); return; }
          const { zone: updated, error } = await transferZone(uuid, { registrar: registrar.trim() || undefined, registrant: registrant.trim() || undefined }, token);
          if (error) { showAlert('Transfer Failed', error); return; }
          if (updated) {
            setTransferResult(updated);
            setSelectedZone(updated);
            setMyZones(prev => prev.map(z => z.uuid === uuid ? updated : z));
            showAlert('Transferred', `Zone ownership successfully updated.`);
          }
        } catch (e: any) { showAlert('Error', e?.message ?? 'Transfer failed.'); }
        finally { setTransferLoading(false); }
      }},
    ]);
  }, [getAccessToken, showAlert]);

  const openRegister = useCallback((name: string) => {
    setRegisterName(name);
    setRegisterDesc('');
    setRegisterChain('POLYGON');
    setRegisterError('');
    setRegisterResult(null);
    setRegisterDone(false);
    setRegisterOpen(true);
  }, []);

  const handleRegister = useCallback(async () => {
    if (!fAuth) { showAlert('Not Connected', 'Connect your Freename account to register zones.'); return; }
    const name = registerName.trim();
    if (!name) { showAlert('Name Required', 'Zone name cannot be empty.'); return; }
    setRegisterLoading(true); setRegisterError(''); setRegisterResult(null); setRegisterDone(false);
    try {
      const token = await getAccessToken();
      if (!token) { setRegisterError('Could not get access token.'); return; }
      const input: CreateZoneInput = {
        name,
        status: 'OK',
        chain: registerChain,
        description: registerDesc.trim() || undefined,
      };
      const { zone, error } = await createZone(input, token, false);
      if (error || !zone) { setRegisterError(error ?? 'Registration failed.'); return; }
      setRegisterResult(zone);
      setRegisterDone(true);
      setMyZones(prev => [zone, ...prev]);
    } catch (e: any) {
      setRegisterError(e?.message ?? 'Registration failed.');
    } finally { setRegisterLoading(false); }
  }, [fAuth, getAccessToken, registerName, registerChain, registerDesc, showAlert]);

  const handleLogin = useCallback(async () => {
    if (!loginUser.trim() || !loginPass.trim()) { showAlert('Required', 'Enter username and password.'); return; }
    const res = await fLogin(loginUser.trim(), loginPass.trim());
    if (res.success) { showAlert('Connected', 'Freename account linked.'); setLoginPass(''); }
  }, [loginUser, loginPass, fLogin, showAlert]);

  const handleAddRecordToZone = useCallback(async (
    zoneUuid: string,
    recordType: string,
    key: string,
    value: string,
  ): Promise<boolean> => {
    setAddRecordLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) { showAlert('Auth Error', 'Could not get access token.'); return false; }
      const result = await createZoneRecords({ zoneUuid, records: [{ type: recordType, key, value }] }, token);
      if (!result.success) { showAlert('Error', result.error ?? 'Failed to add record.'); return false; }
      if (result.records && result.records.length > 0) {
        const nr = result.records[0];
        const inlineRec: FreenameZoneInlineRecord = { uuid: nr.uuid, type: nr.type, name: nr.key, value: nr.value, ttl: 60 };
        setSelectedZone(prev => prev ? { ...prev, records: [inlineRec, ...(prev.records ?? [])] } : prev);
      } else {
        // If API returns no records array, synthesise from input
        const inlineRec: FreenameZoneInlineRecord = { uuid: Date.now().toString(), type: recordType, name: key, value, ttl: 60 };
        setSelectedZone(prev => prev ? { ...prev, records: [inlineRec, ...(prev.records ?? [])] } : prev);
      }
      showAlert('Record Added', `${recordType} record saved to Freename registry.`);
      return true;
    } catch (e: any) { showAlert('Error', e?.message ?? 'Failed to add record.'); return false; }
    finally { setAddRecordLoading(false); }
  }, [getAccessToken, showAlert]);

  const openDetail = (zone: FreenameZoneMgmt) => { setSelectedZone(zone); setTransferResult(null); setDetailOpen(true); };

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'search',  label: 'Search',   icon: 'search'  },
    { key: 'myzones', label: 'My Zones', icon: 'folder'  },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>

      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topCenter}>
          <Text style={s.topTitle}>Zone Browser</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <LiveDot color={fAuth ? Colors.success : Colors.warning} size={5} />
            <Text style={[s.topSub, { color: fAuth ? Colors.success : Colors.warning }]}>
              {fAuth ? `Freename · ${(fUser as any)?.email ?? 'Connected'}` : 'Freename API · Not Connected'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: fAuth ? Colors.successBg : Colors.bgCard, borderColor: (fAuth ? Colors.success : Colors.border) + '55' }]}
          onPress={() => fAuth ? fLogout() : null}
          activeOpacity={0.8}
        >
          <MaterialIcons name={fAuth ? 'logout' : 'cloud-off'} size={18} color={fAuth ? Colors.success : Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Tab Row — authenticated only */}
      {fAuth && (
        <View style={s.tabRow}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabActive]} onPress={() => setTab(t.key)} activeOpacity={0.8}>
              <MaterialIcons name={t.icon as any} size={14} color={tab === t.key ? Colors.bg : Colors.textMuted} />
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
              {t.key === 'myzones' && myZones.length > 0 && (
                <View style={[s.badge, tab === t.key && { backgroundColor: Colors.bg + '33', borderColor: Colors.bg + '55' }]}>
                  <Text style={[s.badgeText, tab === t.key && { color: Colors.bg }]}>{myZones.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── NOT AUTHENTICATED ─────────────────────────────────────────────── */}
        {!fAuth && (
          <>
            {/* Availability check — public */}
            <View style={s.card}>
              <View style={s.ch}>
                <MaterialIcons name="check-circle-outline" size={16} color="#22C55E" />
                <Text style={[s.ct, { color: '#22C55E' }]}>Name Availability</Text>
                <View style={[s.pill, { backgroundColor: '#22C55E10', borderColor: '#22C55E44' }]}>
                  <Text style={[s.pillText, { color: '#22C55E' }]}>PUBLIC</Text>
                </View>
              </View>
              <Text style={s.cd}>Check if a Freename domain name is available — no login required.</Text>
              <Text style={s.il}>ZONE NAME</Text>
              <TextInput style={[s.input, { borderColor: '#22C55E55' }]} value={availInput} onChangeText={v => { setAvailInput(v); setAvailResult(null); setAvailError(''); }} placeholder="e.g. myname.metaverse" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity style={[s.btn, { backgroundColor: '#22C55E', shadowColor: '#22C55E' }, availLoading && { opacity: 0.5 }]} onPress={handleAvailability} disabled={availLoading} activeOpacity={0.85}>
                {availLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="search" size={17} color={Colors.bg} />}
                <Text style={s.btnText}>{availLoading ? 'Checking…' : 'Check Availability'}</Text>
              </TouchableOpacity>
              {availResult !== null && (
                <View style={{ gap: Spacing.sm }}>
                  <View style={[s.availBox, { borderColor: (availResult ? Colors.success : Colors.error) + '55', backgroundColor: availResult ? Colors.successBg : Colors.errorBg }]}>
                    <MaterialIcons name={availResult ? 'check-circle' : 'cancel'} size={22} color={availResult ? Colors.success : Colors.error} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.availTitle, { color: availResult ? Colors.success : Colors.error }]}>{availInput} is {availResult ? 'AVAILABLE' : 'TAKEN'}</Text>
                      <Text style={s.availSub}>{availResult ? 'Register this name on freename.io' : 'Already registered by another user'}</Text>
                    </View>
                  </View>
                  {availResult && (
                    <TouchableOpacity
                      style={[s.btn, { backgroundColor: Colors.primary, shadowColor: Colors.primary }]}
                      onPress={() => openRegister(availInput)}
                      activeOpacity={0.87}
                    >
                      <MaterialIcons name="add-circle" size={18} color={Colors.bg} />
                      <Text style={s.btnText}>Register on Freename</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {availError !== '' && <View style={s.errBox}><MaterialIcons name="error-outline" size={13} color={Colors.error} /><Text style={s.errText}>{availError}</Text></View>}
            </View>

            {/* Connect Freename */}
            <View style={[s.card, { borderColor: Colors.warning + '55' }]}>
              <View style={s.ch}>
                <MaterialIcons name="api" size={16} color={Colors.warning} />
                <Text style={[s.ct, { color: Colors.warning }]}>Connect Freename Account</Text>
              </View>
              <Text style={s.cd}>Connect to unlock Whois zone lookup, your zone portfolio, and status management via the Freename Management API.</Text>
              <View style={s.featureList}>
                {[
                  { icon: 'manage-search',   text: 'Whois lookup: full zone details by name' },
                  { icon: 'folder',          text: 'Browse all your registered zones' },
                  { icon: 'tune',            text: 'Update zone status (Active / Locked / Inactive)' },
                  { icon: 'dns',             text: 'Inspect inline DNS & crypto records' },
                ].map((f, i) => (
                  <View key={i} style={s.fRow}>
                    <View style={[s.fIcon, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                      <MaterialIcons name={f.icon as any} size={12} color={Colors.primary} />
                    </View>
                    <Text style={s.fText}>{f.text}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.il}>FREENAME USERNAME</Text>
              <TextInput style={[s.input, { borderColor: Colors.warning + '55' }]} value={loginUser} onChangeText={setLoginUser} placeholder="your-freename-username" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} />
              <Text style={[s.il, { marginTop: Spacing.sm }]}>PASSWORD</Text>
              <TextInput style={[s.input, { borderColor: Colors.warning + '55' }]} value={loginPass} onChangeText={setLoginPass} placeholder="••••••••" placeholderTextColor={Colors.textMuted} secureTextEntry autoCapitalize="none" />
              {fError ? <View style={s.errBox}><MaterialIcons name="error-outline" size={13} color={Colors.error} /><Text style={s.errText}>{fError}</Text></View> : null}
              <TouchableOpacity style={[s.btn, { backgroundColor: Colors.warning, shadowColor: Colors.warning }, (fLoading || !loginUser.trim() || !loginPass.trim()) && { opacity: 0.45 }]} onPress={handleLogin} disabled={fLoading || !loginUser.trim() || !loginPass.trim()} activeOpacity={0.85}>
                {fLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="login" size={17} color={Colors.bg} />}
                <Text style={s.btnText}>{fLoading ? 'Connecting…' : 'Connect Freename Account'}</Text>
              </TouchableOpacity>
              <View style={[s.note, { borderColor: Colors.warning + '33', backgroundColor: Colors.warning + '08' }]}>
                <MaterialIcons name="info-outline" size={12} color={Colors.warning} />
                <Text style={[s.noteText, { color: Colors.warning }]}>Use your freename.io credentials. Tokens are stored on-device and auto-refreshed.</Text>
              </View>
            </View>
          </>
        )}

        {/* ── SEARCH TAB ────────────────────────────────────────────────────── */}
        {fAuth && tab === 'search' && (
          <>
            {/* Whois lookup */}
            <View style={s.card}>
              <View style={s.ch}>
                <MaterialIcons name="manage-search" size={16} color={Colors.primary} />
                <Text style={s.ct}>Whois Zone Lookup</Text>
                <View style={[s.pill, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                  <LiveDot color={Colors.primary} size={5} />
                  <Text style={[s.pillText, { color: Colors.primary }]}>LIVE API</Text>
                </View>
              </View>
              <Text style={s.cd}>Look up any Freename zone by name — returns UUID, status, registrar, and all inline records.</Text>
              <Text style={s.il}>ZONE NAME</Text>
              <TextInput style={[s.input, { borderColor: Colors.primary + '55' }]} value={searchInput} onChangeText={v => { setSearchInput(v); setSearchResult(null); setSearchError(''); }} placeholder="e.g. btng.gold, selling.cryptocoin" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} />
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {['btng.gold', 'btng.token'].map(d => (
                  <TouchableOpacity key={d} style={[s.quickBtn, { borderColor: Colors.primary + '44', backgroundColor: Colors.primaryGlow }]} onPress={() => { setSearchInput(d); setSearchResult(null); setSearchError(''); }} activeOpacity={0.8}>
                    <Text style={[s.quickText, { color: Colors.primary }]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[s.btn, searchLoading && { opacity: 0.5 }]} onPress={handleSearch} disabled={searchLoading} activeOpacity={0.85}>
                {searchLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="manage-search" size={17} color={Colors.bg} />}
                <Text style={s.btnText}>{searchLoading ? 'Looking up…' : 'Search Zone'}</Text>
              </TouchableOpacity>
              {searchError !== '' && <View style={s.errBox}><MaterialIcons name="search-off" size={13} color={Colors.error} /><Text style={s.errText}>{searchError}</Text></View>}
            </View>

            {searchResult && <ZoneCard zone={searchResult} onOpen={() => openDetail(searchResult)} highlight />}

            {/* Availability */}
            <View style={s.card}>
              <View style={s.ch}>
                <MaterialIcons name="check-circle-outline" size={16} color="#22C55E" />
                <Text style={[s.ct, { color: '#22C55E' }]}>Name Availability</Text>
                <View style={[s.pill, { backgroundColor: '#22C55E10', borderColor: '#22C55E44' }]}><Text style={[s.pillText, { color: '#22C55E' }]}>PUBLIC</Text></View>
              </View>
              <Text style={s.il}>ZONE NAME</Text>
              <TextInput style={[s.input, { borderColor: '#22C55E55' }]} value={availInput} onChangeText={v => { setAvailInput(v); setAvailResult(null); setAvailError(''); }} placeholder="e.g. mynewdomain.btng" placeholderTextColor={Colors.textMuted} autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity style={[s.btn, { backgroundColor: '#22C55E', shadowColor: '#22C55E' }, availLoading && { opacity: 0.5 }]} onPress={handleAvailability} disabled={availLoading} activeOpacity={0.85}>
                {availLoading ? <ActivityIndicator size="small" color={Colors.bg} /> : <MaterialIcons name="search" size={17} color={Colors.bg} />}
                <Text style={s.btnText}>{availLoading ? 'Checking…' : 'Check Availability'}</Text>
              </TouchableOpacity>
              {availResult !== null && (
                <View style={{ gap: Spacing.sm }}>
                  <View style={[s.availBox, { borderColor: (availResult ? Colors.success : Colors.error) + '55', backgroundColor: availResult ? Colors.successBg : Colors.errorBg }]}>
                    <MaterialIcons name={availResult ? 'check-circle' : 'cancel'} size={20} color={availResult ? Colors.success : Colors.error} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.availTitle, { color: availResult ? Colors.success : Colors.error }]}>{availInput} is {availResult ? 'AVAILABLE' : 'TAKEN'}</Text>
                      <Text style={s.availSub}>{availResult ? 'Register at freename.io' : 'Already registered'}</Text>
                    </View>
                  </View>
                  {availResult && (
                    <TouchableOpacity
                      style={[s.btn, { backgroundColor: Colors.primary, shadowColor: Colors.primary }]}
                      onPress={() => openRegister(availInput)}
                      activeOpacity={0.87}
                    >
                      <MaterialIcons name="add-circle" size={18} color={Colors.bg} />
                      <Text style={s.btnText}>Register on Freename</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {availError !== '' && <View style={s.errBox}><MaterialIcons name="error-outline" size={13} color={Colors.error} /><Text style={s.errText}>{availError}</Text></View>}
            </View>
          </>
        )}

        {/* ── MY ZONES TAB ──────────────────────────────────────────────────── */}
        {fAuth && tab === 'myzones' && (
          <>
            <View style={s.zonesHeader}>
              <View>
                <Text style={s.zonesTitle}>Your Zones</Text>
                <Text style={s.zonesSub}>{myZones.length} zone{myZones.length !== 1 ? 's' : ''} · Freename Registry</Text>
              </View>
              <TouchableOpacity style={[s.refreshBtn, zonesLoading && { opacity: 0.5 }]} onPress={() => loadMyZones(0)} disabled={zonesLoading} activeOpacity={0.85}>
                {zonesLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="refresh" size={16} color={Colors.primary} />}
                <Text style={s.refreshText}>{zonesLoading ? 'Loading…' : 'Refresh'}</Text>
              </TouchableOpacity>
            </View>

            {zonesError !== '' && <View style={s.errBox}><MaterialIcons name="error-outline" size={13} color={Colors.error} /><Text style={s.errText}>{zonesError}</Text></View>}

            {/* Status stat chips */}
            {myZones.length > 0 && (
              <View style={s.statChipsRow}>
                {ALL_STATUSES.map(st => {
                  const count = myZones.filter(z => z.status === st).length;
                  if (!count) return null;
                  const c = ST[st];
                  return (
                    <View key={st} style={[s.statChip, { backgroundColor: c.bg, borderColor: c.border }]}>
                      <MaterialIcons name={c.icon as any} size={10} color={c.color} />
                      <Text style={[s.statChipText, { color: c.color }]}>{count} {c.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {zonesLoading && myZones.length === 0 ? (
              <View style={s.loadWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={s.loadText}>Loading zones from Freename…</Text>
              </View>
            ) : !zonesLoading && myZones.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={{ fontSize: 52 }}>🌐</Text>
                <Text style={s.emptyTitle}>No Zones Found</Text>
                <Text style={s.emptySub}>Tap Refresh to load your zones, or register a domain at freename.io</Text>
                <TouchableOpacity style={s.btn} onPress={() => loadMyZones(0)} activeOpacity={0.85}>
                  <MaterialIcons name="refresh" size={16} color={Colors.bg} />
                  <Text style={s.btnText}>Load Zones</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {myZones.map(zone => (
                  <ZoneCard key={zone.uuid} zone={zone} onOpen={() => openDetail(zone)} />
                ))}
                <TouchableOpacity style={[s.loadMoreBtn, zonesLoading && { opacity: 0.5 }]} onPress={() => loadMyZones(zonesPage + 1)} disabled={zonesLoading} activeOpacity={0.85}>
                  {zonesLoading ? <ActivityIndicator size="small" color={Colors.primary} /> : <MaterialIcons name="expand-more" size={16} color={Colors.primary} />}
                  <Text style={s.loadMoreText}>Load More Zones</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>

      {/* ── Register Zone Modal ─────────────────────────────────────────── */}
      <Modal visible={registerOpen} transparent animationType="slide" onRequestClose={() => !registerLoading && setRegisterOpen(false)}>
        <View style={dm.overlay}>
          <View style={[dm.sheet, { paddingBottom: insets.bottom + Spacing.xl }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.xl }}>
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border }} />
              </View>

              {/* Header */}
              <View style={rm.header}>
                <View style={rm.icon}>
                  <MaterialIcons name="add-circle" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={rm.title}>Register on Freename</Text>
                  <Text style={rm.sub}>mint=false · No minting fee</Text>
                </View>
                <TouchableOpacity
                  style={rm.close}
                  onPress={() => { if (!registerLoading) setRegisterOpen(false); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {!registerDone ? (
                <>
                  {/* Form */}
                  <View style={{ gap: Spacing.sm }}>
                    <Text style={s.il}>ZONE NAME</Text>
                    <TextInput
                      style={[s.input, { borderColor: Colors.primary + '66' }]}
                      value={registerName}
                      onChangeText={v => setRegisterName(v)}
                      placeholder="e.g. btng.gold"
                      placeholderTextColor={Colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!registerLoading}
                    />
                    <Text style={[s.il, { marginTop: Spacing.sm }]}>DESCRIPTION (OPTIONAL)</Text>
                    <TextInput
                      style={[s.input, { borderColor: Colors.border }]}
                      value={registerDesc}
                      onChangeText={v => setRegisterDesc(v)}
                      placeholder="Short description for this zone"
                      placeholderTextColor={Colors.textMuted}
                      editable={!registerLoading}
                    />
                    <Text style={[s.il, { marginTop: Spacing.sm }]}>BLOCKCHAIN</Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                      {(['POLYGON', 'ETH', 'BTC'] as const).map(ch => (
                        <TouchableOpacity
                          key={ch}
                          style={[rm.chainBtn, registerChain === ch && { borderColor: Colors.primary, backgroundColor: Colors.primaryGlow }]}
                          onPress={() => setRegisterChain(ch)}
                          activeOpacity={0.8}
                          disabled={registerLoading}
                        >
                          <Text style={{ fontSize: 16 }}>{ch === 'POLYGON' ? '🟣' : ch === 'ETH' ? '🔷' : '🟠'}</Text>
                          <Text style={[rm.chainBtnText, registerChain === ch && { color: Colors.primary }]}>{ch}</Text>
                          {registerChain === ch && <View style={rm.chainDot} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Registration Summary Card */}
                  <View style={rm.summary}>
                    <View style={rm.summaryHeader}>
                      <MaterialIcons name="receipt-long" size={14} color={Colors.primary} />
                      <Text style={rm.summaryTitle}>Registration Summary</Text>
                      <View style={[s.pill, { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '44' }]}>
                        <Text style={[s.pillText, { color: Colors.primary }]}>PREVIEW</Text>
                      </View>
                    </View>
                    {([
                      { label: 'Zone Name',    value: registerName.trim() || '—',         color: Colors.primary },
                      { label: 'Status',       value: 'OK (Active)',                       color: Colors.success },
                      { label: 'Chain',        value: registerChain,                       color: '#8247E5' },
                      { label: 'Mint',         value: 'false — API registry only',         color: Colors.textSecondary },
                      { label: 'Registry',     value: 'Freename Web3 DNS',                 color: Colors.textMuted },
                      { label: 'NFT Minting',  value: 'Not included — add separately',     color: Colors.warning },
                    ] as { label: string; value: string; color: string }[]).map(row => (
                      <View key={row.label} style={rm.summaryRow}>
                        <Text style={rm.summaryLabel}>{row.label}</Text>
                        <Text style={[rm.summaryValue, { color: row.color }]} numberOfLines={1}>{row.value}</Text>
                      </View>
                    ))}
                    {registerDesc.trim() ? (
                      <View style={rm.summaryRow}>
                        <Text style={rm.summaryLabel}>Description</Text>
                        <Text style={[rm.summaryValue, { color: Colors.textSecondary, maxWidth: '65%' }]} numberOfLines={2}>{registerDesc.trim()}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Info note */}
                  <View style={[s.note, { borderColor: Colors.primary + '33', backgroundColor: Colors.primaryGlow }]}>
                    <MaterialIcons name="info-outline" size={12} color={Colors.primary} />
                    <Text style={[s.noteText, { color: Colors.primary }]}>
                      This registers the zone in the Freename API database (mint=false). On-chain NFT minting can be done separately on freename.io — no blockchain fee is charged here.
                    </Text>
                  </View>

                  {registerError !== '' && (
                    <View style={s.errBox}>
                      <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                      <Text style={s.errText}>{registerError}</Text>
                    </View>
                  )}

                  {!fAuth && (
                    <View style={[s.errBox, { borderColor: Colors.warning + '44', backgroundColor: Colors.warning + '08' }]}>
                      <MaterialIcons name="warning" size={13} color={Colors.warning} />
                      <Text style={[s.errText, { color: Colors.warning }]}>Connect your Freename account (Settings tab) before registering.</Text>
                    </View>
                  )}

                  {/* Confirm button */}
                  <TouchableOpacity
                    style={[s.btn, (!registerName.trim() || registerLoading || !fAuth) && { opacity: 0.45 }]}
                    onPress={handleRegister}
                    disabled={!registerName.trim() || registerLoading || !fAuth}
                    activeOpacity={0.87}
                  >
                    {registerLoading
                      ? <ActivityIndicator size="small" color={Colors.bg} />
                      : <MaterialIcons name="cloud-upload" size={18} color={Colors.bg} />}
                    <Text style={s.btnText}>{registerLoading ? 'Registering…' : `Register ${registerName.trim() || 'Zone'}`}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* Success state */
                registerResult && (
                  <View style={{ gap: Spacing.md }}>
                    <View style={rm.successBox}>
                      <MaterialIcons name="check-circle" size={48} color={Colors.success} />
                      <Text style={rm.successTitle}>Zone Registered!</Text>
                      <Text style={rm.successSub}>{registerResult.name} has been created in the Freename registry.</Text>
                    </View>
                    <View style={rm.summary}>
                      <View style={rm.summaryHeader}>
                        <MaterialIcons name="receipt" size={14} color={Colors.success} />
                        <Text style={[rm.summaryTitle, { color: Colors.success }]}>Registration Receipt</Text>
                      </View>
                      <CopyRow label="Zone Name" value={registerResult.name}    color={Colors.primary} />
                      <CopyRow label="UUID"      value={registerResult.uuid}    color={Colors.primary} mono />
                      <CopyRow label="Status"    value={registerResult.status}  color={Colors.success} />
                      {registerResult.chain ? <CopyRow label="Chain" value={registerResult.chain} color="#8247E5" /> : null}
                    </View>
                    <View style={[s.note, { borderColor: Colors.success + '33', backgroundColor: Colors.successBg }]}>
                      <MaterialIcons name="info-outline" size={12} color={Colors.success} />
                      <Text style={[s.noteText, { color: Colors.success }]}>
                        Zone added to My Zones. To mint an on-chain NFT for this domain, visit freename.io dashboard.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.btn, { backgroundColor: Colors.success, shadowColor: Colors.success }]}
                      onPress={() => {
                        setRegisterOpen(false);
                        setTab('myzones');
                      }}
                      activeOpacity={0.87}
                    >
                      <MaterialIcons name="folder" size={18} color={Colors.bg} />
                      <Text style={s.btnText}>View in My Zones</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Zone Detail Modal */}
      <Modal visible={detailOpen} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <View style={dm.overlay}>
          <View style={[dm.sheet, { paddingBottom: insets.bottom + Spacing.xl }]}>
            {selectedZone && (
              <ZoneDetailSheet
                zone={selectedZone}
                onClose={() => setDetailOpen(false)}
                onUpdateStatus={handleUpdateStatus}
                statusUpdating={stUpdating}
                onTransferZone={handleTransferZone}
                transferLoading={transferLoading}
                transferResult={transferResult}
                onAddRecord={handleAddRecordToZone}
                addRecordLoading={addRecordLoading}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.bg },
  topBar:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  iconBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  topCenter:    { flex: 1, alignItems: 'center', gap: 2 },
  topTitle:     { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.4 },
  topSub:       { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  tabRow:       { flexDirection: 'row', marginHorizontal: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: 3, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  tabBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 1, borderRadius: Radius.lg },
  tabActive:    { backgroundColor: Colors.primary },
  tabText:      { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:{ color: Colors.bg },
  badge:        { backgroundColor: Colors.bgElevated, borderRadius: 99, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: Colors.border },
  badgeText:    { fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, includeFontPadding: false },
  scroll:       { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, gap: Spacing.md },
  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  ch:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ct:           { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  cd:           { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  pill:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  pillText:     { fontSize: 9, fontWeight: '800' as any, includeFontPadding: false },
  il:           { fontSize: 9, fontWeight: '800' as any, color: Colors.textMuted, letterSpacing: 1, includeFontPadding: false },
  input:        { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.xl, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 7, elevation: 4 },
  btnText:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  availBox:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.md },
  availTitle:   { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  availSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  errBox:       { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.error + '44', backgroundColor: Colors.errorBg, padding: Spacing.sm + 2 },
  errText:      { flex: 1, fontSize: FontSize.xs, color: Colors.error, includeFontPadding: false },
  note:         { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm + 2 },
  noteText:     { flex: 1, fontSize: FontSize.xs, lineHeight: 16, includeFontPadding: false },
  featureList:  { gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  fRow:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fIcon:        { width: 28, height: 28, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fText:        { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  quickBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1 },
  quickText:    { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  zonesHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zonesTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  zonesSub:     { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  refreshBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '44' },
  refreshText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  statChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  statChipText: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  loadWrap:     { alignItems: 'center', paddingVertical: 48, gap: Spacing.md },
  loadText:     { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },
  emptyWrap:    { alignItems: 'center', paddingVertical: 48, gap: Spacing.md },
  emptyTitle:   { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptySub:     { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, paddingHorizontal: Spacing.lg, includeFontPadding: false },
  loadMoreBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '44', paddingVertical: Spacing.md, backgroundColor: Colors.primaryGlow },
  loadMoreText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary, includeFontPadding: false },
});

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.92)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: Spacing.sm, paddingHorizontal: Spacing.xl, maxHeight: '92%', borderTopWidth: 1, borderTopColor: Colors.border },
});

const rm = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  icon:         { width: 46, height: 46, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title:        { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  sub:          { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  close:        { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chainBtn:     { flex: 1, alignItems: 'center', gap: 4, borderRadius: Radius.lg, borderWidth: 1.5, borderColor: Colors.border, paddingVertical: Spacing.sm + 4, backgroundColor: Colors.bgElevated, position: 'relative', overflow: 'hidden' },
  chainBtnText: { fontSize: 11, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  chainDot:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderRadius: 1.5, backgroundColor: Colors.primary },
  summary:      { backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  summaryHeader:{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderBottomWidth: 1, borderBottomColor: Colors.border + '66', backgroundColor: Colors.primaryGlow },
  summaryTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  summaryValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false, flexShrink: 0, maxWidth: '65%', textAlign: 'right' },
  successBox:   { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm, backgroundColor: Colors.successBg, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.success + '44' },
  successTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  successSub:   { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19, paddingHorizontal: Spacing.lg, includeFontPadding: false },
});
