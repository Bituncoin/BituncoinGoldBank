// BTNG Gold Coin — Terms of Service
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
const MERCHANT_ID    = '248059';
const BUNDLE_ID      = 'com.bituncoin.btng';

const SECTIONS = [
  {
    id: '1',
    icon: 'gavel' as const,
    color: Colors.primary,
    title: '1. Acceptance of Terms',
    body: `Welcome to BTNG Gold Coin, operated by ${COMPANY} ("BTNG", "we", "us", "our"), a company registered under the Ghana Companies Act 992 (Reg. ${REG_NO}, TIN ${TIN}), incorporated on ${EFFECTIVE_DATE}.

By downloading, installing, or using the BTNG Gold Coin application (${BUNDLE_ID}), website (${WEBSITE}), or any related services (collectively, the "Platform"), you ("User", "you") agree to be legally bound by these Terms of Service ("Terms").

If you do not agree to these Terms in their entirety, you must immediately cease all use of the Platform and uninstall the application.

These Terms govern your use of all features including, but not limited to: Spot Trading, P2P Marketplace, Copy Trading, Binary Trading, Practice Wallet, BTNG Genesis Wallet, MTN MoMo Cash Rail, Block Explorer, Certificate Scanner, KYC Verification, Referral System, and Admin Dashboard.`,
  },
  {
    id: '2',
    icon: 'person-outline' as const,
    color: '#3B82F6',
    title: '2. Eligibility & Account Registration',
    body: `Eligibility Requirements
• You must be at least 18 years of age
• You must have full legal capacity to enter into binding contracts
• You must not be a citizen or resident of a jurisdiction where cryptocurrency trading is prohibited
• You must not be on any sanctions list (OFAC, UN, EU, or Ghana FIC)
• You must not have previously had a BTNG account terminated for violations

Account Registration
• You agree to provide accurate, current, and complete information during registration
• You are responsible for maintaining the confidentiality of your login credentials
• You must notify us immediately at ${EMAIL} if you suspect unauthorized account access
• One (1) account per person — creating multiple accounts to circumvent restrictions is prohibited
• BTNG reserves the right to reject any registration at its sole discretion

KYC Verification
• Full platform features require successful completion of Know Your Customer (KYC) verification
• You agree to submit genuine, unaltered identity documents
• Submission of falsified documents is a criminal offense under Ghanaian law and may be reported to authorities
• NON-KYC access is limited to basic wallet and viewing features as defined by BTNG policy`,
  },
  {
    id: '3',
    icon: 'account-balance-wallet' as const,
    color: Colors.primary,
    title: '3. BTNG Gold Coin & Wallet',
    subsections: [
      {
        subtitle: '3.1 BTNG Gold Coin (BTNGG)',
        text: `BTNG Gold Coin (ticker: BTNGG) is a digital asset developed and issued by EKUYE DIGITAL GATEWAY TRUST LTD. BTNGG is represented as being gold-backed with reference to physical gold held at the Bank of Ghana Vault 001, Accra.

Important Disclaimers:
• BTNGG is a digital representation and is NOT a government-issued currency or legal tender
• The gold-backing representation is based on BTNG's internal reserves and oracle data — it is not independently audited unless otherwise stated
• BTNG does not guarantee any specific exchange rate or value for BTNGG at any time
• Holding BTNGG does not constitute ownership of physical gold unless expressly confirmed via an Equity Certificate issued by BTNG`,
      },
      {
        subtitle: '3.2 Genesis Wallet',
        text: `• The BTNG Genesis Wallet uses BIP-39 HD key derivation to generate wallet addresses
• Your 12-word recovery phrase is generated on-device and stored in your device's secure enclave
• BTNG does NOT store, transmit, or have access to your recovery phrase or private keys
• Loss of your recovery phrase results in permanent, irrecoverable loss of wallet access — BTNG cannot assist
• You are solely responsible for backing up and securing your recovery phrase
• BTNG is not liable for any loss of funds arising from loss, theft, or compromise of your recovery phrase or device`,
      },
      {
        subtitle: '3.3 Wallet Transactions',
        text: `• Blockchain transactions are irreversible once broadcast to the network
• BTNG is not liable for transactions sent to incorrect addresses
• Network fees (gas/transaction fees) are determined by the network and may change without notice
• Transaction confirmations depend on network congestion and are outside BTNG's control`,
      },
    ],
  },
  {
    id: '4',
    icon: 'swap-horiz' as const,
    color: '#22C55E',
    title: '4. Trading Services',
    subsections: [
      {
        subtitle: '4.1 Spot Trading',
        text: `• Spot trading is available for KYC-verified users
• All trades are executed at market price or as limit orders — BTNG does not guarantee fill prices
• A trading fee of 0.1% applies to all executed spot orders (subject to change with notice)
• BTNG reserves the right to cancel or reverse orders suspected of market manipulation`,
      },
      {
        subtitle: '4.2 P2P Marketplace',
        text: `• P2P trading occurs directly between users — BTNG acts only as an escrow intermediary
• BTNG does not guarantee the identity, reputation, or reliability of P2P counterparties
• Disputes between P2P parties must be submitted through the in-app dispute resolution system
• Payment proof must be submitted within the time window specified on each P2P order
• BTNG reserves the right to adjudicate disputes and release escrow funds at its sole discretion`,
      },
      {
        subtitle: '4.3 Copy Trading',
        text: `• Copy trading allows you to mirror the trades of other users ("Traders")
• Past performance of any Trader does not guarantee future results
• BTNG does not vet, endorse, or guarantee the trading strategy of any Trader
• You assume full financial risk when activating copy trading on any Trader profile
• Copy trading fees and profit-sharing percentages are displayed per Trader profile`,
      },
      {
        subtitle: '4.4 Binary Trading',
        text: `• Binary trading involves high risk of capital loss — you may lose your entire position
• Binary options are speculative instruments and are restricted or prohibited in certain jurisdictions
• You confirm that binary trading is legal in your jurisdiction before using this feature
• BTNG's binary trading is provided for educational and entertainment purposes — it is a simulated instrument on the BTNG platform and does not constitute regulated financial advice`,
      },
      {
        subtitle: '4.5 Practice Wallet',
        text: `• The Practice Wallet uses virtual funds with no real monetary value
• Profits or losses in the Practice Wallet cannot be converted to real funds
• Practice Wallet is provided for educational purposes to familiarize users with trading interfaces`,
      },
    ],
  },
  {
    id: '5',
    icon: 'payment' as const,
    color: Colors.warning,
    title: '5. Payments & Cash Rail (MTN MoMo)',
    body: `MTN MoMo Cash Rail
BTNG operates an MTN Mobile Money payment rail under Merchant ID ${MERCHANT_ID}. By initiating a Cash Rail transaction, you authorize BTNG to process your payment via MTN Mobile Money on your behalf.

• You must ensure sufficient MoMo balance before initiating transactions
• Transaction fees may apply per MTN MoMo's standard tariffs
• BTNG is not responsible for delays caused by MTN network outages
• Refunds for erroneous MoMo transactions are subject to MTN's refund policy

Deposits & Withdrawals
• Deposits are processed after network confirmation requirements are met
• Withdrawal requests are processed within 1–3 business days
• Minimum and maximum withdrawal limits are displayed within the Platform
• BTNG reserves the right to delay or block withdrawals pending AML review
• Unauthorized withdrawal requests should be reported immediately to ${EMAIL}

BTNG Gold Card
• BTNG Gold Cards are virtual payment instruments linked to your BTNG wallet balance
• Card usage is subject to the card terms displayed in the BTNG Card section of the app
• BTNG Gold Cards are not issued by any bank and do not constitute a regulated payment instrument under current Ghanaian law unless expressly licensed`,
  },
  {
    id: '6',
    icon: 'warning' as const,
    color: Colors.error,
    title: '6. Crypto & Financial Risk Disclosures',
    body: `IMPORTANT — PLEASE READ CAREFULLY

Cryptocurrency Risk
• Cryptocurrency values are highly volatile and can decrease to zero
• You may lose all money invested in cryptocurrency assets
• Past price performance is not indicative of future results
• BTNG Gold Coin does not provide investment advice
• Nothing on this Platform constitutes financial, legal, or tax advice

Regulatory Risk
• Cryptocurrency regulations vary by jurisdiction and may change without notice
• It is your responsibility to ensure compliance with applicable laws in your country
• BTNG is not responsible for losses arising from regulatory changes

Operational Risk
• Blockchain networks may experience congestion, forks, or technical failures
• Smart contract vulnerabilities may result in loss of funds
• BTNG systems may experience downtime for maintenance or due to unforeseen issues

No Investment Advice
• BTNG does not provide investment, financial, tax, or legal advice
• The BTNG AI Private Banker provides informational content only — it is not a licensed financial advisor
• You should consult a licensed financial advisor before making investment decisions

Limitation of Liability
• TO THE MAXIMUM EXTENT PERMITTED BY LAW, BTNG'S TOTAL LIABILITY FOR ANY CLAIM ARISING FROM USE OF THE PLATFORM SHALL NOT EXCEED THE FEES PAID BY YOU TO BTNG IN THE 30 DAYS PRECEDING THE CLAIM
• BTNG is not liable for: indirect, incidental, special, consequential, or punitive damages; loss of profits; loss of data; loss of cryptocurrency assets due to user error, network failure, or third-party attack`,
  },
  {
    id: '7',
    icon: 'verified-user' as const,
    color: '#3B82F6',
    title: '7. KYC, AML & Compliance',
    body: `BTNG operates in compliance with the following Ghanaian and international frameworks:
• Ghana Anti-Money Laundering Act (Act 749)
• Financial Intelligence Centre Act (Act 658)
• Bank of Ghana Payment Systems & Services Act (Act 987)
• FATF Recommendations for Virtual Asset Service Providers (VASPs)

By using the Platform, you agree:
• To complete KYC verification as required
• To not use the Platform for money laundering, terrorist financing, or sanctions evasion
• To not process proceeds of crime through BTNG
• That BTNG may monitor and report suspicious transactions to the Financial Intelligence Centre
• That BTNG may freeze or close accounts suspected of illegal activity
• That BTNG may share information with law enforcement under a valid legal order

Enhanced Due Diligence (EDD) may be required for high-value transactions or users from high-risk jurisdictions.`,
  },
  {
    id: '8',
    icon: 'people' as const,
    color: '#22C55E',
    title: '8. Referral Program',
    body: `BTNG operates a referral program that rewards users for inviting new members to the Platform.

Referral Terms
• Referral commissions are calculated as a percentage of trading fees generated by referred users
• Standard referral rate: 2% of trading fees (subject to change with notice)
• Referral earnings are credited to your BTNG wallet and may be withdrawn
• Referral links may not be used in spam, misleading advertising, or fake accounts

Prohibited Referral Activities
• Self-referral (creating fake accounts to generate referral bonuses) is strictly prohibited
• Wash trading or artificial volume generation to boost referral earnings is prohibited
• Violations may result in forfeiture of all earned referral commissions and account termination

BTNG reserves the right to modify, suspend, or terminate the referral program at any time with notice.`,
  },
  {
    id: '9',
    icon: 'description' as const,
    color: Colors.primary,
    title: '9. Equity Certificates & Sovereign Documents',
    body: `BTNG issues digital Equity Certificates and Sovereign Documents as proof of asset ownership and identity on the BTNG blockchain.

Certificate Validity
• Equity Certificates are issued solely by BTNG and are valid only within the BTNG ecosystem unless otherwise stated
• Certificates are subject to expiry and renewal as specified at issuance
• BTNG does not guarantee recognition of Certificates by third parties, financial institutions, or government agencies outside the BTNG ecosystem

Certificate Verification
• Certificates can be verified via the BTNG Certificate Scanner using the QR code or Certificate ID
• Certificate fingerprints are stored on the BTNG blockchain for tamper-evident verification
• Fraudulent certificate claims or misrepresentation is a violation of these Terms and may be reported to authorities

Equity Grades
• Equity Certificates are graded A–Z based on verified asset value and KYC status
• Grades are assigned by BTNG's automated pipeline and may be reviewed upon request`,
  },
  {
    id: '10',
    icon: 'public' as const,
    color: '#22C55E',
    title: '10. AfCFTA & Cross-Border Operations',
    body: `BTNG is designed to support trade and financial inclusion across all 54 African nations under the African Continental Free Trade Area (AfCFTA) framework.

Cross-Border Transactions
• BTNG enables cross-border value transfer across AfCFTA member states
• Cross-border transactions are subject to applicable national and regional regulations
• Users are responsible for ensuring compliance with the laws of their home country
• BTNG does not guarantee that its services are legal or appropriate in every jurisdiction

Regulatory Compliance by Jurisdiction
• GHANA: Operated under Bank of Ghana oversight framework for digital asset services
• OTHER AFRICAN NATIONS: Users must comply with local financial regulations
• GLOBAL DIASPORA: Users outside Africa must comply with their local cryptocurrency laws

BTNG reserves the right to restrict or disable services in any jurisdiction where regulation requires it.`,
  },
  {
    id: '11',
    icon: 'block' as const,
    color: Colors.error,
    title: '11. Prohibited Activities',
    body: `The following activities are strictly prohibited on the BTNG Platform:

Financial Crime
• Money laundering, terrorist financing, or sanctions evasion
• Processing proceeds of criminal activity
• Creating fake transactions to appear as legitimate volume (wash trading)

Account Abuse
• Creating multiple accounts to bypass restrictions or earn unauthorized bonuses
• Sharing account credentials with third parties
• Impersonating BTNG staff, other users, or any entity

Technical Abuse
• Attempting to reverse engineer, decompile, or hack the BTNG application
• Deploying bots, scrapers, or automated scripts without written authorization
• Conducting denial-of-service attacks against BTNG infrastructure
• Attempting to exploit bugs or vulnerabilities (report responsibly to ${EMAIL})

Content Violations
• Publishing false, defamatory, or misleading content on the Platform
• Using the Platform for unauthorized commercial promotion or spam

Violation of these prohibitions may result in immediate account suspension, forfeiture of funds subject to legal process, and referral to law enforcement authorities.`,
  },
  {
    id: '12',
    icon: 'copyright' as const,
    color: Colors.primary,
    title: '12. Intellectual Property',
    body: `All content, code, design, branding, trademarks, and intellectual property on the BTNG Platform are owned by ${COMPANY} or licensed to BTNG.

You are granted a limited, non-exclusive, non-transferable, revocable license to use the Platform solely for your personal financial management purposes.

You may NOT:
• Copy, reproduce, distribute, or create derivative works from BTNG's code or content
• Use BTNG's name, logo, or trademarks without written permission
• Resell, sublicense, or commercially exploit any part of the Platform
• Claim ownership of any BTNG-generated certificates, wallet interfaces, or design elements

The BTNG SDK (Bituncoin Universal License 1.0) is available for authorized third-party developers under a separate license agreement. Contact ${EMAIL} for SDK licensing inquiries.`,
  },
  {
    id: '13',
    icon: 'gavel' as const,
    color: '#3B82F6',
    title: '13. Governing Law & Dispute Resolution',
    body: `Governing Law
These Terms are governed by and construed in accordance with the laws of the Republic of Ghana, without regard to conflict of law principles.

Jurisdiction
You agree to submit to the exclusive jurisdiction of the courts of Ghana for any disputes arising from or relating to these Terms or your use of the Platform.

Dispute Resolution Process
1. Informal Resolution: Contact ${EMAIL} with a written description of your complaint. BTNG will endeavor to resolve disputes informally within 30 days.

2. Mediation: If informal resolution fails, disputes may be referred to mediation under the Alternative Dispute Resolution Act, 2010 (Act 798) of Ghana.

3. Arbitration: Unresolved disputes shall be submitted to binding arbitration administered by the Ghana Arbitration Centre (GAC) in accordance with its rules.

4. Litigation: Only if arbitration fails or is unavailable, disputes may be brought before the High Court of Ghana (Commercial Division).

Class Action Waiver
You waive your right to participate in class action lawsuits or class-wide arbitration against BTNG.`,
  },
  {
    id: '14',
    icon: 'update' as const,
    color: Colors.primary,
    title: '14. Amendments & Termination',
    body: `Amendments
BTNG reserves the right to modify these Terms at any time. Material changes will be communicated via:
• In-app notification at next login
• Email to your registered address
• Updated "Last Updated" date on this page

Continued use of the Platform after the effective date of changes constitutes acceptance. If you disagree with changes, you must cease using the Platform and request account closure.

Account Termination by User
You may close your account at any time by contacting ${EMAIL}. Pending transactions must be resolved before account closure. Account balances must be withdrawn prior to closure.

Account Termination by BTNG
BTNG may suspend or terminate your account with or without notice for:
• Violation of these Terms
• Suspected fraud or money laundering
• Regulatory requirement or court order
• Prolonged inactivity (12+ months with zero balance)

Upon termination, your license to use the Platform is revoked. Sections 6, 7, 12, and 13 survive termination.`,
  },
  {
    id: '15',
    icon: 'email' as const,
    color: Colors.primary,
    title: '15. Contact Information',
    body: `For all inquiries, support requests, or legal notices:

${COMPANY}
Registration: ${REG_NO} · TIN: ${TIN}
Ghana Companies Act 992 · Incorporated ${EFFECTIVE_DATE}
Republic of Ghana, West Africa

Platform Contact
Email: ${EMAIL}
Website: ${WEBSITE}
App Bundle: ${BUNDLE_ID}
Merchant ID (MTN MoMo): ${MERCHANT_ID}

John Kojo Zi — Founder & Lead Architect
info@bituncoin.io

For legal service of process, please address correspondence to the above company at its registered office in Ghana and send a digital copy to ${EMAIL}.

BTNG Gold Coin v2.0.0 — Ghana & 54 Africa Nations`,
  },
];

