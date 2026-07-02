// BTNG Certificate QR Generator
// Lookup a cert_id → render a verifiable QR code → share or copy
import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as ExpoClipboard from 'expo-clipboard';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Share, Platform,
  Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { getSupabaseClient } from '@/template';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGCertificate } from '@/services/btngCertificatesService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CERT_TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  property:              { label: 'Real Property',         emoji: '🏠', color: '#3B82F6' },
  vehicle:               { label: 'Vehicle',               emoji: '🚗', color: '#F59E0B' },
  land:                  { label: 'Land Parcel',           emoji: '🌍', color: '#22C55E' },
  business:              { label: 'Business Ownership',    emoji: '🏢', color: '#8B5CF6' },
  stock:                 { label: 'Stock / Equity',        emoji: '📈', color: '#06B6D4' },
  minerals:              { label: 'Mineral Rights',        emoji: '⛏️', color: '#EF4444' },
  intellectual_property: { label: 'Intellectual Property', emoji: '💡', color: '#F97316' },
  music_album:           { label: 'Music Album',           emoji: '🎵', color: '#EC4899' },
};

const GRADE_META: Record<string, { color: string; label: string }> = {
  'A+': { color: '#22C55E', label: 'Prime'        },
  'A':  { color: '#3B82F6', label: 'Superior'     },
  'B':  { color: '#F59E0B', label: 'Standard'     },
  'C':  { color: '#F97316', label: 'Below Avg'    },
  'D':  { color: '#EF4444', label: 'Speculative'  },
};

