import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAlert } from '@/template';

// ─────────────────────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────────────────────
const EMAIL_CHANNELS = [
  {
    label: 'Primary',
    email: 'info@bituncoin.io',
    description: 'General enquiries & support',
    iconColor: '#D4A017',
    badgeColor: '#D4A01722',
    badge: 'PRIMARY',
  },
  {
    label: 'Corporate',
    email: 'info@bituncoin.com',
    description: 'Corporate & business relations',
    iconColor: '#3B82F6',
    badgeColor: '#3B82F622',
    badge: 'CORPORATE',
  },
  {
    label: 'AI & Tech',
    email: 'info@bituncoin.ai',
    description: 'AI technology & developer enquiries',
    iconColor: '#8B5CF6',
    badgeColor: '#8B5CF622',
    badge: 'TECH / AI',
  },
];

const WEB_CHANNELS = [
  {
    label: 'bituncoin.io',
    url: 'https://www.bituncoin.io',
    display: 'www.bituncoin.io',
    description: 'Main platform & sovereign registry',
    iconColor: '#D4A017',
    badge: 'MAIN',
  },
  {
    label: 'bituncoin.com',
    url: 'https://www.bituncoin.com',
    display: 'www.bituncoin.com',
    description: 'Corporate portal & investor relations',
    iconColor: '#3B82F6',
    badge: 'CORP',
  },
  {
    label: 'bituncoin.ai',
    url: 'https://www.bituncoin.ai',
    display: 'www.bituncoin.ai',
    description: 'AI banking engine & developer hub',
    iconColor: '#8B5CF6',
    badge: 'AI',
  },
];

const LEGAL_DETAILS = [
  { label: 'Company Name',    value: 'EKUYE DIGITAL GATEWAY TRUST LTD' },
  { label: 'Registration No', value: 'CS099020624' },
  { label: 'TIN',             value: 'C0064220206' },
  { label: 'Legal Authority', value: 'Ghana Companies Act 992' },
  { label: 'Incorporation',   value: '24 June 2024' },
  { label: 'Jurisdiction',    value: 'Republic of Ghana, West Africa' },
  { label: 'Founder',         value: 'John Kojo Zi' },
  { label: 'Role',            value: 'Founder & Lead Architect' },
];