// ── Expandable section ─────────────────────────────────────────────────────────
function TermsSection({ section }: { section: typeof SECTIONS[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={ts.section}>
      <TouchableOpacity style={ts.sectionHeader} onPress={() => setOpen(v => !v)} activeOpacity={0.75}>
        <View style={[ts.sectionIconWrap, { backgroundColor: section.color + '18', borderColor: section.color + '44' }]}>
          <MaterialIcons name={section.icon} size={16} color={section.color} />
        </View>
        <Text style={ts.sectionTitle}>{section.title}</Text>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color={Colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={ts.sectionBody}>
          {'subsections' in section && section.subsections ? (
            section.subsections.map(sub => (
              <View key={sub.subtitle} style={ts.subsection}>
                <Text style={[ts.subsectionTitle, { color: section.color }]}>{sub.subtitle}</Text>
                <Text style={ts.bodyText}>{sub.text}</Text>
              </View>
            ))
          ) : (
            <Text style={ts.bodyText}>{(section as any).body}</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[ts.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={ts.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={ts.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={ts.screenTitle}>Terms of Service</Text>
          <Text style={ts.screenSub}>Last Updated: {LAST_UPDATED}</Text>
        </View>
        <View style={ts.badgeWrap}>
          <MaterialIcons name="gavel" size={14} color={Colors.warning} />
          <Text style={ts.badgeText}>Legal</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ts.scroll}>

        {/* Hero banner */}
        <View style={ts.heroBanner}>
          <View style={ts.heroIconWrap}>
            <MaterialIcons name="balance" size={32} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ts.heroTitle}>Terms of Service</Text>
            <Text style={ts.heroSub}>{COMPANY}</Text>
            <Text style={ts.heroSub}>Reg. {REG_NO} · Ghana</Text>
          </View>
        </View>

        {/* Key highlights */}
        <View style={ts.highlightsCard}>
          <Text style={ts.highlightsTitle}>Key Highlights</Text>
          {[
            { icon: 'warning' as const, color: Colors.error, text: 'Cryptocurrency is high risk — you may lose all invested funds' },
            { icon: 'verified-user' as const, color: '#3B82F6', text: 'KYC verification required for full platform access' },
            { icon: 'lock' as const, color: '#22C55E', text: 'Keep your recovery phrase safe — BTNG cannot recover lost wallets' },
            { icon: 'public' as const, color: Colors.primary, text: 'Governed by Ghanaian law · AfCFTA · 54 African nations' },
            { icon: 'gavel' as const, color: Colors.warning, text: 'Disputes resolved under Ghana Arbitration Centre rules' },
          ].map(h => (
            <View key={h.text} style={ts.highlightRow}>
              <View style={[ts.highlightIcon, { backgroundColor: h.color + '18', borderColor: h.color + '44' }]}>
                <MaterialIcons name={h.icon} size={14} color={h.color} />
              </View>
              <Text style={ts.highlightText}>{h.text}</Text>
            </View>
          ))}
        </View>

        {/* Effective date */}
        <View style={ts.dateBanner}>
          <MaterialIcons name="calendar-today" size={13} color={Colors.textMuted} />
          <Text style={ts.dateText}>Effective: {EFFECTIVE_DATE} · Last Updated: {LAST_UPDATED}</Text>
        </View>

        {/* Expandable sections */}
        {SECTIONS.map(s => <TermsSection key={s.id} section={s} />)}

        {/* Footer */}
        <View style={ts.footer}>
          <View style={ts.footerIconRow}>
            <MaterialIcons name="verified" size={16} color={Colors.primary} />
            <Text style={ts.footerTitle}>BTNG Gold Coin</Text>
          </View>
          <Text style={ts.footerText}>{COMPANY}</Text>
          <Text style={ts.footerText}>Reg. {REG_NO} · TIN {TIN}</Text>
          <Text style={[ts.footerText, { color: Colors.primary }]}>{EMAIL}</Text>
          <Text style={ts.footerText}>{WEBSITE}</Text>
          <Text style={ts.footerText}>Ghana · West Africa · 54 African Nations</Text>
          <View style={ts.legalNote}>
            <MaterialIcons name="info-outline" size={12} color={Colors.textMuted} />
            <Text style={ts.legalNoteText}>
              These Terms do not constitute financial or legal advice. Consult a licensed advisor for personal guidance.
            </Text>
          </View>
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

const ts = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  screenTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  screenSub:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 2 },
  badgeWrap:        { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.warning + '44' },
  badgeText:        { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  scroll:           { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  heroBanner:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', marginBottom: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  heroIconWrap:     { width: 60, height: 60, borderRadius: 18, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  heroTitle:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  heroSub:          { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  highlightsCard:   { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm, marginBottom: Spacing.md },
  highlightsTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 4, includeFontPadding: false },
  highlightRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  highlightIcon:    { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  highlightText:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
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
  legalNote:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.sm },
  legalNoteText:    { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16, includeFontPadding: false },
});
