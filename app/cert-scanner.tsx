import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator,
  ScrollView, Platform, TextInput, Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CameraView, Camera } from 'expo-camera';
import { getSupabaseClient } from '@/template';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { BTNGCertificate } from '@/services/btngCertificatesService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CERT_TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  property:              { label: 'Real Property',          emoji: '🏠', color: '#3B82F6' },
  vehicle:               { label: 'Vehicle',                emoji: '🚗', color: '#F59E0B' },
  land:                  { label: 'Land Parcel',            emoji: '🌍', color: '#22C55E' },
  business:              { label: 'Business Ownership',     emoji: '🏢', color: '#8B5CF6' },
  stock:                 { label: 'Stock / Equity',         emoji: '📈', color: '#06B6D4' },
  minerals:              { label: 'Mineral Rights',         emoji: '⛏️', color: '#EF4444' },
  intellectual_property: { label: 'Intellectual Property',  emoji: '💡', color: '#F97316' },
  music_album:           { label: 'Music Album',            emoji: '🎵', color: '#EC4899' },
};

const GRADE_META: Record<string, { color: string; bg: string; label: string }> = {
  'A+': { color: '#22C55E', bg: '#052e16',  label: 'Prime — Elite asset'          },
  'A':  { color: '#3B82F6', bg: '#172554',  label: 'Superior — High value'        },
  'B':  { color: '#F59E0B', bg: '#451a03',  label: 'Standard — Mid tier'          },
  'C':  { color: '#F97316', bg: '#431407',  label: 'Below average — Low tier'     },
  'D':  { color: '#EF4444', bg: '#450a0a',  label: 'Speculative — Minimal equity' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Parse BTNG verify URL
// ─────────────────────────────────────────────────────────────────────────────
interface ParsedQR {
  certId: string;
  fpPrefix: string;
}

function parseVerifyUrl(raw: string): ParsedQR | null {
  // Expected: https://verify.btng.io/doc/{certId}?fp={fpPrefix}
  const docMatch = raw.match(/\/doc\/([^?&#\s]+)/);
  const fpMatch  = raw.match(/[?&]fp=([^&\s]+)/);
  if (!docMatch) return null;
  return { certId: docMatch[1], fpPrefix: fpMatch ? fpMatch[1] : '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify certificate against Supabase
// ─────────────────────────────────────────────────────────────────────────────
type VerifyStatus = 'idle' | 'loading' | 'verified' | 'invalid' | 'not_found' | 'error';

interface VerifyResult {
  status: VerifyStatus;
  cert: BTNGCertificate | null;
  parsedQR: ParsedQR | null;
  errorMsg?: string;
}

async function lookupCertificate(certId: string, fpPrefix: string): Promise<VerifyResult> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('btng_certificates')
    .select('*')
    .eq('cert_id', certId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return { status: 'not_found', cert: null, parsedQR: { certId, fpPrefix } };
    }
    return { status: 'error', cert: null, parsedQR: { certId, fpPrefix }, errorMsg: error.message };
  }

  const cert = data as BTNGCertificate;
  const fpMatch = !fpPrefix || cert.fingerprint.slice(0, fpPrefix.length) === fpPrefix;
  if (!fpMatch) {
    return {
      status: 'invalid',
      cert,
      parsedQR: { certId, fpPrefix },
      errorMsg: 'Fingerprint mismatch — certificate may be tampered.',
    };
  }
  return { status: 'verified', cert, parsedQR: { certId, fpPrefix } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated Scan Frame overlay
// ─────────────────────────────────────────────────────────────────────────────
function ScanFrame({ active }: { active: boolean }) {
  const lineAnim   = useRef(new Animated.Value(0)).current;
  const cornerAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!active) return;
    const line = Animated.loop(
      Animated.sequence([
        Animated.timing(lineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(lineAnim, { toValue: 0, duration: 0,    useNativeDriver: true }),
      ])
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(cornerAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(cornerAnim, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ])
    );
    line.start();
    pulse.start();
    return () => { line.stop(); pulse.stop(); };
  }, [active]);

  const FRAME = 240;
  const C = 26;
  const T = 3;
  const R = 10;
  const lineY = lineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME - 2] });

  return (
    <View style={[sf.frame, { width: FRAME, height: FRAME }]}>
      {[
        { top: 0,  left: 0,  borderTopWidth: T,    borderLeftWidth: T,    borderTopLeftRadius: R     },
        { top: 0,  right: 0, borderTopWidth: T,    borderRightWidth: T,   borderTopRightRadius: R    },
        { bottom: 0, left: 0,  borderBottomWidth: T, borderLeftWidth: T,  borderBottomLeftRadius: R  },
        { bottom: 0, right: 0, borderBottomWidth: T, borderRightWidth: T, borderBottomRightRadius: R },
      ].map((style, i) => (
        <Animated.View
          key={i}
          style={[sf.corner, { width: C, height: C, borderColor: Colors.primary }, style, { opacity: cornerAnim }]}
        />
      ))}
      {active && (
        <Animated.View
          style={[sf.line, { width: FRAME - 24, transform: [{ translateY: lineY }] }]}
        />
      )}
      <View style={sf.reticle}>
        <View style={sf.dot} />
      </View>
    </View>
  );
}

const sf = StyleSheet.create({
  frame:   { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  corner:  { position: 'absolute', borderWidth: 0 },
  line: {
    position: 'absolute',
    left: 12, height: 2, borderRadius: 1,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 8, elevation: 4, opacity: 0.85,
  },
  reticle: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: Colors.primary + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary, opacity: 0.7 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Verification Result Card
// ─────────────────────────────────────────────────────────────────────────────
function VerificationCard({
  result,
  onScanAgain,
}: {
  result: VerifyResult;
  onScanAgain: () => void;
}) {
  const scaleAnim   = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const glowAnim    = useRef(new Animated.Value(0)).current;
  const flashAnim   = useRef(new Animated.Value(1)).current;

  const isVerified = result.status === 'verified';
  const isInvalid  = result.status !== 'verified' && result.status !== 'idle' && result.status !== 'loading';
  const statusColor = isVerified ? Colors.success : Colors.error;
  const statusBg    = isVerified ? Colors.successBg : 'rgba(239,68,68,0.12)';

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 70, friction: 10 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    if (isVerified) {
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1,   duration: 1000, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.2, duration: 1000, useNativeDriver: true }),
        ])
      );
      glow.start();
      return () => glow.stop();
    }
    if (isInvalid) {
      const flash = Animated.loop(
        Animated.sequence([
          Animated.timing(flashAnim, { toValue: 0.25, duration: 380, useNativeDriver: true }),
          Animated.timing(flashAnim, { toValue: 1,    duration: 380, useNativeDriver: true }),
        ])
      );
      flash.start();
      return () => flash.stop();
    }
  }, [result.status]);

  const cert      = result.cert;
  const parsed    = result.parsedQR;
  const typeMeta  = cert ? (CERT_TYPE_META[cert.cert_type] ?? CERT_TYPE_META['property']) : null;
  const gradeMeta = cert ? (GRADE_META[cert.equity_grade] ?? GRADE_META['D']) : null;

  const statusTitle = isVerified
    ? 'Certificate Verified'
    : result.status === 'not_found' ? 'Certificate Not Found'
    : result.status === 'invalid'   ? 'Certificate Invalid'
    : 'Verification Error';

  const statusSub = isVerified
    ? 'This BTNG sovereign certificate is authentic and active on the ledger.'
    : result.status === 'not_found'
      ? 'No certificate found with this ID in the BTNG Sovereign Ledger.'
      : result.errorMsg ?? 'Could not verify this certificate at this time.';

  return (
    <Animated.View
      style={[
        vc.card,
        { borderColor: statusColor + '55', transform: [{ scale: scaleAnim }], opacity: opacityAnim },
      ]}
    >
      {/* Status banner */}
      <View style={[vc.statusBanner, { backgroundColor: statusBg, borderBottomColor: statusColor + '33' }]}>
        <Animated.View
          style={[
            vc.statusIcon,
            { backgroundColor: statusColor + '20', opacity: isVerified ? glowAnim : isInvalid ? flashAnim : 1 },
          ]}
        >
          <MaterialIcons
            name={isVerified ? 'verified' : 'gpp-bad'}
            size={30}
            color={statusColor}
          />
        </Animated.View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[vc.statusTitle, { color: statusColor }]}>{statusTitle}</Text>
          <Text style={vc.statusSub}>{statusSub}</Text>
        </View>
      </View>

      {/* Certificate details (verified or invalid with cert found) */}
      {cert ? (
        <ScrollView style={vc.detailScroll} showsVerticalScrollIndicator={false}>
          {/* Type row */}
          <View style={[vc.typeBanner, { borderBottomColor: (typeMeta?.color ?? Colors.primary) + '33' }]}>
            <View style={[vc.typeIcon, { backgroundColor: (typeMeta?.color ?? Colors.primary) + '18', borderColor: (typeMeta?.color ?? Colors.primary) + '55' }]}>
              <Text style={vc.typeEmoji}>{typeMeta?.emoji ?? '📜'}</Text>
            </View>
            <View style={vc.typeInfo}>
              <Text style={[vc.typeLabel, { color: typeMeta?.color ?? Colors.primary }]}>{typeMeta?.label ?? cert.cert_type}</Text>
              <Text style={vc.certIdText}>{cert.cert_id}</Text>
            </View>
            {gradeMeta ? (
              <View style={[vc.gradePill, { backgroundColor: gradeMeta.bg, borderColor: gradeMeta.color + '55' }]}>
                <Text style={[vc.gradeText, { color: gradeMeta.color }]}>{cert.equity_grade}</Text>
              </View>
            ) : null}
          </View>

          {/* Info grid */}
          <View style={vc.infoGrid}>
            {[
              { label: 'OWNER',       value: cert.owner_name },
              { label: 'ASSET VALUE', value: `$${cert.asset_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: typeMeta?.color },
              { label: 'ISSUED',      value: cert.issued_at },
              { label: 'EXPIRES',     value: cert.expires_at ?? '—' },
            ].map(item => (
              <View key={item.label} style={vc.infoCell}>
                <Text style={vc.infoCellLabel}>{item.label}</Text>
                <Text style={[vc.infoCellValue, item.color ? { color: item.color } : {}]} numberOfLines={2}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Equity detail */}
          {gradeMeta ? (
            <View style={[vc.gradeRow, { backgroundColor: gradeMeta.bg, borderColor: gradeMeta.color + '44' }]}>
              <MaterialIcons name="star" size={13} color={gradeMeta.color} />
              <Text style={[vc.gradeRowText, { color: gradeMeta.color }]}>
                Grade {cert.equity_grade} — {gradeMeta.label}
              </Text>
            </View>
          ) : null}

          {/* Asset description */}
          {cert.asset_description ? (
            <View style={vc.descRow}>
              <MaterialIcons name="description" size={12} color={Colors.textMuted} />
              <Text style={vc.descText}>{cert.asset_description}</Text>
            </View>
          ) : null}

          {/* Fingerprint */}
          <View style={vc.fpRow}>
            <MaterialIcons name="fingerprint" size={13} color={Colors.textMuted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={vc.fpLabel}>SHA-256 Fingerprint</Text>
              <Text style={vc.fpValue} numberOfLines={2}>{cert.fingerprint}</Text>
            </View>
            {isVerified ? <MaterialIcons name="check-circle" size={16} color={Colors.success} /> : null}
          </View>

          {/* Status pill */}
          <View style={vc.certBottomRow}>
            <View style={[vc.statusPill, {
              backgroundColor: cert.status === 'active' ? Colors.successBg : Colors.errorBg,
              borderColor: (cert.status === 'active' ? Colors.success : Colors.error) + '55',
            }]}>
              <View style={[vc.statusDot, { backgroundColor: cert.status === 'active' ? Colors.success : Colors.error }]} />
              <Text style={[vc.statusPillText, { color: cert.status === 'active' ? Colors.success : Colors.error }]}>
                {cert.status.toUpperCase()}
              </Text>
            </View>
            <Text style={vc.certIdSmall}>{cert.cert_id}</Text>
          </View>
        </ScrollView>
      ) : parsed ? (
        /* Parsed but not found */
        <View style={vc.parsedBlock}>
          {[
            { icon: 'qr-code' as any, label: 'Certificate ID', value: parsed.certId },
            parsed.fpPrefix ? { icon: 'fingerprint' as any, label: 'Fingerprint Prefix', value: parsed.fpPrefix + '…' } : null,
          ].filter(Boolean).map(item => (
            <View key={(item as any).label} style={vc.parsedRow}>
              <MaterialIcons name={(item as any).icon} size={14} color={Colors.textMuted} />
              <Text style={vc.parsedLabel}>{(item as any).label}</Text>
              <Text style={vc.parsedValue} numberOfLines={1}>{(item as any).value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Scan again */}
      <TouchableOpacity style={vc.scanAgainBtn} onPress={onScanAgain} activeOpacity={0.85}>
        <MaterialIcons name="qr-code-scanner" size={16} color={Colors.primary} />
        <Text style={vc.scanAgainText}>Scan Another Certificate</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const vc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  statusBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md + 2, borderBottomWidth: 1 },
  statusIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statusSub: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, lineHeight: 17 },
  detailScroll: { maxHeight: 330 },
  typeBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md + 2, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  typeIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  typeEmoji: { fontSize: 22 },
  typeInfo: { flex: 1, gap: 3 },
  typeLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  certIdText: { fontSize: 10, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', includeFontPadding: false },
  gradePill: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  gradeText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, padding: Spacing.md },
  infoCell: { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  infoCellLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  infoCellValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: Spacing.md, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 1, marginBottom: Spacing.sm },
  gradeRowText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },
  descRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  descText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 17 },
  fpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  fpLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  fpValue: { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', includeFontPadding: false, lineHeight: 14 },
  certBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: Spacing.md, marginBottom: Spacing.md },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: FontWeight.heavy, includeFontPadding: false },
  certIdSmall: { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', includeFontPadding: false },
  parsedBlock: { padding: Spacing.md, gap: Spacing.sm },
  parsedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  parsedLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, width: 110 },
  parsedValue: { flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', includeFontPadding: false },
  scanAgainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: Spacing.md, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66' },
  scanAgainText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function CertScannerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanning, setScanning]           = useState(false);
  const [loading, setLoading]             = useState(false);
  const [verifyResult, setVerifyResult]   = useState<VerifyResult | null>(null);
  const [torchOn, setTorchOn]             = useState(false);
  const [scanMode, setScanMode]           = useState<'qr' | 'all'>('qr');
  const [manualId, setManualId]           = useState('');
  const [manualMode, setManualMode]       = useState(false);
  const [lastRaw, setLastRaw]             = useState<string | null>(null);
  const scannedRef = useRef(false);

  const BARCODE_TYPES_QR  = ['qr'] as any[];
  const BARCODE_TYPES_ALL = ['qr', 'ean13', 'ean8', 'code128', 'code39', 'pdf417', 'aztec', 'datamatrix', 'upc_a', 'upc_e', 'itf14'] as any[];

  useEffect(() => {
    Camera.requestCameraPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  const handleBarcodeScanned = useCallback(async ({ data, type }: { data: string; type?: string }) => {
    if (scannedRef.current || loading) return;
    scannedRef.current = true;
    setLastRaw(data);
    setScanning(false);
    setLoading(true);
    try { Vibration.vibrate(60); } catch {}

    const parsed = parseVerifyUrl(data);
    if (!parsed) {
      // Try treating the raw data as a bare cert_id (e.g. from a Code128 barcode)
      const bareId = data.trim();
      if (bareId.length >= 8 && !bareId.includes(' ')) {
        const result = await lookupCertificate(bareId, '');
        setVerifyResult(result);
      } else {
        setVerifyResult({
          status: 'invalid',
          cert: null,
          parsedQR: null,
          errorMsg: `Scanned data is not a valid BTNG certificate URL or ID.\n\nRaw: ${bareId.slice(0, 80)}${bareId.length > 80 ? '…' : ''}`,
        });
      }
      setLoading(false);
      return;
    }
    const result = await lookupCertificate(parsed.certId, parsed.fpPrefix);
    setVerifyResult(result);
    setLoading(false);
  }, [loading]);

  const handleManualLookup = useCallback(async () => {
    const id = manualId.trim();
    if (!id) return;
    setLoading(true);
    setManualMode(false);
    const result = await lookupCertificate(id, '');
    setVerifyResult(result);
    setLoading(false);
  }, [manualId]);

  const startScanning = useCallback(() => {
    scannedRef.current = false;
    setVerifyResult(null);
    setLastRaw(null);
    setManualMode(false);
    setScanning(true);
  }, []);

  const stopScanning = useCallback(() => {
    scannedRef.current = true;
    setScanning(false);
  }, []);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Certificate Scanner</Text>
          <Text style={s.headerSub}>BTNG Sovereign Verification</Text>
        </View>
        <View style={s.verifyBadge}>
          <Text style={s.verifyBadgeText}>VERIFY</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Viewfinder */}
        {!verifyResult && (
          <View style={s.scannerSection}>
            <View style={s.viewfinder}>
              {scanning && hasPermission ? (
                <>
                  <CameraView
                    style={StyleSheet.absoluteFillObject}
                    facing="back"
                    enableTorch={torchOn}
                    barcodeScannerSettings={{ barcodeTypes: scanMode === 'qr' ? BARCODE_TYPES_QR : BARCODE_TYPES_ALL }}
                    onBarcodeScanned={handleBarcodeScanned}
                  />
                  {/* Overlay */}
                  <View style={s.cameraOverlay}>
                    <View style={s.cameraVignette} />
                    {/* Top toolbar */}
                    <View style={s.camToolbar}>
                      {/* Torch toggle */}
                      <TouchableOpacity
                        style={[s.camToolBtn, torchOn && s.camToolBtnActive]}
                        onPress={() => setTorchOn(v => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <MaterialIcons name={torchOn ? 'flashlight-on' : 'flashlight-off'} size={18} color={torchOn ? Colors.warning : Colors.textPrimary} />
                      </TouchableOpacity>
                      {/* Scan mode toggle */}
                      <TouchableOpacity
                        style={[s.camToolBtn, s.camModeBtn]}
                        onPress={() => setScanMode(v => v === 'qr' ? 'all' : 'qr')}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <MaterialIcons name={scanMode === 'qr' ? 'qr-code' : 'barcode-reader'} size={16} color={Colors.primary} />
                        <Text style={s.camModeText}>{scanMode === 'qr' ? 'QR' : 'ALL'}</Text>
                      </TouchableOpacity>
                    </View>
                    <ScanFrame active />
                    <View style={s.hintRow}>
                      <MaterialIcons name={scanMode === 'qr' ? 'qr-code' : 'view-week'} size={12} color={Colors.textPrimary} />
                      <Text style={s.scanHint}>
                        {scanMode === 'qr' ? 'Point at a BTNG certificate QR code' : 'Scanning QR + all barcode types'}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={s.placeholder}>
                  <ScanFrame active={false} />
                  <View style={s.placeholderText}>
                    {loading ? (
                      <>
                        <ActivityIndicator color={Colors.primary} size="large" />
                        <Text style={s.loadingLabel}>Verifying certificate…</Text>
                      </>
                    ) : (
                      <>
                        <MaterialIcons name="qr-code-scanner" size={38} color={Colors.primary} style={{ opacity: 0.6 }} />
                        <Text style={s.placeholderTitle}>BTNG QR Verifier</Text>
                        <Text style={s.placeholderSub}>
                          {hasPermission === false
                            ? 'Camera permission denied.\nPlease enable in device settings.'
                            : hasPermission === null
                              ? 'Requesting camera permission…'
                              : 'Tap Scan Certificate to begin.'}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* Controls */}
            {!loading && (
              scanning ? (
                <View style={s.controlRow}>
                  <TouchableOpacity style={[s.stopBtn, { flex: 1 }]} onPress={stopScanning} activeOpacity={0.85}>
                    <MaterialIcons name="stop" size={18} color={Colors.error} />
                    <Text style={s.stopBtnText}>Stop</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.manualBtn}
                    onPress={() => { stopScanning(); setManualMode(true); }}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="keyboard" size={16} color={Colors.textSecondary} />
                    <Text style={s.manualBtnText}>Manual</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.controlRow}>
                  <TouchableOpacity
                    style={[s.scanBtn, { flex: 1 }, hasPermission === false && { opacity: 0.4 }]}
                    onPress={startScanning}
                    disabled={hasPermission === false}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="qr-code-scanner" size={20} color={Colors.bg} />
                    <Text style={s.scanBtnText}>Scan Certificate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.manualBtn}
                    onPress={() => setManualMode(v => !v)}
                    activeOpacity={0.85}
                  >
                    <MaterialIcons name="keyboard" size={16} color={Colors.textSecondary} />
                    <Text style={s.manualBtnText}>ID</Text>
                  </TouchableOpacity>
                </View>
              )
            )}

            {/* Manual ID entry */}
            {manualMode && !scanning && (
              <View style={s.manualCard}>
                <View style={s.manualHeader}>
                  <MaterialIcons name="edit" size={14} color={Colors.primary} />
                  <Text style={s.manualTitle}>Enter Certificate ID Manually</Text>
                </View>
                <View style={s.manualInputRow}>
                  <TextInput
                    style={s.manualInput}
                    value={manualId}
                    onChangeText={setManualId}
                    placeholder="e.g. CERT-2026-GH-0001"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={handleManualLookup}
                    autoFocus
                  />
                  {manualId.length > 0 && (
                    <TouchableOpacity onPress={() => setManualId('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialIcons name="close" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={[s.manualLookupBtn, !manualId.trim() && { opacity: 0.4 }]}
                  onPress={handleManualLookup}
                  disabled={!manualId.trim()}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="search" size={16} color={Colors.bg} />
                  <Text style={s.manualLookupBtnText}>Look Up Certificate</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Scan mode chips */}
            {!scanning && !manualMode && (
              <View style={s.modeChipRow}>
                <Text style={s.modeChipLabel}>Barcode type:</Text>
                {[{ key: 'qr', icon: 'qr-code', label: 'QR Only' }, { key: 'all', icon: 'view-week', label: 'QR + Barcode' }].map(m => (
                  <TouchableOpacity
                    key={m.key}
                    style={[s.modeChip, scanMode === m.key && s.modeChipActive]}
                    onPress={() => setScanMode(m.key as 'qr' | 'all')}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MaterialIcons name={m.icon as any} size={12} color={scanMode === m.key ? Colors.bg : Colors.textMuted} />
                    <Text style={[s.modeChipText, scanMode === m.key && s.modeChipTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Result */}
        {verifyResult && !loading && (
          <VerificationCard result={verifyResult} onScanAgain={startScanning} />
        )}

        {/* How it works */}
        {!verifyResult && !scanning && !loading && (
          <View style={s.howCard}>
            <View style={s.howHeader}>
              <MaterialIcons name="info-outline" size={16} color={Colors.primary} />
              <Text style={s.howTitle}>How BTNG QR Verification Works</Text>
            </View>
            <View style={s.howSteps}>
              {[
                { icon: 'qr-code-scanner', text: 'Scan the QR code on any BTNG sovereign certificate' },
                { icon: 'search',          text: 'Certificate ID and fingerprint are parsed from the QR' },
                { icon: 'cloud-done',      text: 'Data is matched against the BTNG Sovereign Ledger' },
                { icon: 'verified',        text: 'Green Verified confirms authenticity and active status' },
              ].map((step, i) => (
                <View key={i} style={s.howStep}>
                  <View style={s.howNum}>
                    <Text style={s.howNumText}>{i + 1}</Text>
                  </View>
                  <MaterialIcons name={step.icon as any} size={15} color={Colors.primary} />
                  <Text style={s.howStepText}>{step.text}</Text>
                </View>
              ))}
            </View>
            <View style={s.howBtnRow}>
              <TouchableOpacity style={[s.docsBtn, { flex: 1 }]} onPress={() => router.push('/btng-sovereign-docs' as any)} activeOpacity={0.85}>
                <MaterialIcons name="description" size={14} color={Colors.primary} />
                <Text style={s.docsBtnText}>My Certificates</Text>
                <MaterialIcons name="chevron-right" size={14} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={[s.docsBtn, s.qrGenBtn, { flex: 1 }]} onPress={() => router.push('/cert-qr-generator' as any)} activeOpacity={0.85}>
                <MaterialIcons name="qr-code-2" size={14} color="#A855F7" />
                <Text style={[s.docsBtnText, { color: '#A855F7' }]}>Generate QR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <MaterialIcons name="verified-user" size={11} color={Colors.textMuted} />
          <Text style={s.footerText}>BTNG Sovereign Document System · ES256 Signed · QR Verified</Text>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, gap: 2 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  verifyBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  verifyBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },

  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.md },

  scannerSection: { gap: Spacing.md },
  viewfinder: { width: '100%', aspectRatio: 1, maxHeight: 320, borderRadius: Radius.xl, overflow: 'hidden', backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.primary + '44' },

  cameraOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  cameraVignette: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,6,8,0.45)' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, zIndex: 1 },
  scanHint: { fontSize: FontSize.xs, color: Colors.textPrimary, fontWeight: FontWeight.semibold, includeFontPadding: false },

  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg, padding: Spacing.xl },
  placeholderText: { alignItems: 'center', gap: Spacing.md },
  placeholderTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  placeholderSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  loadingLabel: { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false, marginTop: Spacing.sm },

  controlRow:     { flexDirection: 'row', gap: Spacing.sm },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 5 },
  scanBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  stopBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, borderWidth: 1.5, borderColor: Colors.error + '55' },
  stopBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },

  // Manual entry
  manualBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingVertical: Spacing.md + 2, paddingHorizontal: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  manualBtnText:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, includeFontPadding: false },
  manualCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.primary + '55', padding: Spacing.lg, gap: Spacing.md },
  manualHeader:      { flexDirection: 'row', alignItems: 'center', gap: 7 },
  manualTitle:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  manualInputRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, height: 48 },
  manualInput:       { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, paddingHorizontal: Spacing.md, includeFontPadding: false, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  manualLookupBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  manualLookupBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  // Mode chips
  modeChipRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' as const },
  modeChipLabel:     { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  modeChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  modeChipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  modeChipText:      { fontSize: 11, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  modeChipTextActive:{ color: Colors.bg },

  // Camera toolbar
  camToolbar:        { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8, zIndex: 10 },
  camToolBtn:        { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  camToolBtnActive:  { backgroundColor: 'rgba(245,158,11,0.25)', borderColor: Colors.warning + '88' },
  camModeBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8, width: 'auto' as any },
  camModeText:       { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },

  howCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md + 2, gap: Spacing.md },
  howHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  howTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  howSteps: { gap: Spacing.sm },
  howStep: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  howNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  howNumText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  howStepText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 17 },
  docsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44' },
  docsBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  howBtnRow: { flexDirection: 'row', gap: Spacing.sm },
  qrGenBtn: { backgroundColor: '#A855F712', borderColor: '#A855F744' },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm },
  footerText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
});
