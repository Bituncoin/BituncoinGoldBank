/**
 * BTNG Developer Library & Code Management Center
 * Authorized: John Kojo Zi — BTNG Admin Team Developer Technician
 * Bituncoin Gold Bank · EKUYE DIGITAL GATEWAY TRUST LTD
 * Reg. CS099020624 · TIN C0064220206 · Ghana Companies Act 992
 */
import React, { useState, useCallback, Component } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, KeyboardAvoidingView, Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// ─── Error Boundary ────────────────────────────────────────────────────────────
class DevErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(e: any) {
    return { hasError: true, error: String(e?.message ?? e) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <MaterialIcons name="bug-report" size={48} color={Colors.error} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: Colors.textPrimary }}>Developer Section Error</Text>
          <Text style={{ fontSize: 13, color: Colors.textMuted, textAlign: 'center' }}>{this.state.error}</Text>
          <TouchableOpacity
            style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
            onPress={() => this.setState({ hasError: false, error: '' })}
          >
            <Text style={{ color: Colors.bg, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEV_NAME  = 'John Kojo Zi';
const DEV_TITLE = 'Lead Developer & Bank Manager · Bituncoin Gold Bank';
const BACKEND_URL = 'https://mebznlvyycuuddfkmebz.backend.onspace.ai';

type DevTab = 'overview' | 'documents' | 'codebase' | 'api' | 'database' | 'changelog' | 'snippets' | 'notes';

// ─── Platform Documents ───────────────────────────────────────────────────────
interface PlatformDoc {
  id: string;
  category: string;
  title: string;
  type: 'PDF' | 'Legal' | 'Technical' | 'Financial' | 'Sovereign' | 'SDK' | 'Policy' | 'Infrastructure';
  status: 'live' | 'beta' | 'draft';
  icon: string;
  color: string;
  version: string;
  lastUpdated: string;
  description: string;
  content: string;
  route?: string;
}

const PLATFORM_DOCS: PlatformDoc[] = [
  // ── Legal & Corporate ──
  {
    id: 'legal-001', category: 'Legal & Corporate',
    title: 'Company Registration Certificate',
    type: 'Legal', status: 'live', icon: 'business', color: '#3B82F6',
    version: 'CS099020624', lastUpdated: '2024-06-24',
    description: 'EKUYE DIGITAL GATEWAY TRUST LTD incorporation certificate under Ghana Companies Act 992.',
    content: `EKUYE DIGITAL GATEWAY TRUST LTD
Registration Number: CS099020624
TIN: C0064220206
Incorporated: 24 June 2024
Jurisdiction: Republic of Ghana
Act: Ghana Companies Act 992

Registered Address: Ghana, West Africa
Principal Activity: Digital Asset Banking, Cryptocurrency Exchange, Sovereign Financial Infrastructure

Directors: John Kojo Zi — Founder & Lead Architect
Legal Status: Active, In Good Standing
Regulatory Status: VASP Framework Compliance (In Progress)`,
  },
  {
    id: 'legal-002', category: 'Legal & Corporate',
    title: 'Privacy Policy — Ghana Act 843',
    type: 'Legal', status: 'live', icon: 'privacy-tip', color: '#3B82F6',
    version: 'v2.0', lastUpdated: '2026-05-01',
    description: 'Full 12-section privacy policy compliant with Ghana Data Protection Act 843.',
    content: 'Complete privacy policy governing data collection, processing, storage, and user rights under Ghana Act 843. Covers KYC data, transaction records, biometric data, third-party sharing, and international data transfers.',
    route: '/privacy-policy',
  },
  {
    id: 'legal-003', category: 'Legal & Corporate',
    title: 'Terms of Service — 15 Sections',
    type: 'Legal', status: 'live', icon: 'gavel', color: '#3B82F6',
    version: 'v2.0', lastUpdated: '2026-05-01',
    description: '15-section ToS covering trading rules, risk disclosures, liability limits, and dispute resolution.',
    content: 'Complete terms of service covering: Account Registration, Eligibility, Prohibited Activities, Trading Rules, Fees & Charges, Deposits & Withdrawals, KYC Requirements, Risk Disclosure, Intellectual Property, Limitation of Liability, Indemnification, Termination, Governing Law (Ghana), Dispute Resolution, Amendments.',
    route: '/terms',
  },
  {
    id: 'legal-004', category: 'Legal & Corporate',
    title: 'BTNG Bituncoin Universal License 1.0',
    type: 'SDK', status: 'live', icon: 'verified', color: '#22C55E',
    version: 'UBL-1.0', lastUpdated: '2026-02-18',
    description: 'UBL-1.0 — Software license for BTNG SDK, APIs, and sovereign blockchain infrastructure.',
    content: `BTNG BITUNCOIN UNIVERSAL LICENSE 1.0 (UBL-1.0)

Copyright (c) 2024–2026 EKUYE DIGITAL GATEWAY TRUST LTD
Reg. CS099020624 · TIN C0064220206 · Ghana

GRANT OF LICENSE:
Subject to the terms, EKUYE DIGITAL GATEWAY TRUST LTD grants a worldwide, royalty-free, non-exclusive license to use, reproduce, modify, and distribute this software and its documentation.

RESTRICTIONS:
- Must not be used for unlawful activities
- Must not impersonate BTNG or EKUYE systems
- Must retain this copyright notice in all copies
- Commercial use requires written consent from info@bituncoin.io

SOVEREIGN CLAUSE:
This software includes sovereign financial infrastructure components. All BTNG transaction signing, wallet generation, and blockchain operations remain property of EKUYE DIGITAL GATEWAY TRUST LTD.

Contact: info@bituncoin.io | www.bituncoin.io`,
    route: '/btng-sdk',
  },

  // ── Sovereign & Blockchain ──
  {
    id: 'sov-001', category: 'Sovereign Blockchain',
    title: 'BTNG Genesis Block — Chain Certificate',
    type: 'Sovereign', status: 'live', icon: 'link', color: '#D4A017',
    version: 'Block #0', lastUpdated: '2026-02-18',
    description: 'Genesis block certificate. BTNG-MAINNET launched 18 February 2026, Accra Ghana.',
    content: `BTNG GENESIS BLOCK CERTIFICATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Chain ID:       BTNG-MAINNET
Block:          #0 (Genesis)
Timestamp:      2026-02-18T00:00:00Z
Location:       Accra, Ghana, West Africa
Miner:          John Kojo Zi (Founder)
Hash:           0x00000000BTNG2026GENESIS...
Nonce:          0
Difficulty:     1
Reward:         500,000,000 BTNGG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Node:           168.231.79.52:64799
Hostname:       srv1282934.hstgr.cloud
IPv6:           2a02:4780:f:bc::1
Protocol:       BTNG/1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gold Reserve:   500kg · Bank of Ghana Vault 001
BTNGG Price:    Pegged to 1/1000 oz XAU
Jurisdiction:   Republic of Ghana`,
    route: '/btng-explorer',
  },
  {
    id: 'sov-002', category: 'Sovereign Blockchain',
    title: 'BTNG Gold Reserve Certificate — 500kg',
    type: 'Sovereign', status: 'live', icon: 'account-balance', color: '#D4A017',
    version: 'RSV-2026-001', lastUpdated: '2026-02-18',
    description: 'Official 500kg gold reserve certificate backing BTNGG tokens. Bank of Ghana Vault 001.',
    content: `BTNG GOLD RESERVE CERTIFICATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Certificate ID:  RSV-2026-001
Asset Type:      Physical Gold (XAU)
Weight:          500 kilograms
Purity:          99.99% fine gold
Location:        Bank of Ghana Vault 001
                 Accra, Ghana, West Africa
Custody Date:    18 February 2026
Custodian:       Bank of Ghana (BoG)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BTNGG Peg:       1 BTNGG = 1/1000 oz XAU
Reserve Ratio:   100% (fully backed)
Audit Frequency: Quarterly
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trustee:         EKUYE DIGITAL GATEWAY TRUST LTD
Policy Code:     BTNG-RSV-POL-001`,
    route: '/btng-proof-of-value',
  },
  {
    id: 'sov-003', category: 'Sovereign Blockchain',
    title: 'BTNG Proof of Value — Official Document',
    type: 'Sovereign', status: 'live', icon: 'workspace-premium', color: '#D4A017',
    version: 'POV-2026', lastUpdated: '2026-06-01',
    description: 'Full Proof of Value document. Node specs, gold reserve, governance, and network topology.',
    content: 'Complete sovereign proof of value document covering: BTNG chain identity, network infrastructure (IPv4/IPv6 dual-stack), gold reserve backing, governance structure, token economics, BTNGG pricing model, API endpoints, and sovereign compliance framework.',
    route: '/btng-proof-of-value',
  },
  {
    id: 'sov-004', category: 'Sovereign Blockchain',
    title: 'BTNG Governance Charter',
    type: 'Sovereign', status: 'live', icon: 'policy', color: '#D4A017',
    version: 'v1.2', lastUpdated: '2026-04-01',
    description: 'Governance rules, voting weights, consensus mechanism, and upgrade process for BTNG chain.',
    content: 'BTNG Governance Charter covering: Consensus Mechanism (PoA), Governance Council, Voting Procedures, Protocol Upgrade Process, Treasury Management, Emergency Procedures, Community Participation, Dispute Resolution, and Amendment Process.',
    route: '/btng-governance',
  },

  // ── Technical Infrastructure ──
  {
    id: 'tech-001', category: 'Technical Infrastructure',
    title: 'BTNG Node Deployment Guide',
    type: 'Technical', status: 'live', icon: 'hub', color: '#22C55E',
    version: 'v1.3', lastUpdated: '2026-05-15',
    description: 'Complete VPS deployment guide for BTNG sovereign node on Hostinger/srv1282934.hstgr.cloud.',
    content: `BTNG NODE DEPLOYMENT GUIDE v1.3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Server: srv1282934.hstgr.cloud
IPv4:   168.231.79.52:64799
IPv6:   2a02:4780:f:bc::1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTALLATION:
1. ssh root@168.231.79.52
2. mkdir -p /opt/btng-node
3. npm install express cors
4. Copy btng-node-server.js → /opt/btng-node/server.js
5. pm2 start server.js --name btng-node
6. ufw allow 64799/tcp
7. pm2 save && pm2 startup

VERIFY:
curl http://168.231.79.52:64799/api/v1/stats

PM2 COMMANDS:
pm2 status btng-node
pm2 logs btng-node --lines 20
pm2 restart btng-node`,
    route: '/btng-deploy',
  },
  {
    id: 'tech-002', category: 'Technical Infrastructure',
    title: 'BTNG A.I.A Engine v1.0 — Architecture',
    type: 'Technical', status: 'live', icon: 'memory', color: '#9945FF',
    version: 'v1.0', lastUpdated: '2026-06-01',
    description: 'A.I.A Engine source architecture: VaultCore, MemorySpine, AfricaEngine, PrivateBanker.',
    content: `A.I.A ENGINE v1.0 — MASTER ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1: MEMORY SPINE
• VaultCore: AES-256-GCM encryption (aes_gcm)
• EncryptedLibraryBox (L1): Base64 + AES encrypted append-only log
• EncryptedReserveCenter (L2): Batch archive with full encryption

PART 2: ASSET & LEDGER
• BTNGGold, BTNGSavings, BTNGChecking, BTNGCredit
• BTNGLedger: deposit_savings, withdraw_checking, transfer_gold

PART 3: BRAINSTEM & COGNITION
• AfricaEngine: Orchestrator (library + reserve + online state)
• ECPU: Transaction validation & routing
• EGPU: Pattern analysis & anomaly detection
• PrivateBanker: Risk evaluation + transaction advisory

RISK LEVELS:
< $1,000  → LOW
$1,000–$5,000 → MEDIUM
> $5,000  → HIGH

Target: Portable Flash-Drive Deployment (Rust/WASM)`,
  },
  {
    id: 'tech-003', category: 'Technical Infrastructure',
    title: 'BTNG3 Wallet Technical Spec',
    type: 'Technical', status: 'live', icon: 'account-balance-wallet', color: '#22C55E',
    version: 'v1.0', lastUpdated: '2026-03-01',
    description: 'BTNG3 wallet: secp256k1 keypair, Base58Check address format, SecureStore key management.',
    content: `BTNG3 WALLET TECHNICAL SPECIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Algorithm:      secp256k1 (same as Bitcoin)
Address:        35-character Base58Check
Format:         Version byte + Public key hash + Checksum

ADDRESS GENERATION:
1. Generate secp256k1 keypair
2. SHA-256 + RIPEMD-160 hash of public key
3. Prepend version byte (0x01 = Personal, 0x02 = Commercial)
4. Double SHA-256 for 4-byte checksum
5. Base58 encode → 35-char address

SECURITY:
• Private keys stored in Expo SecureStore
• Never transmitted to backend
• Keys encrypted with device keychain

NETWORK TYPES:
0x0000 = BTNG MainNet
0x0001 = BTNG TestNet
0x0002 = BTNG RegNet`,
    route: '/btng3-wallet',
  },
  {
    id: 'tech-004', category: 'Technical Infrastructure',
    title: 'Backend API — OnSpace Cloud Endpoints',
    type: 'Technical', status: 'live', icon: 'api', color: '#3B82F6',
    version: 'v2.0', lastUpdated: '2026-06-02',
    description: 'Complete REST API reference for all OnSpace Cloud/Supabase endpoints and Edge Functions.',
    content: `BTNG BACKEND API REFERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Base URL: ${BACKEND_URL}

EDGE FUNCTIONS:
POST /functions/v1/gold-oracle          → Live XAU/USD price + BTNGG
POST /functions/v1/coingecko-prices     → BTC/ETH/BNB/SOL live prices
POST /functions/v1/btng-terminal        → Live order book depth
POST /functions/v1/btng-pay-gateway     → Process BTNG payments
POST /functions/v1/btng-wallet-generate → Generate BTNG3 wallet
GET  /functions/v1/btng-reserve-status  → Chain reserve stats
POST /functions/v1/send-otp-email       → Send OTP code
POST /functions/v1/verify-otp-email     → Verify OTP
POST /functions/v1/btng-support-chat    → AI support chat
POST /functions/v1/send-statement-email → Email statement

DATABASE TABLES: 27 tables with RLS enabled
AUTH: Email OTP + Password hybrid
STORAGE: avatars (5MB), kyc-documents (10MB)`,
  },

  // ── Financial & Payment ──
  {
    id: 'fin-001', category: 'Financial & Payment',
    title: 'MTN MoMo Merchant Credentials',
    type: 'Financial', status: 'live', icon: 'cell-tower', color: '#F59E0B',
    version: 'v1.0', lastUpdated: '2026-04-20',
    description: 'MTN Ghana Mobile Money merchant integration credentials for BTNG Cash Rail.',
    content: `MTN MOMO MERCHANT CREDENTIALS — BTNG CASH RAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Merchant ID:    248059
MSISDN:         +233540418537
Local Number:   054 041 8537
Dial Code:      *170#
Network:        MTN Ghana
Currency:       GHS (Ghana Cedis)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Company:        EKUYE DIGITAL GATEWAY TRUST LTD
Reg. No.:       CS099020624
TIN:            C0064220206
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Integration:    Cash Rail v1.3 (app/cash-rail.tsx)
Hook:           hooks/useCashRail.ts
Service:        services/cashRailService.ts`,
    route: '/cash-rail',
  },
  {
    id: 'fin-002', category: 'Financial & Payment',
    title: 'BTNG Pay Gateway — Payment Protocol',
    type: 'Financial', status: 'live', icon: 'payments', color: '#22C55E',
    version: 'v2.0', lastUpdated: '2026-05-18',
    description: 'BTNG Pay sovereign payment gateway protocol. UCAF signing, merchant transfer, settlement.',
    content: `BTNG PAY GATEWAY PROTOCOL v2.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Chain ID:       BTNG-MAINNET
Channel:        BTNG_PAY_GATEWAY
Currency:       BTNGG (Bituncoin Gold)
Unit:           Satoshi (1 BTNGG = 100,000,000 satoshi)
Anchor:         BTNG-GOLD (gold price oracle)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSACTION FIELDS:
• reference: Unique transaction ID
• amount_satoshi: Amount in satoshi
• sender_wallet / recipient_wallet
• ucaf: Unique Card Authentication Field
• signature: ES256 transaction signature
• public_key: Sender's public key
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SETTLEMENT:
• gold_price_usd: Oracle price
• btng_usd: BTNGG spot price
• usd_equivalent + ghs_equivalent`,
    route: '/btng-pay',
  },
  {
    id: 'fin-003', category: 'Financial & Payment',
    title: 'BTNG Token Economics',
    type: 'Financial', status: 'live', icon: 'monetization-on', color: '#D4A017',
    version: 'v1.0', lastUpdated: '2026-02-18',
    description: 'BTNGG token economics, supply model, gold peg mechanics, and distribution schedule.',
    content: `BTNGG TOKEN ECONOMICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Token:          BTNGG (Bituncoin Gold)
Ticker:         BTNGG
Peg:            1 BTNGG = 1/1000 troy oz XAU
Backing:        100% gold reserve (500kg BoG Vault 001)
Max Supply:     Elastic (gold-reserve-constrained)
Genesis Supply: 500,000,000 BTNGG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRICING:
priceBTNGG = XAU/USD ÷ 1000
Example: XAU = $3,200 → 1 BTNGG = $3.20

DISTRIBUTION:
• 40% — Public Sale & DEX Liquidity
• 25% — Reserve Fund (locked 2 years)
• 20% — Team & Advisors (vested 4 years)
• 10% — Ecosystem Development
• 5%  — Marketing & Partnerships
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STAKING APY:
Flexible:  8% APY
30-day:   12% APY
90-day:   18% APY`,
  },

  // ── SDK & Integration ──
  {
    id: 'sdk-001', category: 'SDK & Integration',
    title: 'BTNG SDK Package — Developer Guide',
    type: 'SDK', status: 'live', icon: 'code', color: '#3DDC84',
    version: 'UBL-1.0', lastUpdated: '2026-05-20',
    description: 'Complete BTNG SDK package for JavaScript, Kotlin, Swift, and Python integrations.',
    content: `BTNG SDK PACKAGE — DEVELOPER GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Available SDKs:
• sdk/btngClient.js       → JavaScript/Node.js
• sdk/BTNGClient.kt       → Android/Kotlin
• sdk/BTNGClient.swift    → iOS/Swift
• sdk/main.py             → Python
• sdk/btng-node-server.js → BTNG Node Server

JAVASCRIPT QUICK START:
const client = new BTNGClient({ apiKey, baseUrl });
const price  = await client.getGoldPrice();
const wallet = await client.generateWallet();
const tx     = await client.sendPayment({ to, amount, currency });

PYTHON QUICK START:
client = BTNGClient(api_key=API_KEY, base_url=BASE_URL)
price  = client.get_gold_price()
wallet = client.generate_wallet()

LICENSE: UBL-1.0 (Bituncoin Universal License)
Contact: info@bituncoin.io`,
    route: '/btng-sdk',
  },
  {
    id: 'sdk-002', category: 'SDK & Integration',
    title: 'API Key Management — 6 Permission Scopes',
    type: 'SDK', status: 'live', icon: 'vpn-key', color: '#F59E0B',
    version: 'v1.0', lastUpdated: '2026-05-10',
    description: 'API key generation system with 6 granular permission scopes for third-party integrations.',
    content: `BTNG API KEY MANAGEMENT SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERMISSION SCOPES:
1. read:market      → Price data, order books
2. read:account     → Balances, portfolio
3. trade            → Place/cancel orders
4. withdraw         → Initiate withdrawals (requires 2FA)
5. admin            → Full platform access
6. webhook          → Receive event callbacks

KEY FORMAT:
btng_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (40 chars)
btng_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx (test keys)

RATE LIMITS:
Free:       100 req/min
Pro:        1,000 req/min
Enterprise: 10,000 req/min

SECURITY:
• Keys stored hashed (SHA-256)
• IP whitelist support
• Automatic expiry (configurable)`,
    route: '/btng-api-key-generator',
  },
  {
    id: 'sdk-003', category: 'SDK & Integration',
    title: 'OAuth2 + Webhook Integration Guide',
    type: 'SDK', status: 'live', icon: 'extension', color: '#9945FF',
    version: 'v1.0', lastUpdated: '2026-05-22',
    description: 'OAuth2 PKCE flow and webhook event system for third-party BTNG platform integrations.',
    content: `BTNG OAUTH2 & WEBHOOK GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OAUTH2 FLOW (PKCE):
1. GET /oauth/authorize?client_id=&redirect_uri=&code_challenge=
2. User approves → redirect with ?code=
3. POST /oauth/token { code, code_verifier }
4. Receive: { access_token, refresh_token, expires_in }
5. Use: Authorization: Bearer <access_token>

WEBHOOK EVENTS:
• trade.filled          → Order filled
• deposit.confirmed     → Deposit confirmed
• withdrawal.processed  → Withdrawal complete
• kyc.approved          → KYC verification passed
• node.online/offline   → Sovereign node status
• price.alert           → Price alert triggered

WEBHOOK PAYLOAD:
{ event, timestamp, data, signature }
Verify: HMAC-SHA256(payload, webhook_secret)`,
    route: '/btng-api-extension',
  },

  // ── Platform Modules ──
  {
    id: 'mod-001', category: 'Platform Modules',
    title: 'KYC Verification System — Flow Diagram',
    type: 'Policy', status: 'live', icon: 'verified-user', color: '#22C55E',
    version: 'v2.2', lastUpdated: '2026-05-20',
    description: 'Complete KYC flow: document upload, face match, admin review, certificate generation.',
    content: `KYC VERIFICATION FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1: Document Upload
  • National ID (front + back) or Passport
  • Selfie with document
  • Storage: kyc-documents bucket (10MB max)

STEP 2: Auto Validation
  • Image quality check
  • Document type classification
  • Liveness detection (selfie vs document photo)

STEP 3: Admin Review
  • Admin reviews via admin dashboard
  • Approve / Reject with reason
  • kyc_submissions table updated

STEP 4: Certificate Issuance
  • On approval: btng_verification_receipts created
  • Equity certificate auto-generated
  • User notified via notifications table

STEP 5: Tier Upgrade
  • KYC approved → Gold Tier
  • Enables: higher limits, BTNGG minting, loan eligibility

Tables: kyc_submissions, btng_verification_receipts
Storage: kyc-documents (private bucket, RLS)`,
    route: '/kyc',
  },
  {
    id: 'mod-002', category: 'Platform Modules',
    title: 'Copy Trading Module — Architecture',
    type: 'Technical', status: 'live', icon: 'people', color: '#EC4899',
    version: 'v1.8', lastUpdated: '2026-04-28',
    description: 'Copy trading system: master traders, follower subscriptions, PnL tracking, risk controls.',
    content: `COPY TRADING MODULE ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABLES:
• copy_traders              → Master trader profiles
• user_copy_subscriptions   → Follower subscriptions

COPY TRADER METRICS:
• win_rate (%)              • monthly_pnl
• total_pnl                 • aum (assets under mgmt)
• follower_count            • trade_count
• risk_level                • min_copy_amount

SUBSCRIPTION FLOW:
1. User views trader profile
2. Sets copy_amount (min: trader.min_copy_amount)
3. Row created in user_copy_subscriptions
4. Trades auto-mirrored proportionally
5. PnL tracked: total_pnl, total_pnl_pct, trades_copied

PROFIT SHARE:
Trader earns profit_share_pct (%) of follower PnL
Default: 10% of profits

RISK LEVELS: Low | Medium | High`,
    route: '/copy-trading',
  },
  {
    id: 'mod-003', category: 'Platform Modules',
    title: 'BTNG Minting Pipeline — BTNGG Tokenization',
    type: 'Technical', status: 'live', icon: 'whatshot', color: '#D4A017',
    version: 'btngd v1.0', lastUpdated: '2026-05-15',
    description: 'BTNGG token minting pipeline: equity verification, LTV calculation, token issuance.',
    content: `BTNG MINTING PIPELINE — btngd v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PIPELINE STAGES:
1. equity_verify    → Validate equity certificate
2. kyc_check        → Confirm KYC status
3. risk_assess      → Risk tier evaluation (LOW/MED/HIGH)
4. ltv_calculate    → Loan-to-Value ratio
5. oracle_price     → Fetch live gold price
6. mint_calculate   → Calculate mintable BTNGG
7. approve          → Admin/auto approval
8. mint_execute     → Issue BTNGG tokens
9. receipt_store    → Save mint receipt

LTV BY RISK TIER:
LOW:    75% LTV (max)
MEDIUM: 60% LTV
HIGH:   45% LTV

MAX MINTABLE = equity_value × ltv_factor ÷ btngg_price

Tables: btng_mint_receipts, btng_equity_pool
Region Policy: GH (Ghana default)`,
    route: '/btng-minting-pipeline',
  },
  {
    id: 'mod-004', category: 'Platform Modules',
    title: 'Africa Free Trade Zone — 54 Nations Module',
    type: 'Policy', status: 'live', icon: 'public', color: '#22C55E',
    version: 'AfCFTA-1.0', lastUpdated: '2026-05-01',
    description: 'AfCFTA integration module. 54-nation free trade, BTNG as settlement currency across Africa.',
    content: `AFRICA FREE TRADE ZONE — BTNG MODULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Framework:     AfCFTA (African Continental Free Trade Area)
Coverage:      54 African Nations
Settlement:    BTNGG (Bituncoin Gold)
Market Size:   $59.5 Trillion Sovereign Economy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BTNG ROLE IN AFCFTA:
• Pan-African settlement currency
• Eliminates FX friction across 54 nations
• Gold-backed stable value for trade
• Instant cross-border settlement (< 10 seconds)

KEY CORRIDORS:
Ghana → Nigeria → South Africa (West Africa)
Ghana → Kenya → Ethiopia (East-West)
Ghana → Morocco → Egypt (North-South)
Ghana → Diaspora (UK, USA, Canada, Europe)

PAYMENT RAILS INTEGRATED:
MTN MoMo (Ghana, Uganda, Cameroon, Ivory Coast)
Airtel Money, Orange Money, M-Pesa
SWIFT for international banks`,
    route: '/africa-free-trade',
  },
  {
    id: 'mod-005', category: 'Platform Modules',
    title: 'Blog CMS — Article Management Guide',
    type: 'Technical', status: 'live', icon: 'article', color: '#3B82F6',
    version: 'v1.4', lastUpdated: '2026-03-15',
    description: 'Blog CMS admin guide. Publishing, categories, featured articles, view tracking.',
    content: `BLOG CMS ADMIN GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABLE: blog_articles
  • id, category, title, summary, content
  • author, author_avatar, date, read_time
  • image, image_color, tags[], views
  • featured, published, created_by (admin)

CATEGORIES: BTNG | Ghana | Market | DeFi | Education

ADMIN OPERATIONS:
• Create article → Admin only (is_admin=true RLS)
• Edit article → Admin only
• Delete article → Admin only
• Publish/unpublish → published flag toggle

PUBLIC ACCESS:
• SELECT where published=true (anon + authenticated)
• View count: increment_article_views() function

BOOKMARKS:
• blog_bookmarks table
• user_id + article_id unique constraint
• Per-user bookmark management`,
    route: '/blog',
  },

  // ── Security & Compliance ──
  {
    id: 'sec-001', category: 'Security & Compliance',
    title: '2FA Security Implementation — TOTP',
    type: 'Policy', status: 'live', icon: 'security', color: '#EF4444',
    version: 'v1.0', lastUpdated: '2026-03-01',
    description: 'Two-factor authentication system. TOTP-based with QR code provisioning and recovery.',
    content: `2FA SECURITY SYSTEM — TOTP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Algorithm:     TOTP (Time-based OTP, RFC 6238)
Period:        30 seconds
Digits:        6
Hash:          HMAC-SHA1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABLE: user_2fa
  • user_id (unique)
  • secret (encrypted TOTP secret)
  • enabled (boolean)
  • verified_at (timestamp)

SETUP FLOW:
1. Generate TOTP secret (base32 encoded)
2. Present QR code for Google Authenticator
3. User scans and enters verification code
4. On success: enabled=true, verified_at set
5. All sensitive operations require TOTP

SUPPORTED APPS:
• Google Authenticator
• Authy
• Microsoft Authenticator
• 1Password (TOTP)`,
    route: '/two-factor',
  },
  {
    id: 'sec-002', category: 'Security & Compliance',
    title: 'Security Events Audit Log',
    type: 'Policy', status: 'live', icon: 'manage-search', color: '#EF4444',
    version: 'v1.0', lastUpdated: '2026-06-02',
    description: 'Admin security audit trail. All admin actions logged in security_events table.',
    content: `SECURITY EVENTS AUDIT LOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TABLE: security_events
  • admin_id (fk user_profiles, must be admin)
  • action_type (text: e.g. 'user_ban', 'kyc_approve')
  • target_user_id, target_user_email, target_user_name
  • details (jsonb: additional context)
  • created_at

ACCESS POLICY:
• INSERT: Only email = 'info@bituncoin.io' + is_admin=true
• SELECT: Only email = 'info@bituncoin.io' + is_admin=true

ACTION TYPES LOGGED:
• kyc_approve / kyc_reject
• user_suspend / user_unsuspend
• withdrawal_approve / withdrawal_reject
• deposit_approve / deposit_reject
• admin_login / admin_logout
• api_key_revoke
• 2fa_force_reset`,
    route: '/admin',
  },
];

// ─── Code modules ─────────────────────────────────────────────────────────────
const CODE_MODULES = [
  {
    id: 'auth',    label: 'Authentication',      icon: 'lock',                color: '#3B82F6',
    files: ['contexts/AuthContext.tsx','services/authService.ts','template/auth/supabase/'],
    status: 'stable', version: 'v2.1', lastEdit: '2026-06-01',
    desc: 'Email OTP + password hybrid auth. Supabase Auth backend. Admin email-lock guard.',
  },
  {
    id: 'wallet',  label: 'Wallet & BTNG3',      icon: 'account-balance-wallet', color: Colors.primary,
    files: ['app/(tabs)/wallet.tsx','services/btng3WalletService.ts','services/btngWalletService.ts'],
    status: 'stable', version: 'v3.4', lastEdit: '2026-06-02',
    desc: 'BTNG3 Base58Check wallet, portfolio chart, gold oracle integration, BTNGG asset card.',
  },
  {
    id: 'oracle',  label: 'Gold Oracle',          icon: 'grain',              color: Colors.warning,
    files: ['hooks/useGoldOracle.ts','supabase/functions/gold-oracle/'],
    status: 'live',   version: 'v1.5', lastEdit: '2026-05-15',
    desc: 'Live XAU/USD price feed. 30s refresh. GHS conversion. BTNGG pricing (1/1000 oz).',
  },
  {
    id: 'kyc',     label: 'KYC Verification',    icon: 'verified-user',      color: '#22C55E',
    files: ['app/kyc.tsx','hooks/useKyc.tsx','services/kycService.ts','app/cert-scanner.tsx'],
    status: 'stable', version: 'v2.2', lastEdit: '2026-05-20',
    desc: 'National ID, selfie, document upload. Admin review pipeline. Certificate scanner with QR.',
  },
  {
    id: 'p2p',     label: 'P2P Marketplace',     icon: 'people',             color: '#9945FF',
    files: ['app/(tabs)/p2p.tsx','hooks/useP2P.tsx','services/p2pService.ts'],
    status: 'stable', version: 'v1.8', lastEdit: '2026-04-28',
    desc: 'P2P buy/sell listings. Order creation, payment confirmation, escrow flow.',
  },
  {
    id: 'trade',   label: 'Spot Trading',         icon: 'swap-horiz',         color: '#EF4444',
    files: ['app/(tabs)/trade.tsx','hooks/useTrading.tsx','services/tradingService.ts'],
    status: 'stable', version: 'v2.0', lastEdit: '2026-05-10',
    desc: 'Market and limit orders. Live order book. Fee calculator. Trade history.',
  },
  {
    id: 'admin',   label: 'Admin Dashboard',      icon: 'admin-panel-settings', color: Colors.primary,
    files: ['app/admin.tsx','hooks/useAdminUsers.tsx','hooks/useAdminBlog.tsx'],
    status: 'stable', version: 'v3.1', lastEdit: '2026-06-02',
    desc: 'Full admin CMS, KYC review, user management, deposit approvals, doc library, dev settings.',
  },
  {
    id: 'cashrail', label: 'MTN MoMo Cash Rail', icon: 'cell-tower',         color: '#F59E0B',
    files: ['app/cash-rail.tsx','hooks/useCashRail.ts','services/cashRailService.ts'],
    status: 'live',   version: 'v1.3', lastEdit: '2026-04-20',
    desc: 'MTN MoMo Ghana payment rail. Merchant ID 248059. MSISDN +233540418537.',
  },
  {
    id: 'blog',    label: 'Blog & CMS',           icon: 'article',            color: '#3B82F6',
    files: ['app/blog.tsx','app/blog-article.tsx','hooks/useBlog.tsx','services/blogService.ts'],
    status: 'stable', version: 'v1.4', lastEdit: '2026-03-15',
    desc: 'BTNG news blog. Admin publishes articles. Category filters. Full markdown content.',
  },
  {
    id: 'notify',  label: 'Notifications',        icon: 'notifications',      color: '#EC4899',
    files: ['app/notifications.tsx','hooks/useNotifications.tsx'],
    status: 'stable', version: 'v1.1', lastEdit: '2026-03-01',
    desc: 'In-app notification system. Admin broadcast. User alerts for trades, KYC, deposits.',
  },
  {
    id: 'btngpay', label: 'BTNG Pay Gateway',     icon: 'payments',           color: '#22C55E',
    files: ['app/btng-pay.tsx','supabase/functions/btng-pay-gateway/'],
    status: 'live',   version: 'v2.0', lastEdit: '2026-05-18',
    desc: 'BTNG sovereign payment gateway. Merchant transfer, UCAF signature, settlement.',
  },
  {
    id: 'sovereign', label: 'Sovereign Dashboard', icon: 'security',          color: Colors.primary,
    files: ['app/btng-sovereign-dashboard.tsx'],
    status: 'live',   version: 'v2.2', lastEdit: '2026-06-02',
    desc: '6-tab sovereign chain UI: dashboard, wallet, mining, explorer, market, reserve terminal.',
  },
  {
    id: 'liveprices', label: 'Live Market Prices', icon: 'trending-up',       color: '#22C55E',
    files: ['services/cryptoPriceService.ts','hooks/useCryptoPrices.ts','contexts/WalletContext.tsx'],
    status: 'live',   version: 'v2.0', lastEdit: '2026-06-03',
    desc: 'CoinGecko Edge Function prices with fallback. 60s refresh. Live BTNG gold oracle every 30s.',
  },
  {
    id: 'orderbook', label: 'Live Order Book',    icon: 'format-list-numbered', color: '#EF4444',
    files: ['hooks/useLiveOrderBook.ts','supabase/functions/btng-terminal/'],
    status: 'live',   version: 'v1.0', lastEdit: '2026-06-03',
    desc: 'Real-time bid/ask depth from btng-terminal Edge Function. 10s polling. Volume bars.',
  },
];

// ─── API Endpoints ─────────────────────────────────────────────────────────────
const API_ENDPOINTS = [
  { name: 'gold-oracle',         method: 'GET',  path: '/functions/v1/gold-oracle',          desc: 'XAU/USD live price + sparkline',         status: 'live',   auth: false },
  { name: 'send-otp-email',      method: 'POST', path: '/functions/v1/send-otp-email',        desc: 'Send OTP code via email',                status: 'live',   auth: false },
  { name: 'verify-otp-email',    method: 'POST', path: '/functions/v1/verify-otp-email',      desc: 'Verify OTP and issue session',           status: 'live',   auth: false },
  { name: 'btng-pay-gateway',    method: 'POST', path: '/functions/v1/btng-pay-gateway',      desc: 'Process BTNG Pay transactions',          status: 'live',   auth: true  },
  { name: 'btng-wallet-generate',method: 'POST', path: '/functions/v1/btng-wallet-generate',  desc: 'Generate BTNG3 wallet on server',        status: 'live',   auth: true  },
  { name: 'btng-reserve-status', method: 'GET',  path: '/functions/v1/btng-reserve-status',   desc: 'Sovereign reserve stats',                status: 'live',   auth: false },
  { name: 'btng-terminal',       method: 'POST', path: '/functions/v1/btng-terminal',         desc: 'Live order book depth + OHLCV',          status: 'live',   auth: true  },
  { name: 'coingecko-prices',    method: 'POST', path: '/functions/v1/coingecko-prices',      desc: 'Live crypto prices (BTC/ETH/BNB/SOL)',   status: 'live',   auth: false },
  { name: 'btng-support-chat',   method: 'POST', path: '/functions/v1/btng-support-chat',     desc: 'AI-powered support chat',                status: 'live',   auth: false },
  { name: 'send-statement-email',method: 'POST', path: '/functions/v1/send-statement-email',  desc: 'Email PDF statement to user',            status: 'beta',   auth: true  },
];

// ─── Database tables summary ───────────────────────────────────────────────────
const DB_TABLES = [
  { name: 'user_profiles',            rows: 'Live',  rls: true,  desc: 'Core user data. Auto-synced from auth.users via trigger.' },
  { name: 'btng_wallets',             rows: 'Live',  rls: true,  desc: 'BTNG3 wallet addresses, balances, tiers.' },
  { name: 'btng_certificates',        rows: 'Live',  rls: true,  desc: 'Equity certificates (property, vehicle, etc.).' },
  { name: 'btng_oracle_cache',        rows: 'Live',  rls: true,  desc: 'Cached gold/crypto prices from oracle edge function.' },
  { name: 'btng_pay_transactions',    rows: 'Live',  rls: true,  desc: 'BTNG Pay gateway transaction records.' },
  { name: 'btng_identities',          rows: 'Live',  rls: true,  desc: 'BTNG ID records linked to user profiles.' },
  { name: 'btng_loans',               rows: 'Live',  rls: true,  desc: 'Gold-backed loan records.' },
  { name: 'btng_mint_receipts',       rows: 'Live',  rls: true,  desc: 'BTNGG token minting pipeline receipts.' },
  { name: 'btng_verification_receipts',rows:'Live',  rls: true,  desc: 'KYC + equity verification pipeline results.' },
  { name: 'btng_equity_pool',         rows: 'Live',  rls: true,  desc: 'Equity pool entries with LTV and risk tier.' },
  { name: 'btng_cards',               rows: 'Live',  rls: true,  desc: 'BTNG Gold Card records per user.' },
  { name: 'btng_credit_transactions', rows: 'Live',  rls: true,  desc: 'Product credit earn/spend transactions.' },
  { name: 'btng_product_credits',     rows: 'Live',  rls: true,  desc: 'Per-user product credit balance.' },
  { name: 'btng_user_roles',          rows: 'Live',  rls: true,  desc: 'User role, identity mint status, discount eligibility.' },
  { name: 'kyc_submissions',          rows: 'Live',  rls: true,  desc: 'User KYC documents. Admin review. Photo uploads.' },
  { name: 'orders',                   rows: 'Live',  rls: true,  desc: 'Spot trading orders (market + limit).' },
  { name: 'trade_history',            rows: 'Live',  rls: true,  desc: 'Full trade history per user.' },
  { name: 'p2p_listings',             rows: 'Live',  rls: true,  desc: 'P2P buy/sell offers.' },
  { name: 'p2p_orders',               rows: 'Live',  rls: true,  desc: 'P2P matched orders.' },
  { name: 'notifications',            rows: 'Live',  rls: true,  desc: 'In-app user notifications.' },
  { name: 'blog_articles',            rows: 'Live',  rls: true,  desc: 'BTNG news & blog posts.' },
  { name: 'copy_traders',             rows: 'Live',  rls: true,  desc: 'Copy trading master accounts.' },
  { name: 'user_copy_subscriptions',  rows: 'Live',  rls: true,  desc: 'User copy-trade subscriptions.' },
  { name: 'cash_rail_transactions',   rows: 'Live',  rls: true,  desc: 'MTN MoMo cash rail payment records.' },
  { name: 'terminal_assets',          rows: 'Live',  rls: true,  desc: 'BTNG Terminal listed assets.' },
  { name: 'terminal_orders',          rows: 'Live',  rls: true,  desc: 'BTNG Terminal trade orders.' },
  { name: 'security_events',          rows: 'Live',  rls: true,  desc: 'Admin audit log (info@bituncoin.io only).' },
  { name: 'email_otps',               rows: 'Live',  rls: true,  desc: 'OTP codes. 10-min expiry.' },
];

// ─── Changelog entries ─────────────────────────────────────────────────────────
const CHANGELOG = [
  { version: 'v3.6.0', date: '2026-06-05', type: 'feature', items: [
    'Developer Library fully upgraded — 20+ platform documents loaded across 7 categories',
    'Documents tab with full-text viewer, search, category filter, and quick-launch to each module',
    'Auth guard fixed — uses isAdmin from AuthContext (consistent with Admin dashboard)',
    'All 28 database tables documented with descriptions',
    'A.I.A Engine v1.0 architecture fully documented in Infrastructure section',
  ]},
  { version: 'v3.5.0', date: '2026-06-02', type: 'feature', items: [
    'Developer Library screen — full code management center for BTNG admin team',
    'Admin dashboard security hardened — server-side email+role double-guard on every render',
    'Crash-protection ErrorBoundary added to Developer, Admin, and Wallet screens',
  ]},
  { version: 'v3.4.0', date: '2026-06-01', type: 'feature', items: [
    'BTNGG balance included in total portfolio value + PnL calculation',
    'BTNGG asset card added to Wallet Assets tab with tier badge, gold GHS value, BTNG3 pills',
    'Gold Reserve Terminal added to Sovereign Dashboard — 15-line boot sequence, infinity lockdown UI',
  ]},
  { version: 'v3.3.0', date: '2026-05-28', type: 'feature', items: [
    'BTNG3 Commercial Wallet auto-provisioned on first signup/login with Base58Check address',
    'Live order book from btng-terminal Edge Function — 10s polling, volume bars, spread display',
  ]},
  { version: 'v3.2.0', date: '2026-05-20', type: 'fix', items: [
    'WalletScreen btng3AssetData temporal dead zone crash permanently fixed',
    'Profile page NFC crash resolved — safely shimmed in try-catch',
    'SafeSection error boundaries throughout profile menu prevent any child crash from blanking screen',
  ]},
  { version: 'v3.1.0', date: '2026-05-15', type: 'feature', items: [
    'Admin Document Library with 16 pre-loaded sovereign docs, file upload to Supabase Storage',
    'BTNG Sovereign Dashboard — live ticker banner, 6 trading pairs, 30s oracle updates',
    'Gold Price Oracle card: GHS calculator, market depth, price alert, sparkline',
  ]},
  { version: 'v3.0.0', date: '2026-05-01', type: 'major', items: [
    'BTNG3 Wallet Generator — secp256k1 keypair, 35-char Base58Check address, SecureStore keys',
    'Privacy Policy (12 sections, Ghana Act 843) + Terms of Service (15 sections) legal pages',
    'Live market data: CoinGecko Edge Function + direct fallback + BTNG gold oracle 30s refresh',
  ]},
  { version: 'v2.0.0', date: '2026-04-01', type: 'major', items: [
    'Full platform launch: Spot Trading, P2P Marketplace, Copy Trading, Practice Wallet',
    'KYC Verification with admin review pipeline and certificate generation',
    'MTN MoMo Cash Rail — Merchant ID 248059 live integration',
    'BTNG Pay Gateway v2.0 with UCAF signing and settlement receipts',
  ]},
];

// ─── Code snippets ─────────────────────────────────────────────────────────────
const CODE_SNIPPETS = [
  {
    id: 's1', title: 'Get Supabase Client',
    lang: 'typescript', category: 'Backend',
    code: `import { getSupabaseClient } from '@/template';\nconst sb = getSupabaseClient();\nconst { data, error } = await sb.from('btng_wallets').select('*').eq('user_id', userId).single();`,
  },
  {
    id: 's2', title: 'Create BTNG3 Wallet',
    lang: 'typescript', category: 'Wallet',
    code: `import { createBTNG3WalletAccount } from '@/services/btng3WalletService';\nconst account = await createBTNG3WalletAccount(0x01, 0x0001); // Personal, MainNet\nconsole.log(account.address); // 35-char Base58Check\nconsole.log(account.publicKeyPem);`,
  },
  {
    id: 's3', title: 'Show Alert',
    lang: 'typescript', category: 'UI',
    code: `import { useAlert } from '@/template';\nconst { showAlert } = useAlert();\n// Simple\nshowAlert('Success', 'Operation completed');\n// Confirm\nshowAlert('Delete?', 'Cannot be undone', [\n  { text: 'Cancel', style: 'cancel' },\n  { text: 'Delete', style: 'destructive', onPress: () => doDelete() }\n]);`,
  },
  {
    id: 's4', title: 'Auth Guard',
    lang: 'typescript', category: 'Auth',
    code: `import { useAuth } from '@/contexts/AuthContext';\nconst { user, isAdmin } = useAuth();\nif (!isAdmin) return <AccessDenied />; // Use isAdmin for admin routes\nif (!user) return <Redirect href="/login" />;`,
  },
  {
    id: 's5', title: 'Upload to Storage',
    lang: 'typescript', category: 'Storage',
    code: `import * as FileSystem from 'expo-file-system';\nimport { decode } from 'base64-arraybuffer';\nimport { getSupabaseClient } from '@/template';\n\nconst base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });\nconst arrayBuffer = decode(base64);\nconst sb = getSupabaseClient();\nconst { data, error } = await sb.storage.from('avatars').upload(\`\${userId}/avatar.jpg\`, arrayBuffer, { contentType: 'image/jpeg', upsert: true });`,
  },
  {
    id: 's6', title: 'Gold Oracle Price',
    lang: 'typescript', category: 'Oracle',
    code: `import { useGoldOracle } from '@/hooks/useGoldOracle';\nconst { priceUSD, priceBTNGG, btngPerGram, change24h, changePct24h, sparkline, loading, refresh } = useGoldOracle();\n// BTNGG = 1/1000 oz XAU\n// priceBTNGG = priceUSD / 1000`,
  },
  {
    id: 's7', title: 'Call Edge Function',
    lang: 'typescript', category: 'Backend',
    code: `import { FunctionsHttpError } from '@supabase/supabase-js';\nimport { getSupabaseClient } from '@/template';\nconst sb = getSupabaseClient();\nconst { data, error } = await sb.functions.invoke('gold-oracle', { body: {} });\nif (error) {\n  let msg = error.message;\n  if (error instanceof FunctionsHttpError) {\n    try { msg = await error.context?.text(); } catch {}\n  }\n  console.error(msg);\n}`,
  },
  {
    id: 's8', title: 'Live Crypto Prices',
    lang: 'typescript', category: 'Market',
    code: `import { useWallet } from '@/contexts/WalletContext';\nconst { coins, pricesLoading, pricesSource, pricesLastUpdated, refreshPrices } = useWallet();\n// coins[] has live prices from CoinGecko Edge Function\n// pricesSource: 'live' | 'fallback'\nconst btcPrice = coins.find(c => c.symbol === 'BTC')?.price;`,
  },
];

// ─── Dev Notes ─────────────────────────────────────────────────────────────────
type DevNote = { id: string; title: string; body: string; tag: string; pinned?: boolean; date: string };

const INITIAL_NOTES: DevNote[] = [
  {
    id: 'n1', title: 'Admin Email Lock',
    tag: 'Security',
    body: 'Admin access uses isAdmin from AuthContext which checks user_profiles.is_admin=true. The ADMIN_EMAILS constant in AuthContext is the source of truth. Never soften this guard.',
    pinned: true, date: '2026-06-05',
  },
  {
    id: 'n2', title: 'BTNGG Pricing Formula',
    tag: 'Oracle',
    body: '1 BTNGG = 1/1000 oz of XAU (gold). So if XAU/USD = $3,200 then 1 BTNGG = $3.20. Always use oraclePriceUSD / 1000 for BTNGG price. Never hardcode.',
    pinned: true, date: '2026-05-15',
  },
  {
    id: 'n3', title: 'Crash Prevention Rules',
    tag: 'Architecture',
    body: '1. NEVER use a const before it is declared (temporal dead zone). 2. ALWAYS wrap async imports in try-catch. 3. Always check null before calling service functions. 4. Wrap dangerous sections in <SafeSection>.',
    date: '2026-05-20',
  },
  {
    id: 'n4', title: 'MTN MoMo Merchant Credentials',
    tag: 'Payments',
    body: 'Merchant ID: 248059 | MSISDN: +233540418537 | Local: 054 041 8537 | Dial: *170# | Network: MTN Ghana | Company: EKUYE DIGITAL GATEWAY TRUST LTD',
    date: '2026-04-20',
  },
  {
    id: 'n5', title: 'BTNG Node & Backend URLs',
    tag: 'Infrastructure',
    body: 'BTNG Node IPv4: 168.231.79.52:64799 | IPv6: 2a02:4780:f:bc::1 | Hostname: srv1282934.hstgr.cloud | Backend: mebznlvyycuuddfkmebz.backend.onspace.ai | Chain: BTNG-MAINNET | Genesis: 2026-02-18 Accra, Ghana | Gold Reserve: 500kg BoG Vault 001',
    date: '2026-02-18',
  },
  {
    id: 'n6', title: 'Live Market Data Architecture',
    tag: 'Market',
    body: 'CoinGecko prices: Edge Function (coingecko-prices) → direct CoinGecko fallback → cached fallback. Refresh every 60s. BTNG gold oracle: gold-oracle Edge Function every 30s. All coins in WalletContext get live prices applied automatically.',
    date: '2026-06-03',
  },
];

// ─── Doc Viewer Modal ──────────────────────────────────────────────────────────
function DocViewerModal({
  doc,
  visible,
  onClose,
  onNavigate,
}: {
  doc: PlatformDoc | null;
  visible: boolean;
  onClose: () => void;
  onNavigate?: (route: string) => void;
}) {
  if (!doc) return null;
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={dv.overlay}>
        <View style={dv.sheet}>
          <View style={dv.header}>
            <View style={[dv.typeIcon, { backgroundColor: doc.color + '18', borderColor: doc.color + '44' }]}>
              <MaterialIcons name={doc.icon as any} size={18} color={doc.color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={dv.title} numberOfLines={2}>{doc.title}</Text>
              <View style={dv.metaRow}>
                <View style={[dv.typeBadge, { backgroundColor: doc.color + '18', borderColor: doc.color + '44' }]}>
                  <Text style={[dv.typeText, { color: doc.color }]}>{doc.type}</Text>
                </View>
                <Text style={dv.versionText}>{doc.version}</Text>
                <Text style={dv.dateText}>{doc.lastUpdated}</Text>
              </View>
            </View>
            <TouchableOpacity style={dv.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={dv.body} contentContainerStyle={dv.bodyContent} showsVerticalScrollIndicator={false}>
            <Text style={dv.descText}>{doc.description}</Text>
            <View style={dv.divider} />
            <View style={dv.contentBox}>
              <Text style={dv.contentText}>{doc.content}</Text>
            </View>
            {doc.route && (
              <TouchableOpacity
                style={[dv.openBtn, { backgroundColor: doc.color }]}
                onPress={() => { onClose(); if (onNavigate) onNavigate(doc.route!); }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="open-in-new" size={16} color="#fff" />
                <Text style={dv.openBtnText}>Open Module</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const dv = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(6,6,8,0.85)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '90%', borderWidth: 1.5, borderColor: Colors.primary + '44' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.border },
  typeIcon: { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 },
  typeBadge: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  typeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  versionText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  dateText: { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  body: { flex: 1 },
  bodyContent: { padding: Spacing.xl, gap: Spacing.md },
  descText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, includeFontPadding: false },
  divider: { height: 1, backgroundColor: Colors.border },
  contentBox: { backgroundColor: '#070708', borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: '#22C55E22' },
  contentText: { fontSize: 11, color: '#7CFC00', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 20, includeFontPadding: false },
  openBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.sm },
  openBtnText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: '#fff', includeFontPadding: false },
});

// ─── Main Screen ────────────────────────────────────────────────────────────────
export default function DeveloperScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  // Tabs
  const [tab, setTab] = useState<DevTab>('overview');

  // Documents
  const [docSearch, setDocSearch] = useState('');
  const [docCategory, setDocCategory] = useState('All');
  const [selectedDoc, setSelectedDoc] = useState<PlatformDoc | null>(null);
  const [docViewerVisible, setDocViewerVisible] = useState(false);

  // Codebase search
  const [codeSearch, setCodeSearch] = useState('');
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Snippet copy
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [snippetFilter, setSnippetFilter] = useState('All');

  // Notes
  const [notes, setNotes] = useState<DevNote[]>(INITIAL_NOTES);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editNote, setEditNote] = useState<DevNote | null>(null);
  const [noteForm, setNoteForm] = useState({ title: '', body: '', tag: 'General' });

  // Changelog filter
  const [changeFilter, setChangeFilter] = useState<'all' | 'feature' | 'fix' | 'major'>('all');

  // Guard: access denied for non-admins
  if (!isAdmin) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={s.accessDeniedWrap}>
          <View style={s.accessShield}>
            <MaterialIcons name="developer-mode" size={40} color={Colors.error} />
          </View>
          <Text style={s.accessTitle}>Developer Access Restricted</Text>
          <Text style={s.accessSub}>
            This Developer Library is exclusively authorized for the BTNG Admin Developer Team.{'\n'}
            Authorized: {DEV_NAME} · info@bituncoin.io
          </Text>
          <View style={s.accessInfoCard}>
            <MaterialIcons name="info-outline" size={14} color={Colors.warning} />
            <Text style={s.accessInfoText}>
              {user ? `Signed in as ${user.email} — not authorized.` : 'Please sign in with the authorized developer account.'}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const handleCopySnippet = (id: string) => {
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  const handleSaveNote = () => {
    if (!noteForm.title.trim()) return;
    if (editNote) {
      setNotes(prev => prev.map(n => n.id === editNote.id ? { ...n, ...noteForm } : n));
    } else {
      setNotes(prev => [{
        id: `n${Date.now()}`,
        title: noteForm.title,
        body: noteForm.body,
        tag: noteForm.tag,
        pinned: false,
        date: new Date().toISOString().split('T')[0],
      }, ...prev]);
    }
    setShowNoteModal(false);
    setEditNote(null);
    setNoteForm({ title: '', body: '', tag: 'General' });
  };

  const filteredModules = codeSearch.trim()
    ? CODE_MODULES.filter(m =>
        m.label.toLowerCase().includes(codeSearch.toLowerCase()) ||
        m.files.some(f => f.toLowerCase().includes(codeSearch.toLowerCase())) ||
        m.desc.toLowerCase().includes(codeSearch.toLowerCase())
      )
    : CODE_MODULES;

  const snippetCategories = ['All', ...Array.from(new Set(CODE_SNIPPETS.map(sn => sn.category)))];
  const filteredSnippets = snippetFilter === 'All' ? CODE_SNIPPETS : CODE_SNIPPETS.filter(sn => sn.category === snippetFilter);
  const filteredChangelog = changeFilter === 'all' ? CHANGELOG : CHANGELOG.filter(c => c.type === changeFilter);
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.date.localeCompare(a.date);
  });

  // Documents
  const docCategories = ['All', ...Array.from(new Set(PLATFORM_DOCS.map(d => d.category)))];
  const filteredDocs = PLATFORM_DOCS.filter(d => {
    const matchCat = docCategory === 'All' || d.category === docCategory;
    const matchSearch = !docSearch.trim() ||
      d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
      d.description.toLowerCase().includes(docSearch.toLowerCase()) ||
      d.type.toLowerCase().includes(docSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const openDoc = useCallback((doc: PlatformDoc) => {
    setSelectedDoc(doc);
    setDocViewerVisible(true);
  }, []);

  return (
    <DevErrorBoundary>
      <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Top Bar */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={s.topTitleRow}>
              <Text style={s.topTitle}>Developer Library</Text>
              <View style={s.devBadge}>
                <MaterialIcons name="code" size={11} color={Colors.primary} />
                <Text style={s.devBadgeText}>BTNG DEV</Text>
              </View>
            </View>
            <Text style={s.topSub}>{DEV_NAME} · {DEV_TITLE}</Text>
          </View>
          <TouchableOpacity style={s.adminBtn} onPress={() => router.push('/admin' as any)}>
            <MaterialIcons name="admin-panel-settings" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Tab row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabScrollWrap}
          contentContainerStyle={s.tabScrollContent}
        >
          {([
            { id: 'overview',   icon: 'dashboard',       label: 'Overview'   },
            { id: 'documents',  icon: 'library-books',   label: `Docs (${PLATFORM_DOCS.length})`  },
            { id: 'codebase',   icon: 'folder-open',     label: 'Codebase'   },
            { id: 'api',        icon: 'api',             label: 'API'        },
            { id: 'database',   icon: 'storage',         label: 'Database'   },
            { id: 'changelog',  icon: 'history',         label: 'Changelog'  },
            { id: 'snippets',   icon: 'code',            label: 'Snippets'   },
            { id: 'notes',      icon: 'sticky-note-2',   label: 'Notes'      },
          ] as { id: DevTab; icon: string; label: string }[]).map(t => (
            <TouchableOpacity
              key={t.id}
              style={[s.tabBtn, tab === t.id && s.tabBtnActive]}
              onPress={() => setTab(t.id)}
              activeOpacity={0.8}
            >
              <MaterialIcons name={t.icon as any} size={13} color={tab === t.id ? Colors.bg : Colors.textMuted} />
              <Text style={[s.tabBtnText, tab === t.id && { color: Colors.bg }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 32, gap: Spacing.md }}
        >

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <>
              {/* Identity card */}
              <View style={s.identityCard}>
                <View style={s.identityIconWrap}>
                  <MaterialIcons name="developer-mode" size={28} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.identityTitleRow}>
                    <Text style={s.identityName}>{DEV_NAME}</Text>
                    <View style={s.liveBadge}>
                      <View style={s.liveDot} />
                      <Text style={s.liveBadgeText}>LIVE</Text>
                    </View>
                  </View>
                  <Text style={s.identityRole}>{DEV_TITLE}</Text>
                  <Text style={s.identityEmail}>info@bituncoin.io · admin@btng.gold</Text>
                </View>
              </View>

              {/* Quick stats */}
              <View style={s.statsRow}>
                {[
                  { label: 'Docs',       val: PLATFORM_DOCS.length, color: '#F59E0B',    tab: 'documents'  },
                  { label: 'Modules',    val: CODE_MODULES.length,  color: Colors.primary, tab: 'codebase'  },
                  { label: 'APIs',       val: API_ENDPOINTS.length, color: '#22C55E',    tab: 'api'        },
                  { label: 'DB Tables',  val: DB_TABLES.length,     color: '#3B82F6',    tab: 'database'   },
                  { label: 'Snippets',   val: CODE_SNIPPETS.length, color: '#9945FF',    tab: 'snippets'   },
                  { label: 'Dev Notes',  val: notes.length,         color: '#EC4899',    tab: 'notes'      },
                ].map(stat => (
                  <TouchableOpacity
                    key={stat.label}
                    style={[s.statCard, { borderColor: stat.color + '44' }]}
                    activeOpacity={0.8}
                    onPress={() => setTab(stat.tab as DevTab)}
                  >
                    <Text style={[s.statVal, { color: stat.color }]}>{stat.val}</Text>
                    <Text style={s.statLabel}>{stat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Platform manifest */}
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="info" size={15} color={Colors.primary} />
                  <Text style={s.cardTitle}>Platform Manifest</Text>
                </View>
                {[
                  { k: 'Platform',    v: 'BTNG Gold Coin — Bituncoin Gold Bank' },
                  { k: 'Company',     v: 'EKUYE DIGITAL GATEWAY TRUST LTD' },
                  { k: 'Reg. No.',    v: 'CS099020624', mono: true },
                  { k: 'TIN',         v: 'C0064220206', mono: true },
                  { k: 'Jurisdiction',v: 'Ghana Companies Act 992 · 24 Jun 2024' },
                  { k: 'Gold Reserve',v: '500kg · Bank of Ghana Vault 001' },
                  { k: 'Chain',       v: 'BTNG-MAINNET · 168.231.79.52:64799', mono: true },
                  { k: 'IPv6',        v: '2a02:4780:f:bc::1', mono: true },
                  { k: 'Backend',     v: `${BACKEND_URL}`, mono: true },
                  { k: 'App Version', v: 'v2.0.0 — Production' },
                  { k: 'Tech Stack',  v: 'React Native · Expo · TypeScript' },
                  { k: 'Platforms',   v: 'iOS + Android + Web' },
                  { k: 'Dev Email',   v: 'info@bituncoin.io · admin@btng.gold', mono: true },
                ].map(row => (
                  <View key={row.k} style={s.manifestRow}>
                    <Text style={s.manifestKey}>{row.k}</Text>
                    <Text style={[s.manifestVal, row.mono && s.mono]} numberOfLines={1}>{row.v}</Text>
                  </View>
                ))}
              </View>

              {/* Quick launch */}
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="rocket-launch" size={15} color={Colors.primary} />
                  <Text style={s.cardTitle}>Quick Launch</Text>
                </View>
                <View style={s.quickGrid}>
                  {[
                    { label: 'Admin',          icon: 'admin-panel-settings', color: Colors.primary, route: '/admin'                   },
                    { label: 'Wallet',          icon: 'account-balance-wallet', color: Colors.warning, route: '/(tabs)/wallet'         },
                    { label: 'Gold Oracle',     icon: 'grain',              color: Colors.warning, route: '/btng-sovereign-dashboard'  },
                    { label: 'Block Explorer',  icon: 'explore',            color: '#3B82F6',      route: '/btng-explorer'             },
                    { label: 'BTNG Pay',        icon: 'payments',           color: '#22C55E',      route: '/btng-pay'                  },
                    { label: 'Cash Rail',       icon: 'cell-tower',         color: '#F59E0B',      route: '/cash-rail'                 },
                    { label: 'KYC',             icon: 'verified-user',      color: '#22C55E',      route: '/kyc'                       },
                    { label: 'Cert Scanner',    icon: 'qr-code-scanner',    color: '#9945FF',      route: '/cert-scanner'              },
                    { label: 'Node Dashboard',  icon: 'hub',                color: '#22C55E',      route: '/btng-node'                 },
                    { label: 'API Manager',     icon: 'vpn-key',            color: '#F59E0B',      route: '/btng-api-manager'          },
                    { label: 'Mint Pipeline',   icon: 'whatshot',           color: Colors.primary, route: '/btng-minting-pipeline'     },
                    { label: 'Sovereign Docs',  icon: 'description',        color: Colors.primary, route: '/btng-sovereign-docs'       },
                  ].map(item => (
                    <TouchableOpacity
                      key={item.label}
                      style={[s.quickBtn, { borderColor: item.color + '44' }]}
                      onPress={() => router.push(item.route as any)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.quickBtnIcon, { backgroundColor: item.color + '18', borderColor: item.color + '33' }]}>
                        <MaterialIcons name={item.icon as any} size={18} color={item.color} />
                      </View>
                      <Text style={[s.quickBtnLabel, { color: item.color }]} numberOfLines={2}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}

          {/* ── DOCUMENTS ── */}
          {tab === 'documents' && (
            <>
              {/* Header */}
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="library-books" size={15} color={Colors.warning} />
                  <Text style={s.cardTitle}>{PLATFORM_DOCS.length} Platform Documents Loaded</Text>
                  <View style={{ flex: 1 }} /><View style={[s.liveBadge, { }]}>
                    <View style={s.liveDot} />
                    <Text style={s.liveBadgeText}>ALL LIVE</Text>
                  </View>
                </View>
                <Text style={s.infoText}>Complete BTNG platform document library — legal, sovereign, technical, financial, SDK, and compliance documents.</Text>
              </View>

              {/* Search */}
              <View style={s.searchBar}>
                <MaterialIcons name="search" size={16} color={Colors.textMuted} />
                <TextInput
                  style={s.searchInput}
                  value={docSearch}
                  onChangeText={setDocSearch}
                  placeholder="Search documents..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {docSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setDocSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Category filter */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: 2 }}>
                {docCategories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.filterChip, docCategory === cat && s.filterChipActive]}
                    onPress={() => setDocCategory(cat)}
                  >
                    <Text style={[s.filterChipText, docCategory === cat && { color: Colors.bg }]}>
                      {cat === 'All' ? `All (${PLATFORM_DOCS.length})` : cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.resultsLabel}>{filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}</Text>

              {/* Doc cards */}
              {filteredDocs.map(doc => (
                <TouchableOpacity
                  key={doc.id}
                  style={[s.docCard, { borderLeftColor: doc.color, borderLeftWidth: 3 }]}
                  onPress={() => openDoc(doc)}
                  activeOpacity={0.8}
                >
                  <View style={s.docCardTop}>
                    <View style={[s.docIconWrap, { backgroundColor: doc.color + '18', borderColor: doc.color + '33' }]}>
                      <MaterialIcons name={doc.icon as any} size={20} color={doc.color} />
                    </View>
                    <View style={s.docInfo}>
                      <View style={s.docTitleRow}>
                        <Text style={s.docTitle} numberOfLines={2}>{doc.title}</Text>
                      </View>
                      <View style={s.docMeta}>
                        <View style={[s.docTypeBadge, { backgroundColor: doc.color + '18', borderColor: doc.color + '44' }]}>
                          <Text style={[s.docTypeText, { color: doc.color }]}>{doc.type}</Text>
                        </View>
                        <View style={[s.docStatusDot, { backgroundColor: doc.status === 'live' ? Colors.success : doc.status === 'beta' ? Colors.warning : Colors.textMuted }]} />
                        <Text style={s.docVersion}>{doc.version}</Text>
                        <Text style={s.docDate}>{doc.lastUpdated}</Text>
                      </View>
                      <Text style={s.docDesc} numberOfLines={2}>{doc.description}</Text>
                    </View>
                    <View style={s.docActions}>
                      {doc.route && (
                        <TouchableOpacity
                          style={s.docRouteBtn}
                          onPress={() => router.push(doc.route as any)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <MaterialIcons name="open-in-new" size={13} color={doc.color} />
                        </TouchableOpacity>
                      )}
                      <MaterialIcons name="chevron-right" size={18} color={Colors.textMuted} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}

              {filteredDocs.length === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 40, gap: Spacing.md }}>
                  <MaterialIcons name="search-off" size={36} color={Colors.textMuted} />
                  <Text style={{ fontSize: FontSize.md, color: Colors.textMuted, includeFontPadding: false }}>No documents found</Text>
                </View>
              )}
            </>
          )}

          {/* ── CODEBASE ── */}
          {tab === 'codebase' && (
            <>
              <View style={s.searchBar}>
                <MaterialIcons name="search" size={16} color={Colors.textMuted} />
                <TextInput
                  style={s.searchInput}
                  value={codeSearch}
                  onChangeText={setCodeSearch}
                  placeholder="Search modules, files..."
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {codeSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setCodeSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialIcons name="close" size={14} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.resultsLabel}>{filteredModules.length} module{filteredModules.length !== 1 ? 's' : ''}</Text>
              {filteredModules.map(mod => {
                const isOpen = expandedModule === mod.id;
                return (
                  <View key={mod.id} style={[s.moduleCard, { borderLeftColor: mod.color, borderLeftWidth: 3 }]}>
                    <TouchableOpacity
                      style={s.moduleCardTop}
                      onPress={() => setExpandedModule(isOpen ? null : mod.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[s.moduleIconWrap, { backgroundColor: mod.color + '18', borderColor: mod.color + '33' }]}>
                        <MaterialIcons name={mod.icon as any} size={18} color={mod.color} />
                      </View>
                      <View style={s.moduleInfo}>
                        <View style={s.moduleTitleRow}>
                          <Text style={s.moduleLabel}>{mod.label}</Text>
                          <View style={[s.moduleStatusBadge, {
                            backgroundColor: mod.status === 'live' ? Colors.successBg : Colors.primaryGlow,
                            borderColor: mod.status === 'live' ? Colors.success + '44' : Colors.primary + '44',
                          }]}>
                            <View style={[s.moduleStatusDot, { backgroundColor: mod.status === 'live' ? Colors.success : Colors.primary }]} />
                            <Text style={[s.moduleStatusText, { color: mod.status === 'live' ? Colors.success : Colors.primary }]}>
                              {mod.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={s.moduleDesc} numberOfLines={isOpen ? undefined : 2}>{mod.desc}</Text>
                        <View style={s.moduleMetaRow}>
                          <Text style={s.moduleMeta}>{mod.version}</Text>
                          <Text style={s.moduleDot}>·</Text>
                          <Text style={s.moduleMeta}>Last: {mod.lastEdit}</Text>
                          <Text style={s.moduleDot}>·</Text>
                          <Text style={s.moduleMeta}>{mod.files.length} file{mod.files.length !== 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                      <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                    {isOpen && (
                      <View style={s.moduleExpanded}>
                        <Text style={s.moduleFilesLabel}>Files</Text>
                        {mod.files.map(f => (
                          <View key={f} style={s.fileRow}>
                            <MaterialIcons name="insert-drive-file" size={13} color={mod.color} />
                            <Text style={[s.fileText, { color: mod.color }]}>{f}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {/* ── API ── */}
          {tab === 'api' && (
            <>
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
                  <Text style={s.cardTitle}>Base URL</Text>
                </View>
                <Text style={[s.mono, { color: Colors.primary, fontSize: 11 }]}>
                  {BACKEND_URL}/functions/v1/
                </Text>
              </View>
              {API_ENDPOINTS.map(ep => (
                <View key={ep.name} style={s.apiCard}>
                  <View style={s.apiHeaderRow}>
                    <View style={[s.apiMethodBadge, { backgroundColor: ep.method === 'GET' ? '#22C55E18' : '#3B82F618', borderColor: ep.method === 'GET' ? '#22C55E44' : '#3B82F644' }]}>
                      <Text style={[s.apiMethodText, { color: ep.method === 'GET' ? '#22C55E' : '#3B82F6' }]}>{ep.method}</Text>
                    </View>
                    <Text style={s.apiName}>{ep.name}</Text>
                    <View style={[s.apiStatusDot, { backgroundColor: ep.status === 'live' ? Colors.success : Colors.warning }]} />
                    {ep.auth && (
                      <View style={s.apiAuthBadge}>
                        <MaterialIcons name="lock" size={9} color={Colors.warning} />
                        <Text style={s.apiAuthText}>Auth</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.mono, { fontSize: 10, color: Colors.textMuted, marginTop: 4 }]}>{ep.path}</Text>
                  <Text style={s.apiDesc}>{ep.desc}</Text>
                </View>
              ))}
            </>
          )}

          {/* ── DATABASE ── */}
          {tab === 'database' && (
            <>
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <MaterialIcons name="security" size={14} color={Colors.success} />
                  <Text style={s.cardTitle}>All {DB_TABLES.length} tables have RLS enabled</Text>
                </View>
                <Text style={s.infoText}>Row-Level Security is active on every table. Policies restrict access by user_id = auth.uid() or admin email checks.</Text>
              </View>
              {DB_TABLES.map(t => (
                <View key={t.name} style={s.dbCard}>
                  <View style={s.dbHeaderRow}>
                    <View style={s.dbIconWrap}>
                      <MaterialIcons name="table-chart" size={14} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.dbName}>{t.name}</Text>
                      <Text style={s.dbDesc}>{t.desc}</Text>
                    </View>
                    <View style={[s.dbRlsBadge, { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}>
                      <MaterialIcons name="shield" size={9} color={Colors.success} />
                      <Text style={s.dbRlsText}>RLS</Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* ── CHANGELOG ── */}
          {tab === 'changelog' && (
            <>
              <View style={s.filterRow}>
                {(['all', 'major', 'feature', 'fix'] as const).map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[s.filterChip, changeFilter === f && s.filterChipActive]}
                    onPress={() => setChangeFilter(f)}
                  >
                    <Text style={[s.filterChipText, changeFilter === f && { color: Colors.bg }]}>
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {filteredChangelog.map(entry => {
                const typeColor = entry.type === 'major' ? '#9945FF' : entry.type === 'feature' ? Colors.success : Colors.warning;
                return (
                  <View key={entry.version} style={[s.changeCard, { borderLeftColor: typeColor, borderLeftWidth: 3 }]}>
                    <View style={s.changeHeaderRow}>
                      <View style={[s.changeVersionBadge, { backgroundColor: typeColor + '18', borderColor: typeColor + '44' }]}>
                        <Text style={[s.changeVersionText, { color: typeColor }]}>{entry.version}</Text>
                      </View>
                      <Text style={s.changeDate}>{entry.date}</Text>
                      <View style={[s.changeTypeBadge, { backgroundColor: typeColor + '18', borderColor: typeColor + '33' }]}>
                        <Text style={[s.changeTypeText, { color: typeColor }]}>{entry.type.toUpperCase()}</Text>
                      </View>
                    </View>
                    <View style={s.changeItems}>
                      {entry.items.map((item, i) => (
                        <View key={i} style={s.changeItemRow}>
                          <View style={[s.changeItemDot, { backgroundColor: typeColor }]} />
                          <Text style={s.changeItemText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {/* ── SNIPPETS ── */}
          {tab === 'snippets' && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScrollContent}>
                {snippetCategories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.filterChip, snippetFilter === cat && s.filterChipActive]}
                    onPress={() => setSnippetFilter(cat)}
                  >
                    <Text style={[s.filterChipText, snippetFilter === cat && { color: Colors.bg }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {filteredSnippets.map(snip => (
                <View key={snip.id} style={s.snippetCard}>
                  <View style={s.snippetHeaderRow}>
                    <View style={s.snippetCatBadge}>
                      <Text style={s.snippetCatText}>{snip.category}</Text>
                    </View>
                    <Text style={s.snippetTitle}>{snip.title}</Text>
                    <TouchableOpacity
                      style={[s.copyBtn, copiedSnippet === snip.id && { backgroundColor: Colors.successBg, borderColor: Colors.success + '44' }]}
                      onPress={() => handleCopySnippet(snip.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name={copiedSnippet === snip.id ? 'check' : 'content-copy'} size={13} color={copiedSnippet === snip.id ? Colors.success : Colors.primary} />
                      <Text style={[s.copyBtnText, copiedSnippet === snip.id && { color: Colors.success }]}>
                        {copiedSnippet === snip.id ? 'Copied' : 'Copy'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.codeBox}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <Text style={s.codeText}>{snip.code}</Text>
                    </ScrollView>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* ── NOTES ── */}
          {tab === 'notes' && (
            <>
              <TouchableOpacity
                style={s.addNoteBtn}
                onPress={() => { setEditNote(null); setNoteForm({ title: '', body: '', tag: 'General' }); setShowNoteModal(true); }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="add" size={18} color={Colors.bg} />
                <Text style={s.addNoteBtnText}>Add Dev Note</Text>
              </TouchableOpacity>
              {sortedNotes.map(note => (
                <View key={note.id} style={[s.noteCard, note.pinned && { borderColor: Colors.warning + '66' }]}>
                  <View style={s.noteHeaderRow}>
                    {note.pinned && <MaterialIcons name="push-pin" size={12} color={Colors.warning} />}
                    <View style={s.noteTagBadge}>
                      <Text style={s.noteTagText}>{note.tag}</Text>
                    </View>
                    <Text style={s.noteTitle}>{note.title}</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={s.noteEditBtn}
                      onPress={() => { setEditNote(note); setNoteForm({ title: note.title, body: note.body, tag: note.tag }); setShowNoteModal(true); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="edit" size={13} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.noteEditBtn}
                      onPress={() => setNotes(prev => prev.filter(n => n.id !== note.id))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="delete-outline" size={13} color={Colors.error} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setNotes(prev => prev.map(n => n.id === note.id ? { ...n, pinned: !n.pinned } : n))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="push-pin" size={13} color={note.pinned ? Colors.warning : Colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <Text style={s.noteBody}>{note.body}</Text>
                  <Text style={s.noteDate}>{note.date}</Text>
                </View>
              ))}
            </>
          )}

        </ScrollView>

        {/* Doc Viewer Modal */}
        <DocViewerModal
          doc={selectedDoc}
          visible={docViewerVisible}
          onClose={() => setDocViewerVisible(false)}
          onNavigate={(route) => router.push(route as any)}
        />

        {/* Note modal */}
        <Modal visible={showNoteModal} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={s.modalOverlay}>
              <View style={s.modalSheet}>
                <View style={s.modalHeader}>
                  <TouchableOpacity onPress={() => { setShowNoteModal(false); setEditNote(null); }}>
                    <MaterialIcons name="close" size={22} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <Text style={s.modalTitle}>{editNote ? 'Edit Note' : 'Add Dev Note'}</Text>
                  <TouchableOpacity
                    style={[s.modalSaveBtn, !noteForm.title.trim() && { opacity: 0.4 }]}
                    onPress={handleSaveNote}
                    disabled={!noteForm.title.trim()}
                  >
                    <Text style={s.modalSaveBtnText}>{editNote ? 'Update' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md }} showsVerticalScrollIndicator={false}>
                  <Text style={s.fieldLabel}>Title *</Text>
                  <TextInput
                    style={s.modalInput}
                    value={noteForm.title}
                    onChangeText={v => setNoteForm(f => ({ ...f, title: v }))}
                    placeholder="Note title..."
                    placeholderTextColor={Colors.textMuted}
                    autoFocus
                  />
                  <Text style={s.fieldLabel}>Tag</Text>
                  <View style={s.filterRow}>
                    {['General', 'Security', 'Architecture', 'Oracle', 'Payments', 'Infrastructure', 'Auth', 'UI', 'Market'].map(tag => (
                      <TouchableOpacity
                        key={tag}
                        style={[s.filterChip, noteForm.tag === tag && s.filterChipActive]}
                        onPress={() => setNoteForm(f => ({ ...f, tag }))}
                      >
                        <Text style={[s.filterChipText, noteForm.tag === tag && { color: Colors.bg }]}>{tag}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={s.fieldLabel}>Body</Text>
                  <TextInput
                    style={[s.modalInput, { minHeight: 120 }]}
                    value={noteForm.body}
                    onChangeText={v => setNoteForm(f => ({ ...f, body: v }))}
                    placeholder="Note content..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                  <View style={{ height: 20 }} />
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </DevErrorBoundary>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch', alignItems: 'stretch' },
  topBar:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, gap: Spacing.md },
  backBtn:           { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topTitleRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitle:          { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  devBadge:          { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '55' },
  devBadgeText:      { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 0.8, includeFontPadding: false },
  topSub:            { fontSize: 10, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  adminBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.primary + '55' },
  tabScrollWrap:     { borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabScrollContent:  { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tabBtn:            { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive:      { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabBtnText:        { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  // Access denied
  accessDeniedWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.lg },
  accessShield:      { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.errorBg, borderWidth: 2, borderColor: Colors.error + '55', alignItems: 'center', justifyContent: 'center' },
  accessTitle:       { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary, textAlign: 'center', includeFontPadding: false },
  accessSub:         { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20, includeFontPadding: false },
  accessInfoCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: Colors.warningBg, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.warning + '44', width: '100%' },
  accessInfoText:    { flex: 1, fontSize: FontSize.xs, color: Colors.warning, lineHeight: 17, includeFontPadding: false },
  // Identity card
  identityCard:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '66', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  identityIconWrap:  { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1.5, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  identityTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  identityName:      { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  identityRole:      { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  identityEmail:     { fontSize: 10, color: Colors.textMuted, marginTop: 1, includeFontPadding: false },
  liveBadge:         { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '44' },
  liveDot:           { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.success },
  liveBadgeText:     { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.success, letterSpacing: 0.8, includeFontPadding: false },
  // Stats
  statsRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard:          { flex: 1, minWidth: '30%', backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:           { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:         { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
  // Generic card
  card:              { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  cardHeader:        { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardTitle:         { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  // Manifest
  manifestRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm },
  manifestKey:       { width: 100, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, flexShrink: 0 },
  manifestVal:       { flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary, includeFontPadding: false },
  mono:              { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  infoText:          { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  // Quick launch
  quickGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickBtn:          { width: '30%', flex: 1, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 5, minWidth: 80 },
  quickBtnIcon:      { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quickBtnLabel:     { fontSize: 10, fontWeight: FontWeight.bold, textAlign: 'center', includeFontPadding: false },
  // Search
  searchBar:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, height: 44 },
  searchInput:       { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, includeFontPadding: false },
  resultsLabel:      { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  // Document card
  docCard:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  docCardTop:        { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  docIconWrap:       { width: 44, height: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  docInfo:           { flex: 1, gap: 4 },
  docTitleRow:       { flexDirection: 'row', alignItems: 'center' },
  docTitle:          { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  docMeta:           { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  docTypeBadge:      { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  docTypeText:       { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  docStatusDot:      { width: 6, height: 6, borderRadius: 3 },
  docVersion:        { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  docDate:           { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  docDesc:           { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  docActions:        { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  docRouteBtn:       { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  // Module card
  moduleCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  moduleCardTop:     { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  moduleIconWrap:    { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  moduleInfo:        { flex: 1, gap: 4 },
  moduleTitleRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  moduleLabel:       { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  moduleStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  moduleStatusDot:   { width: 5, height: 5, borderRadius: 2.5 },
  moduleStatusText:  { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  moduleDesc:        { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16, includeFontPadding: false },
  moduleMetaRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  moduleMeta:        { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  moduleDot:         { fontSize: 10, color: Colors.textMuted },
  moduleExpanded:    { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, backgroundColor: Colors.bgElevated, gap: Spacing.sm },
  moduleFilesLabel:  { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.textMuted, letterSpacing: 1.2, includeFontPadding: false },
  fileRow:           { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 4 },
  fileText:          { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  // API
  apiCard:           { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  apiHeaderRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apiMethodBadge:    { borderRadius: Radius.sm, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  apiMethodText:     { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.3, includeFontPadding: false },
  apiName:           { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  apiStatusDot:      { width: 7, height: 7, borderRadius: 3.5 },
  apiAuthBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.warning + '44' },
  apiAuthText:       { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.warning, includeFontPadding: false },
  apiDesc:           { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 5, includeFontPadding: false },
  // DB
  dbCard:            { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  dbHeaderRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dbIconWrap:        { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  dbName:            { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  dbDesc:            { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 16, includeFontPadding: false },
  dbRlsBadge:        { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  dbRlsText:         { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  // Changelog
  filterRow:         { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  filterScrollContent:{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: 2 },
  filterChip:        { paddingHorizontal: 12, height: 32, justifyContent: 'center', borderRadius: Radius.full, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText:    { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  changeCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md, overflow: 'hidden' },
  changeHeaderRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  changeVersionBadge:{ borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  changeVersionText: { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  changeDate:        { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  changeTypeBadge:   { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  changeTypeText:    { fontSize: 9, fontWeight: FontWeight.heavy, letterSpacing: 0.5, includeFontPadding: false },
  changeItems:       { gap: Spacing.sm },
  changeItemRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  changeItemDot:     { width: 6, height: 6, borderRadius: 3, marginTop: 5, flexShrink: 0 },
  changeItemText:    { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
  // Snippets
  snippetCard:       { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm, overflow: 'hidden' },
  snippetHeaderRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  snippetCatBadge:   { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  snippetCatText:    { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  snippetTitle:      { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  copyBtn:           { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryGlow, borderRadius: Radius.lg, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44' },
  copyBtnText:       { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  codeBox:           { backgroundColor: '#070708', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#22C55E22' },
  codeText:          { fontSize: 11, color: '#7CFC00', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 19, includeFontPadding: false },
  // Notes
  addNoteBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  addNoteBtnText:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  noteCard:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  noteHeaderRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteTagBadge:      { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.primary + '44' },
  noteTagText:       { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },
  noteTitle:         { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  noteEditBtn:       { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  noteBody:          { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18, includeFontPadding: false },
  noteDate:          { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  // Modal
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(6,6,8,0.82)', justifyContent: 'flex-end' },
  modalSheet:        { backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '88%', borderWidth: 1, borderColor: Colors.border },
  modalHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  modalSaveBtn:      { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minWidth: 60, alignItems: 'center' },
  modalSaveBtnText:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  modalInput:        { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: FontSize.md, includeFontPadding: false },
  fieldLabel:        { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: FontWeight.semibold, letterSpacing: 0.3, includeFontPadding: false },
});
