import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Pressable, Animated, Share, Platform, Dimensions, Linking,
} from 'react-native';
import * as JSZip from 'jszip';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as MediaLibrary from 'expo-media-library';
import ViewShot from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert } from '@/template';
import { useBtngCertificates } from '@/hooks/useBtngCertificates';
import { useEquityBalance } from '@/hooks/useEquityBalance';
import { BTNGCertificate, CertType, computeEquityGrade } from '@/services/btngCertificatesService';

// ─────────────────────────────────────────────────────────────────────────────
// Equity Balance Card — full sovereign equity verification block
// ─────────────────────────────────────────────────────────────────────────────
interface EquityBalanceCardProps {
  userId: string;
}

function EquityBalanceCard({ userId }: EquityBalanceCardProps) {
  const { balance, loading, error, refreshedAt, load } = useEquityBalance(userId);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [loading]);

  const handleCopy = (label: string, value: string) => {
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const verifyUrl = balance
    ? `https://verify.bituncoin.io/${balance.document_id}`
    : 'https://verify.bituncoin.io';

  if (loading && !balance) {
    return (
      <Animated.View style={[eb.card, { opacity: pulseAnim }]}>
        <View style={eb.loadRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={eb.loadText}>Loading equity balance…</Text>
        </View>
      </Animated.View>
    );
  }

  if (error && !balance) {
    return (
      <View style={eb.card}>
        <View style={eb.errorRow}>
          <MaterialIcons name="error-outline" size={16} color={Colors.error} />
          <Text style={eb.errorText}>Could not load equity balance</Text>
          <TouchableOpacity style={eb.retryBtn} onPress={load}>
            <Text style={eb.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={eb.card}>
      {/* Gradient accent bar */}
      <LinearGradient
        colors={['#D4A017', '#2E7D32', '#1A3A6B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={eb.accentBar}
      />

      {/* Header row */}
      <TouchableOpacity style={eb.header} onPress={() => setExpanded(v => !v)} activeOpacity={0.85}>
        <View style={eb.headerLeft}>
          <View style={eb.headerIconWrap}>
            <LinearGradient colors={['#D4A017', '#A07810']} style={eb.headerIconGrad}>
              <Text style={eb.headerIconText}>⚖️</Text>
            </LinearGradient>
          </View>
          <View style={{ gap: 2 }}>
            <Text style={eb.headerTitle}>BTNG Equity Balance</Text>
            <Text style={eb.headerSub}>Sovereign Verified · ES256 Signed</Text>
          </View>
        </View>
        <View style={eb.headerRight}>
          <View style={eb.verifiedBadge}>
            <MaterialIcons name="verified" size={11} color="#22C55E" />
            <Text style={eb.verifiedText}>VERIFIED</Text>
          </View>
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={20}
            color={Colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Summary equity row — always visible */}
      {balance && (
        <View style={eb.summaryRow}>
          <View style={eb.summaryCell}>
            <Text style={eb.summaryCellValue}>{balance.total_equity.toLocaleString('en-US', { maximumFractionDigits: 2 })} BTNGG</Text>
            <Text style={eb.summaryCellLabel}>Total Equity</Text>
          </View>
          <View style={eb.summaryDivider} />
          <View style={eb.summaryCell}>
            <Text style={[eb.summaryCellValue, { color: Colors.primary }]}>
              ${balance.usd_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={eb.summaryCellLabel}>USD Value</Text>
          </View>
          <View style={eb.summaryDivider} />
          <View style={eb.summaryCell}>
            <Text style={[eb.summaryCellValue, { color: '#22C55E' }]}>
              ${balance.loan_eligible_equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={eb.summaryCellLabel}>Loan-Eligible</Text>
          </View>
          <View style={eb.summaryDivider} />
          <View style={eb.summaryCell}>
            <View style={[eb.tierBadge, balance.tier === 'Gold' || balance.tier === 'Platinum' ? eb.tierBadgeGold : eb.tierBadgeSilver]}>
              <Text style={[eb.tierText, (balance.tier === 'Gold' || balance.tier === 'Platinum') ? { color: Colors.primary } : {}]}>
                {balance.tier}
              </Text>
            </View>
            <Text style={eb.summaryCellLabel}>Tier</Text>
          </View>
        </View>
      )}

      {/* Expanded detail block */}
      {expanded && balance && (
        <View style={eb.detail}>

          {/* ── Section: Identity ── */}
          <View style={eb.sectionHeader}>
            <MaterialIcons name="badge" size={13} color={Colors.primary} />
            <Text style={eb.sectionTitle}>HOLDER IDENTITY</Text>
          </View>
          <View style={eb.detailGrid}>
            <View style={eb.detailCell}>
              <Text style={eb.detailLabel}>BTNG ID</Text>
              <View style={eb.detailValueRow}>
                <Text style={eb.detailMono} numberOfLines={1}>{balance.btng_id}</Text>
                <TouchableOpacity onPress={() => handleCopy('BTNG ID', balance.btng_id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <MaterialIcons name={copied === 'BTNG ID' ? 'check' : 'content-copy'} size={12} color={copied === 'BTNG ID' ? Colors.success : Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={eb.detailCell}>
              <Text style={eb.detailLabel}>SOVEREIGN STATUS</Text>
              <View style={eb.statusRow}>
                <View style={eb.statusDot} />
                <Text style={[eb.detailValue, { color: '#22C55E' }]}>{balance.sovereign_status}</Text>
              </View>
            </View>
          </View>

          <View style={eb.detailCellFull}>
            <Text style={eb.detailLabel}>WALLET ADDRESS</Text>
            <View style={eb.detailValueRow}>
              <Text style={eb.detailMono} numberOfLines={1}>{balance.wallet_address}</Text>
              <TouchableOpacity onPress={() => handleCopy('Wallet', balance.wallet_address)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <MaterialIcons name={copied === 'Wallet' ? 'check' : 'content-copy'} size={12} color={copied === 'Wallet' ? Colors.success : Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={eb.detailCellFull}>
            <Text style={eb.detailLabel}>IMPORT / EXPORT ACCOUNT ID</Text>
            <View style={eb.detailValueRow}>
              <Text style={eb.detailMono} numberOfLines={1}>{balance.import_export_account_id}</Text>
              <TouchableOpacity onPress={() => handleCopy('Account', balance.import_export_account_id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <MaterialIcons name={copied === 'Account' ? 'check' : 'content-copy'} size={12} color={copied === 'Account' ? Colors.success : Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={eb.detailCellFull}>
            <Text style={eb.detailLabel}>ON-CHAIN TX HASH</Text>
            <View style={eb.detailValueRow}>
              <Text style={[eb.detailMono, { flex: 1 }]} numberOfLines={1}>{balance.on_chain_tx_hash}</Text>
              <TouchableOpacity onPress={() => handleCopy('TX', balance.on_chain_tx_hash)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <MaterialIcons name={copied === 'TX' ? 'check' : 'content-copy'} size={12} color={copied === 'TX' ? Colors.success : Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Section: BTNG Gold Deposit ── */}
          <View style={[eb.sectionHeader, { marginTop: Spacing.md }]}>
            <MaterialIcons name="account-balance" size={13} color={Colors.primary} />
            <Text style={eb.sectionTitle}>BTNG GOLD COIN DEPOSIT</Text>
          </View>
          <View style={eb.goldDepositCard}>
            <View style={eb.goldDepositRow}>
              <View style={eb.goldIconWrap}>
                <Text style={eb.goldIcon}>🏅</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={eb.goldDataRow}>
                  <View style={eb.goldDataCell}>
                    <Text style={eb.goldDataLabel}>BTNGG AMOUNT</Text>
                    <Text style={eb.goldDataValue}>{balance.total_equity.toLocaleString('en-US', { maximumFractionDigits: 2 })} BTNGG</Text>
                  </View>
                  <View style={eb.goldDataCell}>
                    <Text style={eb.goldDataLabel}>TROY OZ GOLD</Text>
                    <Text style={eb.goldDataValue}>{balance.gold_oz_troy.toFixed(2)} oz</Text>
                  </View>
                </View>
                <View style={eb.goldDataRow}>
                  <View style={eb.goldDataCell}>
                    <Text style={eb.goldDataLabel}>USD VALUE</Text>
                    <Text style={[eb.goldDataValue, { color: Colors.primary }]}>
                      ${balance.usd_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={eb.goldDataCell}>
                    <Text style={eb.goldDataLabel}>GHS BACKED</Text>
                    <Text style={eb.goldDataValue}>GHS {balance.gold_backed_ghs.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* ── Section: Equity Breakdown ── */}
          <View style={[eb.sectionHeader, { marginTop: Spacing.md }]}>
            <MaterialIcons name="pie-chart" size={13} color='#22C55E' />
            <Text style={[eb.sectionTitle, { color: '#22C55E' }]}>EQUITY SECURITY BACKUP</Text>
            <View style={eb.securedBadge}>
              <MaterialIcons name="security" size={9} color="#22C55E" />
              <Text style={eb.securedText}>SECURED — EQUITY BACKUP ACTIVE</Text>
            </View>
          </View>

          <View style={eb.equitySecurityBox}>
            <Text style={eb.equitySecurityText}>
              This document certifies that the equity balance is fully collateralized, eligible for trade settlement, cross-border correspondence, and loan instruments under BTNG Sovereign Banking Policy. EKUYE DIGITAL GATEWAY TRUST LTD acts as Trustee and Official Officer under Ghana Companies Act 992, Reg. CS099020624, TIN C0064220206.
            </Text>
          </View>

          <View style={eb.equityGrid}>
            {[
              { label: 'Total BTNG Equity',    value: balance.total_equity,        unit: 'BTNGG', color: Colors.textPrimary },
              { label: 'Asset-Backed Equity',  value: balance.asset_backed_equity, unit: 'BTNGG', color: Colors.primary },
              { label: 'Liquid Equity',         value: balance.liquid_equity,       unit: 'BTNGG', color: '#3B82F6' },
              { label: 'Loan-Eligible Equity',  value: balance.loan_eligible_equity, unit: 'USD',  color: '#22C55E' },
            ].map((row, i) => (
              <View key={i} style={eb.equityRow}>
                <View style={[eb.equityDot, { backgroundColor: row.color }]} />
                <Text style={eb.equityLabel}>{row.label}</Text>
                <Text style={[eb.equityValue, { color: row.color }]}>
                  {row.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.unit}
                </Text>
              </View>
            ))}
          </View>

          {/* ── Section: Verification ── */}
          <View style={[eb.sectionHeader, { marginTop: Spacing.md }]}>
            <MaterialIcons name="verified-user" size={13} color='#3B82F6' />
            <Text style={[eb.sectionTitle, { color: '#3B82F6' }]}>LEDGER & VERIFICATION</Text>
          </View>

          <View style={eb.verifyBlock}>
            {/* Document ID */}
            <View style={eb.verifyRow}>
              <Text style={eb.verifyLabel}>DOCUMENT ID</Text>
              <Text style={eb.verifyMono} numberOfLines={1}>{balance.document_id}</Text>
            </View>
            {/* Timestamp */}
            <View style={eb.verifyRow}>
              <Text style={eb.verifyLabel}>VERIFIED AT (UTC)</Text>
              <Text style={eb.verifyValue}>{new Date(balance.verified_at).toUTCString()}</Text>
            </View>
            {/* Equity Hash */}
            <View style={eb.verifyHashBlock}>
              <View style={eb.verifyHashHeader}>
                <MaterialIcons name="fingerprint" size={12} color={Colors.textMuted} />
                <Text style={eb.verifyLabel}>EQUITY VERIFICATION HASH (SHA-256)</Text>
              </View>
              <Text style={eb.verifyHashValue}>{balance.equity_hash}</Text>
            </View>
            {/* Sovereign Signature */}
            <View style={eb.verifyHashBlock}>
              <View style={eb.verifyHashHeader}>
                <MaterialIcons name="draw" size={12} color={Colors.primary} />
                <Text style={eb.verifyLabel}>SOVEREIGN SIGNATURE (ES256)</Text>
              </View>
              <Text style={[eb.verifyHashValue, { color: Colors.primary + 'CC' }]}>
                {balance.on_chain_tx_hash.slice(0, 32)}…{balance.on_chain_tx_hash.slice(-8)}
              </Text>
            </View>
            {/* Verification URL */}
            <View style={eb.verifyRow}>
              <Text style={eb.verifyLabel}>VERIFICATION URL</Text>
              <Text style={[eb.verifyMono, { color: '#3B82F6' }]} numberOfLines={1}>{verifyUrl}</Text>
            </View>

            {/* QR Code */}
            <View style={eb.qrVerifyRow}>
              <View style={eb.qrVerifyBox}>
                <QRCode
                  value={verifyUrl}
                  size={80}
                  color={Colors.primary}
                  backgroundColor={Colors.bgCard}
                />
                <Text style={eb.qrLabel}>SCAN TO VERIFY</Text>
              </View>
              <View style={eb.qrVerifyInfo}>
                <Text style={eb.qrInfoTitle}>BTNG Sovereign Registry</Text>
                <Text style={eb.qrInfoSub}>verify.bituncoin.io</Text>
                <View style={eb.adminSigRow}>
                  <View style={eb.adminSigBox}>
                    <Text style={eb.adminSigName}>John Kojo Zi</Text>
                    <Text style={eb.adminSigRole}>Founder & Lead Architect</Text>
                    <Text style={eb.adminSigOrg}>EKUYE DIGITAL GATEWAY TRUST LTD</Text>
                  </View>
                </View>
                <Text style={eb.legalRef}>
                  Reg. CS099020624 · TIN C0064220206{"\n"}
                  Ghana Companies Act 992 · 24 June 2024
                </Text>
              </View>
            </View>
          </View>

          {/* Refresh row */}
          <TouchableOpacity style={eb.refreshRow} onPress={load} activeOpacity={0.8}>
            <MaterialIcons name="refresh" size={13} color={Colors.textMuted} />
            <Text style={eb.refreshText}>
              {refreshedAt
                ? `Last refreshed ${new Date(refreshedAt).toLocaleTimeString()}`
                : 'Tap to refresh equity data'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const eb = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  loadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  loadText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.error,
    includeFontPadding: false,
  },
  retryBtn: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  retryText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    paddingBottom: Spacing.sm + 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    flex: 1,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.primary + '66',
    flexShrink: 0,
  },
  headerIconGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: { fontSize: 20 },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  headerSub: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  verifiedText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: '#22C55E',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    gap: 3,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 6,
  },
  summaryCellValue: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    includeFontPadding: false,
    textAlign: 'center',
  },
  summaryCellLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    includeFontPadding: false,
    textAlign: 'center',
  },
  tierBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  tierBadgeGold: {
    backgroundColor: Colors.warningBg,
    borderColor: Colors.primary + '55',
  },
  tierBadgeSilver: {
    backgroundColor: Colors.bgCard,
    borderColor: Colors.border,
  },
  tierText: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  detail: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 1,
    includeFontPadding: false,
    flex: 1,
  },
  securedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  securedText: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: '#22C55E',
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  detailGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  detailCell: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  detailCellFull: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  detailLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  detailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  detailMono: {
    flex: 1,
    fontSize: 9,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  goldDepositCard: {
    backgroundColor: Colors.warningBg,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
    padding: Spacing.md,
  },
  goldDepositRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  goldIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.warningBg,
    borderWidth: 2,
    borderColor: Colors.primary + '88',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  goldIcon: { fontSize: 24 },
  goldDataRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  goldDataCell: { flex: 1, gap: 3 },
  goldDataLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.primary + 'BB',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  goldDataValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    includeFontPadding: false,
  },
  equitySecurityBox: {
    backgroundColor: 'rgba(34,197,94,0.07)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.28)',
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
    padding: Spacing.sm + 2,
  },
  equitySecurityText: {
    fontSize: 9,
    color: 'rgba(34,197,94,0.9)',
    lineHeight: 14,
    includeFontPadding: false,
  },
  equityGrid: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  equityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  equityDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  equityLabel: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  equityValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
    textAlign: 'right',
  },
  verifyBlock: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    gap: 0,
  },
  verifyRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 3,
  },
  verifyLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  verifyValue: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  verifyMono: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  verifyHashBlock: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 5,
  },
  verifyHashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  verifyHashValue: {
    fontSize: 8,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 13,
    includeFontPadding: false,
  },
  qrVerifyRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
  },
  qrVerifyBox: {
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  qrLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  qrVerifyInfo: {
    flex: 1,
    gap: 5,
  },
  qrInfoTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  qrInfoSub: {
    fontSize: 9,
    color: '#3B82F6',
    includeFontPadding: false,
  },
  adminSigRow: { marginTop: 4 },
  adminSigBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
    padding: Spacing.sm,
    gap: 2,
  },
  adminSigName: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    fontStyle: 'italic',
    includeFontPadding: false,
  },
  adminSigRole: {
    fontSize: 8,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  adminSigOrg: {
    fontSize: 8,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  legalRef: {
    fontSize: 8,
    color: Colors.textMuted,
    lineHeight: 12,
    includeFontPadding: false,
    marginTop: 3,
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
  },
  refreshText: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Zoomable Image — pinch + pan + double-tap-to-reset
// ─────────────────────────────────────────────────────────────────────────────
const MIN_SCALE = 1;
const MAX_SCALE = 4;

function ZoomableImage({
  uri,
  width,
  aspectRatio,
  resetKey,
}: {
  uri: string;
  width: number;
  aspectRatio: number;
  resetKey: number;
}) {
  const scale        = useSharedValue(1);
  const savedScale   = useSharedValue(1);
  const translateX   = useSharedValue(0);
  const translateY   = useSharedValue(0);
  const savedX       = useSharedValue(0);
  const savedY       = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false);

  // Reset when a new image is loaded
  useEffect(() => {
    scale.value      = withTiming(1, { duration: 250 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 250 });
    translateY.value = withTiming(0, { duration: 250 });
    savedX.value     = 0;
    savedY.value     = 0;
    setIsZoomed(false);
  }, [resetKey]);

  const updateZoomedState = (s: number) => {
    setIsZoomed(s > 1.05);
  };

  // Clamp pan based on current scale so the image never drifts too far
  const clamp = (val: number, maxOffset: number) => {
    'worklet';
    return Math.max(-maxOffset, Math.min(maxOffset, val));
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value      = withSpring(1,  { damping: 14, stiffness: 120 });
        translateX.value = withSpring(0,  { damping: 14, stiffness: 120 });
        translateY.value = withSpring(0,  { damping: 14, stiffness: 120 });
        savedScale.value = 1;
        savedX.value     = 0;
        savedY.value     = 0;
        runOnJS(updateZoomedState)(1);
      } else {
        runOnJS(updateZoomedState)(scale.value);
      }
    });

  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onUpdate(e => {
      const maxOffsetX = (width * (scale.value - 1)) / 2;
      const maxOffsetY = ((width / aspectRatio) * (scale.value - 1)) / 2;
      translateX.value = clamp(savedX.value + e.translationX, maxOffsetX);
      translateY.value = clamp(savedY.value + e.translationY, maxOffsetY);
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value      = withSpring(1, { damping: 14, stiffness: 120 });
      translateX.value = withSpring(0, { damping: 14, stiffness: 120 });
      translateY.value = withSpring(0, { damping: 14, stiffness: 120 });
      savedScale.value = 1;
      savedX.value     = 0;
      savedY.value     = 0;
      runOnJS(updateZoomedState)(1);
    });

  const composed = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(panGesture, doubleTapGesture),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <View style={{ width, borderRadius: Radius.xl, overflow: 'hidden' }}>
      <GestureHandlerRootView style={{ width }}>
        <GestureDetector gesture={composed}>
          <ReAnimated.View style={animatedStyle}>
            <Image
              source={{ uri }}
              style={[
                pv.image,
                { width, aspectRatio },
              ]}
              contentFit="contain"
              transition={200}
            />
          </ReAnimated.View>
        </GestureDetector>
      </GestureHandlerRootView>
      {/* Gold glow border overlay */}
      <View style={pv.imageGlow} pointerEvents="none" />
      {/* Zoom hint pill */}
      {isZoomed ? (
        <View style={zi.resetPill} pointerEvents="none">
          <MaterialIcons name="zoom-out" size={11} color={Colors.primary} />
          <Text style={zi.resetText}>Double-tap to reset</Text>
        </View>
      ) : (
        <View style={zi.hintPill} pointerEvents="none">
          <MaterialIcons name="zoom-in" size={11} color={Colors.textMuted} />
          <Text style={zi.hintText}>Pinch to zoom · Double-tap to reset</Text>
        </View>
      )}
    </View>
  );
}

const zi = StyleSheet.create({
  resetPill: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
  },
  resetText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
  hintPill: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hintText: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Certificate type metadata
// ─────────────────────────────────────────────────────────────────────────────
interface CertTypeMeta {
  type: CertType;
  label: string;
  emoji: string;
  color: string;
  description: string;
  prefix: string;
}

const CERT_TYPES: CertTypeMeta[] = [
  { type: 'property',             label: 'Real Property',         emoji: '🏠', color: '#3B82F6', description: 'Land & building ownership certificate',    prefix: 'PROP' },
  { type: 'vehicle',              label: 'Vehicle',               emoji: '🚗', color: '#F59E0B', description: 'Motor vehicle title certificate',           prefix: 'VEH'  },
  { type: 'land',                 label: 'Land Parcel',           emoji: '🌍', color: '#22C55E', description: 'Land parcel sovereignty certificate',       prefix: 'LAND' },
  { type: 'business',             label: 'Business Ownership',    emoji: '🏢', color: '#8B5CF6', description: 'Business equity ownership certificate',     prefix: 'BIZ'  },
  { type: 'stock',                label: 'Stock / Equity',        emoji: '📈', color: '#06B6D4', description: 'Stock & equity percentage certificate',     prefix: 'STK'  },
  { type: 'minerals',             label: 'Mineral Rights',        emoji: '⛏️', color: '#EF4444', description: 'Mineral rights sovereignty certificate',   prefix: 'MIN'  },
  { type: 'intellectual_property',label: 'Intellectual Property', emoji: '💡', color: '#F97316', description: 'Patent, trademark & copyright certificate', prefix: 'IP'   },
  { type: 'music_album',          label: 'Music Album',           emoji: '🎵', color: '#EC4899', description: 'Master & publishing rights certificate',    prefix: 'MUS'  },
  { type: 'import_export',        label: 'Import/Export PoV',     emoji: '🛣', color: '#D4A017', description: 'Proof of Value & Equity Security Backup',   prefix: 'IEGW' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sort helpers
// ─────────────────────────────────────────────────────────────────────────────
export type SortOrder =
  | 'newest'
  | 'oldest'
  | 'highest_value'
  | 'lowest_value'
  | 'grade_asc'
  | 'grade_desc';

const SORT_OPTIONS: Array<{ key: SortOrder; label: string; iconName: string }> = [
  { key: 'newest',        label: 'Newest',        iconName: 'north'         },
  { key: 'oldest',        label: 'Oldest',        iconName: 'south'         },
  { key: 'highest_value', label: 'Highest Value', iconName: 'trending-up'   },
  { key: 'lowest_value',  label: 'Lowest Value',  iconName: 'trending-down' },
  { key: 'grade_asc',     label: 'Grade A→D',     iconName: 'sort'          },
  { key: 'grade_desc',    label: 'Grade D→A',     iconName: 'sort'          },
];

const GRADE_ORDER = ['A+', 'A', 'B', 'C', 'D'];

function sortCerts(certs: BTNGCertificate[], order: SortOrder): BTNGCertificate[] {
  const arr = [...certs];
  switch (order) {
    case 'newest':        return arr.sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());
    case 'oldest':        return arr.sort((a, b) => new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime());
    case 'highest_value': return arr.sort((a, b) => b.asset_value - a.asset_value);
    case 'lowest_value':  return arr.sort((a, b) => a.asset_value - b.asset_value);
    case 'grade_asc':     return arr.sort((a, b) => GRADE_ORDER.indexOf(a.equity_grade) - GRADE_ORDER.indexOf(b.equity_grade));
    case 'grade_desc':    return arr.sort((a, b) => GRADE_ORDER.indexOf(b.equity_grade) - GRADE_ORDER.indexOf(a.equity_grade));
    default:              return arr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Expiry helper
// ─────────────────────────────────────────────────────────────────────────────
function getDaysUntilExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  if (isNaN(expiry.getTime())) return null;
  const diff = expiry.getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────────────────────────
// Equity grade helpers
// ─────────────────────────────────────────────────────────────────────────────
const GRADE_META: Record<string, { color: string; bg: string; label: string }> = {
  'A+': { color: '#22C55E', bg: '#052e16',  label: 'Prime — Elite asset'        },
  'A':  { color: '#3B82F6', bg: '#172554',  label: 'Superior — High value'      },
  'B':  { color: '#F59E0B', bg: '#451a03',  label: 'Standard — Mid tier'        },
  'C':  { color: '#F97316', bg: '#431407',  label: 'Below average — Low tier'   },
  'D':  { color: '#EF4444', bg: '#450a0a',  label: 'Speculative — Minimal equity'},
};

function GradeBadge({ grade }: { grade: string }) {
  const meta = GRADE_META[grade] ?? GRADE_META['D'];
  return (
    <View style={[gb.badge, { backgroundColor: meta.bg, borderColor: meta.color + '66' }]}>
      <Text style={[gb.grade, { color: meta.color }]}>{grade}</Text>
      <Text style={[gb.label, { color: meta.color + 'BB' }]}>{meta.label}</Text>
    </View>
  );
}
const gb = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  grade: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  label: { fontSize: 9, fontWeight: FontWeight.semibold, includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Import/Export Proof of Value — dedicated expanded card
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Sovereign PDF Generator — 2-page HTML document for Import/Export cert
// ─────────────────────────────────────────────────────────────────────────────
function buildSovereignPdfHtml(cert: BTNGCertificate): string {
  const md = cert.metadata ?? {};
  const btngId         = md.btng_id                  ?? cert.cert_id;
  const walletAddr     = md.wallet_address            ?? '0x0000000000000000000000000000000000000000';
  const importExportId = md.import_export_account_id  ?? `IEGW-${cert.cert_id}`;
  const txHash         = md.on_chain_tx_hash          ?? cert.fingerprint;
  const btnggAmount    = (md.btngg_amount              ?? cert.asset_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const goldOzTroy     = (md.gold_oz_troy              ?? 0).toFixed(4);
  const usdValue       = (md.usd_value                 ?? cert.asset_value * 1.175).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ghsBacked      = (md.gold_backed_ghs           ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const adminRef       = md.admin_reference            ?? `ADM-${cert.cert_id.slice(-8)}`;
  const reservePolicy  = md.reserve_policy_code        ?? 'BTNG-RSV-POL-001';
  const assetBackedEq  = (md.asset_backed_equity       ?? cert.asset_value * 0.7).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const liquidEq       = (md.liquid_equity             ?? cert.asset_value * 0.4).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const loanEligible   = (md.loan_eligible_equity      ?? cert.asset_value * 0.35).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const verifyUrl      = `https://verify.bituncoin.io/${cert.cert_id}?fp=${cert.fingerprint.slice(0, 16)}`;
  const qrApiUrl       = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(verifyUrl)}&color=8B6914&bgcolor=FFFDF4`;
  const utcTs          = new Date(cert.created_at).toUTCString();
  const issuedDate     = cert.issued_at;
  const expiresDate    = cert.expires_at ?? 'No Expiry';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="title" content="BTNG Sovereign Import/Export PoV — ${cert.cert_id}">
<meta name="author" content="John Kojo Zi — EKUYE DIGITAL GATEWAY TRUST LTD">
<meta name="subject" content="BTNG Sovereign Import/Export Proof of Value & Equity Security Backup">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #fff; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm 12mm; position: relative; background: #fff; page-break-after: always; }
  .page-2 { page-break-after: auto; }

  /* ── Header ── */
  .doc-header { background: linear-gradient(135deg, #0E0C04 0%, #1A1400 50%, #0A0A10 100%); border-radius: 6px; padding: 14px 18px; display: flex; align-items: center; gap: 14px; margin-bottom: 12px; border: 1.5px solid #C4900F; }
  .doc-header-coin { width: 52px; height: 52px; background: #2A1F00; border: 2px solid #C4900F; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; flex-shrink: 0; }
  .doc-header-text { flex: 1; }
  .doc-header-brand { font-size: 16px; font-weight: bold; color: #D4A017; letter-spacing: 2px; }
  .doc-header-subtitle { font-size: 8px; color: #8B6914; letter-spacing: 1.5px; margin-top: 2px; }
  .doc-header-right { text-align: right; }
  .doc-header-badge { background: rgba(212,160,23,0.15); border: 1px solid #C4900F; border-radius: 4px; padding: 4px 8px; display: inline-block; }
  .doc-header-badge-text { font-size: 8px; color: #D4A017; font-weight: bold; letter-spacing: 1px; }
  .doc-cert-type { font-size: 8px; color: #8B6914; margin-top: 3px; letter-spacing: 0.8px; }

  /* ── Tri-color accent bar ── */
  .accent-bar { height: 3px; background: linear-gradient(to right, #D4A017 33%, #1A6B1A 33%, #1A6B1A 66%, #1A3A6B 66%); border-radius: 2px; margin-bottom: 12px; }

  /* ── Section headers ── */
  .section-label { font-size: 7px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; color: #8B6914; border-bottom: 1px solid #D4A01744; padding-bottom: 3px; margin-bottom: 7px; display: flex; align-items: center; gap: 5px; }
  .section-label::before { content: ''; width: 3px; height: 10px; background: #D4A017; border-radius: 2px; display: inline-block; }

  /* ── Info grids ── */
  .info-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
  .info-grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; margin-bottom: 8px; }
  .info-cell { background: #FFFDF4; border: 1px solid #E8D88A; border-radius: 4px; padding: 6px 8px; }
  .info-cell-label { font-size: 6px; font-weight: bold; letter-spacing: 1px; color: #8B6914; text-transform: uppercase; margin-bottom: 2px; }
  .info-cell-value { font-size: 9px; font-weight: bold; color: #1a1a1a; }
  .info-cell-mono { font-size: 8px; color: #333; font-family: 'Courier New', monospace; word-break: break-all; }

  /* ── Holder card ── */
  .holder-card { background: #EEF4FF; border: 1.5px solid #3A5A9B55; border-left: 3px solid #1A3A6B; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
  .holder-avatar { width: 38px; height: 38px; background: #D4E4FF; border: 1px solid #1A3A6B44; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .holder-name { font-size: 12px; font-weight: bold; color: #1A3A6B; }
  .holder-role { font-size: 8px; color: #1A3A6B; margin-top: 1px; }
  .holder-org { font-size: 7.5px; color: #555; margin-top: 1px; }

  /* ── Gold deposit table ── */
  .gold-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; border: 1.5px solid #D4A01788; border-radius: 4px; overflow: hidden; }
  .gold-table th { background: #2A1F00; color: #D4A017; font-size: 7px; letter-spacing: 1px; text-transform: uppercase; padding: 5px 8px; text-align: left; }
  .gold-table td { background: #FFFDF4; border-top: 1px solid #E8D88A; padding: 5px 8px; font-size: 9px; color: #1a1a1a; font-weight: bold; }
  .gold-table td.gold-val { color: #8B6914; font-family: Georgia, serif; font-size: 10px; }

  /* ── Equity security box ── */
  .equity-security-box { background: rgba(21,128,61,0.07); border: 1px solid rgba(21,128,61,0.3); border-left: 3px solid #15803D; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; }
  .equity-security-header { font-size: 7px; font-weight: bold; letter-spacing: 1px; color: #15803D; text-transform: uppercase; margin-bottom: 4px; display: flex; align-items: center; gap: 5px; }
  .secured-badge { background: rgba(21,128,61,0.12); border: 1px solid rgba(21,128,61,0.4); border-radius: 3px; padding: 1px 5px; font-size: 6.5px; font-weight: bold; color: #15803D; letter-spacing: 0.5px; }
  .equity-security-text { font-size: 8px; color: #14532D; line-height: 1.55; }

  /* ── Equity balance grid ── */
  .equity-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 8px; }
  .equity-row-item { background: #F8F8FF; border: 1px solid #E0E0F0; border-radius: 3px; padding: 5px 7px; display: flex; align-items: center; gap: 5px; }
  .equity-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .equity-label-text { flex: 1; font-size: 7px; color: #555; }
  .equity-value-text { font-size: 8px; font-weight: bold; }

  /* ── Verification block ── */
  .verify-block { background: #F8F9FF; border: 1px solid #C0C8E8; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; }
  .verify-row { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px solid #E8ECF8; }
  .verify-row:last-child { border-bottom: none; }
  .verify-row-label { font-size: 6.5px; font-weight: bold; letter-spacing: 0.8px; color: #6B7DB0; text-transform: uppercase; width: 110px; flex-shrink: 0; padding-top: 1px; }
  .verify-row-val { font-size: 8px; color: #1a1a1a; font-family: 'Courier New', monospace; word-break: break-all; }
  .verify-row-val.link { color: #1A3A6B; }
  .fp-block { background: #0E0C04; border-radius: 3px; padding: 5px 7px; margin: 4px 0; }
  .fp-label { font-size: 6.5px; color: #8B6914; letter-spacing: 0.8px; margin-bottom: 2px; }
  .fp-value { font-size: 7.5px; color: #D4A017; font-family: 'Courier New', monospace; word-break: break-all; line-height: 1.4; }

  /* ── QR row ── */
  .qr-verify-row { display: flex; gap: 14px; align-items: flex-start; margin-top: 8px; }
  .qr-box { border: 1.5px solid #C4900F; border-radius: 4px; padding: 5px; background: #FFFDF4; flex-shrink: 0; text-align: center; }
  .qr-scan-label { font-size: 6.5px; font-weight: bold; color: #8B6914; letter-spacing: 0.8px; text-align: center; margin-top: 4px; }
  .qr-info { flex: 1; }
  .qr-info-title { font-size: 10px; font-weight: bold; color: #1a1a1a; margin-bottom: 2px; }
  .qr-info-sub { font-size: 8px; color: #1A3A6B; margin-bottom: 6px; }

  /* ── Page 2 ── */
  .p2-header { background: linear-gradient(135deg, #0E0C04 0%, #1A1400 100%); border-radius: 6px; padding: 10px 18px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border: 1.5px solid #C4900F; }
  .p2-header-title { font-size: 10px; font-weight: bold; color: #D4A017; letter-spacing: 1.5px; }
  .p2-header-sub { font-size: 7.5px; color: #8B6914; margin-top: 2px; }
  .p2-header-id { font-size: 7px; color: #D4A01799; font-family: 'Courier New', monospace; margin-top: 3px; }

  /* ── Signature section ── */
  .sig-section { border: 1px solid #D4A01755; border-radius: 6px; padding: 16px 20px; margin-bottom: 16px; background: #FFFDF4; }
  .sig-section-title { font-size: 7px; font-weight: bold; letter-spacing: 1.2px; color: #8B6914; text-transform: uppercase; margin-bottom: 12px; padding-bottom: 4px; border-bottom: 1px solid #D4A01744; }
  .sig-row { display: flex; align-items: flex-end; gap: 30px; }
  .sig-box { flex: 1; }
  .sig-name-stylized { font-size: 22px; font-family: Georgia, serif; font-style: italic; color: #8B6914; margin-bottom: 2px; border-bottom: 1.5px solid #C4900F; padding-bottom: 4px; }
  .sig-name-print { font-size: 10px; font-weight: bold; color: #1a1a1a; margin-top: 4px; }
  .sig-role { font-size: 8px; color: #555; margin-top: 2px; }
  .sig-org { font-size: 7.5px; color: #777; margin-top: 1px; }
  .sig-date-box { text-align: right; }
  .sig-date-label { font-size: 6.5px; color: #999; letter-spacing: 0.8px; text-transform: uppercase; }
  .sig-date-val { font-size: 9px; font-weight: bold; color: #1a1a1a; margin-top: 2px; }

  /* ── Sovereign Seal ── */
  .seal-section { display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 16px; padding: 20px; background: linear-gradient(135deg, #FFFDF4, #FFF8E1); border: 2px solid #D4A017; border-radius: 8px; }
  .seal-ring-outer { width: 80px; height: 80px; border: 3px solid #D4A017; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(212,160,23,0.08); flex-shrink: 0; }
  .seal-ring-inner { width: 60px; height: 60px; border: 1.5px solid #C4900F88; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; background: rgba(212,160,23,0.06); }
  .seal-text-center { text-align: center; }
  .seal-verified-text { font-size: 11px; font-weight: bold; color: #8B6914; letter-spacing: 2px; text-transform: uppercase; }
  .seal-divider { width: 80%; height: 1px; background: #D4A017; margin: 6px auto; }
  .seal-admin-name { font-size: 14px; font-style: italic; color: #8B6914; font-family: Georgia, serif; margin-bottom: 2px; }
  .seal-admin-role { font-size: 7.5px; color: #555; margin-bottom: 1px; }
  .seal-legal-ref { font-size: 7px; color: #777; line-height: 1.5; }

  /* ── Legal notice ── */
  .legal-box { background: #F5F5F5; border: 1px solid #D0D0D0; border-radius: 4px; padding: 12px 14px; margin-bottom: 14px; }
  .legal-header { font-size: 7px; font-weight: bold; letter-spacing: 1.2px; color: #555; text-transform: uppercase; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #D0D0D0; display: flex; align-items: center; gap: 5px; }
  .legal-text { font-size: 8px; color: #444; line-height: 1.65; }
  .legal-reg-row { margin-top: 6px; background: #EBEBEB; border-radius: 3px; padding: 5px 7px; font-size: 8px; color: #333; font-family: 'Courier New', monospace; }

  /* ── Document integrity footer ── */
  .doc-integrity { background: #0E0C04; border-radius: 5px; padding: 10px 14px; margin-bottom: 12px; }
  .integrity-title { font-size: 6.5px; font-weight: bold; letter-spacing: 1.2px; color: #8B6914; text-transform: uppercase; margin-bottom: 6px; }
  .integrity-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .integrity-cell { }
  .integrity-label { font-size: 6px; color: #8B6914; letter-spacing: 0.8px; text-transform: uppercase; }
  .integrity-val { font-size: 7.5px; color: #D4A017; font-family: 'Courier New', monospace; word-break: break-all; line-height: 1.4; margin-top: 1px; }
  .integrity-val.link { color: #6BAED6; }

  /* ── Page footer ── */
  .page-footer { border-top: 1px solid #D4A01755; padding-top: 8px; display: flex; align-items: center; justify-content: space-between; }
  .page-footer-left { font-size: 7px; color: #8B6914; }
  .page-footer-right { font-size: 7px; color: #aaa; }
  .grade-badge { display: inline-block; background: #1A4A1A; color: #22C55E; font-size: 10px; font-weight: bold; border: 1px solid #22C55E55; border-radius: 4px; padding: 2px 8px; }
</style>
</head>
<body>

<!-- ════════════════════════════════════════════════════════════ PAGE 1 ════ -->
<div class="page">

  <!-- Header -->
  <div class="doc-header">
    <div class="doc-header-coin">&#127885;</div>
    <div class="doc-header-text">
      <div class="doc-header-brand">BTNG GOLD COIN</div>
      <div class="doc-header-subtitle">IMPORT / EXPORT — PROOF OF VALUE &amp; EQUITY SECURITY BACKUP</div>
      <div class="doc-cert-type">BTNG-IEGW — SOVEREIGN FINANCIAL INSTRUMENT</div>
    </div>
    <div class="doc-header-right">
      <div class="doc-header-badge"><div class="doc-header-badge-text">UBL-1.0 &nbsp;·&nbsp; ES256 SIGNED</div></div>
      <div class="doc-cert-type" style="margin-top:4px;">Grade: <strong style="color:#D4A017;">${cert.equity_grade}</strong></div>
    </div>
  </div>

  <div class="accent-bar"></div>

  <!-- Document Information -->
  <div class="section-label">Document Information</div>
  <div class="info-grid-2" style="margin-bottom:8px;">
    <div class="info-cell">
      <div class="info-cell-label">Unique Document ID</div>
      <div class="info-cell-mono">${cert.cert_id}</div>
    </div>
    <div class="info-cell">
      <div class="info-cell-label">UTC Timestamp</div>
      <div class="info-cell-value">${utcTs}</div>
    </div>
    <div class="info-cell">
      <div class="info-cell-label">Admin Reference</div>
      <div class="info-cell-mono">${adminRef}</div>
    </div>
    <div class="info-cell">
      <div class="info-cell-label">Reserve Policy Code</div>
      <div class="info-cell-mono">${reservePolicy}</div>
    </div>
  </div>

  <!-- Holder Information -->
  <div class="section-label">Holder Information</div>
  <div class="holder-card">
    <div class="holder-avatar">&#128100;</div>
    <div>
      <div class="holder-name">${cert.owner_name}</div>
      <div class="holder-role">Official Officer &amp; Trustee</div>
      <div class="holder-org">EKUYE DIGITAL GATEWAY TRUST LTD &nbsp;·&nbsp; Ghana</div>
    </div>
    <div style="margin-left:auto;text-align:right;">
      <div class="grade-badge">${cert.equity_grade}</div>
      <div style="font-size:7px;color:#555;margin-top:4px;">Issued: ${issuedDate} &nbsp; Expires: ${expiresDate}</div>
    </div>
  </div>

  <!-- Wallet & Account Details -->
  <div class="section-label">Wallet &amp; Account Details</div>
  <div style="margin-bottom:8px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
      <div class="info-cell"><div class="info-cell-label">BTNG ID</div><div class="info-cell-mono">${btngId}</div></div>
      <div class="info-cell"><div class="info-cell-label">Import / Export Account ID</div><div class="info-cell-mono">${importExportId}</div></div>
    </div>
    <div style="margin-top:5px;">
      <div class="info-cell"><div class="info-cell-label">Wallet Address (Full)</div><div class="info-cell-mono">${walletAddr}</div></div>
    </div>
    <div style="margin-top:5px;">
      <div class="info-cell"><div class="info-cell-label">On-Chain Transaction Hash</div><div class="info-cell-mono">${txHash}</div></div>
    </div>
  </div>

  <!-- BTNG Gold Coin Deposit -->
  <div class="section-label">BTNG Gold Coin Deposit</div>
  <table class="gold-table">
    <tr>
      <th>BTNGG Amount</th>
      <th>Troy Oz Gold</th>
      <th>USD Value</th>
      <th>GHS Backed</th>
    </tr>
    <tr>
      <td class="gold-val">${btnggAmount} BTNGG</td>
      <td class="gold-val">${goldOzTroy} oz</td>
      <td class="gold-val">$ ${usdValue}</td>
      <td class="gold-val">GHS ${ghsBacked}</td>
    </tr>
  </table>

  <!-- Equity Security Backup -->
  <div class="equity-security-box">
    <div class="equity-security-header">
      Equity Security Backup Statement
      <span class="secured-badge">&#10003; SECURED &mdash; EQUITY BACKUP ACTIVE</span>
    </div>
    <div class="equity-security-text">
      This Import/Export Proof of Value document certifies that the stated BTNG Gold Coin deposit is fully collateralized and equity-backed. The deposit is eligible for trade settlement, cross-border correspondence, and loan instruments under BTNG Sovereign Banking Policy. Collateralization covers 100% of the deposit value. EKUYE DIGITAL GATEWAY TRUST LTD acts as Official Officer and Trustee under Ghana Companies Act 992, Reg. CS099020624, TIN C0064220206, incorporated 24 June 2024.
    </div>
  </div>

  <!-- Equity Balance Breakdown -->
  <div class="section-label">BTNG Equity Balance — Verified</div>
  <div class="equity-grid">
    <div class="equity-row-item"><div class="equity-dot" style="background:#1a1a1a;"></div><span class="equity-label-text">Total BTNG Equity</span><span class="equity-value-text">${btnggAmount} BTNGG</span></div>
    <div class="equity-row-item"><div class="equity-dot" style="background:#8B6914;"></div><span class="equity-label-text">Asset-Backed Equity</span><span class="equity-value-text" style="color:#8B6914;">${assetBackedEq} BTNGG</span></div>
    <div class="equity-row-item"><div class="equity-dot" style="background:#1A3A6B;"></div><span class="equity-label-text">Liquid Equity</span><span class="equity-value-text" style="color:#1A3A6B;">${liquidEq} BTNGG</span></div>
    <div class="equity-row-item"><div class="equity-dot" style="background:#15803D;"></div><span class="equity-label-text">Loan-Eligible Equity</span><span class="equity-value-text" style="color:#15803D;">$ ${loanEligible}</span></div>
  </div>

  <!-- Ledger & Verification -->
  <div class="section-label">Ledger &amp; Verification</div>
  <div class="verify-block">
    <div class="verify-row"><span class="verify-row-label">Ledger Reference</span><span class="verify-row-val">${cert.cert_id}</span></div>
    <div class="verify-row"><span class="verify-row-label">SHA-256 Document Hash</span></div>
    <div class="fp-block"><div class="fp-label">SHA-256 FINGERPRINT</div><div class="fp-value">${cert.fingerprint}</div></div>
    <div class="verify-row"><span class="verify-row-label">Verification URL</span><span class="verify-row-val link">${verifyUrl}</span></div>
  </div>

  <!-- QR Code + Admin Sig -->
  <div class="qr-verify-row">
    <div class="qr-box">
      <img src="${qrApiUrl}" width="130" height="130" alt="QR Code" />
      <div class="qr-scan-label">SCAN TO VERIFY</div>
    </div>
    <div class="qr-info">
      <div class="qr-info-title">BTNG Sovereign Registry</div>
      <div class="qr-info-sub">verify.bituncoin.io &nbsp;·&nbsp; www.bituncoin.io</div>
      <div style="background:#FFFDF4;border:1px solid #D4A01755;border-left:2.5px solid #D4A017;border-radius:4px;padding:7px 9px;margin-top:6px;">
        <div style="font-size:13px;font-style:italic;color:#8B6914;font-family:Georgia,serif;">John Kojo Zi</div>
        <div style="font-size:7.5px;color:#555;margin-top:2px;">Founder &amp; Lead Architect</div>
        <div style="font-size:7px;color:#888;margin-top:1px;">EKUYE DIGITAL GATEWAY TRUST LTD</div>
      </div>
      <div style="font-size:7px;color:#888;margin-top:5px;line-height:1.5;">Reg. CS099020624 &nbsp;·&nbsp; TIN C0064220206<br>Ghana Companies Act 992 &nbsp;·&nbsp; 24 June 2024</div>
    </div>
  </div>

  <!-- Page footer -->
  <div class="page-footer" style="margin-top:auto;padding-top:10px;">
    <div class="page-footer-left">BTNG Gold Coin &nbsp;·&nbsp; Ghana &amp; Africa &nbsp;·&nbsp; ${new Date().getFullYear()} &nbsp;·&nbsp; Page 1 of 2</div>
    <div class="page-footer-right">ES256 Signed &nbsp;·&nbsp; UBL-1.0 &nbsp;·&nbsp; Sovereign Document System v1.1</div>
  </div>

</div>
<!-- ════════════════════════════════════════════════════ END PAGE 1 ════════ -->


<!-- ════════════════════════════════════════════════════════════ PAGE 2 ════ -->
<div class="page page-2">

  <div class="p2-header">
    <div>
      <div class="p2-header-title">AUTHORIZATION &amp; LEGAL</div>
      <div class="p2-header-sub">BTNG Sovereign Import/Export Proof of Value</div>
      <div class="p2-header-id">${cert.cert_id}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:8px;color:#D4A017;">Page 2 of 2</div>
      <div style="font-size:7px;color:#8B6914;margin-top:2px;">EKUYE DIGITAL GATEWAY TRUST LTD</div>
    </div>
  </div>

  <div class="accent-bar"></div>

  <!-- Admin Signature -->
  <div class="section-label">Admin Authorization &amp; Signature</div>
  <div class="sig-section">
    <div class="sig-section-title">Authorized Signatory — Founder &amp; Lead Architect</div>
    <div class="sig-row">
      <div class="sig-box">
        <div class="sig-name-stylized">John Kojo Zi</div>
        <div class="sig-name-print">JOHN KOJO ZI</div>
        <div class="sig-role">Founder &amp; Lead Architect</div>
        <div class="sig-org">EKUYE DIGITAL GATEWAY TRUST LTD</div>
        <div class="sig-org" style="margin-top:3px;">Ghana &nbsp;·&nbsp; West Africa</div>
      </div>
      <div class="sig-date-box">
        <div class="sig-date-label">Date Authorized</div>
        <div class="sig-date-val">${new Date(cert.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <div style="margin-top:12px;">
          <div style="width:100px;height:1px;background:#C4900F;margin-bottom:2px;"></div>
          <div style="font-size:6.5px;color:#aaa;letter-spacing:0.8px;">AUTHORIZED SIGNATURE</div>
        </div>
      </div>
    </div>
  </div>

  <!-- BTNG SOVEREIGN VERIFIED SEALED -->  
  <div class="section-label">System Seal</div>
  <div class="seal-section">
    <div class="seal-ring-outer"><div class="seal-ring-inner">&#127885;</div></div>
    <div class="seal-text-center">
      <div class="seal-verified-text">BTNG SOVEREIGN</div>
      <div class="seal-verified-text">VERIFIED SEALED</div>
      <div class="seal-divider"></div>
      <div class="seal-admin-name">John Kojo Zi</div>
      <div class="seal-admin-role">Founder &amp; Lead Architect</div>
      <div class="seal-legal-ref">EKUYE DIGITAL GATEWAY TRUST LTD<br>Reg. CS099020624 &nbsp;·&nbsp; TIN C0064220206<br>Ghana Companies Act 992 &nbsp;·&nbsp; 24 June 2024</div>
    </div>
    <div class="seal-ring-outer"><div class="seal-ring-inner">&#127885;</div></div>
  </div>

  <!-- Legal Notice -->
  <div class="section-label">Legal Notice</div>
  <div class="legal-box">
    <div class="legal-header">&#9878;&nbsp; Official Legal Declaration</div>
    <div class="legal-text">
      <strong>EKUYE DIGITAL GATEWAY TRUST LTD</strong> is incorporated under the <strong>Ghana Companies Act 992</strong>, registered on <strong>24 June 2024</strong>, with Registration Number <strong>CS099020624</strong> and TIN <strong>C0064220206</strong>.
      <br><br>
      This document constitutes a <strong>Sovereign Financial Instrument</strong> issued under the BTNG Gold Coin Blockchain System. It serves as an official Proof of Value and Equity Security Backup Deposit for import/export and cross-border correspondence purposes under BTNG Sovereign Banking Policy.
      <br><br>
      The stated equity balance and gold-backed deposit are fully collateralized and have been verified through the BTNG Sovereign Ledger. This instrument is eligible for use in trade settlement, cross-border correspondence, loan applications, and financial institution submissions.
      <br><br>
      <strong>Any alteration, unauthorized reproduction, or fraudulent use of this document constitutes a criminal offence under applicable Ghanaian law and international financial regulations.</strong> Verification of authenticity must be performed through the official Bituncoin Sovereign Registry at <strong>verify.bituncoin.io</strong> | <strong>www.bituncoin.io</strong> | Contact: <strong>info@bituncoin.io</strong>
    </div>
    <div class="legal-reg-row">EKUYE DIGITAL GATEWAY TRUST LTD &nbsp;·&nbsp; CS099020624 &nbsp;·&nbsp; C0064220206 &nbsp;·&nbsp; Ghana Companies Act 992 &nbsp;·&nbsp; 24 June 2024</div>
  </div>

  <!-- Document Integrity Footer -->
  <div class="section-label">Document Integrity</div>
  <div class="doc-integrity">
    <div class="integrity-title">Cryptographic Verification Hashes &amp; References</div>
    <div class="integrity-grid">
      <div class="integrity-cell">
        <div class="integrity-label">SHA-256 Document Hash</div>
        <div class="integrity-val">${cert.fingerprint}</div>
      </div>
      <div class="integrity-cell">
        <div class="integrity-label">Ledger Reference</div>
        <div class="integrity-val">${cert.cert_id}</div>
      </div>
      <div class="integrity-cell" style="margin-top:5px;">
        <div class="integrity-label">Reserve Policy Code</div>
        <div class="integrity-val">${reservePolicy}</div>
      </div>
      <div class="integrity-cell" style="margin-top:5px;">
        <div class="integrity-label">Admin Reference</div>
        <div class="integrity-val">${adminRef}</div>
      </div>
      <div class="integrity-cell" style="margin-top:5px;grid-column:span 2;">
        <div class="integrity-label">Verification URL</div>
        <div class="integrity-val link">${verifyUrl}</div>
      </div>
    </div>
  </div>

  <!-- Final page footer -->
  <div class="page-footer">
    <div class="page-footer-left">BTNG Gold Coin Sovereign Document System v1.1 &nbsp;·&nbsp; ES256 Signed &nbsp;·&nbsp; QR Verified &nbsp;·&nbsp; Page 2 of 2</div>
    <div class="page-footer-right">${new Date().getFullYear()} EKUYE DIGITAL GATEWAY TRUST LTD &nbsp;·&nbsp; Ghana</div>
  </div>

</div>
<!-- ════════════════════════════════════════════════════ END PAGE 2 ════════ -->

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
function ImportExportCertCard({
  cert,
  onShare,
  onDelete,
  sharing,
}: {
  cert: BTNGCertificate;
  onShare: (cert: BTNGCertificate) => void;
  onDelete: (cert: BTNGCertificate) => void;
  sharing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const { showAlert } = useAlert();
  const meta = CERT_TYPES.find(t => t.type === 'import_export') ?? CERT_TYPES[0];
  const grade = GRADE_META[cert.equity_grade] ?? GRADE_META['D'];
  const md = cert.metadata ?? {};

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const html = buildSovereignPdfHtml(cert);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const pdfName = `BTNG-IEGW-${cert.cert_id}.pdf`;
      const destPath = `${FileSystem.cacheDirectory}${pdfName}`;
      await FileSystem.copyAsync({ from: uri, to: destPath });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(destPath, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: `BTNG Sovereign Document — ${cert.cert_id}`,
        });
      } else {
        showAlert('PDF Generated', `Saved as ${pdfName}. Sharing is not available on this device.`);
      }
    } catch (err) {
      showAlert('Export Failed', 'Could not generate the sovereign PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };
  const verifyUrl = `https://verify.bituncoin.io/${cert.cert_id}?fp=${cert.fingerprint.slice(0, 16)}`;

  const btngId         = md.btng_id                  ?? cert.cert_id;
  const walletAddr     = md.wallet_address            ?? '0x0000…';
  const importExportId = md.import_export_account_id  ?? `IEGW-${cert.cert_id}`;
  const txHash         = md.on_chain_tx_hash          ?? cert.fingerprint;
  const btnggAmount    = md.btngg_amount              ?? cert.asset_value;
  const goldOzTroy     = md.gold_oz_troy              ?? 0;
  const usdValue       = md.usd_value                 ?? cert.asset_value * 1.175;
  const ghsBacked      = md.gold_backed_ghs           ?? 0;
  const adminRef       = md.admin_reference           ?? `ADM-${cert.cert_id.slice(-8)}`;
  const reservePolicy  = md.reserve_policy_code       ?? 'BTNG-RSV-POL-001';

  return (
    <View style={[iev.card, { borderColor: meta.color + '66' }]}>
      <LinearGradient
        colors={[meta.color, '#A07810', meta.color + '22']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={iev.accentBar}
      />

      {/* Header */}
      <TouchableOpacity style={iev.header} onPress={() => setExpanded(v => !v)} activeOpacity={0.85}>
        <View style={[iev.iconWrap, { backgroundColor: meta.color + '18', borderColor: meta.color + '55' }]}>
          <Text style={iev.emoji}>{meta.emoji}</Text>
        </View>
        <View style={iev.headerText}>
          <View style={iev.titleRow}>
            <Text style={[iev.certTypeLabel, { color: meta.color }]}>IMPORT / EXPORT</Text>
            <View style={[iev.sovBadge, { backgroundColor: meta.color + '18', borderColor: meta.color + '44' }]}>
              <MaterialIcons name="verified" size={9} color={meta.color} />
              <Text style={[iev.sovBadgeText, { color: meta.color }]}>PROOF OF VALUE</Text>
            </View>
          </View>
          <Text style={iev.certId} numberOfLines={1}>{cert.cert_id}</Text>
        </View>
        <View style={[iev.gradePill, { backgroundColor: grade.bg, borderColor: grade.color + '66' }]}>
          <Text style={[iev.gradeText, { color: grade.color }]}>{cert.equity_grade}</Text>
        </View>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      {/* Summary strip */}
      <View style={iev.summaryStrip}>
        <View style={iev.stripCell}>
          <Text style={iev.stripVal} numberOfLines={1}>{btnggAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} BTNGG</Text>
          <Text style={iev.stripLbl}>Deposit</Text>
        </View>
        <View style={iev.stripDivider} />
        <View style={iev.stripCell}>
          <Text style={[iev.stripVal, { color: meta.color }]}>${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={iev.stripLbl}>USD Value</Text>
        </View>
        <View style={iev.stripDivider} />
        <View style={iev.stripCell}>
          <Text style={iev.stripVal}>{goldOzTroy.toFixed(4)} oz</Text>
          <Text style={iev.stripLbl}>Troy Gold</Text>
        </View>
        <View style={iev.stripDivider} />
        <View style={iev.stripCell}>
          <View style={iev.statusDotRow}>
            <View style={[iev.statusDot, { backgroundColor: cert.status === 'active' ? Colors.success : Colors.error }]} />
            <Text style={[iev.stripVal, { color: cert.status === 'active' ? Colors.success : Colors.error, fontSize: 9 }]}>
              {cert.status.toUpperCase()}
            </Text>
          </View>
          <Text style={iev.stripLbl}>Status</Text>
        </View>
      </View>

      {expanded && (
        <View style={iev.body}>

          {/* Document Information */}
          <View style={iev.sectionHeader}>
            <MaterialIcons name="article" size={12} color={meta.color} />
            <Text style={[iev.sectionTitle, { color: meta.color }]}>DOCUMENT INFORMATION</Text>
          </View>
          <View style={iev.infoGrid}>
            <View style={iev.infoCell}>
              <Text style={iev.infoLabel}>UNIQUE DOCUMENT ID</Text>
              <Text style={iev.infoMono} numberOfLines={1}>{cert.cert_id}</Text>
            </View>
            <View style={iev.infoCell}>
              <Text style={iev.infoLabel}>UTC TIMESTAMP</Text>
              <Text style={iev.infoValue}>{new Date(cert.created_at).toUTCString().slice(0, 25)}</Text>
            </View>
            <View style={iev.infoCell}>
              <Text style={iev.infoLabel}>ADMIN REFERENCE</Text>
              <Text style={iev.infoMono}>{adminRef}</Text>
            </View>
            <View style={iev.infoCell}>
              <Text style={iev.infoLabel}>RESERVE POLICY CODE</Text>
              <Text style={iev.infoMono}>{reservePolicy}</Text>
            </View>
          </View>

          {/* Holder Information */}
          <View style={[iev.sectionHeader, { marginTop: Spacing.sm }]}>
            <MaterialIcons name="badge" size={12} color={Colors.info} />
            <Text style={[iev.sectionTitle, { color: Colors.info }]}>HOLDER INFORMATION</Text>
          </View>
          <View style={iev.holderCard}>
            <View style={iev.holderRow}>
              <View style={iev.holderAvatar}>
                <Text style={iev.holderAvatarText}>👤</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={iev.holderName}>{cert.owner_name}</Text>
                <Text style={iev.holderRole}>Official Officer & Trustee</Text>
                <Text style={iev.holderOrg}>EKUYE DIGITAL GATEWAY TRUST LTD · Ghana</Text>
              </View>
            </View>
          </View>

          {/* Wallet & Account Details */}
          <View style={[iev.sectionHeader, { marginTop: Spacing.sm }]}>
            <MaterialIcons name="account-balance-wallet" size={12} color="#8B5CF6" />
            <Text style={[iev.sectionTitle, { color: '#8B5CF6' }]}>WALLET & ACCOUNT DETAILS</Text>
          </View>
          <View style={iev.detailBlock}>
            <View style={iev.detailRow}>
              <Text style={iev.detailLabel}>BTNG ID</Text>
              <Text style={iev.detailMono} numberOfLines={1}>{btngId}</Text>
            </View>
            <View style={iev.detailRow}>
              <Text style={iev.detailLabel}>WALLET ADDRESS</Text>
              <Text style={iev.detailMono} numberOfLines={1}>{walletAddr}</Text>
            </View>
            <View style={iev.detailRow}>
              <Text style={iev.detailLabel}>IMPORT / EXPORT ACCOUNT ID</Text>
              <Text style={iev.detailMono} numberOfLines={1}>{importExportId}</Text>
            </View>
            <View style={[iev.detailRow, { borderBottomWidth: 0 }]}>
              <Text style={iev.detailLabel}>ON-CHAIN TX HASH</Text>
              <Text style={iev.detailMono} numberOfLines={1}>{txHash.slice(0, 28)}…</Text>
            </View>
          </View>

          {/* BTNG Gold Coin Deposit */}
          <View style={[iev.sectionHeader, { marginTop: Spacing.sm }]}>
            <MaterialIcons name="account-balance" size={12} color={meta.color} />
            <Text style={[iev.sectionTitle, { color: meta.color }]}>BTNG GOLD COIN DEPOSIT</Text>
          </View>
          <View style={iev.goldBox}>
            <View style={iev.goldBoxRow}>
              <View style={iev.goldCoin}>
                <Text style={{ fontSize: 26 }}>🏅</Text>
              </View>
              <View style={iev.goldGrid}>
                <View style={iev.goldRow}>
                  <View style={iev.goldCell}>
                    <Text style={iev.goldLabel}>BTNGG AMOUNT</Text>
                    <Text style={iev.goldValue}>{btnggAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })} BTNGG</Text>
                  </View>
                  <View style={iev.goldCell}>
                    <Text style={iev.goldLabel}>TROY OZ GOLD</Text>
                    <Text style={iev.goldValue}>{goldOzTroy.toFixed(4)} oz</Text>
                  </View>
                </View>
                <View style={iev.goldRow}>
                  <View style={iev.goldCell}>
                    <Text style={iev.goldLabel}>USD VALUE</Text>
                    <Text style={[iev.goldValue, { color: meta.color }]}>${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={iev.goldCell}>
                    <Text style={iev.goldLabel}>GHS BACKED</Text>
                    <Text style={iev.goldValue}>GHS {ghsBacked.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Equity Security Backup */}
          <View style={[iev.sectionHeader, { marginTop: Spacing.sm }]}>
            <MaterialIcons name="security" size={12} color={Colors.success} />
            <Text style={[iev.sectionTitle, { color: Colors.success }]}>EQUITY SECURITY BACKUP</Text>
            <View style={iev.securedBadge}>
              <MaterialIcons name="check-circle" size={9} color={Colors.success} />
              <Text style={iev.securedText}>SECURED — ACTIVE</Text>
            </View>
          </View>
          <View style={iev.equityBackupBox}>
            <Text style={iev.equityBackupText}>
              This Import/Export Proof of Value document certifies that the stated BTNG Gold Coin deposit is fully collateralized and equity-backed. The deposit is eligible for trade settlement, cross-border correspondence, and loan instruments under BTNG Sovereign Banking Policy. Collateralization covers 100% of the deposit value. EKUYE DIGITAL GATEWAY TRUST LTD acts as Official Officer and Trustee under Ghana Companies Act 992, Reg. CS099020624, TIN C0064220206, incorporated 24 June 2024.
            </Text>
          </View>

          {/* Equity Grade */}
          <GradeBadge grade={cert.equity_grade} />

          {/* Ledger & Verification */}
          <View style={[iev.sectionHeader, { marginTop: Spacing.sm }]}>
            <MaterialIcons name="verified-user" size={12} color={Colors.info} />
            <Text style={[iev.sectionTitle, { color: Colors.info }]}>LEDGER & VERIFICATION</Text>
          </View>
          <View style={iev.verifyBlock}>
            <View style={iev.verifyRow}>
              <Text style={iev.verifyLabel}>LEDGER REFERENCE</Text>
              <Text style={iev.verifyMono} numberOfLines={1}>{cert.cert_id}</Text>
            </View>
            <View style={iev.verifyRow}>
              <Text style={iev.verifyLabel}>ISSUED / EXPIRES</Text>
              <Text style={iev.verifyValue}>{cert.issued_at} → {cert.expires_at ?? 'No Expiry'}</Text>
            </View>
            <View style={iev.verifyHashBlock}>
              <View style={iev.verifyHashHeader}>
                <MaterialIcons name="fingerprint" size={11} color={Colors.textMuted} />
                <Text style={iev.verifyLabel}>SHA-256 DOCUMENT HASH</Text>
              </View>
              <Text style={iev.verifyHashVal}>{cert.fingerprint}</Text>
            </View>
            <View style={iev.verifyRow}>
              <Text style={iev.verifyLabel}>VERIFICATION URL</Text>
              <Text style={[iev.verifyMono, { color: Colors.info }]} numberOfLines={1}>{verifyUrl}</Text>
            </View>
            {/* QR Code + Admin Signature */}
            <View style={iev.qrRow}>
              <View style={iev.qrBox}>
                <QRCode value={verifyUrl} size={88} color={meta.color} backgroundColor={Colors.bgCard} />
                <Text style={[iev.qrLabel, { color: meta.color }]}>SCAN TO VERIFY</Text>
              </View>
              <View style={iev.qrInfo}>
                <Text style={iev.qrTitle}>BTNG Sovereign Registry</Text>
                <Text style={iev.qrSub}>verify.bituncoin.io</Text>
                <View style={iev.sigBox}>
                  <Text style={iev.sigName}>John Kojo Zi</Text>
                  <Text style={iev.sigRole}>Founder & Lead Architect</Text>
                  <Text style={iev.sigOrg}>EKUYE DIGITAL GATEWAY TRUST LTD</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Legal Notice */}
          <View style={iev.legalBox}>
            <View style={iev.legalHeader}>
              <MaterialIcons name="gavel" size={12} color={Colors.textMuted} />
              <Text style={iev.legalHeaderText}>LEGAL NOTICE</Text>
            </View>
            <Text style={iev.legalText}>
              {"EKUYE DIGITAL GATEWAY TRUST LTD · Reg. CS099020624 · TIN C0064220206\nIncorporated under Ghana Companies Act 992 · 24 June 2024\n\nThis document is a sovereign financial instrument issued under the BTNG Gold Coin Blockchain System. It constitutes a Proof of Value and Equity Security Backup Deposit for import/export and cross-border correspondence purposes. Any alteration, reproduction, or misuse of this document is a violation of applicable Ghanaian and international laws."}
            </Text>
            <View style={iev.legalFooter}>
              <MaterialIcons name="verified-user" size={10} color={meta.color} />
              <Text style={[iev.legalFooterText, { color: meta.color }]}>BTNG Sovereign Document System v1.1 · UBL-1.0 · ES256 Signed</Text>
            </View>
          </View>

          {/* Renewal lineage */}
          {cert.renewed_from_cert_id ? (
            <View style={cc.lineageRow}>
              <MaterialIcons name="link" size={13} color="#F59E0B" />
              <Text style={cc.lineageLabel}>Renewed from</Text>
              <Text style={cc.lineageCertId} numberOfLines={1}>{cert.renewed_from_cert_id}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={{ gap: Spacing.sm }}>
            {/* Row 1: Share as Image + Export PDF */}
            <View style={cc.actionRow}>
              <TouchableOpacity
                style={[
                  cc.actionBtn,
                  { backgroundColor: meta.color + '18', borderColor: meta.color + '44' },
                  sharing && { opacity: 0.6 },
                ]}
                onPress={() => onShare(cert)}
                activeOpacity={0.8}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color={meta.color} />
                ) : (
                  <>
                    <MaterialIcons name="image" size={15} color={meta.color} />
                    <Text style={[cc.actionBtnText, { color: meta.color }]}>Share Image</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  cc.actionBtn,
                  { backgroundColor: '#1A3A6B22', borderColor: '#1A3A6B55' },
                  exportingPdf && { opacity: 0.6 },
                ]}
                onPress={handleExportPdf}
                activeOpacity={0.8}
                disabled={exportingPdf}
              >
                {exportingPdf ? (
                  <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                  <>
                    <MaterialIcons name="picture-as-pdf" size={15} color="#3B82F6" />
                    <Text style={[cc.actionBtnText, { color: '#3B82F6' }]}>Export PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            {/* Row 2: Delete */}
            <TouchableOpacity style={[cc.deleteBtn, { flex: 0, width: '100%', justifyContent: 'center' }]} onPress={() => onDelete(cert)} activeOpacity={0.8}>
              <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
              <Text style={cc.deleteBtnText}>Delete Certificate</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const iev = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 2,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
  accentBar: { height: 3, width: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    padding: Spacing.md,
    paddingBottom: Spacing.sm + 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    flexShrink: 0,
  },
  emoji: { fontSize: 24 },
  headerText: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  certTypeLabel: {
    fontSize: 12,
    fontWeight: FontWeight.heavy,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  sovBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  sovBadgeText: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  certId: {
    fontSize: 9,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  gradePill: {
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
  },
  gradeText: { fontSize: 12, fontWeight: FontWeight.heavy, includeFontPadding: false },
  summaryStrip: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  stripCell: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm + 2, gap: 3, paddingHorizontal: 2 },
  stripDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 6 },
  stripVal: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    includeFontPadding: false,
    textAlign: 'center',
  },
  stripLbl: {
    fontSize: 7,
    color: Colors.textMuted,
    includeFontPadding: false,
    textAlign: 'center',
  },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  body: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm + 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    letterSpacing: 1,
    includeFontPadding: false,
    flex: 1,
  },
  securedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  securedText: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.success,
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  infoCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  infoLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  infoValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  infoMono: {
    fontSize: 9,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  holderCard: {
    backgroundColor: 'rgba(59,130,246,0.07)',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.info + '44',
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
    padding: Spacing.md,
  },
  holderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  holderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1.5,
    borderColor: Colors.info + '55',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  holderAvatarText: { fontSize: 22 },
  holderName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  holderRole: {
    fontSize: FontSize.xs,
    color: Colors.info,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },
  holderOrg: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  detailBlock: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  detailRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 3,
  },
  detailLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  detailMono: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  goldBox: {
    backgroundColor: Colors.warningBg,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    padding: Spacing.md,
  },
  goldBoxRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  goldCoin: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.warningBg,
    borderWidth: 2,
    borderColor: Colors.primary + '88',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  goldGrid: { flex: 1, gap: Spacing.sm },
  goldRow: { flexDirection: 'row', gap: Spacing.sm },
  goldCell: { flex: 1, gap: 2 },
  goldLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.primary + 'BB',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  goldValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    includeFontPadding: false,
  },
  equityBackupBox: {
    backgroundColor: 'rgba(34,197,94,0.07)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
    padding: Spacing.md,
  },
  equityBackupText: {
    fontSize: 9,
    color: 'rgba(34,197,94,0.9)',
    lineHeight: 14,
    includeFontPadding: false,
  },
  verifyBlock: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  verifyRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 3,
  },
  verifyLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  verifyValue: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  verifyMono: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  verifyHashBlock: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 5,
  },
  verifyHashHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  verifyHashVal: {
    fontSize: 8,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 13,
    includeFontPadding: false,
  },
  qrRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
  },
  qrBox: { alignItems: 'center', gap: 5, flexShrink: 0 },
  qrLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  qrInfo: { flex: 1, gap: 5 },
  qrTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  qrSub: { fontSize: 9, color: Colors.info, includeFontPadding: false },
  sigBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
    padding: Spacing.sm,
    gap: 2,
    marginTop: 4,
  },
  sigName: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    fontStyle: 'italic',
    includeFontPadding: false,
  },
  sigRole: { fontSize: 8, color: Colors.textSecondary, includeFontPadding: false },
  sigOrg: { fontSize: 8, color: Colors.textMuted, includeFontPadding: false },
  legalBox: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  legalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  legalHeaderText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  legalText: {
    fontSize: 9,
    color: Colors.textMuted,
    lineHeight: 14,
    includeFontPadding: false,
    padding: Spacing.md,
  },
  legalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  legalFooterText: {
    fontSize: 8,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Certificate Image Card — captured by ViewShot for PNG sharing
// ─────────────────────────────────────────────────────────────────────────────
const CARD_WIDTH = 360;

function CertificateImageCard({ cert }: { cert: BTNGCertificate }) {
  const meta       = CERT_TYPES.find(t => t.type === cert.cert_type) ?? CERT_TYPES[0];
  const grade      = GRADE_META[cert.equity_grade] ?? GRADE_META['D'];
  const verifyUrl  = `https://verify.bituncoin.io/doc/${cert.cert_id}?fp=${cert.fingerprint.slice(0, 16)}`;

  return (
    <View style={img.card}>
      {/* Gold outer border frame */}
      <View style={img.goldFrame}>

        {/* Gradient Header */}
        <LinearGradient
          colors={['#1A1200', '#0E0E14', meta.color + '33']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={img.header}
        >
          {/* Top branding row */}
          <View style={img.brandRow}>
            <View style={img.goldCoinBadge}>
              <Text style={img.goldCoinText}>🏅</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={img.brandTitle}>BTNG GOLD COIN</Text>
              <Text style={img.brandSub}>SOVEREIGN CERTIFICATE OF OWNERSHIP</Text>
            </View>
            <View style={[img.ubBadge, { borderColor: Colors.primary + '88' }]}>
              <Text style={img.ubBadgeText}>UBL-1.0</Text>
            </View>
          </View>

          {/* Cert type section */}
          <View style={img.certTypeRow}>
            <View style={[img.certTypeIcon, { backgroundColor: meta.color + '22', borderColor: meta.color + '66' }]}>
              <Text style={img.certTypeEmoji}>{meta.emoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[img.certTypeLabel, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
              <Text style={img.certIdText}>{cert.cert_id}</Text>
            </View>
            <View style={[img.gradeBadgeLarge, { backgroundColor: grade.bg, borderColor: grade.color + '88' }]}>
              <Text style={[img.gradeBadgeGrade, { color: grade.color }]}>{cert.equity_grade}</Text>
              <Text style={[img.gradeBadgeLabel, { color: grade.color + 'BB' }]}>GRADE</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Certificate body */}
        <View style={img.body}>

          {/* Owner & Value row */}
          <View style={img.infoGrid}>
            <View style={[img.infoCell, { borderColor: meta.color + '33' }]}>
              <Text style={img.infoCellLabel}>REGISTERED OWNER</Text>
              <Text style={img.infoCellValue} numberOfLines={1}>{cert.owner_name}</Text>
            </View>
            <View style={[img.infoCell, { borderColor: Colors.primary + '33' }]}>
              <Text style={img.infoCellLabel}>APPRAISED VALUE</Text>
              <Text style={[img.infoCellValue, { color: Colors.primary }]}>
                ${cert.asset_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={[img.infoCell, { borderColor: Colors.border }]}>
              <Text style={img.infoCellLabel}>DATE ISSUED</Text>
              <Text style={img.infoCellValue}>{cert.issued_at}</Text>
            </View>
            <View style={[img.infoCell, { borderColor: Colors.border }]}>
              <Text style={img.infoCellLabel}>EXPIRES</Text>
              <Text style={img.infoCellValue}>{cert.expires_at ?? 'No Expiry'}</Text>
            </View>
          </View>

          {/* Asset description */}
          {cert.asset_description ? (
            <View style={img.descRow}>
              <Text style={img.descLabel}>ASSET DESCRIPTION</Text>
              <Text style={img.descText} numberOfLines={2}>{cert.asset_description}</Text>
            </View>
          ) : null}

          {/* Equity grade row */}
          <View style={[img.equityRow, { backgroundColor: grade.bg, borderColor: grade.color + '55' }]}>
            <View style={[img.equityDot, { backgroundColor: grade.color }]} />
            <Text style={[img.equityGrade, { color: grade.color }]}>Grade {cert.equity_grade}</Text>
            <Text style={[img.equityLabel, { color: grade.color + 'BB' }]}>{grade.label}</Text>
          </View>

          {/* QR + Fingerprint block */}
          <View style={img.qrBlock}>
            <View style={img.qrContainer}>
              <View style={[img.qrBox, { borderColor: meta.color + '55' }]}>
                <QRCode
                  value={verifyUrl}
                  size={88}
                  color={meta.color}
                  backgroundColor='#0E0E14'
                />
              </View>
              <Text style={[img.qrLabel, { color: meta.color }]}>SCAN TO VERIFY</Text>
            </View>
            <View style={img.qrInfo}>
              <Text style={img.qrInfoTitle}>Verification URL</Text>
              <Text style={img.qrInfoUrl} numberOfLines={3}>{verifyUrl}</Text>
              <View style={img.fpRow}>
                <MaterialIcons name="fingerprint" size={11} color={Colors.textMuted} />
                <Text style={img.fpLabel}>SHA-256</Text>
              </View>
              <Text style={img.fpValue} numberOfLines={2}>{cert.fingerprint.slice(0, 40)}…</Text>
              <View style={img.statusRow}>
                <View style={[img.statusDot, { backgroundColor: cert.status === 'active' ? Colors.success : Colors.error }]} />
                <Text style={[img.statusText, { color: cert.status === 'active' ? Colors.success : Colors.error }]}>
                  {cert.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Gold footer */}
        <LinearGradient
          colors={['#1A1200', '#0A0A10']}
          style={img.footer}
        >
          {/* Decorative gold line */}
          <View style={img.goldLine} />

          {/* Import/Export: BTNG SOVEREIGN VERIFIED SEALED badge */}
          {cert.cert_type === 'import_export' && (
            <View style={img.sealBlock}>
              <View style={img.sealRingOuter}>
                <View style={img.sealRingInner}>
                  <Text style={img.sealEmoji}>{'\uD83C\uDFF5'}</Text>
                </View>
              </View>
              <View style={img.sealTextBlock}>
                <Text style={img.sealVerifiedText}>BTNG SOVEREIGN VERIFIED SEALED</Text>
                <View style={img.sealDividerLine} />
                <Text style={img.sealAdminName}>John Kojo Zi</Text>
                <Text style={img.sealAdminRole}>Founder & Lead Architect</Text>
                <Text style={img.sealLegalRef}>EKUYE DIGITAL GATEWAY TRUST LTD</Text>
                <Text style={img.sealLegalRef}>Reg. CS099020624 · TIN C0064220206</Text>
                <Text style={img.sealLegalRef}>Ghana Companies Act 992 · 24 June 2024</Text>
              </View>
              <View style={img.sealRingOuter}>
                <View style={img.sealRingInner}>
                  <Text style={img.sealEmoji}>{'\uD83C\uDFF5'}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={img.footerContent}>
            <Text style={img.footerLeft}>Bituncoin (BTNG) · Ghana & Africa · {new Date().getFullYear()}</Text>
            <View style={img.footerRight}>
              <MaterialIcons name="verified-user" size={10} color={Colors.primary} />
              <Text style={img.footerRightText}>ES256 Signed</Text>
            </View>
          </View>
          <Text style={img.footerUrl}>verify.bituncoin.io · www.bituncoin.io · info@bituncoin.io</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

const img = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#060608',
  },
  goldFrame: {
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    padding: Spacing.md + 2,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '33',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
  },
  goldCoinBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.warningBg,
    borderWidth: 2,
    borderColor: Colors.primary + '88',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldCoinText: { fontSize: 22 },
  brandTitle: {
    fontSize: 13,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 1.5,
    includeFontPadding: false,
  },
  brandSub: {
    fontSize: 8,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  ubBadge: {
    borderRadius: Radius.sm,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: Colors.primaryGlow,
  },
  ubBadgeText: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  certTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  certTypeIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  certTypeEmoji: { fontSize: 22 },
  certTypeLabel: {
    fontSize: 12,
    fontWeight: FontWeight.heavy,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  certIdText: {
    fontSize: 9,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  gradeBadgeLarge: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    gap: 1,
  },
  gradeBadgeGrade: {
    fontSize: 22,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
  },
  gradeBadgeLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  body: {
    backgroundColor: '#0E0E14',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  infoCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    gap: 3,
  },
  infoCellLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  infoCellValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  descRow: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  descLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  descText: {
    fontSize: 10,
    color: Colors.textSecondary,
    lineHeight: 15,
    includeFontPadding: false,
  },
  equityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
  },
  equityDot: { width: 8, height: 8, borderRadius: 4 },
  equityGrade: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
  },
  equityLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },
  qrBlock: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  qrContainer: {
    alignItems: 'center',
    gap: 6,
  },
  qrBox: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#0E0E14',
    borderWidth: 1.5,
  },
  qrLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  qrInfo: {
    flex: 1,
    gap: 5,
  },
  qrInfoTitle: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  qrInfoUrl: {
    fontSize: 8,
    color: Colors.textSecondary,
    lineHeight: 12,
    includeFontPadding: false,
  },
  fpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  fpLabel: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  fpValue: {
    fontSize: 7.5,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 12,
    includeFontPadding: false,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.primary + '44',
  },
  goldLine: {
    height: 1,
    backgroundColor: Colors.primary,
    opacity: 0.6,
    marginBottom: 4,
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: {
    fontSize: 8,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  footerRightText: {
    fontSize: 8,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
  },
  footerUrl: {
    fontSize: 7,
    color: Colors.textMuted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  // ── Import/Export Sovereign Seal ──────────────────────────────────────────
  sealBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: 'rgba(212,160,23,0.09)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    marginHorizontal: 2,
  },
  sealRingOuter: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: 'rgba(212,160,23,0.12)',
  },
  sealRingInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary + '77',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  sealEmoji: {
    fontSize: 14,
  },
  sealTextBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  sealVerifiedText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.7,
    textAlign: 'center',
    includeFontPadding: false,
  },
  sealDividerLine: {
    width: '80%',
    height: 1,
    backgroundColor: Colors.primary + '55',
    marginVertical: 2,
  },
  sealAdminName: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    fontStyle: 'italic',
    textAlign: 'center',
    includeFontPadding: false,
  },
  sealAdminRole: {
    fontSize: 7,
    color: Colors.primary + 'BB',
    textAlign: 'center',
    includeFontPadding: false,
  },
  sealLegalRef: {
    fontSize: 6.5,
    color: Colors.textMuted,
    textAlign: 'center',
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Lineage chain builder — returns ordered array from Gen 1 (root) → Gen N (cert)
// ─────────────────────────────────────────────────────────────────────────────
interface ChainNode {
  cert_id: string;
  cert_type: CertType | null;
  inLedger: boolean;
  isCurrent: boolean;
  generation: number;
}

function buildLineageChain(cert: BTNGCertificate, allCerts: BTNGCertificate[]): ChainNode[] {
  const ancestors: Array<{ cert_id: string; cert_type: CertType | null; inLedger: boolean }> = [];
  let current: BTNGCertificate = cert;
  const visited = new Set<string>();

  while (current.renewed_from_cert_id && !visited.has(current.cert_id)) {
    visited.add(current.cert_id);
    const parent = allCerts.find(c => c.cert_id === current.renewed_from_cert_id);
    if (parent) {
      ancestors.unshift({ cert_id: parent.cert_id, cert_type: parent.cert_type, inLedger: true });
      current = parent;
    } else {
      ancestors.unshift({ cert_id: current.renewed_from_cert_id, cert_type: null, inLedger: false });
      break;
    }
  }

  return [
    ...ancestors.map((a, i) => ({ ...a, isCurrent: false, generation: i + 1 })),
    { cert_id: cert.cert_id, cert_type: cert.cert_type, inLedger: true, isCurrent: true, generation: ancestors.length + 1 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Lineage depth helper — walks renewed_from_cert_id chain upward
// Gen 1 = original (no ancestor), Gen 2 = 1 renewal, Gen 3 = 2 renewals, etc.
// ─────────────────────────────────────────────────────────────────────────────
function computeLineageDepth(cert: BTNGCertificate, allCerts: BTNGCertificate[]): number {
  let depth = 1;
  let current: BTNGCertificate = cert;
  const visited = new Set<string>();
  while (current.renewed_from_cert_id && !visited.has(current.cert_id)) {
    visited.add(current.cert_id);
    const parent = allCerts.find(c => c.cert_id === current.renewed_from_cert_id);
    if (!parent) {
      // Ancestor exists but is not in collection — still counts as +1
      depth += 1;
      break;
    }
    depth += 1;
    current = parent;
  }
  return depth;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lineage Tree Card — visual renewal chain with ancestor node + arrow connector
// ─────────────────────────────────────────────────────────────────────────────
function LineageTreeCard({
  cert,
  allCerts,
  onShare,
  onDelete,
  sharing,
  highlighted,
  onHighlightAncestor,
}: {
  cert: BTNGCertificate;
  allCerts: BTNGCertificate[];
  onShare: (cert: BTNGCertificate) => void;
  onDelete: (cert: BTNGCertificate) => void;
  sharing: boolean;
  highlighted: boolean;
  onHighlightAncestor: (certId: string) => void;
}) {
  const ancestorCert = allCerts.find(c => c.cert_id === cert.renewed_from_cert_id);
  const ancestorMeta = ancestorCert
    ? CERT_TYPES.find(t => t.type === ancestorCert.cert_type) ?? CERT_TYPES[0]
    : null;
  const meta = CERT_TYPES.find(t => t.type === cert.cert_type) ?? CERT_TYPES[0];
  const depth = computeLineageDepth(cert, allCerts);
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const [chainTooltipVisible, setChainTooltipVisible] = useState(false);
  const chainNodes = chainTooltipVisible ? buildLineageChain(cert, allCerts) : [];

  useEffect(() => {
    if (highlighted) {
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.delay(1800),
        Animated.timing(highlightAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
      ]).start();
    }
  }, [highlighted]);

  const highlightBorder = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2.5],
  });

  return (
    <View style={lt.wrapper}>
      {/* ── Ancestor Node ── */}
      <View style={lt.ancestorRow}>
        {/* Depth indicator line */}
        <View style={lt.depthLine} />
        <View style={lt.ancestorContent}>
          {ancestorCert ? (
            // Found the original cert in this user's collection
            <TouchableOpacity
              style={[lt.ancestorFound, { borderColor: (ancestorMeta?.color ?? Colors.primary) + '66' }]}
              onPress={() => onHighlightAncestor(ancestorCert.cert_id)}
              activeOpacity={0.82}
            >
              <View style={[lt.ancestorIconWrap, { backgroundColor: (ancestorMeta?.color ?? Colors.primary) + '18' }]}>
                <Text style={lt.ancestorEmoji}>{ancestorMeta?.emoji ?? '📜'}</Text>
              </View>
              <View style={lt.ancestorInfo}>
                <View style={lt.ancestorBadgeRow}>
                  <View style={lt.predecessorBadge}>
                    <MaterialIcons name="history" size={9} color="#F59E0B" />
                    <Text style={lt.predecessorLabel}>PREDECESSOR</Text>
                  </View>
                  <View style={[lt.gradeSmall, { backgroundColor: (GRADE_META[ancestorCert.equity_grade] ?? GRADE_META['D']).bg, borderColor: (GRADE_META[ancestorCert.equity_grade] ?? GRADE_META['D']).color + '66' }]}>
                    <Text style={[lt.gradeSmallText, { color: (GRADE_META[ancestorCert.equity_grade] ?? GRADE_META['D']).color }]}>{ancestorCert.equity_grade}</Text>
                  </View>
                </View>
                <Text style={lt.ancestorCertId} numberOfLines={1}>{ancestorCert.cert_id}</Text>
                <Text style={lt.ancestorMeta}>
                  {ancestorMeta?.label} · ${ancestorCert.asset_value.toLocaleString('en-US', { maximumFractionDigits: 0 })} · {ancestorCert.issued_at}
                </Text>
              </View>
              <View style={lt.tapHint}>
                <MaterialIcons name="open-in-new" size={13} color="#F59E0B99" />
              </View>
            </TouchableOpacity>
          ) : (
            // Original cert was deleted or exists outside user's collection
            <View style={lt.ancestorGhost}>
              <View style={lt.ghostIconWrap}>
                <MaterialIcons name="help-outline" size={16} color={Colors.textMuted} />
              </View>
              <View style={lt.ancestorInfo}>
                <View style={lt.ancestorBadgeRow}>
                  <View style={lt.predecessorBadge}>
                    <MaterialIcons name="history" size={9} color="#F59E0B" />
                    <Text style={lt.predecessorLabel}>PREDECESSOR</Text>
                  </View>
                  <View style={lt.archivedBadge}>
                    <Text style={lt.archivedText}>ARCHIVED</Text>
                  </View>
                </View>
                <Text style={lt.ancestorCertId} numberOfLines={1}>{cert.renewed_from_cert_id}</Text>
                <Text style={lt.ancestorMeta}>Original certificate not found in ledger</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ── Arrow Connector ── */}
      <View style={lt.connectorWrap}>
        <View style={lt.connectorLeft} />
        <View style={lt.connectorCenter}>
          <View style={lt.connectorLine} />
          <View style={lt.arrowHead}>
            <MaterialIcons name="arrow-downward" size={16} color={meta.color} />
          </View>
          <View style={lt.renewalBadge}>
            <MaterialIcons name="autorenew" size={10} color={meta.color} />
            <Text style={[lt.renewalBadgeText, { color: meta.color }]}>RENEWED</Text>
            {depth >= 2 && (
              <TouchableOpacity
                style={[lt.genBadge, depth >= 4 ? lt.genBadgeRare : depth >= 3 ? lt.genBadgeDeep : lt.genBadgeBase]}
                onPress={() => setChainTooltipVisible(true)}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <MaterialIcons name="account-tree" size={8} color={depth >= 4 ? '#A78BFA' : depth >= 3 ? '#60A5FA' : '#F59E0B'} />
                <Text style={[lt.genBadgeText, { color: depth >= 4 ? '#A78BFA' : depth >= 3 ? '#60A5FA' : '#F59E0B' }]}>
                  Gen {depth}
                </Text>
                <MaterialIcons name="info-outline" size={7} color={depth >= 4 ? '#A78BFA88' : depth >= 3 ? '#60A5FA88' : '#F59E0B88'} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={lt.connectorRight} />
      </View>

      {/* ── Lineage Chain Tooltip Modal ── */}
      <Modal
        visible={chainTooltipVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChainTooltipVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={ltt.overlay} onPress={() => setChainTooltipVisible(false)}>
          <View style={ltt.card} onStartShouldSetResponder={() => true}>
            {/* Header */}
            <View style={ltt.header}>
              <View style={ltt.headerIcon}>
                <MaterialIcons name="account-tree" size={15} color={Colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={ltt.headerTitle}>Lineage Chain</Text>
                <Text style={ltt.headerSub}>{depth} generation{depth !== 1 ? 's' : ''} · {cert.cert_id}</Text>
              </View>
              <TouchableOpacity
                style={ltt.closeBtn}
                onPress={() => setChainTooltipVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={15} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Chain nodes */}
            <ScrollView
              style={ltt.chainScroll}
              contentContainerStyle={ltt.chainContent}
              showsVerticalScrollIndicator={false}
              scrollEnabled={buildLineageChain(cert, allCerts).length > 5}
            >
              {buildLineageChain(cert, allCerts).map((node, idx, arr) => {
                const nodeMeta = node.cert_type ? CERT_TYPES.find(t => t.type === node.cert_type) : null;
                const isLast = idx === arr.length - 1;
                const genColor = node.generation >= 4 ? '#A78BFA' : node.generation >= 3 ? '#60A5FA' : '#F59E0B';
                return (
                  <View key={node.cert_id} style={ltt.nodeWrap}>
                    {/* Node row */}
                    <View style={[
                      ltt.nodeRow,
                      node.isCurrent && ltt.nodeRowCurrent,
                      !node.inLedger && ltt.nodeRowArchived,
                    ]}>
                      {/* Gen badge */}
                      <View style={[ltt.genPill, { backgroundColor: genColor + '1A', borderColor: genColor + '55' }]}>
                        <Text style={[ltt.genPillText, { color: genColor }]}>G{node.generation}</Text>
                      </View>

                      {/* Type icon */}
                      {node.inLedger && nodeMeta ? (
                        <View style={[ltt.typeIcon, { backgroundColor: nodeMeta.color + '18', borderColor: nodeMeta.color + '44' }]}>
                          <Text style={ltt.typeEmoji}>{nodeMeta.emoji}</Text>
                        </View>
                      ) : (
                        <View style={[ltt.typeIcon, { backgroundColor: Colors.bgElevated, borderColor: Colors.border }]}>
                          <MaterialIcons name="help-outline" size={13} color={Colors.textMuted} />
                        </View>
                      )}

                      {/* Cert info */}
                      <View style={ltt.nodeInfo}>
                        <View style={ltt.nodeTopRow}>
                          <Text style={ltt.nodeCertId} numberOfLines={1}>{node.cert_id}</Text>
                          {node.isCurrent && (
                            <View style={ltt.currentBadge}>
                              <Text style={ltt.currentBadgeText}>CURRENT</Text>
                            </View>
                          )}
                        </View>
                        <Text style={ltt.nodeSubtext}>
                          {node.inLedger
                            ? (nodeMeta?.label ?? node.cert_type ?? 'Certificate')
                            : 'Not in ledger — archived or external'}
                        </Text>
                      </View>

                      {/* Status dot */}
                      <View style={[
                        ltt.statusDot,
                        { backgroundColor: node.inLedger ? (node.isCurrent ? Colors.primary : Colors.success) : Colors.textMuted },
                      ]} />
                    </View>

                    {/* Connector arrow between nodes */}
                    {!isLast && (
                      <View style={ltt.nodeConnector}>
                        <View style={ltt.nodeConnectorLine} />
                        <MaterialIcons name="arrow-downward" size={11} color={Colors.textMuted} />
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            {/* Footer note */}
            <View style={ltt.footer}>
              <MaterialIcons name="info-outline" size={10} color={Colors.textMuted} />
              <Text style={ltt.footerText}>Tap any card in the list to jump to a certificate</Text>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Renewed Certificate Card ── */}
      <Animated.View style={[lt.renewedWrap, { borderWidth: highlightBorder, borderColor: '#F59E0B' }]}>
        <CertificateCard
          cert={cert}
          onShare={onShare}
          onDelete={onDelete}
          sharing={sharing}
        />
      </Animated.View>
    </View>
  );
}

const lt = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.xl,
  },
  ancestorRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  depthLine: {
    width: 3,
    backgroundColor: '#F59E0B44',
    borderRadius: 2,
    marginRight: Spacing.sm,
  },
  ancestorContent: {
    flex: 1,
  },
  ancestorFound: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    backgroundColor: '#1C1400',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  ancestorGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed' as any,
    padding: Spacing.md,
    opacity: 0.7,
  },
  ancestorIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ghostIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  ancestorEmoji: { fontSize: 18 },
  ancestorInfo: { flex: 1, gap: 3, minWidth: 0 },
  ancestorBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  predecessorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F59E0B22',
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#F59E0B44',
  },
  predecessorLabel: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: '#F59E0B',
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  gradeSmall: {
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  gradeSmallText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
  },
  archivedBadge: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  archivedText: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  ancestorCertId: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  ancestorMeta: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  tapHint: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F59E0B18',
    borderWidth: 1,
    borderColor: '#F59E0B33',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  connectorWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 52,
    marginVertical: 2,
  },
  connectorLeft: {
    width: 3 + Spacing.sm,
  },
  connectorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    gap: 2,
  },
  connectorLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#F59E0B55',
    borderRadius: 1,
  },
  arrowHead: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1C1400',
    borderWidth: 1.5,
    borderColor: '#F59E0B66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  renewalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'absolute',
    right: 0,
    top: 16,
  },
  renewalBadgeText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  genBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    marginLeft: 2,
  },
  genBadgeBase: {
    backgroundColor: '#1C1400',
    borderColor: '#F59E0B66',
  },
  genBadgeDeep: {
    backgroundColor: '#172554',
    borderColor: '#60A5FA55',
  },
  genBadgeRare: {
    backgroundColor: '#1E1040',
    borderColor: '#A78BFA55',
  },
  genBadgeText: {
    fontSize: 7.5,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
  connectorRight: {
    flex: 1,
  },
  renewedWrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Lineage Chain Tooltip Styles
// ─────────────────────────────────────────────────────────────────────────────
const ltt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6,6,8,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '33',
    backgroundColor: Colors.primaryGlow,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1.5,
    borderColor: Colors.primary + '66',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
  headerSub: {
    fontSize: 9,
    color: Colors.primary + 'AA',
    includeFontPadding: false,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chainScroll: {
    maxHeight: 360,
  },
  chainContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 0,
  },
  nodeWrap: {
    gap: 0,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm + 2,
  },
  nodeRowCurrent: {
    borderColor: Colors.primary + '66',
    backgroundColor: Colors.primaryGlow,
  },
  nodeRowArchived: {
    opacity: 0.6,
    borderStyle: 'dashed' as any,
  },
  genPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    minWidth: 26,
    alignItems: 'center',
    flexShrink: 0,
  },
  genPillText: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
  },
  typeIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  typeEmoji: { fontSize: 14 },
  nodeInfo: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  nodeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  nodeCertId: {
    flex: 1,
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  currentBadge: {
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    flexShrink: 0,
  },
  currentBadgeText: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
  nodeSubtext: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  nodeConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 22,
    gap: 2,
  },
  nodeConnectorLine: {
    width: 1.5,
    height: 10,
    backgroundColor: Colors.border,
    borderRadius: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerText: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Certificate Card (expanded list card)
// ─────────────────────────────────────────────────────────────────────────────
function CertificateCard({
  cert,
  onShare,
  onDelete,
  sharing,
}: {
  cert: BTNGCertificate;
  onShare: (cert: BTNGCertificate) => void;
  onDelete: (cert: BTNGCertificate) => void;
  sharing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = CERT_TYPES.find(t => t.type === cert.cert_type) ?? CERT_TYPES[0];
  const verifyUrl = `https://verify.bituncoin.io/doc/${cert.cert_id}?fp=${cert.fingerprint.slice(0, 16)}`;
  const grade = GRADE_META[cert.equity_grade] ?? GRADE_META['D'];

  return (
    <View style={[cc.card, { borderColor: meta.color + '44' }]}>
      {/* Card Header */}
      <TouchableOpacity style={cc.header} onPress={() => setExpanded(v => !v)} activeOpacity={0.85}>
        <View style={[cc.iconWrap, { backgroundColor: meta.color + '18', borderColor: meta.color + '44' }]}>
          <Text style={cc.emoji}>{meta.emoji}</Text>
        </View>
        <View style={cc.headerText}>
          <Text style={cc.certLabel}>{meta.label}</Text>
          <Text style={cc.certId} numberOfLines={1}>{cert.cert_id}</Text>
        </View>
        <View style={cc.headerRight}>
          <View style={[cc.gradePill, { backgroundColor: grade.bg, borderColor: grade.color + '66' }]}>
            <Text style={[cc.gradeText, { color: grade.color }]}>{cert.equity_grade}</Text>
          </View>
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={18}
            color={Colors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={cc.body}>
          {/* Cert info grid */}
          <View style={cc.infoGrid}>
            <View style={cc.infoCell}>
              <Text style={cc.infoLabel}>OWNER</Text>
              <Text style={cc.infoValue} numberOfLines={1}>{cert.owner_name}</Text>
            </View>
            <View style={cc.infoCell}>
              <Text style={cc.infoLabel}>ASSET VALUE</Text>
              <Text style={[cc.infoValue, { color: meta.color }]}>
                ${cert.asset_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={cc.infoCell}>
              <Text style={cc.infoLabel}>ISSUED</Text>
              <Text style={cc.infoValue}>{cert.issued_at}</Text>
            </View>
            <View style={cc.infoCell}>
              <Text style={cc.infoLabel}>EXPIRES</Text>
              <Text style={cc.infoValue}>{cert.expires_at ?? '—'}</Text>
            </View>
          </View>

          {/* Equity grade badge */}
          <GradeBadge grade={cert.equity_grade} />

          {/* Asset description */}
          {cert.asset_description ? (
            <View style={cc.descRow}>
              <MaterialIcons name="description" size={12} color={Colors.textMuted} />
              <Text style={cc.descText} numberOfLines={2}>{cert.asset_description}</Text>
            </View>
          ) : null}

          {/* Renewal lineage row */}
          {cert.renewed_from_cert_id ? (
            <View style={cc.lineageRow}>
              <MaterialIcons name="link" size={13} color="#F59E0B" />
              <Text style={cc.lineageLabel}>Renewed from</Text>
              <Text style={cc.lineageCertId} numberOfLines={1}>{cert.renewed_from_cert_id}</Text>
            </View>
          ) : null}

          {/* Fingerprint */}
          <View style={cc.fingerprintRow}>
            <MaterialIcons name="fingerprint" size={12} color={Colors.textMuted} />
            <Text style={cc.fingerprintLabel}>SHA-256</Text>
            <Text style={cc.fingerprintValue} numberOfLines={1}>
              {cert.fingerprint.slice(0, 32)}…
            </Text>
          </View>

          {/* QR Code */}
          <View style={cc.qrSection}>
            <View style={cc.qrWrap}>
              <QRCode
                value={verifyUrl}
                size={96}
                color={meta.color}
                backgroundColor={Colors.bgCard}
              />
              <View style={[cc.qrBrand, { backgroundColor: meta.color + '18', borderColor: meta.color + '44' }]}>
                <Text style={[cc.qrBrandText, { color: meta.color }]}>BTNG</Text>
              </View>
            </View>
            <View style={cc.qrInfo}>
              <Text style={cc.qrTitle}>Verification QR</Text>
              <Text
                style={[cc.qrUrl, { color: Colors.info }]}
                numberOfLines={2}
                onPress={() => Linking.openURL(verifyUrl)}
              >{verifyUrl}</Text>
              <View style={cc.qrStatusRow}>
                <View style={[cc.statusDot, { backgroundColor: cert.status === 'active' ? Colors.success : Colors.error }]} />
                <Text style={[cc.statusText, { color: cert.status === 'active' ? Colors.success : Colors.error }]}>
                  {cert.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={cc.actionRow}>
            <TouchableOpacity
              style={[
                cc.actionBtn,
                { backgroundColor: meta.color + '18', borderColor: meta.color + '44' },
                sharing && { opacity: 0.6 },
              ]}
              onPress={() => onShare(cert)}
              activeOpacity={0.8}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={meta.color} />
              ) : (
                <>
                  <MaterialIcons name="image" size={15} color={meta.color} />
                  <Text style={[cc.actionBtnText, { color: meta.color }]}>Share as Image</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={cc.deleteBtn}
              onPress={() => onDelete(cert)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="delete-outline" size={15} color={Colors.error} />
              <Text style={cc.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const cc = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, marginBottom: Spacing.md, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md + 2 },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  emoji: { fontSize: 22 },
  headerText: { flex: 1, gap: 3 },
  certLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  certId: { fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace' as any, includeFontPadding: false },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gradePill: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  gradeText: { fontSize: 11, fontWeight: FontWeight.heavy, includeFontPadding: false },
  body: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md + 2, paddingTop: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.md },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  infoCell: { flex: 1, minWidth: '45%', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, gap: 3 },
  infoLabel: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 0.8, includeFontPadding: false },
  infoValue: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  descRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  descText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 16 },
  fingerprintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.md, padding: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  fingerprintLabel: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, includeFontPadding: false },
  fingerprintValue: { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: 'monospace' as any, includeFontPadding: false },
  qrSection: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  qrWrap: { position: 'relative', width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  qrBrand: { position: 'absolute', bottom: -6, right: -6, borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  qrBrandText: { fontSize: 7, fontWeight: FontWeight.heavy, includeFontPadding: false },
  qrInfo: { flex: 1, gap: 6 },
  qrTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  qrUrl: { fontSize: 8, color: Colors.textMuted, lineHeight: 13, includeFontPadding: false },
  qrStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm + 2, borderRadius: Radius.lg, borderWidth: 1, minHeight: 36 },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.lg, borderRadius: Radius.lg, backgroundColor: Colors.errorBg, borderWidth: 1, borderColor: Colors.error + '44' },
  deleteBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.error, includeFontPadding: false },
  lineageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1C1400',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: '#F59E0B44',
  },
  lineageLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: '#F59E0B99',
    includeFontPadding: false,
  },
  lineageCertId: {
    flex: 1,
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: '#F59E0B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty type selector card
// ─────────────────────────────────────────────────────────────────────────────
function TypeSelectorCard({ onSelect }: { onSelect: (type: CertTypeMeta) => void }) {
  return (
    <View style={ts.grid}>
      {CERT_TYPES.map(t => (
        <TouchableOpacity
          key={t.type}
          style={[ts.card, { borderColor: t.color + '44' }]}
          onPress={() => onSelect(t)}
          activeOpacity={0.8}
        >
          <View style={[ts.iconWrap, { backgroundColor: t.color + '18', borderColor: t.color + '44' }]}>
            <Text style={ts.emoji}>{t.emoji}</Text>
          </View>
          <Text style={ts.label}>{t.label}</Text>
          <Text style={ts.desc} numberOfLines={1}>{t.description}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const ts = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  card: { width: '47%', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, gap: Spacing.sm, alignItems: 'center' },
  iconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  emoji: { fontSize: 20 },
  label: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  desc: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Create Certificate Modal
// ─────────────────────────────────────────────────────────────────────────────
interface PrefillData {
  cert_type?: CertType;
  owner_name?: string;
  asset_description?: string;
  asset_value?: number;
  renewed_from_cert_id?: string | null;
}

interface CreateModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: { cert_type: CertType; owner_name: string; asset_description: string; asset_value: number }) => void;
  creating: boolean;
  prefill?: PrefillData | null;
}

function CreateCertModal({ visible, onClose, onSubmit, creating, prefill }: CreateModalProps) {
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [selectedType, setSelectedType] = useState<CertTypeMeta | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [description, setDescription] = useState('');
  const [assetValue, setAssetValue] = useState('');
  const slideAnim = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      if (prefill) {
        const prefillTypeMeta = prefill.cert_type
          ? CERT_TYPES.find(t => t.type === prefill.cert_type) ?? null
          : null;
        setSelectedType(prefillTypeMeta);
        setStep(prefillTypeMeta ? 'form' : 'type');
        setOwnerName(prefill.owner_name ?? '');
        setDescription(prefill.asset_description ?? '');
        setAssetValue(prefill.asset_value ? String(prefill.asset_value) : '');
      } else {
        setStep('type');
        setSelectedType(null);
        setOwnerName('');
        setDescription('');
        setAssetValue('');
      }
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 12 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleTypeSelect = (type: CertTypeMeta) => {
    setSelectedType(type);
    setStep('form');
  };

  const valueNum = parseFloat(assetValue.replace(/,/g, '')) || 0;
  const previewGrade = computeEquityGrade(valueNum);
  const gradeMeta = GRADE_META[previewGrade] ?? GRADE_META['D'];

  const canSubmit = selectedType && ownerName.trim() && valueNum > 0;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={cm.overlay} onPress={onClose} />
      <Animated.View style={[cm.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={cm.handle} />

        {/* Header */}
        <View style={cm.header}>
          {step === 'form' && (
            <TouchableOpacity style={cm.backBtn} onPress={() => setStep('type')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="arrow-back" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
          <Text style={cm.headerTitle}>
            {step === 'type' ? 'Select Certificate Type' : `New ${selectedType?.label ?? ''}`}
          </Text>
          <TouchableOpacity style={cm.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="close" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={cm.scrollBody} showsVerticalScrollIndicator={false} contentContainerStyle={cm.scrollContent}>
          {step === 'type' ? (
            <TypeSelectorCard onSelect={handleTypeSelect} />
          ) : (
            <View style={cm.form}>
              {/* Type badge */}
              <View style={[cm.typeBadge, { borderColor: (selectedType?.color ?? Colors.primary) + '44' }]}>
                <Text style={cm.typeBadgeEmoji}>{selectedType?.emoji}</Text>
                <Text style={[cm.typeBadgeText, { color: selectedType?.color }]}>{selectedType?.label}</Text>
              </View>

              {/* Owner Name */}
              <View style={cm.fieldWrap}>
                <Text style={cm.fieldLabel}>Owner / Holder Name</Text>
                <TextInput
                  style={cm.input}
                  value={ownerName}
                  onChangeText={setOwnerName}
                  placeholder="Full legal name…"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
                />
              </View>

              {/* Asset Description */}
              <View style={cm.fieldWrap}>
                <Text style={cm.fieldLabel}>Asset Description <Text style={cm.optional}>(optional)</Text></Text>
                <TextInput
                  style={[cm.input, { minHeight: 64, textAlignVertical: 'top' }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Brief description of the asset…"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
              </View>

              {/* Asset Value */}
              <View style={cm.fieldWrap}>
                <Text style={cm.fieldLabel}>Appraised Asset Value (USD)</Text>
                <View style={cm.valueRow}>
                  <View style={cm.valuePrefix}>
                    <Text style={cm.valuePrefixText}>USD $</Text>
                  </View>
                  <TextInput
                    style={cm.valueInput}
                    value={assetValue}
                    onChangeText={v => setAssetValue(v.replace(/[^0-9.]/g, ''))}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                  {valueNum > 0 && (
                    <View style={[cm.liveGrade, { backgroundColor: gradeMeta.bg, borderColor: gradeMeta.color + '55' }]}>
                      <Text style={[cm.liveGradeText, { color: gradeMeta.color }]}>{previewGrade}</Text>
                    </View>
                  )}
                </View>
                {valueNum > 0 && (
                  <Text style={[cm.gradeHint, { color: gradeMeta.color }]}>
                    Equity Grade: {previewGrade} — {gradeMeta.label}
                  </Text>
                )}
              </View>

              {/* Quick values */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, paddingVertical: 2 }}>
                {[10000, 50000, 100000, 250000, 500000].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[cm.quickChip, assetValue === String(v) && cm.quickChipActive]}
                    onPress={() => setAssetValue(String(v))}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  >
                    <Text style={[cm.quickChipText, assetValue === String(v) && cm.quickChipTextActive]}>
                      ${v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Submit */}
              <TouchableOpacity
                style={[
                  cm.submitBtn,
                  { backgroundColor: selectedType?.color ?? Colors.primary },
                  !canSubmit && { opacity: 0.45 },
                ]}
                onPress={() => {
                  if (!canSubmit || !selectedType) return;
                  onSubmit({
                    cert_type: selectedType.type,
                    owner_name: ownerName.trim(),
                    asset_description: description.trim(),
                    asset_value: valueNum,
                  });
                }}
                disabled={!canSubmit || creating}
                activeOpacity={0.85}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialIcons name="verified" size={16} color="#fff" />
                    <Text style={cm.submitBtnText}>Issue Certificate</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  scrollBody: { maxHeight: 600 },
  scrollContent: { padding: Spacing.xl, paddingBottom: 40, gap: Spacing.md },
  form: { gap: Spacing.md },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, alignSelf: 'flex-start' },
  typeBadgeEmoji: { fontSize: 24 },
  typeBadgeText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  optional: { color: Colors.textMuted, fontWeight: FontWeight.normal },
  input: { backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, color: Colors.textPrimary, fontSize: FontSize.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, includeFontPadding: false },
  valueRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgElevated, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border, overflow: 'hidden' },
  valuePrefix: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, backgroundColor: Colors.warningBg, borderRightWidth: 1, borderRightColor: Colors.warning + '44' },
  valuePrefixText: { fontSize: FontSize.xs, fontWeight: FontWeight.heavy, color: Colors.warning, includeFontPadding: false },
  valueInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, includeFontPadding: false },
  liveGrade: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderLeftWidth: 1, borderLeftColor: Colors.border },
  liveGradeText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  gradeHint: { fontSize: 10, fontWeight: FontWeight.semibold, includeFontPadding: false },
  quickChip: { paddingHorizontal: 12, height: 30, justifyContent: 'center', borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  quickChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickChipText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  quickChipTextActive: { color: Colors.bg, fontWeight: FontWeight.bold },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.md + 2, borderRadius: Radius.lg, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// Certificate Timeline
// ─────────────────────────────────────────────────────────────────────────────
const TL_LABEL_H  = 56;
const TL_NODE_SZ  = 46;
const TL_CONN_W   = 44;
const TL_TOTAL_H  = TL_LABEL_H + TL_NODE_SZ + TL_LABEL_H;

function CertificateTimeline({
  certificates,
  onNodePress,
}: {
  certificates: BTNGCertificate[];
  onNodePress: (cert: BTNGCertificate) => void;
}) {
  const sorted = [...certificates].sort(
    (a, b) => new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime()
  );

  // Group by year for year markers
  const years: string[] = [];
  sorted.forEach(c => {
    const y = c.issued_at.slice(0, 4);
    if (!years.includes(y)) years.push(y);
  });

  if (sorted.length === 0) return null;

  const totalLineW =
    sorted.length * TL_NODE_SZ +
    Math.max(0, sorted.length - 1) * TL_CONN_W;

  return (
    <View style={tl.outerCard}>
      {/* Header */}
      <View style={tl.cardHeader}>
        <MaterialIcons name="timeline" size={14} color={Colors.primary} />
        <Text style={tl.cardTitle}>Certificate Timeline</Text>
        <View style={tl.countPill}>
          <Text style={tl.countText}>{sorted.length}</Text>
        </View>
        {years.map(y => (
          <View key={y} style={tl.yearPill}>
            <Text style={tl.yearText}>{y}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          tl.scrollContent,
          { minWidth: totalLineW + Spacing.xl * 2 },
        ]}
        style={tl.scroll}
        bounces={false}
      >
        {/* Background center line */}
        <View
          style={[
            tl.centerLine,
            {
              width: totalLineW,
              top: TL_LABEL_H + TL_NODE_SZ / 2 - 1,
              left: Spacing.xl,
            },
          ]}
        />

        {sorted.map((cert, idx) => {
          const meta  = CERT_TYPES.find(t => t.type === cert.cert_type) ?? CERT_TYPES[0];
          const grade = GRADE_META[cert.equity_grade] ?? GRADE_META['D'];
          const isAbove = idx % 2 === 0;
          const isLast  = idx === sorted.length - 1;

          // Label: show cert_id suffix + date
          const idShort   = cert.cert_id.length > 14
            ? cert.cert_id.slice(-10)
            : cert.cert_id;
          const verifyUrl = `https://verify.bituncoin.io/doc/${cert.cert_id}?fp=${cert.fingerprint.slice(0, 16)}`;

          return (
            <View
              key={cert.id}
              style={[
                tl.nodeCol,
                {
                  width: TL_NODE_SZ + (isLast ? 0 : TL_CONN_W),
                  height: TL_TOTAL_H,
                },
              ]}
            >
              {/* Top label slot */}
              <View style={[tl.labelSlot, { height: TL_LABEL_H, justifyContent: 'flex-end', paddingBottom: 8 }]}>
                {isAbove && (
                  <View style={tl.labelBox}>
                    <View style={[tl.gradeDot, { backgroundColor: grade.color }]} />
                    <Text style={[tl.gradeLabel, { color: grade.color }]}>{cert.equity_grade}</Text>
                    <Text style={tl.idLabel} numberOfLines={1}>{idShort}</Text>
                    <Text style={tl.holdHint}>Hold to verify</Text>
                  </View>
                )}
              </View>

              {/* Node row: dot + optional connector */}
              <View style={tl.nodeRow}>
                <TouchableOpacity
                  style={[
                    tl.dot,
                    {
                      width: TL_NODE_SZ,
                      height: TL_NODE_SZ,
                      borderRadius: TL_NODE_SZ / 2,
                      backgroundColor: meta.color + '20',
                      borderColor: meta.color,
                      shadowColor: meta.color,
                    },
                  ]}
                  onPress={() => onNodePress(cert)}
                  onLongPress={async () => {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Linking.openURL(verifyUrl);
                  }}
                  delayLongPress={400}
                  activeOpacity={0.75}
                >
                  <Text style={tl.dotEmoji}>{meta.emoji}</Text>
                  {/* Grade pip */}
                  <View
                    style={[
                      tl.gradePip,
                      { backgroundColor: grade.color, borderColor: Colors.bg },
                    ]}
                  />
                </TouchableOpacity>

                {/* Connector to next node */}
                {!isLast && (
                  <View
                    style={[
                      tl.connector,
                      { width: TL_CONN_W, backgroundColor: meta.color + '40' },
                    ]}
                  />
                )}
              </View>

              {/* Bottom label slot */}
              <View style={[tl.labelSlot, { height: TL_LABEL_H, justifyContent: 'flex-start', paddingTop: 8 }]}>
                {!isAbove && (
                  <View style={tl.labelBox}>
                    <View style={[tl.gradeDot, { backgroundColor: grade.color }]} />
                    <Text style={[tl.gradeLabel, { color: grade.color }]}>{cert.equity_grade}</Text>
                    <Text style={tl.idLabel} numberOfLines={1}>{idShort}</Text>
                    <Text style={tl.holdHint}>Hold to verify</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Legend */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tl.legendContent}
        style={tl.legend}
      >
        {CERT_TYPES.filter(t => certificates.some(c => c.cert_type === t.type)).map(t => (
          <View key={t.type} style={tl.legendItem}>
            <View style={[tl.legendDot, { backgroundColor: t.color }]} />
            <Text style={tl.legendLabel}>{t.emoji} {t.label}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={tl.cardFooter}>
        <MaterialIcons name="touch-app" size={10} color={Colors.textMuted} />
        <Text style={tl.cardFooterText}>Tap a node to jump to that certificate</Text>
      </View>
    </View>
  );
}

const tl = StyleSheet.create({
  outerCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.primaryGlow,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
    flex: 1,
  },
  countPill: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  countText: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.bg,
    includeFontPadding: false,
  },
  yearPill: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  yearText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  scroll: {
    height: TL_TOTAL_H + Spacing.md * 2,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    position: 'relative',
  },
  centerLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: Colors.primary + '25',
    borderRadius: 1,
  },
  nodeCol: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  labelSlot: {
    width: TL_NODE_SZ,
    alignItems: 'center',
  },
  labelBox: {
    alignItems: 'center',
    gap: 2,
    maxWidth: TL_NODE_SZ + TL_CONN_W - 4,
  },
  gradeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gradeLabel: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
    letterSpacing: 0.3,
  },
  idLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
    textAlign: 'center',
  },
  holdHint: {
    fontSize: 7,
    color: Colors.primary + '88',
    includeFontPadding: false,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    position: 'relative',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 2,
  },
  dotEmoji: { fontSize: 18 },
  gradePip: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  connector: {
    height: 2,
    borderRadius: 1,
    zIndex: 1,
  },
  legend: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    maxHeight: 36,
  },
  legendContent: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cardFooterText: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function BTNGSovereignDocsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  const { certificates, loading, creating, error, load, create, remove } = useBtngCertificates(user?.id);
  const { balance } = useEquityBalance(user?.id);
  const [createVisible, setCreateVisible] = useState(false);
  const [renewPrefill, setRenewPrefill] = useState<PrefillData | null>(null);
  const [filterType, setFilterType] = useState<CertType | 'all' | 'lineage'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerCollapsed, setBannerCollapsed] = useState(false);
  const [lineageHighlight, setLineageHighlight] = useState<string | null>(null);
  const [timelineView, setTimelineView] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);

  // ViewShot share state
  const viewShotRef = useRef<ViewShot>(null);
  const [sharingCertId, setSharingCertId] = useState<string | null>(null);
  const [captureReady, setCaptureReady] = useState(false);

  // Preview modal state
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isConfirmSharing, setIsConfirmSharing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [zoomResetKey, setZoomResetKey] = useState(0);

  // Export All state
  const exportViewShotRef = useRef<ViewShot>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportCurrentCert, setExportCurrentCert] = useState<BTNGCertificate | null>(null);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: {
    cert_type: CertType;
    owner_name: string;
    asset_description: string;
    asset_value: number;
  }) => {
    // For import_export, auto-attach equity metadata from the live balance card
    let metadata: Record<string, any> | undefined;
    if (data.cert_type === 'import_export' && balance) {
      metadata = {
        btng_id: balance.btng_id,
        wallet_address: balance.wallet_address,
        import_export_account_id: balance.import_export_account_id,
        on_chain_tx_hash: balance.on_chain_tx_hash,
        btngg_amount: balance.total_equity,
        gold_oz_troy: balance.gold_oz_troy,
        usd_value: balance.usd_value,
        gold_backed_ghs: balance.gold_backed_ghs,
        admin_reference: `ADM-${balance.btng_id}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
        reserve_policy_code: 'BTNG-RSV-POL-001',
        sovereign_status: balance.sovereign_status,
        tier: balance.tier,
      };
    }
    const cert = await create({ ...data, metadata, renewed_from_cert_id: renewPrefill?.renewed_from_cert_id ?? null });
    if (cert) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateVisible(false);
      showAlert('Certificate Issued', `${data.cert_type.replace(/_/g, ' ').toUpperCase()} certificate ${cert.cert_id} has been successfully issued and stored on the BTNG Sovereign Ledger.`);
    } else {
      showAlert('Error', 'Failed to create certificate. Please try again.');
    }
  };

  // Capture the off-screen ViewShot when captureReady fires
  useEffect(() => {
    if (!captureReady || !sharingCertId) return;
    const cert = certificates.find(c => c.id === sharingCertId);
    if (!cert) { setSharingCertId(null); setCaptureReady(false); return; }

    const doCapture = async () => {
      try {
        // Small delay to let the ViewShot render fully
        await new Promise<void>(r => setTimeout(r, 300));
        const uri = await (viewShotRef.current as any).capture();
        const fileName = `btng_cert_${cert.cert_id}.png`;
        const destPath = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.copyAsync({ from: uri, to: destPath });
        // Show preview instead of sharing immediately
        setPreviewUri(destPath);
        setZoomResetKey(k => k + 1);
        setShowPreview(true);
      } catch (err) {
        showAlert('Share Failed', 'Could not generate certificate image. Please try again.');
      } finally {
        setSharingCertId(null);
        setCaptureReady(false);
      }
    };

    doCapture();
  }, [captureReady, sharingCertId, certificates]);

  const handleExportAll = useCallback(async () => {
    if (certificates.length === 0) {
      showAlert('No Certificates', 'Issue at least one sovereign certificate before exporting.');
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      showAlert('Sharing Unavailable', 'File sharing is not available on this device.');
      return;
    }
    setExportingAll(true);
    const capturedFiles: { path: string; name: string }[] = [];
    try {
      for (let i = 0; i < certificates.length; i++) {
        const cert = certificates[i];
        setExportCurrentCert(cert);
        setExportProgress({ current: i + 1, total: certificates.length });
        // Allow ViewShot to render
        await new Promise<void>(r => setTimeout(r, 450));
        const uri = await (exportViewShotRef.current as any).capture();
        const fileName = `btng_cert_${cert.cert_id}.png`;
        const destPath = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.copyAsync({ from: uri, to: destPath });
        capturedFiles.push({ path: destPath, name: fileName });
      }

      // Bundle into ZIP
      const zip = new (JSZip as any)();
      for (const file of capturedFiles) {
        const b64 = await FileSystem.readAsStringAsync(file.path, { encoding: FileSystem.EncodingType.Base64 as any });
        zip.file(file.name, b64, { base64: true });
      }
      // Add a manifest
      const manifest = JSON.stringify({
        exported_at: new Date().toISOString(),
        total: certificates.length,
        certificates: certificates.map(c => ({
          cert_id: c.cert_id,
          type: c.cert_type,
          owner: c.owner_name,
          value: c.asset_value,
          grade: c.equity_grade,
          issued: c.issued_at,
        })),
      }, null, 2);
      zip.file('manifest.json', manifest);

      const zipBase64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const zipPath = `${FileSystem.cacheDirectory}btng-certificates-export.zip`;
      await FileSystem.writeAsStringAsync(zipPath, zipBase64, { encoding: FileSystem.EncodingType.Base64 as any });

      await Sharing.shareAsync(zipPath, {
        mimeType: 'application/zip',
        UTI: 'public.zip-archive',
        dialogTitle: `BTNG Certificate Export — ${certificates.length} certificates`,
      });
    } catch (err) {
      showAlert('Export Failed', 'Could not generate the certificate bundle. Please try again.');
    } finally {
      setExportingAll(false);
      setExportCurrentCert(null);
      setExportProgress(null);
    }
  }, [certificates, showAlert]);

  const handleConfirmShare = useCallback(async () => {
    if (!previewUri) return;
    const cert = certificates.find(c => previewUri.includes(c.cert_id));
    setIsConfirmSharing(true);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(previewUri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: cert ? `BTNG Certificate — ${cert.cert_id}` : 'BTNG Sovereign Certificate',
        });
      } else {
        if (cert) {
          const meta = CERT_TYPES.find(t => t.type === cert.cert_type);
          const verifyUrl = `https://verify.bituncoin.io/doc/${cert.cert_id}?fp=${cert.fingerprint.slice(0, 16)}`;
          await Share.share({
            message: [
              'BTNG Sovereign Certificate',
              `Type: ${meta?.label ?? cert.cert_type}`,
              `Owner: ${cert.owner_name}`,
              `Value: $${cert.asset_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              `Grade: ${cert.equity_grade}`,
              `Verify: ${verifyUrl}`,
            ].join('\n'),
            title: `BTNG Certificate — ${cert.cert_id}`,
          });
        }
      }
    } catch (err) {
      showAlert('Share Failed', 'Could not complete sharing. Please try again.');
    } finally {
      setIsConfirmSharing(false);
      setShowPreview(false);
      setPreviewUri(null);
    }
  }, [previewUri, certificates, showAlert]);

  const handleSaveToDevice = useCallback(async () => {
    if (!previewUri) return;
    setIsSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Permission Denied', 'Please enable photo library access in your device settings to save certificates.');
        return;
      }
      const asset = await MediaLibrary.createAssetAsync(previewUri);
      const fileName = asset.filename ?? previewUri.split('/').pop() ?? 'btng_certificate.png';
      showAlert('Saved to Camera Roll', `${fileName} has been saved to your photo library.`);
    } catch (err) {
      showAlert('Save Failed', 'Could not save the certificate image. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [previewUri, showAlert]);

  const handleCancelPreview = useCallback(() => {
    setShowPreview(false);
    setPreviewUri(null);
    setZoomResetKey(k => k + 1);
  }, []);

  const handleShare = useCallback((cert: BTNGCertificate) => {
    setSharingCertId(cert.id);
    // captureReady will be set true once the ViewShot layout is complete
    setCaptureReady(false);
    // Trigger capture after next render cycle
    requestAnimationFrame(() => {
      setTimeout(() => setCaptureReady(true), 50);
    });
  }, []);

  const handleDelete = (cert: BTNGCertificate) => {
    showAlert(
      'Delete Certificate',
      `Are you sure you want to delete ${cert.cert_id}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const ok = await remove(cert.id);
          if (!ok) showAlert('Error', 'Failed to delete certificate.');
        }},
      ]
    );
  };

  // Near-expiry detection — certificates expiring within 30 days
  const nearExpiryCerts = certificates.filter(c => {
    const days = getDaysUntilExpiry(c.expires_at);
    return days !== null && days <= 30;
  }).sort((a, b) => {
    const da = getDaysUntilExpiry(a.expires_at) ?? 9999;
    const db = getDaysUntilExpiry(b.expires_at) ?? 9999;
    return da - db;
  });

  const handleRenew = (cert: BTNGCertificate) => {
    setRenewPrefill({
      cert_type: cert.cert_type,
      owner_name: cert.owner_name,
      asset_description: cert.asset_description ?? '',
      asset_value: cert.asset_value,
      renewed_from_cert_id: cert.cert_id,
    });
    setCreateVisible(true);
  };

  const renewedCount = certificates.filter(c => c.renewed_from_cert_id !== null).length;
  const certYears = [...new Set(certificates.map(c => c.issued_at.slice(0, 4)))].sort((a, b) => b.localeCompare(a));

  const typeFiltered = filterType === 'all'
    ? certificates
    : filterType === 'lineage'
      ? certificates.filter(c => c.renewed_from_cert_id !== null)
      : certificates.filter(c => c.cert_type === filterType);

  const yearFiltered = selectedYear
    ? typeFiltered.filter(c => c.issued_at.startsWith(selectedYear))
    : typeFiltered;

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const queryFiltered = trimmedQuery
    ? yearFiltered.filter(c =>
        c.owner_name.toLowerCase().includes(trimmedQuery) ||
        c.cert_id.toLowerCase().includes(trimmedQuery) ||
        (c.asset_description ?? '').toLowerCase().includes(trimmedQuery)
      )
    : yearFiltered;
  const filtered = queryFiltered;
  const sortedCerts = sortCerts(filtered, sortOrder);

  const totalValue = certificates.reduce((s, c) => s + c.asset_value, 0);
  const gradeCount: Record<string, number> = {};
  certificates.forEach(c => { gradeCount[c.equity_grade] = (gradeCount[c.equity_grade] ?? 0) + 1; });
  const topGrade = Object.entries(gradeCount).sort((a, b) => {
    const order = ['A+', 'A', 'B', 'C', 'D'];
    return order.indexOf(a[0]) - order.indexOf(b[0]);
  })[0]?.[0] ?? '—';

  // The cert currently being prepared for sharing
  const sharingCert = sharingCertId ? certificates.find(c => c.id === sharingCertId) ?? null : null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Sovereign Documents</Text>
          <Text style={s.headerSub}>BTNG Asset Certificates</Text>
        </View>
        <TouchableOpacity
          style={s.contactBtn}
          onPress={() => router.push('/contact' as any)}
          activeOpacity={0.85}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialIcons name="contact-support" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={s.scanBtn}
          onPress={() => router.push('/cert-scanner' as any)}
          activeOpacity={0.85}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialIcons name="qr-code-scanner" size={18} color={Colors.primary} />
        </TouchableOpacity>
        {certificates.length > 0 && (
          <TouchableOpacity
            style={[s.timelineToggleBtn, timelineView && s.timelineToggleBtnActive]}
            onPress={() => setTimelineView(v => !v)}
            activeOpacity={0.85}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialIcons
              name="timeline"
              size={18}
              color={timelineView ? Colors.primary : Colors.textMuted}
            />
          </TouchableOpacity>
        )}
        {certificates.length > 0 && (
          <TouchableOpacity
            style={[s.exportBtn, exportingAll && { opacity: 0.55 }]}
            onPress={handleExportAll}
            disabled={exportingAll}
            activeOpacity={0.85}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            {exportingAll ? (
              <ActivityIndicator size="small" color={Colors.info} />
            ) : (
              <MaterialIcons name="archive" size={18} color={Colors.info} />
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={s.createBtn}
          onPress={() => {
            if (!user) { showAlert('Sign In Required', 'Please sign in to issue sovereign certificates.'); return; }
            setCreateVisible(true);
          }}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={18} color={Colors.bg} />
          <Text style={s.createBtnText}>Issue</Text>
        </TouchableOpacity>
      </View>

      {/* Off-screen ViewShot — renders the certificate image card for share capture */}
      {sharingCert ? (
        <View style={s.offScreen} pointerEvents="none">
          <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0, width: CARD_WIDTH }}>
            <CertificateImageCard cert={sharingCert} />
          </ViewShot>
        </View>
      ) : null}

      {/* Off-screen ViewShot — for Export All sequential capture */}
      {exportCurrentCert ? (
        <View style={s.offScreen} pointerEvents="none">
          <ViewShot ref={exportViewShotRef} options={{ format: 'png', quality: 1.0, width: CARD_WIDTH }}>
            <CertificateImageCard cert={exportCurrentCert} />
          </ViewShot>
        </View>
      ) : null}

      {/* Generating overlay — only show while capturing, hide once preview is ready */}
      {sharingCertId && !showPreview ? (
        <View style={s.sharingOverlay} pointerEvents="none">
          <View style={s.sharingBox}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={s.sharingText}>Generating certificate image…</Text>
          </View>
        </View>
      ) : null}

      {/* Export All overlay */}
      {exportingAll && exportProgress ? (
        <View style={s.sharingOverlay} pointerEvents="none">
          <View style={[s.sharingBox, s.exportBox]}>
            <View style={s.exportIconRow}>
              <ActivityIndicator color={Colors.info} size="large" />
              <View style={[s.exportBadge, { backgroundColor: Colors.info + '22', borderColor: Colors.info + '55' }]}>
                <Text style={[s.exportBadgeText, { color: Colors.info }]}>ZIP</Text>
              </View>
            </View>
            <Text style={s.sharingText}>Bundling certificates…</Text>
            <View style={s.exportProgressRow}>
              <Text style={s.exportProgressLabel}>
                {exportProgress.current} / {exportProgress.total}
              </Text>
              {exportCurrentCert ? (
                <Text style={s.exportProgressCert} numberOfLines={1}>
                  {exportCurrentCert.cert_id}
                </Text>
              ) : null}
            </View>
            {/* Progress bar */}
            <View style={s.progressBarBg}>
              <View
                style={[
                  s.progressBarFill,
                  { width: `${(exportProgress.current / exportProgress.total) * 100}%` as any },
                ]}
              />
            </View>
            <Text style={s.exportHint}>Generating PNG + ZIP archive…</Text>
          </View>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* Hero Banner */}
        <View style={s.heroBanner}>
          <View style={s.heroLeft}>
            <View style={s.heroIconWrap}>
              <Text style={s.heroIcon}>📜</Text>
            </View>
            <View style={{ gap: 3 }}>
              <Text style={s.heroTitle}>BTNG Sovereign Ledger</Text>
              <Text style={s.heroSub}>ES256 Signed · QR Verified · Blockchain-Ready</Text>
            </View>
          </View>
          <View style={s.heroBadge}>
            <Text style={s.heroBadgeText}>UBL-1.0</Text>
          </View>
        </View>

        {/* Equity Balance Verification Card */}
        {user && (
          <EquityBalanceCard userId={user.id} />
        )}

        {/* Stats row */}
        {certificates.length > 0 && (
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statNum}>{certificates.length}</Text>
              <Text style={s.statLabel}>Certificates</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCard}>
              <Text style={s.statNum}>${totalValue >= 1000000 ? (totalValue / 1000000).toFixed(1) + 'M' : totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + 'K' : totalValue.toFixed(0)}</Text>
              <Text style={s.statLabel}>Total Value</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: (GRADE_META[topGrade] ?? GRADE_META['D']).color }]}>{topGrade}</Text>
              <Text style={s.statLabel}>Top Grade</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCard}>
              <Text style={s.statNum}>{new Set(certificates.map(c => c.cert_type)).size}</Text>
              <Text style={s.statLabel}>Asset Types</Text>
            </View>
          </View>
        )}

        {/* Certificate type filter */}
        {certificates.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filterContent}
            style={s.filterScroll}
          >
            <TouchableOpacity
              style={[s.filterChip, filterType === 'all' && s.filterChipActive]}
              onPress={() => setFilterType('all')}
            >
              <Text style={[s.filterChipText, filterType === 'all' && s.filterChipTextActive]}>
                All ({certificates.length})
              </Text>
            </TouchableOpacity>
            {CERT_TYPES.filter(t => certificates.some(c => c.cert_type === t.type)).map(t => (
              <TouchableOpacity
                key={t.type}
                style={[s.filterChip, filterType === t.type && s.filterChipActive, filterType === t.type && { borderColor: t.color }]}
                onPress={() => setFilterType(t.type)}
              >
                <Text style={s.filterChipEmoji}>{t.emoji}</Text>
                <Text style={[s.filterChipText, filterType === t.type && { color: t.color, fontWeight: FontWeight.bold }]}>
                  {t.label} ({certificates.filter(c => c.cert_type === t.type).length})
                </Text>
              </TouchableOpacity>
            ))}
            {renewedCount > 0 && (
              <TouchableOpacity
                style={[
                  s.filterChip,
                  filterType === 'lineage' && s.filterChipLineageActive,
                ]}
                onPress={() => setFilterType('lineage')}
              >
                <MaterialIcons
                  name="account-tree"
                  size={13}
                  color={filterType === 'lineage' ? '#F59E0B' : Colors.textSecondary}
                />
                <Text style={[s.filterChipText, filterType === 'lineage' && s.filterChipLineageText]}>
                  Lineage ({renewedCount})
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* Year Filter + Sort Row */}
        {certificates.length > 0 && (
          <View style={so.rowWrap}>
            {/* Year pills — scrollable */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterContent}
              style={[s.filterScroll, { flex: 1 }]}
            >
              <TouchableOpacity
                style={[s.filterChip, selectedYear === null && s.filterChipActive]}
                onPress={() => setSelectedYear(null)}
              >
                <MaterialIcons
                  name="date-range"
                  size={12}
                  color={selectedYear === null ? Colors.primary : Colors.textSecondary}
                />
                <Text style={[s.filterChipText, selectedYear === null && s.filterChipTextActive]}>
                  All Years
                </Text>
              </TouchableOpacity>
              {certYears.map(year => (
                <TouchableOpacity
                  key={year}
                  style={[
                    s.filterChip,
                    selectedYear === year && s.filterChipActive,
                  ]}
                  onPress={() => setSelectedYear(selectedYear === year ? null : year)}
                >
                  <MaterialIcons
                    name="calendar-today"
                    size={11}
                    color={selectedYear === year ? Colors.primary : Colors.textMuted}
                  />
                  <Text style={[
                    s.filterChipText,
                    selectedYear === year && s.filterChipTextActive,
                  ]}>
                    {year}
                  </Text>
                  <View style={[
                    s.yearCountBadge,
                    selectedYear === year && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                  ]}>
                    <Text style={[
                      s.yearCountText,
                      selectedYear === year && { color: Colors.bg },
                    ]}>
                      {certificates.filter(c => c.issued_at.startsWith(year)).length}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Sort button */}
            <Pressable
              style={({ pressed }) => [so.sortBtn, pressed && { opacity: 0.75 }, sortOrder !== 'newest' && so.sortBtnActive]}
              onPress={() => setSortMenuVisible(true)}
            >
              <MaterialIcons
                name={SORT_OPTIONS.find(o => o.key === sortOrder)?.iconName as any ?? 'sort'}
                size={13}
                color={sortOrder !== 'newest' ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[so.sortBtnLabel, sortOrder !== 'newest' && { color: Colors.primary }]} numberOfLines={1}>
                {SORT_OPTIONS.find(o => o.key === sortOrder)?.label ?? 'Newest'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={15} color={sortOrder !== 'newest' ? Colors.primary : Colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Sort Popover Modal */}
        <Modal
          visible={sortMenuVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSortMenuVisible(false)}
          statusBarTranslucent
        >
          <Pressable style={so.overlay} onPress={() => setSortMenuVisible(false)}>
            <View style={so.menu} onStartShouldSetResponder={() => true}>
              {/* Header */}
              <View style={so.menuHeader}>
                <MaterialIcons name="sort" size={14} color={Colors.primary} />
                <Text style={so.menuTitle}>Sort Certificates</Text>
                <Pressable
                  style={so.menuClose}
                  onPress={() => setSortMenuVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                </Pressable>
              </View>
              {/* Options */}
              {SORT_OPTIONS.map((opt, idx) => {
                const isActive = sortOrder === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={({ pressed }) => [
                      so.menuItem,
                      isActive && so.menuItemActive,
                      pressed && { opacity: 0.75 },
                      idx < SORT_OPTIONS.length - 1 && so.menuItemBorder,
                    ]}
                    onPress={() => { setSortOrder(opt.key); setSortMenuVisible(false); }}
                  >
                    <View style={[so.menuIcon, isActive && { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '55' }]}>
                      <MaterialIcons name={opt.iconName as any} size={14} color={isActive ? Colors.primary : Colors.textMuted} />
                    </View>
                    <Text style={[so.menuItemText, isActive && { color: Colors.primary, fontWeight: FontWeight.bold as any }]}>
                      {opt.label}
                    </Text>
                    {isActive && (
                      <MaterialIcons name="check-circle" size={15} color={Colors.primary} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Modal>

        {/* Search Bar */}
        {certificates.length > 0 && (
          <View style={sb.wrap}>
            <View style={sb.iconWrap}>
              <MaterialIcons name="search" size={18} color={searchQuery ? Colors.primary : Colors.textMuted} />
            </View>
            <TextInput
              style={sb.input}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by owner, cert ID, or description…"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="never"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={sb.clearBtn}
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.75}
              >
                <MaterialIcons name="cancel" size={17} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Near-Expiry Warning Banner */}
        {user && nearExpiryCerts.length > 0 && (
          <View style={nb.banner}>
            {/* Banner header row */}
            <TouchableOpacity
              style={nb.headerRow}
              onPress={() => setBannerCollapsed(v => !v)}
              activeOpacity={0.85}
            >
              <View style={nb.iconWrap}>
                <MaterialIcons name="warning" size={16} color="#F59E0B" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={nb.headerTitle}>
                  {nearExpiryCerts.length === 1
                    ? '1 Certificate Expiring Soon'
                    : `${nearExpiryCerts.length} Certificates Expiring Soon`}
                </Text>
                <Text style={nb.headerSub}>Review and renew before they lapse</Text>
              </View>
              <View style={nb.countBadge}>
                <Text style={nb.countText}>{nearExpiryCerts.length}</Text>
              </View>
              <MaterialIcons
                name={bannerCollapsed ? 'expand-more' : 'expand-less'}
                size={18}
                color="#F59E0B"
              />
            </TouchableOpacity>

            {/* Expanded cert rows */}
            {!bannerCollapsed && (
              <View style={nb.list}>
                {nearExpiryCerts.map((cert, idx) => {
                  const days = getDaysUntilExpiry(cert.expires_at) ?? 0;
                  const meta = CERT_TYPES.find(t => t.type === cert.cert_type) ?? CERT_TYPES[0];
                  const isExpired = days <= 0;
                  const isUrgent = days <= 7 && !isExpired;
                  const rowColor = isExpired ? '#EF4444' : isUrgent ? '#F97316' : '#F59E0B';
                  return (
                    <View
                      key={cert.id}
                      style={[
                        nb.row,
                        idx < nearExpiryCerts.length - 1 && nb.rowBorder,
                      ]}
                    >
                      {/* Cert type icon */}
                      <View style={[nb.rowIcon, { backgroundColor: meta.color + '18', borderColor: meta.color + '44' }]}>
                        <Text style={nb.rowEmoji}>{meta.emoji}</Text>
                      </View>

                      {/* Cert info */}
                      <View style={nb.rowInfo}>
                        <Text style={nb.rowCertId} numberOfLines={1}>{cert.cert_id}</Text>
                        <Text style={nb.rowType}>{meta.label}</Text>
                      </View>

                      {/* Countdown */}
                      <View style={[nb.countdown, { backgroundColor: rowColor + '1A', borderColor: rowColor + '55' }]}>
                        {isExpired ? (
                          <Text style={[nb.countdownNum, { color: rowColor }]}>EXPIRED</Text>
                        ) : (
                          <>
                            <Text style={[nb.countdownNum, { color: rowColor }]}>{days}d</Text>
                            <Text style={[nb.countdownLabel, { color: rowColor + 'BB' }]}>left</Text>
                          </>
                        )}
                      </View>

                      {/* Renew button */}
                      <TouchableOpacity
                        style={nb.renewBtn}
                        onPress={() => handleRenew(cert)}
                        activeOpacity={0.85}
                      >
                        <MaterialIcons name="autorenew" size={13} color="#F59E0B" />
                        <Text style={nb.renewBtnText}>Renew</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Timeline View */}
        {timelineView && sortedCerts.length > 0 && (
          <CertificateTimeline
            certificates={sortedCerts}
            onNodePress={(cert) => {
              setTimelineView(false);
              setFilterType('all');
              setLineageHighlight(cert.cert_id);
              setTimeout(() => setLineageHighlight(null), 2500);
            }}
          />
        )}

        {/* Certificates */}
        {!user ? (
          <View style={s.authPrompt}>
            <Text style={s.authEmoji}>🔐</Text>
            <Text style={s.authTitle}>Sign In Required</Text>
            <Text style={s.authSub}>Sign in to issue and manage your BTNG sovereign asset certificates.</Text>
            <TouchableOpacity style={s.authBtn} onPress={() => router.push('/login')}>
              <MaterialIcons name="login" size={16} color={Colors.bg} />
              <Text style={s.authBtnText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={s.loading}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={s.loadingText}>Loading certificates…</Text>
          </View>
        ) : error ? (
          <View style={s.errorWrap}>
            <MaterialIcons name="error-outline" size={36} color={Colors.error} />
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={load}>
              <Text style={s.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : sortedCerts.length === 0 && trimmedQuery ? (
          <View style={s.noResults}>
            <View style={s.noResultsIconWrap}>
              <MaterialIcons name="search-off" size={32} color={Colors.textMuted} />
            </View>
            <Text style={s.noResultsTitle}>No results for "{searchQuery.trim()}"</Text>
            <Text style={s.noResultsSub}>Try searching by owner name, certificate ID, or asset description.</Text>
            <TouchableOpacity
              style={s.noResultsClear}
              onPress={() => setSearchQuery('')}
              activeOpacity={0.85}
            >
              <MaterialIcons name="close" size={13} color={Colors.primary} />
              <Text style={s.noResultsClearText}>Clear Search</Text>
            </TouchableOpacity>
          </View>
        ) : sortedCerts.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyHeader}>
              <Text style={s.emptyEmoji}>📜</Text>
              <Text style={s.emptyTitle}>No Certificates Yet</Text>
              <Text style={s.emptyText}>Issue your first BTNG sovereign asset certificate. Choose from 8 asset categories below.</Text>
            </View>
            <TypeSelectorCard onSelect={() => setCreateVisible(true)} />
          </View>
        ) : (
          <View style={s.certList}>
            {sortedCerts.map(cert =>
              filterType === 'lineage' ? (
                <LineageTreeCard
                  key={cert.id}
                  cert={cert}
                  allCerts={certificates}
                  onShare={handleShare}
                  onDelete={handleDelete}
                  sharing={sharingCertId === cert.id}
                  highlighted={lineageHighlight === cert.cert_id}
                  onHighlightAncestor={(certId) => {
                    setFilterType('all');
                    setLineageHighlight(certId);
                    setTimeout(() => setLineageHighlight(null), 2500);
                  }}
                />
              ) : cert.cert_type === 'import_export' ? (
                <ImportExportCertCard
                  key={cert.id}
                  cert={cert}
                  onShare={handleShare}
                  onDelete={handleDelete}
                  sharing={sharingCertId === cert.id}
                />
              ) : (
                <CertificateCard
                  key={cert.id}
                  cert={cert}
                  onShare={handleShare}
                  onDelete={handleDelete}
                  sharing={sharingCertId === cert.id}
                />
              )
            )}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <MaterialIcons name="verified-user" size={11} color={Colors.textMuted} />
          <Text style={s.footerText}>
            {'Bituncoin Sovereign System v1.1 · ES256 · '}
            <Text
              style={s.footerLink}
              onPress={() => Linking.openURL('https://verify.bituncoin.io')}
            >
              verify.bituncoin.io
            </Text>
            {' · '}
            <Text
              style={s.footerLink}
              onPress={() => Linking.openURL('mailto:info@bituncoin.io')}
            >
              info@bituncoin.io
            </Text>
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Create Modal */}
      <CreateCertModal
        visible={createVisible}
        onClose={() => { setCreateVisible(false); setRenewPrefill(null); }}
        onSubmit={handleCreate}
        creating={creating}
        prefill={renewPrefill}
      />

      {/* Certificate Image Preview Modal */}
      <Modal
        visible={showPreview}
        transparent
        animationType="fade"
        onRequestClose={handleCancelPreview}
        statusBarTranslucent
      >
        <View style={pv.overlay}>
          <View style={pv.container}>
            {/* Modal Header */}
            <View style={pv.header}>
              <View style={pv.headerLeft}>
                <View style={pv.headerIcon}>
                  <MaterialIcons name="image" size={16} color={Colors.primary} />
                </View>
                <View style={{ gap: 2 }}>
                  <Text style={pv.headerTitle}>Certificate Preview</Text>
                  <Text style={pv.headerSub}>Review before sharing</Text>
                </View>
              </View>
              <TouchableOpacity
                style={pv.closeBtn}
                onPress={handleCancelPreview}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Certificate Image Preview */}
            <ScrollView
              style={pv.imageScroll}
              contentContainerStyle={pv.imageScrollContent}
              showsVerticalScrollIndicator={false}
              bounces
              scrollEnabled={false}
            >
              {previewUri ? (
                <View style={pv.imageWrapper}>
                  <ZoomableImage
                    uri={previewUri}
                    width={SCREEN_W - Spacing.xl * 2}
                    aspectRatio={CARD_WIDTH / 580}
                    resetKey={zoomResetKey}
                  />
                </View>
              ) : (
                <View style={pv.imagePlaceholder}>
                  <ActivityIndicator color={Colors.primary} size="large" />
                </View>
              )}

              {/* File info row */}
              <View style={pv.fileInfoRow}>
                <View style={pv.fileInfoCell}>
                  <MaterialIcons name="image" size={12} color={Colors.textMuted} />
                  <Text style={pv.fileInfoLabel}>Format</Text>
                  <Text style={pv.fileInfoValue}>PNG · High Res</Text>
                </View>
                <View style={pv.fileInfoDivider} />
                <View style={pv.fileInfoCell}>
                  <MaterialIcons name="verified-user" size={12} color={Colors.primary} />
                  <Text style={pv.fileInfoLabel}>Standard</Text>
                  <Text style={[pv.fileInfoValue, { color: Colors.primary }]}>UBL-1.0</Text>
                </View>
                <View style={pv.fileInfoDivider} />
                <View style={pv.fileInfoCell}>
                  <MaterialIcons name="qr-code" size={12} color={Colors.textMuted} />
                  <Text style={pv.fileInfoLabel}>Includes</Text>
                  <Text style={pv.fileInfoValue}>QR + Fingerprint</Text>
                </View>
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={pv.actions}>
              {/* Save to Device — full width top row */}
              <TouchableOpacity
                style={[pv.saveBtn, isSaving && { opacity: 0.65 }]}
                onPress={handleSaveToDevice}
                disabled={isSaving || isConfirmSharing}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator color={Colors.bg} size="small" />
                ) : (
                  <>
                    <MaterialIcons name="save-alt" size={16} color={Colors.bg} />
                    <Text style={pv.saveBtnText}>Save to Device</Text>
                  </>
                )}
              </TouchableOpacity>
              {/* Cancel + Share row */}
              <View style={pv.actionRow}>
                <TouchableOpacity
                  style={pv.cancelBtn}
                  onPress={handleCancelPreview}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="close" size={16} color={Colors.textSecondary} />
                  <Text style={pv.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[pv.shareBtn, isConfirmSharing && { opacity: 0.65 }]}
                  onPress={handleConfirmShare}
                  disabled={isConfirmSharing || isSaving}
                  activeOpacity={0.85}
                >
                  {isConfirmSharing ? (
                    <ActivityIndicator color={Colors.bg} size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="share" size={16} color={Colors.bg} />
                      <Text style={pv.shareBtnText}>Share</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  offScreen: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: CARD_WIDTH,
    opacity: 0,
  },
  sharingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,6,8,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  sharingBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    minWidth: 220,
  },
  sharingText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  exportBox: { minWidth: 260, gap: Spacing.md },
  exportIconRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  exportBadge: { borderRadius: Radius.md, borderWidth: 1.5, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  exportBadgeText: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false, letterSpacing: 1 },
  exportProgressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, width: '100%' },
  exportProgressLabel: { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, color: Colors.info, includeFontPadding: false },
  exportProgressCert: { flex: 1, fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', includeFontPadding: false },
  progressBarBg: { width: '100%', height: 4, borderRadius: 2, backgroundColor: Colors.bgElevated, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Colors.info, borderRadius: 2 },
  exportHint: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, gap: 2 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  contactBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  scanBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '66', alignItems: 'center', justifyContent: 'center' },
  timelineToggleBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  timelineToggleBtnActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary + '88' },
  exportBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 1.5, borderColor: Colors.info + '55', alignItems: 'center', justifyContent: 'center' },
  createBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3 },
  createBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  scroll: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, gap: Spacing.md },
  heroBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md + 2, borderWidth: 1.5, borderColor: Colors.primary + '44' },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  heroIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.warningBg, borderWidth: 1.5, borderColor: Colors.warning + '66', alignItems: 'center', justifyContent: 'center' },
  heroIcon: { fontSize: 24 },
  heroTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  heroSub: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  heroBadge: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.primary + '55' },
  heroBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false, letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  statCard: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.textPrimary, includeFontPadding: false },
  statLabel: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  statDivider: { width: 1, backgroundColor: Colors.border },
  filterScroll: { marginVertical: -4 },
  filterContent: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: 4 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 32, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary },
  filterChipEmoji: { fontSize: 12 },
  filterChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false },
  filterChipTextActive: { color: Colors.primary },
  filterChipLineageActive: { backgroundColor: '#1C1400', borderColor: '#F59E0B88', borderWidth: 1.5 },
  filterChipLineageText: { color: '#F59E0B', fontWeight: FontWeight.bold as any },
  yearCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  yearCountText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  certList: { gap: 0 },
  empty: { gap: Spacing.xl },
  emptyHeader: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 280, includeFontPadding: false },
  authPrompt: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  authEmoji: { fontSize: 48 },
  authTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  authSub: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', maxWidth: 260, includeFontPadding: false },
  authBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, marginTop: Spacing.sm },
  authBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  loading: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, includeFontPadding: false },
  errorWrap: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.md },
  errorText: { color: Colors.error, fontSize: FontSize.sm, textAlign: 'center', includeFontPadding: false },
  retryBtn: { backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '44' },
  retryBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm },
  footerText: { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },
  footerLink: { fontSize: 9, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  noResults: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  noResultsIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.bgCard,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResultsTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    includeFontPadding: false,
    maxWidth: 280,
  },
  noResultsSub: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
    includeFontPadding: false,
  },
  noResultsClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md + 4,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    marginTop: Spacing.sm,
  },
  noResultsClearText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Sort Control Styles
// ─────────────────────────────────────────────────────────────────────────────
const so = StyleSheet.create({
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
    maxWidth: 130,
  },
  sortBtnActive: {
    backgroundColor: Colors.primaryGlow,
    borderColor: Colors.primary + '88',
  },
  sortBtnLabel: {
    fontSize: 11,
    fontWeight: FontWeight.semibold as any,
    color: Colors.textSecondary,
    includeFontPadding: false,
    flexShrink: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6,6,8,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  menu: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '33',
    backgroundColor: Colors.primaryGlow,
  },
  menuTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold as any,
    color: Colors.primary,
    includeFontPadding: false,
  },
  menuClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
  },
  menuItemActive: {
    backgroundColor: Colors.primaryGlow,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  menuItemText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Search Bar Styles
// ─────────────────────────────────────────────────────────────────────────────
const sb = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
    minHeight: 46,
  },
  iconWrap: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    includeFontPadding: false,
  },
  clearBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Near-Expiry Banner Styles
// ─────────────────────────────────────────────────────────────────────────────
const nb = StyleSheet.create({
  banner: {
    backgroundColor: '#1C1400',
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: '#F59E0B55',
    overflow: 'hidden',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F59E0B22',
    borderWidth: 1.5,
    borderColor: '#F59E0B55',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#F59E0B',
    includeFontPadding: false,
  },
  headerSub: {
    fontSize: 10,
    color: '#F59E0B99',
    includeFontPadding: false,
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    color: '#000',
    includeFontPadding: false,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: '#F59E0B33',
    paddingHorizontal: Spacing.md + 2,
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    paddingVertical: Spacing.sm + 2,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B22',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
  },
  rowEmoji: { fontSize: 16 },
  rowInfo: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowCertId: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    includeFontPadding: false,
  },
  rowType: {
    fontSize: 9,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  countdown: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
    minWidth: 48,
    flexShrink: 0,
  },
  countdownNum: {
    fontSize: 12,
    fontWeight: FontWeight.heavy,
    includeFontPadding: false,
    lineHeight: 14,
  },
  countdownLabel: {
    fontSize: 8,
    fontWeight: FontWeight.semibold,
    includeFontPadding: false,
    lineHeight: 10,
  },
  renewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B22',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#F59E0B55',
    flexShrink: 0,
  },
  renewBtnText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: '#F59E0B',
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Certificate Preview Modal Styles
// ─────────────────────────────────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;

const pv = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6,6,8,0.88)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  container: {
    width: '100%',
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1.5,
    borderColor: Colors.primary + '44',
    maxHeight: '92%',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageScroll: {
    maxHeight: 520,
  },
  imageScrollContent: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  imageWrapper: {
    position: 'relative',
    width: SCREEN_W - Spacing.xl * 2,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  image: {
    height: undefined,
    borderRadius: Radius.xl,
    backgroundColor: Colors.bg,
  },
  imageGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderColor: Colors.primary + '55',
    pointerEvents: 'none' as any,
  },
  imagePlaceholder: {
    width: SCREEN_W - Spacing.xl * 2,
    height: 320,
    borderRadius: Radius.xl,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  fileInfoRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  fileInfoCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  fileInfoDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 2,
  },
  fileInfoLabel: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  fileInfoValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  actions: {
    flexDirection: 'column',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl + 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.africanGreen,
    shadowColor: Colors.africanGreen,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#fff',
    includeFontPadding: false,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  shareBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  shareBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
    includeFontPadding: false,
  },
});