// Build the shareable verify URL
function buildVerifyUrl(certId: string, fingerprint: string): string {
  const fpPrefix = fingerprint ? fingerprint.slice(0, 12) : '';
  return `https://verify.btng.io/doc/${encodeURIComponent(certId)}${fpPrefix ? `?fp=${fpPrefix}` : ''}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pulse animation
// ─────────────────────────────────────────────────────────────────────────────
function Pulse({ color = Colors.success, size = 8 }: { color?: string; size?: number }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 2, duration: 800, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(a, { toValue: 1, duration: 800, useNativeDriver: true }),
    ])).start();
  }, [a]);
  return (
    <View style={{ width: size + 4, height: size + 4, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size + 4, height: size + 4, borderRadius: (size + 4) / 2, backgroundColor: color, opacity: 0.25, transform: [{ scale: a }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy Button
// ─────────────────────────────────────────────────────────────────────────────
function CopyBtn({ value, label, size = 13 }: { value: string; label?: string; size?: number }) {
  const [ok, setOk] = useState(false);
  return (
    <TouchableOpacity
      style={[cpb.btn, ok && { borderColor: Colors.success + '55', backgroundColor: Colors.successBg }]}
      onPress={() => { ExpoClipboard.setStringAsync(value).catch(()=>{}); setOk(true); setTimeout(() => setOk(false), 2200); }}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <MaterialIcons name={ok ? 'check' : 'content-copy'} size={size} color={ok ? Colors.success : Colors.primary} />
      {label ? <Text style={[cpb.label, ok && { color: Colors.success }]}>{ok ? 'Copied!' : label}</Text> : null}
    </TouchableOpacity>
  );
}
const cpb = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44' },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// QR Panel
// ─────────────────────────────────────────────────────────────────────────────
function QrPanel({ cert, verifyUrl }: { cert: BTNGCertificate; verifyUrl: string }) {
  const scaleAnim   = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim    = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 9 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
    const glow = Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1,   duration: 1200, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
    ]));
    glow.start();
    return () => glow.stop();
  }, []);

  const typeMeta  = CERT_TYPE_META[cert.cert_type] ?? CERT_TYPE_META['property'];
  const gradeMeta = GRADE_META[cert.equity_grade] ?? GRADE_META['D'];

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        title: `BTNG Certificate — ${cert.cert_id}`,
        message: `BTNG Sovereign Certificate\n\nOwner: ${cert.owner_name}\nType: ${typeMeta.label}\nValue: $${cert.asset_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}\nGrade: ${cert.equity_grade}\n\nVerify at:\n${verifyUrl}`,
        url: verifyUrl,
      });
    } catch {}
  }, [verifyUrl, cert]);

  return (
    <Animated.View style={[qp.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
      {/* Cert type banner */}
      <View style={[qp.typeBanner, { borderBottomColor: typeMeta.color + '33' }]}>
        <View style={[qp.typeIcon, { backgroundColor: typeMeta.color + '18', borderColor: typeMeta.color + '55' }]}>
          <Text style={qp.typeEmoji}>{typeMeta.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[qp.typeLabel, { color: typeMeta.color }]}>{typeMeta.label}</Text>
          <Text style={qp.certId} numberOfLines={1}>{cert.cert_id}</Text>
        </View>
        <View style={[qp.gradePill, { borderColor: gradeMeta.color + '66' }]}>
          <Text style={[qp.gradeText, { color: gradeMeta.color }]}>{cert.equity_grade}</Text>
          <Text style={[qp.gradeLabel, { color: gradeMeta.color }]}>{gradeMeta.label}</Text>
        </View>
      </View>

      {/* QR Code */}
      <Animated.View style={[qp.qrWrap, { opacity: glowAnim.interpolate({ inputRange: [0.4, 1], outputRange: [0.9, 1] }) }]}>
        <View style={qp.qrInner}>
          <QRCode
            value={verifyUrl}
            size={200}
            color={Colors.bg === '#060608' ? '#000000' : '#1a1a2e'}
            backgroundColor="#FFFFFF"
            logo={undefined}
            logoSize={0}
            quietZone={8}
            enableLinearGradient={false}
          />
        </View>
        {/* Corner overlays */}
        {[
          { top: 0,  left: 0,  borderTopWidth: 3,    borderLeftWidth: 3,    borderTopLeftRadius: 10     },
          { top: 0,  right: 0, borderTopWidth: 3,    borderRightWidth: 3,   borderTopRightRadius: 10    },
          { bottom: 0, left: 0,  borderBottomWidth: 3, borderLeftWidth: 3,  borderBottomLeftRadius: 10  },
          { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
        ].map((style, i) => (
          <View key={i} style={[qp.corner, { borderColor: Colors.primary }, style]} />
        ))}
      </Animated.View>

      {/* Verify URL */}
      <View style={qp.urlWrap}>
        <View style={qp.urlIconWrap}>
          <MaterialIcons name="link" size={13} color={Colors.primary} />
        </View>
        <Text style={qp.urlText} numberOfLines={2}>{verifyUrl}</Text>
        <CopyBtn value={verifyUrl} size={13} />
      </View>

      {/* Cert stats grid */}
      <View style={qp.statsGrid}>
        {[
          { label: 'OWNER',        value: cert.owner_name,                                                                       color: undefined },
          { label: 'ASSET VALUE',  value: `$${cert.asset_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,         color: typeMeta.color },
          { label: 'ISSUED',       value: cert.issued_at,                                                                        color: undefined },
          { label: 'EXPIRES',      value: cert.expires_at ?? 'No Expiry',                                                       color: undefined },
          { label: 'STATUS',       value: cert.status.toUpperCase(),                                                             color: cert.status === 'active' ? Colors.success : Colors.error },
          { label: 'FINGERPRINT',  value: cert.fingerprint.slice(0, 16) + '…',                                                  color: Colors.textMuted },
        ].map(item => (
          <View key={item.label} style={qp.statCell}>
            <Text style={qp.statLabel}>{item.label}</Text>
            <Text style={[qp.statValue, item.color ? { color: item.color } : {}]} numberOfLines={1}>{item.value}</Text>
          </View>
        ))}
      </View>

      {/* Action buttons */}
      <View style={qp.actionRow}>
        <TouchableOpacity style={[qp.actionBtn, { flex: 1 }]} onPress={handleShare} activeOpacity={0.85}>
          <MaterialIcons name="share" size={17} color={Colors.bg} />
          <Text style={qp.actionBtnText}>Share Certificate</Text>
        </TouchableOpacity>
        <CopyBtn value={verifyUrl} label="Copy URL" size={14} />
      </View>

      {/* QR hint */}
      <View style={qp.hint}>
        <MaterialIcons name="info-outline" size={11} color={Colors.textMuted} />
        <Text style={qp.hintText}>
          Scan this QR to verify authenticity on the BTNG Sovereign Ledger. URL encodes cert ID + fingerprint prefix.
        </Text>
      </View>
    </Animated.View>
  );
}

