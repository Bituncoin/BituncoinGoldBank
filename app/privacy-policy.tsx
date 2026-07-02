// BTNG Gold Coin — Privacy Policy
// EKUYE DIGITAL GATEWAY TRUST LTD · Ghana · info@bituncoin.io
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const EFFECTIVE_DATE = '24 June 2024';
const LAST_UPDATED   = 'June 2026';
const COMPANY        = 'EKUYE DIGITAL GATEWAY TRUST LTD';
const REG_NO         = 'CS099020624';
const TIN            = 'C0064220206';
const EMAIL          = 'info@bituncoin.io';
const WEBSITE        = 'www.bituncoin.io';

// ── Section data ─────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: '1',
    icon: 'info-outline' as const,
    color: '#3B82F6',
    title: '1. About This Policy',
    body: `This Privacy Policy describes how ${COMPANY} ("BTNG", "we", "us", or "our") collects, uses, stores, and protects your personal information when you use the BTNG Gold Coin platform, mobile application, and associated services (collectively, the "Platform").

By accessing or using our Platform, you acknowledge that you have read, understood, and agree to the practices described in this Privacy Policy. If you do not agree, please discontinue use of the Platform immediately.

Registration No.: ${REG_NO} · TIN: ${TIN}
Ghana Companies Act 992 · Incorporated 24 June 2024`,
  },
  {
    id: '2',
    icon: 'folder-open' as const,
    color: Colors.primary,
    title: '2. Information We Collect',
    subsections: [
      {
        subtitle: '2.1 Account & Identity Information',
        text: `• Full legal name and preferred username
• Email address (primary identifier for authentication)
• Phone number (optional, for SMS verification)
• Date of birth (required for KYC compliance)
• Country of residence and nationality
• Government-issued ID details (National ID, Passport, Voter's Card)
• Profile photograph / selfie (KYC verification)`,
      },
      {
        subtitle: '2.2 Financial & Transaction Data',
        text: `• Wallet addresses (BTNG Genesis HD wallet, external addresses)
• Transaction history (deposits, withdrawals, trades, transfers, P2P orders)
• Order book activity (spot, P2P, binary, copy-trade positions)
• MTN MoMo cash rail transactions (merchant ID 248059)
• Fee payment records and referral earnings
• Bank account details (if provided for fiat withdrawals)`,
      },
      {
        subtitle: '2.3 KYC / AML Documents',
        text: `• Scanned copies of government-issued identification
• Proof of address documents
• Facial biometric data (selfie comparison for liveness check)
• KYC submission timestamps and reviewer audit trail
• Document verification status and rejection reasons (if applicable)`,
      },
      {
        subtitle: '2.4 Device & Technical Data',
        text: `• Device type, operating system, and app version
• IP address and approximate geolocation (country/city level)
• Push notification tokens
• App usage analytics and error logs
• Session duration and feature interaction data`,
      },
      {
        subtitle: '2.5 Communications',
        text: `• Support ticket content and resolution history
• In-app messages and announcements you interact with
• Email correspondence with info@bituncoin.io`,
      },
    ],
  },
  {
    id: '3',
    icon: 'settings-applications' as const,
    color: '#22C55E',
    title: '3. How We Use Your Information',
    body: `We use your personal information for the following legitimate purposes:

Account Management
• Create, verify, and maintain your BTNG account
• Authenticate your identity on each login (email/OTP/biometric)
• Reset passwords and manage security settings

Platform Services
• Process trades, P2P orders, deposits, and withdrawals
• Generate and manage your BTNG Genesis HD wallet
• Execute MTN MoMo Cash Rail transactions (Merchant ID 248059)
• Facilitate copy trading, binary trading, and practice wallet features
• Issue and verify BTNG Equity Certificates and Sovereign Documents

Compliance & Legal Obligations
• Perform Know Your Customer (KYC) verification as required under Ghanaian law and global AML standards
• Detect, investigate, and prevent fraud, money laundering, and unauthorized access
• Respond to lawful requests from Ghanaian regulatory authorities (Bank of Ghana, Ghana Revenue Authority)
• Maintain audit trails for regulatory reporting

Communications
• Send transactional emails (login OTP, trade confirmations, withdrawal alerts)
• Deliver platform announcements, blog articles, and educational content
• Notify you of KYC status changes, security events, and system updates
• Send referral commission confirmations

Analytics & Improvement
• Analyze usage patterns to improve Platform performance and UX
• Debug technical issues via error logs
• Conduct internal research on trading volume and product performance`,
  },
  {
    id: '4',
    icon: 'security' as const,
    color: '#9945FF',
    title: '4. KYC Document Handling',
    body: `BTNG operates under a strict KYC/AML framework aligned with the Bank of Ghana's digital finance guidelines and the Financial Intelligence Centre Act, 2004 (Act 658).

Document Collection
KYC documents (front/back of National ID, Passport, Voter's Card, and selfie) are uploaded securely and stored in an encrypted private storage bucket (kyc-documents) accessible only to the user and authorized BTNG admin reviewers.

Document Access Controls
• Users may only access their own KYC documents
• Admin reviewers (authorized BTNG staff only) may view documents for verification purposes
• No third party has access to KYC documents without a lawful court order or regulatory request
• File access is governed by Row-Level Security (RLS) policies on our database

Document Retention
• KYC documents are retained for a minimum of five (5) years following account closure, in compliance with Ghanaian AML regulations
• Documents submitted for rejected applications are retained for two (2) years
• Users may request data deletion after the mandatory retention period expires

Document Security
• All KYC documents are stored in encrypted form (AES-256 at rest)
• Access is logged and audited
• Documents are not used for any purpose other than identity verification and regulatory compliance`,
  },
  {
    id: '5',
    icon: 'share' as const,
    color: Colors.warning,
    title: '5. Data Sharing & Disclosure',
    body: `We do not sell your personal data to any third party. We may share information only in the following limited circumstances:

Service Providers
• OnSpace Cloud (backend infrastructure, database, authentication) — data processed under a Data Processing Agreement
• MTN Mobile Money Ghana (transaction processing for Cash Rail payments)
• Email delivery providers (for OTP and transactional emails only)

Regulatory & Legal Disclosure
• Ghanaian government agencies and law enforcement when required by valid legal process
• Financial Intelligence Centre (FIC) for mandatory AML reporting
• Bank of Ghana in the event of regulatory examination
• Courts of competent jurisdiction in Ghana

Business Transfers
In the event of a merger, acquisition, or asset sale, your data may be transferred to the successor entity. You will be notified via email and in-app notification prior to such transfer.

We require all third-party processors to maintain appropriate security standards and process data only as directed by BTNG.`,
  },
  {
    id: '6',
    icon: 'lock' as const,
    color: '#22C55E',
    title: '6. Data Security',
    body: `BTNG employs bank-grade security measures to protect your personal information:

Encryption
• Data in transit: TLS 1.3 (HTTPS) for all API communications
• Data at rest: AES-256 encryption for all database fields and file storage
• Wallet credentials: Stored in device-level secure enclave (Expo SecureStore)
• KYC documents: Encrypted private storage with RLS access controls

Authentication Security
• Email OTP (6-digit, 10-minute expiry) for all logins
• Optional 2-Factor Authentication (TOTP) via authenticator app
• Biometric authentication (Face ID / Fingerprint) for admin access
• Session management with secure token rotation

Infrastructure Security
• PostgreSQL database with Row-Level Security (RLS) on all tables
• Edge Function serverless architecture (no exposed server root access)
• Automated threat detection and rate limiting
• Admin actions are logged in the security_events audit table

Despite our best efforts, no system is completely secure. We encourage you to use a strong unique password and enable 2FA on your account.`,
  },
  {
    id: '7',
    icon: 'public' as const,
    color: '#3B82F6',
    title: '7. Cookies & Tracking',
    body: `The BTNG Gold Coin mobile application does not use browser cookies. However, we may use the following:

Device Identifiers
• Push notification tokens (for sending alerts to your device)
• Anonymous device fingerprints (for fraud detection and session management)

Analytics
• Aggregated, anonymized usage data (feature usage frequency, session duration)
• Crash reports and performance metrics via Expo telemetry
• No cross-app behavioral tracking or advertising identifiers are used

We do not use third-party advertising networks, social media tracking pixels, or behavioral profiling for marketing purposes.`,
  },
  {
    id: '8',
    icon: 'person' as const,
    color: Colors.primary,
    title: '8. Your Rights',
    body: `As a BTNG user, you have the following rights with respect to your personal data:

Right of Access
Request a complete copy of the personal data we hold about you (email: info@bituncoin.io).

Right to Rectification
Correct inaccurate personal information via the Edit Profile screen or by contacting support.

Right to Erasure ("Right to be Forgotten")
Request deletion of your account and personal data, subject to mandatory legal retention periods (KYC data: 5 years minimum under Ghanaian law).

Right to Data Portability
Request your transaction history and account data in machine-readable format (JSON/CSV).

Right to Restrict Processing
Request that we limit processing of your data in certain circumstances.

Right to Object
Object to processing of your data for analytics or non-essential purposes.

Right to Withdraw Consent
Withdraw any consent previously given at any time (note: this does not affect lawfulness of prior processing).

To exercise any of these rights, contact: info@bituncoin.io
We will respond within 30 days. Identity verification may be required before fulfilling requests.`,
  },
  {
    id: '9',
    icon: 'child-care' as const,
    color: Colors.error,
    title: "9. Children's Privacy",
    body: `The BTNG Gold Coin Platform is not directed to persons under the age of 18. We do not knowingly collect personal information from minors.

If you are a parent or guardian and believe your child has provided personal data to BTNG, please contact us immediately at info@bituncoin.io. Upon verification, we will delete such data within 14 days.

Age verification is conducted as part of the KYC process using date of birth and government-issued identification.`,
  },
  {
    id: '10',
    icon: 'flight-takeoff' as const,
    color: '#22C55E',
    title: '10. International Transfers & AfCFTA',
    body: `BTNG is designed to serve all 54 African nations under the African Continental Free Trade Area (AfCFTA) framework. Your data may be processed and stored on servers located in Ghana or other jurisdictions where our cloud infrastructure providers operate.

For cross-border data transfers, we ensure:
• Adequate protection through contractual safeguards (Data Processing Agreements)
• Compliance with the Ghana Data Protection Act, 2012 (Act 843)
• Alignment with the AU Convention on Cyber Security and Personal Data Protection (Malabo Convention) principles
• Notification to the Data Protection Commission of Ghana where required

Ghanaian users: Your data is processed under the Ghana Data Protection Act, 2012 and the Bank of Ghana's regulatory framework. You have the right to lodge a complaint with the Data Protection Commission of Ghana (www.dpghana.gov.gh).`,
  },
  {
    id: '11',
    icon: 'update' as const,
    color: Colors.primary,
    title: '11. Changes to This Policy',
    body: `We may update this Privacy Policy periodically to reflect changes in our practices, legal requirements, or service offerings.

When we make material changes, we will:
• Display a prominent notice within the BTNG app
• Send an email notification to your registered address
• Update the "Last Updated" date at the top of this page

Continued use of the Platform after changes take effect constitutes acceptance of the revised policy. We encourage you to review this policy periodically.`,
  },
  {
    id: '12',
    icon: 'email' as const,
    color: Colors.primary,
    title: '12. Contact & Data Controller',
    body: `For privacy inquiries, data access requests, or to report a concern:

Data Controller
${COMPANY}
Registration: ${REG_NO} · TIN: ${TIN}
Ghana Companies Act 992 · Incorporated ${EFFECTIVE_DATE}
Republic of Ghana, West Africa

Contact
Email: ${EMAIL}
Website: ${WEBSITE}
Platform: BTNG Gold Coin (com.bituncoin.btng)

Founder & DPO Contact
John Kojo Zi — Founder & Lead Architect
info@bituncoin.io

Supervisory Authority
Data Protection Commission of Ghana
www.dpghana.gov.gh
(For unresolved privacy complaints)`,
  },
];