const PLATFORM_STATS = [
  { emoji: '🌍', value: '54',   label: 'African Nations' },
  { emoji: '🏅', value: 'BTNG', label: 'Gold Coin' },
  { emoji: '🔐', value: 'ES256', label: 'Signed Certs' },
  { emoji: '🏦', value: 'UBL',  label: 'v1.0 Standard' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper — open link safely
// ─────────────────────────────────────────────────────────────────────────────
async function openLink(url: string, showAlert: (t: string, m: string) => void) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      showAlert('Cannot Open Link', `Unable to open: ${url}`);
    }
  } catch {
    showAlert('Error', 'Failed to open the link. Please try again.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Header
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ icon, title, color = Colors.primary }: { icon: string; title: string; color?: string }) {
  return (
    <View style={sl.row}>
      <View style={[sl.iconWrap, { backgroundColor: color + '18', borderColor: color + '44' }]}>
        <MaterialIcons name={icon as any} size={14} color={color} />
      </View>
      <Text style={[sl.title, { color }]}>{title}</Text>
      <View style={[sl.line, { backgroundColor: color + '33' }]} />
    </View>
  );
}
const sl = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 1.2, includeFontPadding: false },
  line: { flex: 1, height: 1, borderRadius: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Email Channel Card
// ─────────────────────────────────────────────────────────────────────────────
function EmailCard({ item, onPress }: { item: typeof EMAIL_CHANNELS[0]; onPress: () => void }) {
  return (
    <TouchableOpacity style={[ec.card, { borderColor: item.iconColor + '44' }]} onPress={onPress} activeOpacity={0.82}>
      <View style={[ec.iconWrap, { backgroundColor: item.badgeColor, borderColor: item.iconColor + '55' }]}>
        <MaterialIcons name="email" size={20} color={item.iconColor} />
      </View>
      <View style={ec.info}>
        <View style={ec.topRow}>
          <Text style={ec.email}>{item.email}</Text>
          <View style={[ec.badge, { backgroundColor: item.badgeColor, borderColor: item.iconColor + '55' }]}>
            <Text style={[ec.badgeText, { color: item.iconColor }]}>{item.badge}</Text>
          </View>
        </View>
        <Text style={ec.desc}>{item.description}</Text>
      </View>
      <View style={[ec.arrow, { borderColor: item.iconColor + '44' }]}>
        <MaterialIcons name="open-in-new" size={14} color={item.iconColor} />
      </View>
    </TouchableOpacity>
  );
}
const ec = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    padding: Spacing.md + 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
  },
  info: { flex: 1, gap: 3 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  email: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
    flexShrink: 1,
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  desc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Web Channel Card
// ─────────────────────────────────────────────────────────────────────────────
function WebCard({ item, onPress }: { item: typeof WEB_CHANNELS[0]; onPress: () => void }) {
  return (
    <TouchableOpacity style={[wc.card, { borderColor: item.iconColor + '44' }]} onPress={onPress} activeOpacity={0.82}>
      <LinearGradient
        colors={[item.iconColor + '22', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={wc.gradientBar}
      />
      <View style={wc.content}>
        <View style={wc.left}>
          <View style={[wc.globeWrap, { backgroundColor: item.iconColor + '18', borderColor: item.iconColor + '55' }]}>
            <MaterialIcons name="language" size={18} color={item.iconColor} />
          </View>
          <View style={wc.textBlock}>
            <Text style={[wc.url, { color: item.iconColor }]}>{item.display}</Text>
            <Text style={wc.desc}>{item.description}</Text>
          </View>
        </View>
        <View style={[wc.badge, { backgroundColor: item.iconColor + '18', borderColor: item.iconColor + '44' }]}>
          <Text style={[wc.badgeText, { color: item.iconColor }]}>{item.badge}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={18} color={item.iconColor + 'AA'} />
      </View>
    </TouchableOpacity>
  );
}
const wc = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  gradientBar: { height: 2, width: '100%' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.md,
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  globeWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexShrink: 0,
  },
  textBlock: { flex: 1, gap: 2 },
  url: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    includeFontPadding: false,
  },
  desc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ContactScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="arrow-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Contact & About</Text>
          <Text style={s.headerSub}>Official Bituncoin Channels</Text>
        </View>
        <View style={s.headerBadge}>
          <MaterialIcons name="verified" size={12} color={Colors.primary} />
          <Text style={s.headerBadgeText}>OFFICIAL</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Hero Banner ── */}
        <LinearGradient
          colors={['#1A1200', '#0E0E14', '#0A0A10']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <LinearGradient
            colors={['#D4A017', '#1A6B1A', '#1A3A6B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.heroAccentBar}
          />
          <View style={s.heroBody}>
            <View style={s.heroCoinWrap}>
              <Text style={s.heroCoinEmoji}>🏅</Text>
              <View style={s.heroCoinRing} />
            </View>
            <View style={s.heroText}>
              <Text style={s.heroTitle}>BTNG Gold Coin</Text>
              <Text style={s.heroSubtitle}>Bituncoin · Ghana & 54 Africa Nations</Text>
              <Text style={s.heroDesc}>
                The BTNG Gold Coin is the sovereign digital gold asset for Africa, issued and managed by EKUYE DIGITAL GATEWAY TRUST LTD.
              </Text>
            </View>
          </View>

          {/* Platform stats */}
          <View style={s.statsRow}>
            {PLATFORM_STATS.map((st, i) => (
              <View key={i} style={[s.statCell, i < PLATFORM_STATS.length - 1 && { borderRightWidth: 1, borderRightColor: Colors.border }]}>
                <Text style={s.statEmoji}>{st.emoji}</Text>
                <Text style={s.statValue}>{st.value}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* ── Email Channels ── */}
        <SectionLabel icon="email" title="EMAIL CHANNELS" color={Colors.primary} />
        {EMAIL_CHANNELS.map(item => (
          <EmailCard
            key={item.email}
            item={item}
            onPress={() => openLink(`mailto:${item.email}`, showAlert)}
          />
        ))}

        {/* ── Website Channels ── */}
        <SectionLabel icon="language" title="OFFICIAL WEBSITES" color="#3B82F6" />
        {WEB_CHANNELS.map(item => (
          <WebCard
            key={item.url}
            item={item}
            onPress={() => openLink(item.url, showAlert)}
          />
        ))}

        {/* ── Verification Portal ── */}
        <SectionLabel icon="verified-user" title="SOVEREIGN VERIFICATION" color="#22C55E" />
        <TouchableOpacity
          style={s.verifyCard}
          onPress={() => openLink('https://verify.bituncoin.io', showAlert)}
          activeOpacity={0.82}
        >
          <LinearGradient
            colors={['#052e16', '#0E0E14']}
            style={s.verifyGrad}
          >
            <View style={s.verifyInner}>
              <View style={s.verifyIconWrap}>
                <MaterialIcons name="qr-code-scanner" size={24} color="#22C55E" />
              </View>
              <View style={s.verifyText}>
                <Text style={s.verifyTitle}>BTNG Verification Portal</Text>
                <Text style={s.verifyUrl}>verify.bituncoin.io</Text>
                <Text style={s.verifyDesc}>Verify sovereign certificates, ES256 signatures & QR codes</Text>
              </View>
              <View style={s.verifyArrow}>
                <MaterialIcons name="open-in-new" size={16} color="#22C55E" />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Legal & Registration ── */}
        <SectionLabel icon="gavel" title="LEGAL & REGISTRATION" color="#F59E0B" />
        <View style={s.legalCard}>
          {/* Header */}
          <LinearGradient
            colors={['#1A1200', '#0E0E14']}
            style={s.legalHeader}
          >
            <View style={s.legalHeaderLeft}>
              <View style={s.legalLogoWrap}>
                <Text style={{ fontSize: 22 }}>🏛️</Text>
              </View>
              <View style={{ gap: 3 }}>
                <Text style={s.legalCompanyName}>EKUYE DIGITAL GATEWAY</Text>
                <Text style={s.legalCompanyName}>TRUST LTD</Text>
                <View style={s.legalVerifiedBadge}>
                  <MaterialIcons name="verified" size={10} color={Colors.primary} />
                  <Text style={s.legalVerifiedText}>REGISTERED COMPANY · GHANA</Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* Details grid */}
          <View style={s.legalGrid}>
            {LEGAL_DETAILS.map((row, i) => (
              <View
                key={i}
                style={[
                  s.legalRow,
                  i < LEGAL_DETAILS.length - 1 && s.legalRowBorder,
                ]}
              >
                <Text style={s.legalLabel}>{row.label}</Text>
                <Text style={s.legalValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Seal footer */}
          <View style={s.legalSeal}>
            <LinearGradient
              colors={['#1A1200', '#0A0A10']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.legalSealGrad}
            >
              <View style={s.sealRingOuter}>
                <View style={s.sealRingInner}>
                  <Text style={{ fontSize: 14 }}>🏅</Text>
                </View>
              </View>
              <View style={s.sealCenter}>
                <Text style={s.sealTitle}>BTNG SOVEREIGN VERIFIED SEALED</Text>
                <View style={s.sealDivider} />
                <Text style={s.sealAdmin}>John Kojo Zi</Text>
                <Text style={s.sealRole}>Founder & Lead Architect</Text>
                <Text style={s.sealLegal}>
                  Reg. CS099020624 · TIN C0064220206{'\n'}
                  Ghana Companies Act 992 · 24 June 2024
                </Text>
              </View>
              <View style={s.sealRingOuter}>
                <View style={s.sealRingInner}>
                  <Text style={{ fontSize: 14 }}>🏅</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* ── About Platform ── */}
        <SectionLabel icon="info" title="ABOUT THE PLATFORM" color="#8B5CF6" />
        <View style={s.aboutCard}>
          <Text style={s.aboutText}>
            The BTNG Gold Coin platform is a unified, secure, and scalable banking operating system tailored for Africa's 54 countries and the global diaspora. It combines traditional banking, cryptocurrency, and a decentralized marketplace under one sovereign standard.
          </Text>
          <View style={s.aboutFeatureGrid}>
            {[
              { emoji: '📈', label: 'Spot Trading' },
              { emoji: '🤝', label: 'P2P Marketplace' },
              { emoji: '🔄', label: 'Copy Trading' },
              { emoji: '🏋️', label: 'Practice Wallet' },
              { emoji: '📜', label: 'Sovereign Certs' },
              { emoji: '🔐', label: 'KYC Verification' },
              { emoji: '💳', label: 'Multi Wallet' },
              { emoji: '📰', label: 'BTNG Blog' },
            ].map((f, i) => (
              <View key={i} style={s.featureCell}>
                <Text style={s.featureEmoji}>{f.emoji}</Text>
                <Text style={s.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Quick Contact Buttons ── */}
        <SectionLabel icon="send" title="QUICK CONTACT" color={Colors.primary} />
        <View style={s.quickRow}>
          <TouchableOpacity
            style={s.quickBtn}
            onPress={() => openLink('mailto:info@bituncoin.io', showAlert)}
            activeOpacity={0.82}
          >
            <MaterialIcons name="email" size={18} color={Colors.primary} />
            <Text style={s.quickBtnText}>Email Us</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.quickBtn, s.quickBtnSecondary]}
            onPress={() => openLink('https://www.bituncoin.io', showAlert)}
            activeOpacity={0.82}
          >
            <MaterialIcons name="language" size={18} color="#3B82F6" />
            <Text style={[s.quickBtnText, { color: '#3B82F6' }]}>Visit Website</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <MaterialIcons name="verified-user" size={11} color={Colors.textMuted} />
          <Text style={s.footerText}>
            Bituncoin Sovereign System v1.1 · ES256 · Ghana & 54 Africa Nations
          </Text>
        </View>
        <Text style={s.footerDomains}>
          www.bituncoin.io · www.bituncoin.com · www.bituncoin.ai
        </Text>
        <Text style={s.footerEmails}>
          info@bituncoin.io · info@bituncoin.com · info@bituncoin.ai
        </Text>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, gap: 2 },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  headerSub: {
    fontSize: 10,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryGlow,
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '55',
  },
  headerBadgeText: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.6,
    includeFontPadding: false,
  },

  // ── Scroll ──
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },

  // ── Hero ──
  hero: {
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  heroAccentBar: { height: 3 },
  heroBody: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md + 2,
    paddingBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  heroCoinWrap: {
    position: 'relative',
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  heroCoinEmoji: { fontSize: 36, zIndex: 2 },
  heroCoinRing: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.primary,
    opacity: 0.45,
  },
  heroText: { flex: 1, gap: 4 },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  heroSubtitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    includeFontPadding: false,
  },
  heroDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    includeFontPadding: false,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    gap: 2,
  },
  statEmoji: { fontSize: 16 },
  statValue: {
    fontSize: 11,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    includeFontPadding: false,
  },
  statLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    includeFontPadding: false,
    textAlign: 'center',
  },

  // ── Verify Card ──
  verifyCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#22C55E55',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyGrad: { padding: Spacing.md + 2 },
  verifyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  verifyIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#22C55E22',
    borderWidth: 2,
    borderColor: '#22C55E55',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  verifyText: { flex: 1, gap: 3 },
  verifyTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  verifyUrl: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#22C55E',
    includeFontPadding: false,
  },
  verifyDesc: {
    fontSize: 10,
    color: Colors.textMuted,
    includeFontPadding: false,
  },
  verifyArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#22C55E18',
    borderWidth: 1,
    borderColor: '#22C55E44',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Legal Card ──
  legalCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  legalHeader: {
    padding: Spacing.md + 2,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '33',
  },
  legalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  legalLogoWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 2,
    borderColor: Colors.primary + '66',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  legalCompanyName: {
    fontSize: 13,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.5,
    includeFontPadding: false,
    lineHeight: 18,
  },
  legalVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  legalVerifiedText: {
    fontSize: 7,
    fontWeight: FontWeight.heavy,
    color: Colors.primary + 'AA',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  legalGrid: {
    paddingHorizontal: Spacing.md + 2,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm + 3,
    gap: Spacing.md,
  },
  legalRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  legalLabel: {
    width: 110,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textMuted,
    includeFontPadding: false,
    flexShrink: 0,
  },
  legalValue: {
    flex: 1,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    includeFontPadding: false,
  },
  legalSeal: {
    borderTopWidth: 1,
    borderTopColor: Colors.primary + '33',
    overflow: 'hidden',
  },
  legalSealGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.md + 2,
  },
  sealRingOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryGlow,
    flexShrink: 0,
  },
  sealRingInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '77',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.1)',
  },
  sealCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  sealTitle: {
    fontSize: 8,
    fontWeight: FontWeight.heavy,
    color: Colors.primary,
    letterSpacing: 0.8,
    textAlign: 'center',
    includeFontPadding: false,
  },
  sealDivider: {
    width: '90%',
    height: 1,
    backgroundColor: Colors.primary + '44',
    marginVertical: 3,
  },
  sealAdmin: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    fontStyle: 'italic',
    textAlign: 'center',
    includeFontPadding: false,
  },
  sealRole: {
    fontSize: 8,
    color: Colors.textSecondary,
    textAlign: 'center',
    includeFontPadding: false,
  },
  sealLegal: {
    fontSize: 7,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 12,
    includeFontPadding: false,
    marginTop: 2,
  },

  // ── About ──
  aboutCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md + 4,
    gap: Spacing.md,
  },
  aboutText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 21,
    includeFontPadding: false,
  },
  aboutFeatureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  featureCell: {
    width: '22%',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  featureEmoji: { fontSize: 18 },
  featureLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    textAlign: 'center',
    includeFontPadding: false,
    lineHeight: 11,
  },

  // ── Quick Buttons ──
  quickRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1.5,
    borderColor: Colors.primary + '66',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  quickBtnSecondary: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderColor: '#3B82F666',
    shadowColor: '#3B82F6',
  },
  quickBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    includeFontPadding: false,
  },

  // ── Footer ──
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: Spacing.md,
  },
  footerText: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  footerDomains: {
    fontSize: 9,
    color: Colors.primary + 'BB',
    textAlign: 'center',
    includeFontPadding: false,
    letterSpacing: 0.3,
  },
  footerEmails: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'center',
    includeFontPadding: false,
    marginBottom: Spacing.sm,
  },
});