const qp = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: Colors.primary + '55', overflow: 'hidden', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 6 },

  typeBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderBottomWidth: 1 },
  typeIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  typeEmoji: { fontSize: 20 },
  typeLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  certId: { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', includeFontPadding: false },
  gradePill: { alignItems: 'center', gap: 1, borderRadius: Radius.lg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, backgroundColor: Colors.bgElevated },
  gradeText: { fontSize: 18, fontWeight: FontWeight.heavy, includeFontPadding: false },
  gradeLabel: { fontSize: 8, fontWeight: FontWeight.bold, includeFontPadding: false },

  qrWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl, position: 'relative' },
  qrInner: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: Radius.xl, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 5 },
  corner: { position: 'absolute', width: 28, height: 28, borderWidth: 0 },

  urlWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  urlIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  urlText: { flex: 1, fontSize: 9, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', lineHeight: 13, includeFontPadding: false },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  statCell: { flex: 1, minWidth: '44%', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  statLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  statValue: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginHorizontal: Spacing.lg, marginBottom: Spacing.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  hintText: { flex: 1, fontSize: 9, color: Colors.textMuted, lineHeight: 14, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// My Certs quick-select
// ─────────────────────────────────────────────────────────────────────────────
interface MyCertChip { cert_id: string; cert_type: string; owner_name: string }

function MyCertsChips({ onSelect }: { onSelect: (certId: string) => void }) {
  const { user } = useAuth();
  const [certs, setCerts] = useState<MyCertChip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const supabase = getSupabaseClient();
    supabase
      .from('btng_certificates')
      .select('cert_id, cert_type, owner_name')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setCerts((data ?? []) as MyCertChip[]);
        setLoading(false);
      });
  }, [user]);

  if (!user || (!loading && certs.length === 0)) return null;

  return (
    <View style={mc.wrap}>
      <View style={mc.header}>
        <MaterialIcons name="verified-user" size={13} color={Colors.primary} />
        <Text style={mc.title}>My Active Certificates</Text>
        {loading && <><View style={{ flex: 1 }} /><ActivityIndicator size="small" color={Colors.primary} /></>}
      </View>
      {!loading && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mc.scroll}>
          {certs.map(c => {
            const meta = CERT_TYPE_META[c.cert_type] ?? CERT_TYPE_META['property'];
            return (
              <TouchableOpacity key={c.cert_id} style={mc.chip} onPress={() => onSelect(c.cert_id)} activeOpacity={0.8}>
                <Text>{meta.emoji}</Text>
                <View style={mc.chipInfo}>
                  <Text style={mc.chipId} numberOfLines={1}>{c.cert_id}</Text>
                  <Text style={[mc.chipType, { color: meta.color }]}>{meta.label}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={14} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
const mc = StyleSheet.create({
  wrap: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  scroll: { flexDirection: 'row', gap: Spacing.sm, paddingRight: 4, paddingTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.border, maxWidth: 220 },
  chipInfo: { flex: 1, gap: 1 },
  chipId: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', includeFontPadding: false },
  chipType: { fontSize: 9, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CertQrGeneratorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ certId?: string }>();

  const [certId, setCertId]           = useState(params.certId ?? '');
  const [loading, setLoading]         = useState(false);
  const [cert, setCert]               = useState<BTNGCertificate | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl]     = useState('');

  // Auto-lookup if certId was passed via params
  useEffect(() => {
    if (params.certId) handleLookup(params.certId);
  }, []);

  const handleLookup = useCallback(async (idOverride?: string) => {
    const id = (idOverride ?? certId).trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setCert(null);
    setVerifyUrl('');
    try {
      const supabase = getSupabaseClient();
      const { data, error: dbErr } = await supabase
        .from('btng_certificates')
        .select('*')
        .eq('cert_id', id)
        .single();

      if (dbErr) {
        if (dbErr.code === 'PGRST116') setError(`No certificate found with ID "${id}" in the BTNG Sovereign Ledger.`);
        else setError(`Lookup failed: ${dbErr.message}`);
        setLoading(false);
        return;
      }
      const c = data as BTNGCertificate;
      setCert(c);
      setVerifyUrl(buildVerifyUrl(c.cert_id, c.fingerprint));
    } catch (e: any) {
      setError(`Unexpected error: ${e?.message ?? 'unknown'}`);
    }
    setLoading(false);
  }, [certId]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>QR Generator</Text>
          <Text style={s.headerSub}>BTNG Certificate Verifiable QR</Text>
        </View>
        <TouchableOpacity
          style={s.scanBtn}
          onPress={() => router.push('/cert-scanner' as any)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="qr-code-scanner" size={16} color={Colors.primary} />
          <Text style={s.scanBtnText}>Scan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Intro card ─────────────────────────────────────────────── */}
        <View style={s.introCard}>
          <View style={s.introIcon}>
            <Text style={{ fontSize: 28 }}>📲</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.introTitle}>Generate Verifiable QR Code</Text>
            <Text style={s.introSub}>
              Enter any BTNG Certificate ID to generate a QR code linking to{' '}
              <Text style={{ color: Colors.primary }}>verify.btng.io</Text> with the cert's fingerprint prefix embedded for tamper detection.
            </Text>
          </View>
        </View>

        {/* ── My Certs quick-select ───────────────────────────────────── */}
        <MyCertsChips onSelect={(id) => { setCertId(id); handleLookup(id); }} />

        {/* ── Input card ─────────────────────────────────────────────── */}
        <View style={s.inputCard}>
          <View style={s.inputLabelRow}>
            <MaterialIcons name="fingerprint" size={15} color={Colors.primary} />
            <Text style={s.inputLabel}>Certificate ID</Text>
          </View>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={certId}
              onChangeText={(v) => { setCertId(v); setError(null); if (cert) { setCert(null); setVerifyUrl(''); } }}
              placeholder="e.g. CERT-2026-GH-0001"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => handleLookup()}
            />
            {certId.length > 0 && !loading && (
              <TouchableOpacity
                onPress={() => { setCertId(''); setCert(null); setError(null); setVerifyUrl(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={16} color={Colors.textMuted} style={{ marginRight: Spacing.sm }} />
              </TouchableOpacity>
            )}
          </View>

          {/* Demo quick-fill chips */}
          <View style={s.chipRow}>
            <Text style={s.chipRowLabel}>Quick fill:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingRight: 4 }}>
              {['CERT-2026-GH-0001', 'CERT-2026-NG-0001', 'CERT-2026-KE-0001'].map(id => (
                <TouchableOpacity
                  key={id}
                  style={s.chip}
                  onPress={() => { setCertId(id); setError(null); setCert(null); setVerifyUrl(''); }}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                >
                  <Text style={s.chipText}>{id}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[s.lookupBtn, (!certId.trim() || loading) && { opacity: 0.5 }]}
            onPress={() => handleLookup()}
            disabled={!certId.trim() || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={Colors.bg} size="small" />
              : <MaterialIcons name="qr-code-2" size={20} color={Colors.bg} />}
            <Text style={s.lookupBtnText}>{loading ? 'Looking up…' : 'Generate QR Code'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Error ──────────────────────────────────────────────────── */}
        {error ? (
          <View style={s.errorCard}>
            <MaterialIcons name="error-outline" size={20} color={Colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={s.errorTitle}>Not Found</Text>
              <Text style={s.errorMsg}>{error}</Text>
            </View>
          </View>
        ) : null}

        {/* ── QR Panel ───────────────────────────────────────────────── */}
        {cert && verifyUrl ? (
          <QrPanel cert={cert} verifyUrl={verifyUrl} />
        ) : null}

        {/* ── URL format info ─────────────────────────────────────────── */}
        {!cert && !loading && (
          <View style={s.infoCard}>
            <View style={s.infoHeader}>
              <MaterialIcons name="info-outline" size={15} color={Colors.primary} />
              <Text style={s.infoTitle}>QR Code Format</Text>
            </View>
            <View style={s.infoRows}>
              {[
                { icon: 'link',        label: 'Base URL',         value: 'https://verify.btng.io/doc/{certId}' },
                { icon: 'fingerprint', label: 'Fingerprint param', value: '?fp={first 12 chars of SHA-256}' },
                { icon: 'verified',    label: 'Purpose',          value: 'Tamper-proof verifiable certificate link' },
                { icon: 'security',    label: 'Encoding',         value: 'ES256 signed · BTNG Sovereign Ledger' },
              ].map(item => (
                <View key={item.label} style={s.infoRow}>
                  <View style={s.infoIconWrap}>
                    <MaterialIcons name={item.icon as any} size={13} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={s.infoRowLabel}>{item.label}</Text>
                    <Text style={s.infoRowValue}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View style={s.footer}>
          <Pulse color={Colors.primary} size={5} />
          <Text style={s.footerText}>BTNG Sovereign Certificate System · Verifiable QR · ES256</Text>
        </View>
        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, gap: 2 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66' },
  scanBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  // Scroll
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.md },

  // Intro card
  introCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '44' },
  introIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  introTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  introSub: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false, marginTop: 2 },

  // Input card
  inputCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  inputLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '44', height: 52 },
  input: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, paddingHorizontal: Spacing.md, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chipRowLabel: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  chip: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  chipText: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.textSecondary, includeFontPadding: false },
  lookupBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 5 },
  lookupBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.bg, includeFontPadding: false },

  // Error
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: Colors.errorBg, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.error + '55' },
  errorTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  errorMsg: { fontSize: FontSize.xs, color: Colors.error, lineHeight: 17, includeFontPadding: false, marginTop: 3 },

  // Info card
  infoCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  infoRows: { gap: Spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  infoIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  infoRowLabel: { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.5, includeFontPadding: false },
  infoRowValue: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: Spacing.sm },
  footerText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});