// ── Expandable section ────────────────────────────────────────────────────────
function PolicySection({ section }: { section: typeof SECTIONS[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={ss.section}>
      <TouchableOpacity style={ss.sectionHeader} onPress={() => setOpen(v => !v)} activeOpacity={0.75}>
        <View style={[ss.sectionIconWrap, { backgroundColor: section.color + '18', borderColor: section.color + '44' }]}>
          <MaterialIcons name={section.icon} size={16} color={section.color} />
        </View>
        <Text style={ss.sectionTitle}>{section.title}</Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={ss.sectionBody}>
          {'subsections' in section && section.subsections ? (
            section.subsections.map(sub => (
              <View key={sub.subtitle} style={ss.subsection}>
                <Text style={[ss.subsectionTitle, { color: section.color }]}>{sub.subtitle}</Text>
                <Text style={ss.bodyText}>{sub.text}</Text>
              </View>
            ))
          ) : (
            <Text style={ss.bodyText}>{(section as any).body}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[ss.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={ss.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={ss.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={ss.screenTitle}>Privacy Policy</Text>
          <Text style={ss.screenSub}>Last Updated: {LAST_UPDATED}</Text>
        </View>
        <View style={ss.badgeWrap}>
          <MaterialIcons name="shield" size={14} color={Colors.success} />
          <Text style={ss.badgeText}>GDPR+</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ss.scroll}>

        {/* Hero banner */}
        <View style={ss.heroBanner}>
          <View style={ss.heroIconWrap}>
            <MaterialIcons name="privacy-tip" size={32} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ss.heroTitle}>Your Privacy Matters</Text>
            <Text style={ss.heroSub}>{COMPANY}</Text>
            <Text style={ss.heroSub}>Reg. {REG_NO} · Ghana</Text>
          </View>
        </View>

        {/* Quick stats */}
        <View style={ss.statsRow}>
          {[
            { icon: 'lock' as const, label: 'AES-256\nEncryption', color: '#22C55E' },
            { icon: 'verified-user' as const, label: 'KYC/AML\nCompliant', color: '#3B82F6' },
            { icon: 'public' as const, label: 'AfCFTA\n54 Nations', color: Colors.primary },
            { icon: 'gavel' as const, label: 'Ghana\nAct 843', color: Colors.warning },
          ].map(item => (
            <View key={item.label} style={[ss.statCard, { borderColor: item.color + '44' }]}>
              <MaterialIcons name={item.icon} size={18} color={item.color} />
              <Text style={[ss.statLabel, { color: item.color }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Effective date */}
        <View style={ss.dateBanner}>
          <MaterialIcons name="calendar-today" size={13} color={Colors.textMuted} />
          <Text style={ss.dateText}>Effective: {EFFECTIVE_DATE} · Last Updated: {LAST_UPDATED}</Text>
        </View>

        {/* Expandable sections */}
        {SECTIONS.map(s => <PolicySection key={s.id} section={s} />)}

        {/* Footer */}
        <View style={ss.footer}>
          <View style={ss.footerIconRow}>
            <MaterialIcons name="verified" size={16} color={Colors.primary} />
            <Text style={ss.footerTitle}>BTNG Gold Coin</Text>
          </View>
          <Text style={ss.footerText}>{COMPANY}</Text>
          <Text style={ss.footerText}>Reg. {REG_NO} · TIN {TIN}</Text>
          <Text style={[ss.footerText, { color: Colors.primary }]}>{EMAIL}</Text>
          <Text style={ss.footerText}>{WEBSITE}</Text>
          <Text style={ss.footerText}>Ghana · West Africa · 54 African Nations</Text>
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

const ss = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  screenTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  screenSub:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  badgeWrap:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.success + '44' },
  badgeText:        { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.success, includeFontPadding: false },
  scroll:           { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  heroBanner:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', marginBottom: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  heroIconWrap:     { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  heroTitle:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  heroSub:          { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  statsRow:         { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard:         { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, alignItems: 'center', gap: 5 },
  statLabel:        { fontSize: 9, fontWeight: FontWeight.bold, textAlign: 'center', includeFontPadding: false, lineHeight: 13 },
  dateBanner:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  dateText:         { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  section:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm, overflow: 'hidden' },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  sectionIconWrap:  { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionTitle:     { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionBody:      { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, paddingTop: 2 },
  subsection:       { gap: 5, marginBottom: Spacing.md },
  subsectionTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  bodyText:         { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22, includeFontPadding: false },
  footer:           { alignItems: 'center', gap: 5, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.primary + '44', marginTop: Spacing.lg },
  footerIconRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  footerTitle:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  footerText:       { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});
