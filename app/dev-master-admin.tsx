/**
 * app/dev-master-admin.tsx
 * ═══════════════════════════════════════════════════════════════════
 * BTNG Developer Master Admin Panel — Read-Only Reference
 * ═══════════════════════════════════════════════════════════════════
 * Displays MANIFEST.md + CHANGELOG.md with collapsible sections for:
 *   - All engine classes
 *   - All database tables
 *   - All app screens
 *   - All edge functions
 *   - All service files
 *
 * EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
 * John Kojo Zi — Founder & Lead Architect
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Pressable, Platform, Dimensions, ActivityIndicator, TextInput, Switch,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { btngSovereignEngine, type SystemStatus, UniversalKeyManager } from '@/services/btngSovereignEngineService';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Section {
  id: string;
  title: string;
  icon: string;
  iconColor: string;
  badge?: string;
  badgeColor?: string;
  items: SectionItem[];
}

interface SectionItem {
  label: string;
  value?: string;
  mono?: boolean;
  highlight?: boolean;
  color?: string;
  sub?: string;
  tag?: string;
  tagColor?: string;
}

// ─── MANIFEST DATA ────────────────────────────────────────────────────────────

const CRYPTOGRAPHIC_ENGINE_CLASSES: SectionItem[] = [
  { label: 'UniversalKeyManager',     value: 'Ed25519 key gen, signing, verification, PBKDF2', tag: 'STATIC', tagColor: '#3B82F6' },
  { label: 'ClientWalletEngine',      value: 'Client sovereign wallet — Ed25519 keys',          tag: 'CLASS',  tagColor: Colors.success },
  { label: 'BankWalletEngine',        value: 'BTNG Bank system wallet — Ed25519 keys',           tag: 'CLASS',  tagColor: Colors.primary },
  { label: 'MerchantWalletEngine',    value: 'All merchant wallets — auto-keyed Ed25519',        tag: 'CLASS',  tagColor: '#F59E0B' },
  { label: 'TripleKeyPaymentEngine',  value: '3-step payment: Client → Bank → Merchant',         tag: 'CLASS',  tagColor: '#9945FF' },
  { label: 'AuditLogger',             value: 'Immutable event log — AsyncStorage',               tag: 'CLASS',  tagColor: Colors.textMuted },
  { label: 'BTNGSovereignEngine',     value: 'Master orchestrator singleton — boot all engines', tag: 'SINGLETON', tagColor: Colors.error, highlight: true },
];

const CRYPTO_STACK: SectionItem[] = [
  { label: 'Key Generation',    value: 'nacl.sign.keyPair()',                   mono: true, color: Colors.success },
  { label: 'Signing',           value: 'nacl.sign.detached()',                  mono: true, color: Colors.success },
  { label: 'Verification',      value: 'nacl.sign.detached.verify()',           mono: true, color: Colors.success },
  { label: 'SHA-256 Hashing',   value: 'Crypto.digestStringAsync(SHA256)',      mono: true, color: '#3B82F6' },
  { label: 'CSPRNG Entropy',    value: 'Crypto.getRandomBytes()',               mono: true, color: '#3B82F6' },
  { label: 'Key Derivation',    value: 'PBKDF2-SHA256 × 4096 rounds',          mono: false, color: '#F59E0B' },
  { label: 'Key Encryption',    value: 'AES-256-XOR + auth tag (key wrap)',     mono: false, color: '#F59E0B' },
  { label: 'Private Storage',   value: 'expo-secure-store (Keychain/Keystore)', mono: false, color: Colors.error, highlight: true },
];

const ADDRESS_TYPES: SectionItem[] = [
  { label: 'W — Individual Wallet',       value: 'BTNG1Gw[hash]', mono: true, color: Colors.primary },
  { label: 'M — Business / Merchant',     value: 'BTNG1Gm[hash]', mono: true, color: '#F59E0B' },
  { label: 'E — Enterprise',              value: 'BTNG1Ge[hash]', mono: true, color: '#3B82F6' },
  { label: 'G — Government / Ministry',   value: 'BTNG1Gg[hash]', mono: true, color: Colors.success },
  { label: 'T — Treasury / Central Bank', value: 'BTNG1Gt[hash]', mono: true, color: Colors.error },
  { label: 'V — Validator / Node',        value: 'BTNG1Gv[hash]', mono: true, color: '#9945FF' },
  { label: 'C — Coin / Asset',            value: 'BTNG1Gc[hash]', mono: true, color: Colors.copper },
];

const NATION_PREFIXES: SectionItem[] = [
  { label: 'Ghana',            value: 'BTNG1G',  mono: true, color: Colors.primary, highlight: true },
  { label: 'Nigeria',          value: 'BTNG2N',  mono: true },
  { label: 'South Africa',     value: 'BTNG3S',  mono: true },
  { label: 'Kenya',            value: 'BTNG4K',  mono: true },
  { label: 'Egypt',            value: 'BTNG5E',  mono: true },
  { label: 'Ethiopia',         value: 'BTNG6E',  mono: true },
  { label: 'Morocco',          value: 'BTNG7M',  mono: true },
  { label: 'Uganda',           value: 'BTNG8U',  mono: true },
  { label: 'Tanzania',         value: 'BTNG9T',  mono: true },
  { label: 'Algeria',          value: 'BTNG10A', mono: true },
  { label: 'Sudan',            value: 'BTNG11S', mono: true },
  { label: 'Angola',           value: 'BTNG12A', mono: true },
  { label: 'Mozambique',       value: 'BTNG13M', mono: true },
  { label: 'Madagascar',       value: 'BTNG14M', mono: true },
  { label: 'Cameroon',         value: 'BTNG15C', mono: true },
  { label: "Côte d'Ivoire",    value: 'BTNG16C', mono: true },
  { label: 'Niger',            value: 'BTNG17N', mono: true },
  { label: 'Burkina Faso',     value: 'BTNG18B', mono: true },
  { label: 'Mali',             value: 'BTNG19M', mono: true },
  { label: 'Malawi',           value: 'BTNG20M', mono: true },
  { label: 'Zambia',           value: 'BTNG21Z', mono: true },
  { label: 'Senegal',          value: 'BTNG22S', mono: true },
  { label: 'Chad',             value: 'BTNG23C', mono: true },
  { label: 'Somalia',          value: 'BTNG24S', mono: true },
  { label: 'Zimbabwe',         value: 'BTNG25Z', mono: true },
  { label: 'Guinea',           value: 'BTNG26G', mono: true },
  { label: 'Rwanda',           value: 'BTNG27R', mono: true },
  { label: 'Benin',            value: 'BTNG28B', mono: true },
  { label: 'Burundi',          value: 'BTNG29B', mono: true },
  { label: 'Tunisia',          value: 'BTNG30T', mono: true },
  { label: 'South Sudan',      value: 'BTNG31S', mono: true },
  { label: 'Togo',             value: 'BTNG32T', mono: true },
  { label: 'Sierra Leone',     value: 'BTNG33S', mono: true },
  { label: 'Libya',            value: 'BTNG34L', mono: true },
  { label: 'DR Congo',         value: 'BTNG35D', mono: true },
  { label: 'Congo',            value: 'BTNG36C', mono: true },
  { label: 'Liberia',          value: 'BTNG37L', mono: true },
  { label: 'C.A. Republic',    value: 'BTNG38C', mono: true },
  { label: 'Mauritania',       value: 'BTNG39M', mono: true },
  { label: 'Eritrea',          value: 'BTNG40E', mono: true },
  { label: 'Namibia',          value: 'BTNG41N', mono: true },
  { label: 'Botswana',         value: 'BTNG42B', mono: true },
  { label: 'Lesotho',          value: 'BTNG43L', mono: true },
  { label: 'Eswatini',         value: 'BTNG44E', mono: true },
  { label: 'Gabon',            value: 'BTNG45G', mono: true },
  { label: 'Gambia',           value: 'BTNG46G', mono: true },
  { label: 'Guinea-Bissau',    value: 'BTNG47G', mono: true },
  { label: 'Equatorial Guinea',value: 'BTNG48E', mono: true },
  { label: 'Cape Verde',       value: 'BTNG49C', mono: true },
  { label: 'São Tomé',         value: 'BTNG50S', mono: true },
  { label: 'Seychelles',       value: 'BTNG51S', mono: true },
  { label: 'Mauritius',        value: 'BTNG52M', mono: true },
  { label: 'Comoros',          value: 'BTNG53C', mono: true },
  { label: 'Djibouti',         value: 'BTNG54D', mono: true },
];

const SERVICE_FILES: SectionItem[] = [
  { label: 'btngSovereignEngineService.ts', value: 'Triple-Key Engine · Ed25519 · SecureStore',   tag: 'v3.0', tagColor: Colors.primary, highlight: true },
  { label: 'btngEngineService.ts',           value: '54-Nation Address Engine · BTNG prefix map',  tag: 'v1.0', tagColor: Colors.success },
  { label: 'btngBankEngine.ts',              value: 'Core bank ledger & accounts',                  tag: 'LIVE', tagColor: Colors.success },
  { label: 'btngWalletService.ts',           value: 'Genesis wallet operations',                    tag: 'LIVE', tagColor: Colors.success },
  { label: 'btng3WalletService.ts',          value: 'HD wallet — Base58Check derivation',           tag: 'LIVE', tagColor: Colors.success },
  { label: 'cashRailService.ts',             value: 'MTN MoMo cash rail (Merchant 248059)',         tag: 'LIVE', tagColor: Colors.warning },
  { label: 'mintingPipelineService.ts',      value: 'BTNGG minting pipeline btngd v1.0',            tag: 'LIVE', tagColor: Colors.success },
  { label: 'verificationPipelineService.ts', value: 'Identity KYC pipeline',                        tag: 'LIVE', tagColor: Colors.success },
  { label: 'kycService.ts',                  value: 'KYC submission management',                    tag: 'LIVE', tagColor: Colors.success },
  { label: 'tradingService.ts',              value: 'Spot trading engine',                          tag: 'LIVE', tagColor: Colors.success },
  { label: 'p2pService.ts',                  value: 'P2P marketplace',                              tag: 'LIVE', tagColor: Colors.success },
  { label: 'portfolioService.ts',            value: 'Portfolio value tracking',                     tag: 'LIVE', tagColor: Colors.success },
  { label: 'pipelineHubService.ts',          value: 'Pipeline hub orchestrator',                    tag: 'LIVE', tagColor: Colors.success },
  { label: 'productEngineService.ts',        value: 'BTNG product engine',                         tag: 'LIVE', tagColor: Colors.success },
  { label: 'authService.ts',                 value: 'Authentication service',                       tag: 'LIVE', tagColor: Colors.success },
  { label: 'cryptoPriceService.ts',          value: 'Live crypto price feeds',                      tag: 'LIVE', tagColor: Colors.success },
  { label: 'exchangeRateService.ts',         value: 'FX exchange rates',                            tag: 'LIVE', tagColor: Colors.success },
  { label: 'blogService.ts',                 value: 'Blog CMS service',                             tag: 'LIVE', tagColor: Colors.success },
  { label: 'profileStorageService.ts',       value: 'User profile storage',                        tag: 'LIVE', tagColor: Colors.success },
  { label: 'twoFactorService.ts',            value: '2FA TOTP management',                         tag: 'LIVE', tagColor: Colors.success },
  { label: 'btngCertificatesService.ts',     value: 'Equity certificates',                         tag: 'LIVE', tagColor: Colors.success },
  { label: 'brainRouterService.ts',          value: 'AI brain router',                              tag: 'LIVE', tagColor: '#9945FF' },
  { label: 'liveDataBootstrap.ts',           value: 'App boot + data seed',                         tag: 'LIVE', tagColor: Colors.success },
];

const EDGE_FUNCTIONS: SectionItem[] = [
  { label: 'btng-brain-router',     value: '/functions/btng-brain-router',     tag: 'AI',      tagColor: '#9945FF' },
  { label: 'btng-pay-gateway',      value: '/functions/btng-pay-gateway',      tag: 'PAYMENT', tagColor: Colors.primary, highlight: true },
  { label: 'btng-reserve-status',   value: '/functions/btng-reserve-status',   tag: 'CHAIN',   tagColor: Colors.warning },
  { label: 'btng-support-chat',     value: '/functions/btng-support-chat',     tag: 'AI',      tagColor: '#9945FF' },
  { label: 'btng-terminal',         value: '/functions/btng-terminal',         tag: 'TRADE',   tagColor: Colors.success },
  { label: 'btng-wallet-generate',  value: '/functions/btng-wallet-generate',  tag: 'WALLET',  tagColor: Colors.primary },
  { label: 'coingecko-prices',      value: '/functions/coingecko-prices',      tag: 'MARKET',  tagColor: '#F7931A' },
  { label: 'eth-blockchain',        value: '/functions/eth-blockchain',        tag: 'BRIDGE',  tagColor: '#627EEA' },
  { label: 'gold-oracle',           value: '/functions/gold-oracle',           tag: 'ORACLE',  tagColor: Colors.primary, highlight: true },
  { label: 'send-otp-email',        value: '/functions/send-otp-email',        tag: 'AUTH',    tagColor: '#3B82F6' },
  { label: 'send-statement-email',  value: '/functions/send-statement-email',  tag: 'EMAIL',   tagColor: '#3B82F6' },
  { label: 'stripe-onramp',         value: '/functions/stripe-onramp',         tag: 'FIAT',    tagColor: '#635BFF' },
  { label: 'verify-otp-email',      value: '/functions/verify-otp-email',      tag: 'AUTH',    tagColor: '#3B82F6' },
];

const DATABASE_TABLES: SectionItem[] = [
  { label: 'user_profiles',              value: 'User accounts + KYC status + tier',             tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_cards',                 value: 'HD vault cards (W/M/E/G/T/V/C types)',           tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_identities',            value: 'BTNG chain identities',                         tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_wallets',               value: 'BTNG wallet records + balances',                 tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_certificates',          value: 'Equity certificates (A/B/C/D grade)',            tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_loans',                 value: 'Loan records + LTV + APR',                       tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_mint_receipts',         value: 'Minting receipts + pipeline stages',             tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_oracle_cache',          value: 'Gold price cache (XAU/USD)',                     tag: 'RLS', tagColor: Colors.primary },
  { label: 'btng_pay_transactions',      value: 'BTNG Pay transactions + signatures',             tag: 'RLS', tagColor: Colors.primary, highlight: true },
  { label: 'btng_equity_pool',           value: 'Equity pool — valuations',                      tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_product_credits',       value: 'Product credits balance',                       tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_credit_transactions',   value: 'Credit earn/spend history',                     tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_verification_receipts', value: 'KYC verification pipeline receipts',            tag: 'RLS', tagColor: Colors.success },
  { label: 'btng_rulings',               value: 'AI brain ruling log',                            tag: 'RLS', tagColor: '#9945FF' },
  { label: 'btng_user_roles',            value: 'User roles + discount eligibility',              tag: 'RLS', tagColor: Colors.success },
  { label: 'kyc_submissions',            value: 'KYC photo submissions + review status',          tag: 'RLS', tagColor: Colors.warning },
  { label: 'orders',                     value: 'Spot trade orders',                              tag: 'RLS', tagColor: Colors.success },
  { label: 'trade_history',              value: 'Trade history + PnL',                            tag: 'RLS', tagColor: Colors.success },
  { label: 'p2p_listings',               value: 'P2P marketplace buy/sell listings',              tag: 'RLS', tagColor: Colors.success },
  { label: 'p2p_orders',                 value: 'P2P orders + escrow status',                     tag: 'RLS', tagColor: Colors.success },
  { label: 'copy_traders',               value: 'Copy trading profiles + stats',                  tag: 'RLS', tagColor: Colors.success },
  { label: 'user_copy_subscriptions',    value: 'User copy trading subscriptions',                tag: 'RLS', tagColor: Colors.success },
  { label: 'blog_articles',              value: 'Blog CMS articles',                              tag: 'RLS', tagColor: Colors.success },
  { label: 'blog_bookmarks',             value: 'Article bookmarks',                              tag: 'RLS', tagColor: Colors.success },
  { label: 'notifications',              value: 'User push notifications',                        tag: 'RLS', tagColor: Colors.success },
  { label: 'cash_rail_transactions',     value: 'MTN MoMo cash rail (Merchant 248059)',           tag: 'RLS', tagColor: Colors.warning, highlight: true },
  { label: 'terminal_traders',           value: 'Terminal trader profiles',                       tag: 'RLS', tagColor: Colors.success },
  { label: 'terminal_assets',            value: 'Terminal listed assets',                         tag: 'RLS', tagColor: Colors.success },
  { label: 'terminal_orders',            value: 'Terminal orders',                                tag: 'RLS', tagColor: Colors.success },
  { label: 'security_events',            value: 'Admin audit trail (info@bituncoin.io only)',     tag: 'RLS', tagColor: Colors.error, highlight: true },
  { label: 'user_2fa',                   value: '2FA TOTP secrets (encrypted)',                   tag: 'RLS', tagColor: Colors.error },
  { label: 'email_otps',                 value: 'Email OTP codes (service_role access)',          tag: 'RLS', tagColor: Colors.warning },
];

const APP_SCREENS_CORE: SectionItem[] = [
  { label: 'Market',   value: '/(tabs)/index',   tag: 'TAB', tagColor: Colors.primary },
  { label: 'Trade',    value: '/(tabs)/trade',   tag: 'TAB', tagColor: Colors.primary },
  { label: 'P2P',      value: '/(tabs)/p2p',     tag: 'TAB', tagColor: Colors.primary },
  { label: 'Wallet',   value: '/(tabs)/wallet',  tag: 'TAB', tagColor: Colors.primary },
  { label: 'Profile',  value: '/(tabs)/profile', tag: 'TAB', tagColor: Colors.primary },
];

const APP_SCREENS_BANK: SectionItem[] = [
  { label: 'Admin Dashboard',      value: '/admin',                    tag: 'ADMIN',  tagColor: Colors.error },
  { label: 'App Builder',          value: '/app-builder',             tag: 'DEV',    tagColor: '#9945FF' },
  { label: 'Dev Master Admin',     value: '/dev-master-admin',        tag: 'DEV',    tagColor: '#9945FF', highlight: true },
  { label: 'BTNG Pay',             value: '/btng-pay',                tag: 'PAY',    tagColor: Colors.success },
  { label: 'Cash Rail',            value: '/cash-rail',               tag: 'BANK',   tagColor: Colors.warning },
  { label: 'BTNG Bank',            value: '/btng-bank',               tag: 'BANK',   tagColor: Colors.primary },
  { label: 'Genesis Wallet',       value: '/btng-genesis',            tag: 'WALLET', tagColor: Colors.primary },
  { label: 'BTNG3 Wallet',         value: '/btng3-wallet',            tag: 'WALLET', tagColor: Colors.primary },
  { label: 'Deposit',              value: '/deposit',                 tag: 'BANK',   tagColor: Colors.success },
  { label: 'Withdraw',             value: '/withdraw',                tag: 'BANK',   tagColor: Colors.error },
  { label: 'Transfer',             value: '/transfer',                tag: 'BANK',   tagColor: Colors.primary },
];

const APP_SCREENS_CRYPTO: SectionItem[] = [
  { label: 'Sovereign Engine',        value: '/btng-sovereign-engine',        tag: 'CRYPTO', tagColor: '#9945FF', highlight: true },
  { label: 'Sovereign Dashboard',     value: '/btng-sovereign-dashboard',     tag: 'CRYPTO', tagColor: '#9945FF' },
  { label: 'Sovereign Docs',          value: '/btng-sovereign-docs',          tag: 'LEGAL',  tagColor: '#3B82F6' },
  { label: 'Block Explorer',          value: '/btng-explorer',                tag: 'CHAIN',  tagColor: '#3B82F6' },
  { label: 'Minting Pipeline',        value: '/btng-minting-pipeline',        tag: 'MINT',   tagColor: Colors.primary },
  { label: 'Verification Pipeline',   value: '/btng-verification-pipeline',   tag: 'KYC',    tagColor: Colors.success },
  { label: 'Pipeline Hub',            value: '/btng-pipeline-hub',            tag: 'OPS',    tagColor: '#9945FF' },
  { label: 'Cert Scanner',            value: '/cert-scanner',                 tag: 'SCAN',   tagColor: Colors.warning },
  { label: 'QR Generator',            value: '/cert-qr-generator',            tag: 'UTIL',   tagColor: Colors.primary },
  { label: 'Governance',              value: '/btng-governance',              tag: 'DAO',    tagColor: '#9945FF' },
  { label: 'BTNG Card',               value: '/btng-card',                    tag: 'CARD',   tagColor: Colors.primary },
  { label: 'Proof of Value',          value: '/btng-proof-of-value',          tag: 'LEGAL',  tagColor: '#3B82F6' },
];

const APP_SCREENS_TRADING: SectionItem[] = [
  { label: 'Copy Trading',    value: '/copy-trading',    tag: 'TRADE', tagColor: Colors.success },
  { label: 'Binary Trading',  value: '/binary-trading',  tag: 'TRADE', tagColor: Colors.error },
  { label: 'Practice Wallet', value: '/practice',        tag: 'TRAIN', tagColor: Colors.primary },
  { label: 'Watchlist',       value: '/watchlist',       tag: 'MARKET',tagColor: Colors.success },
  { label: 'BTNG Terminal',   value: '/btng-terminal',   tag: 'MARKET',tagColor: Colors.success },
  { label: 'Fee Calculator',  value: '/fee-calculator',  tag: 'UTIL',  tagColor: Colors.primary },
  { label: 'FX Converter',    value: '/fx-converter',    tag: 'UTIL',  tagColor: Colors.primary },
];

const APP_SCREENS_DEV: SectionItem[] = [
  { label: 'Node Dashboard',   value: '/btng-node',            tag: 'INFRA', tagColor: '#22C55E' },
  { label: 'Node Engine',      value: '/btng-node-engine',     tag: 'INFRA', tagColor: '#22C55E' },
  { label: 'Node Generator',   value: '/btng-node-generator',  tag: 'INFRA', tagColor: '#22C55E' },
  { label: 'BTNG Deploy',      value: '/btng-deploy',          tag: 'DEVOPS',tagColor: '#F59E0B' },
  { label: 'API Manager',      value: '/btng-api-manager',     tag: 'DEV',   tagColor: '#F59E0B' },
  { label: 'API Key Gen',      value: '/btng-api-key-generator', tag: 'DEV', tagColor: '#F59E0B' },
  { label: 'API Extension',    value: '/btng-api-extension',   tag: 'DEV',   tagColor: '#F59E0B' },
  { label: 'BTNG SDK',         value: '/btng-sdk',             tag: 'SDK',   tagColor: '#9945FF' },
  { label: 'Developer Library',value: '/developer',            tag: 'DEV',   tagColor: '#9945FF' },
  { label: 'Contract Deploy',  value: '/btng-contract-deploy', tag: 'SC',    tagColor: '#627EEA' },
  { label: 'NFT Creator',      value: '/nft-creator',          tag: 'NFT',   tagColor: '#9945FF' },
  { label: 'AI Creator',       value: '/ai-creator',           tag: 'AI',    tagColor: '#9945FF' },
  { label: 'Private Banker AI',value: '/btng-private-banker',  tag: 'AI',    tagColor: '#9945FF', highlight: true },
  { label: 'Support Chat',     value: '/support-chat',         tag: 'AI',    tagColor: '#9945FF' },
  { label: 'Africa Free Trade',value: '/africa-free-trade',    tag: 'TRADE', tagColor: Colors.success },
  { label: 'Africa Value',     value: '/africa-value-engine',  tag: 'ECON',  tagColor: Colors.success },
  { label: 'Global Panel',     value: '/btng-global-panel',    tag: 'GLOBAL',tagColor: Colors.primary },
  { label: 'Eternal Service',  value: '/btng-eternal-service', tag: 'SVC',   tagColor: Colors.primary },
  { label: 'Product Engine',   value: '/btng-product-engine',  tag: 'PROD',  tagColor: Colors.primary },
];

// ─── CHANGELOG DATA ───────────────────────────────────────────────────────────
interface ChangelogEntry {
  version: string;
  date: string;
  author: string;
  title: string;
  color: string;
  items: { type: 'ADDED' | 'REMOVED' | 'CHANGED' | 'FIXED'; text: string }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v4.0.0',
    date: 'June 2026',
    author: 'John Kojo Zi',
    title: 'ENTERPRISE GATEWAY — Master Key + Sandbox + Gateway Security (Visa/Mastercard Scale)',
    color: '#F59E0B',
    items: [
      { type: 'ADDED', text: 'MasterKeyAuthority — Root of Trust: Ed25519 key pair, issues 1-year certs to all entities, signs high-value tx > 10,000 BTNGG' },
      { type: 'ADDED', text: 'SandboxEnvironment — Test mode per merchant: 10,000 BTNGG fake funds, API keys (publicKey + secretKey + webhookSecret), 30-day expiry' },
      { type: 'ADDED', text: 'GatewaySecurityLayer — Fraud rules: 50K/tx, 100K/day, 500K/month, velocity limit 10 tx/min, KYC required, IP whitelist, address blacklist' },
      { type: 'ADDED', text: 'EnterpriseMerchantGateway — Full payment pipeline: security check → client sig → master sig → sandbox/production → gateway receipt' },
      { type: 'ADDED', text: 'BTNGEnterpriseSystem — Unified orchestrator: single entry point for all enterprise operations' },
      { type: 'ADDED', text: 'Dual-signature receipts — Merchant signature + Master signature for all amounts > 10,000 BTNGG' },
      { type: 'ADDED', text: 'Certificate revocation system — instant revoke of any compromised merchant, bank, or client entity' },
      { type: 'ADDED', text: 'Merchant onboarding flow: validate → Ed25519 keygen → master cert → sandbox environment → PENDING_VERIFICATION → ACTIVE' },
      { type: 'ADDED', text: 'Sandbox API key generation: publicKey (32 bytes), secretKey (64 bytes), webhookSecret (32 bytes) — all CSPRNG' },
      { type: 'ADDED', text: 'dev-master/engines/btng-enterprise-v3.js — complete runnable Node.js reference (no external deps)' },
      { type: 'ADDED', text: 'dev-master/engines/enterprise-gateway.README.md — full architecture docs, class reference, merchant onboarding diagram' },
      { type: 'ADDED', text: 'Health tab Gateway card — MasterKeyAuthority + SandboxEnvironment + Fraud Rules summary with Visa/Mastercard Scale badge' },
    ],
  },
  {
    version: 'v3.0.0',
    date: 'June 2026',
    author: 'John Kojo Zi',
    title: 'SOVEREIGN ENGINE MASTERPIECE UPGRADE — Real Ed25519 Cryptography',
    color: Colors.primary,
    items: [
      { type: 'ADDED', text: 'Real Ed25519 key generation via nacl.sign.keyPair() (TweetNaCl)' },
      { type: 'ADDED', text: 'Real Ed25519 signing via nacl.sign.detached()' },
      { type: 'ADDED', text: 'Real Ed25519 verification via nacl.sign.detached.verify()' },
      { type: 'ADDED', text: 'Real SHA-256 via expo-crypto.digestStringAsync()' },
      { type: 'ADDED', text: 'Real CSPRNG via expo-crypto.getRandomBytes()' },
      { type: 'ADDED', text: 'PBKDF2-SHA256 × 4096 rounds key derivation' },
      { type: 'ADDED', text: 'AES-256-XOR + auth tag private key wrapping' },
      { type: 'ADDED', text: 'expo-secure-store (Keychain/Keystore) for private key storage' },
      { type: 'ADDED', text: 'Key fingerprint: SHA-256(pubkey).slice(0,16)' },
      { type: 'ADDED', text: 'CSPRNG nonce in every payment (replay protection)' },
      { type: 'ADDED', text: 'Key archive on wallet reset (last 5 client, last 3 bank)' },
      { type: 'ADDED', text: 'New storage namespace: _v3 (isolated from v1/v2)' },
      { type: 'REMOVED', text: 'Math.random() — replaced with CSPRNG' },
      { type: 'REMOVED', text: 'Fake SHA-256 hash — replaced with expo-crypto' },
      { type: 'REMOVED', text: 'Simulated signatures — replaced with real Ed25519' },
      { type: 'REMOVED', text: 'Base64 encryption — replaced with PBKDF2-XOR key wrap' },
      { type: 'REMOVED', text: 'Demo payment flow — replaced with real cryptographic signing' },
    ],
  },
  {
    version: 'v2.0.0',
    date: 'May 2026',
    author: 'John Kojo Zi',
    title: 'TRIPLE-KEY ARCHITECTURE — 3-Step Payment Pipeline',
    color: '#9945FF',
    items: [
      { type: 'ADDED', text: 'TripleKeyPaymentEngine class — Client → Bank → Merchant' },
      { type: 'ADDED', text: 'MerchantWalletEngine with per-merchant key pairs' },
      { type: 'ADDED', text: 'BankWalletEngine with system-level signing' },
      { type: 'ADDED', text: 'AuditLogger with persistent event log' },
      { type: 'ADDED', text: 'BTNGSovereignEngine orchestrator singleton' },
      { type: 'ADDED', text: 'UI: app/btng-sovereign-engine.tsx (7-tab interface)' },
      { type: 'ADDED', text: 'OS Quick-Launch button in Profile screen' },
      { type: 'ADDED', text: 'Integration in BTNG Pay Security tab' },
      { type: 'ADDED', text: 'Admin Quick-Launch card in admin.tsx' },
    ],
  },
  {
    version: 'v1.0.0',
    date: 'February 2026',
    author: 'John Kojo Zi',
    title: 'GENESIS — BTNG Sovereign Platform Initial Launch',
    color: Colors.success,
    items: [
      { type: 'ADDED', text: 'Ghana Sovereign Node: 168.231.79.52:64799' },
      { type: 'ADDED', text: 'BTNG Mainnet genesis block: 18 February 2026' },
      { type: 'ADDED', text: '54-Nation address engine (BTNG1G through BTNG54D)' },
      { type: 'ADDED', text: 'All 7 address types (W/M/E/G/T/V/C)' },
      { type: 'ADDED', text: 'MTN MoMo integration (Merchant ID: 248059)' },
      { type: 'ADDED', text: 'EKUYE DIGITAL GATEWAY TRUST LTD (CS099020624)' },
      { type: 'ADDED', text: 'Full BTNG Gold Coin platform deployment — 60+ screens' },
    ],
  },
];

// ─── CollapsibleSection Component ────────────────────────────────────────────
function CollapsibleSection({
  title,
  icon,
  iconColor,
  badge,
  badgeColor,
  items,
  defaultOpen = false,
}: {
  title: string;
  icon: string;
  iconColor: string;
  badge?: string;
  badgeColor?: string;
  items: SectionItem[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={s.section}>
      <Pressable
        style={({ pressed }) => [s.sectionHeader, pressed && { opacity: 0.8 }]}
        onPress={() => setOpen(v => !v)}
      >
        <View style={[s.sectionIconWrap, { backgroundColor: iconColor + '18', borderColor: iconColor + '44' }]}>
          <MaterialIcons name={icon as any} size={18} color={iconColor} />
        </View>
        <Text style={s.sectionTitle}>{title}</Text>
        {badge ? (
          <View style={[s.sectionBadge, { backgroundColor: (badgeColor ?? iconColor) + '18', borderColor: (badgeColor ?? iconColor) + '44' }]}>
            <Text style={[s.sectionBadgeText, { color: badgeColor ?? iconColor }]}>{badge}</Text>
          </View>
        ) : null}
        <View style={s.sectionChevron}>
          <MaterialIcons
            name={open ? 'expand-less' : 'expand-more'}
            size={20}
            color={Colors.textMuted}
          />
        </View>
      </Pressable>

      {open ? (
        <View style={s.sectionBody}>
          {items.map((item, idx) => (
            <View
              key={`${item.label}-${idx}`}
              style={[
                s.itemRow,
                item.highlight && { backgroundColor: (item.color ?? iconColor) + '0D', borderLeftWidth: 3, borderLeftColor: item.color ?? iconColor },
                idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
              ]}
            >
              <View style={s.itemLeft}>
                <Text
                  style={[
                    s.itemLabel,
                    item.mono && s.itemLabelMono,
                    item.highlight && { color: Colors.textPrimary, fontWeight: FontWeight.bold },
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                {item.value ? (
                  <Text
                    style={[
                      s.itemValue,
                      item.mono && s.itemValueMono,
                      item.color ? { color: item.color } : null,
                    ]}
                    numberOfLines={2}
                  >
                    {item.value}
                  </Text>
                ) : null}
                {item.sub ? (
                  <Text style={s.itemSub} numberOfLines={1}>{item.sub}</Text>
                ) : null}
              </View>
              {item.tag ? (
                <View style={[s.itemTag, { backgroundColor: (item.tagColor ?? Colors.primary) + '18', borderColor: (item.tagColor ?? Colors.primary) + '44' }]}>
                  <Text style={[s.itemTagText, { color: item.tagColor ?? Colors.primary }]}>{item.tag}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─── ChangelogCard Component ─────────────────────────────────────────────────
function ChangelogCard({ entry }: { entry: ChangelogEntry }) {
  const [open, setOpen] = useState(false);
  const addedCount   = entry.items.filter(i => i.type === 'ADDED').length;
  const removedCount = entry.items.filter(i => i.type === 'REMOVED').length;

  return (
    <View style={[cl.card, { borderLeftColor: entry.color, borderLeftWidth: 3 }]}>
      <Pressable
        style={({ pressed }) => [cl.header, pressed && { opacity: 0.8 }]}
        onPress={() => setOpen(v => !v)}
      >
        <View style={[cl.versionBadge, { backgroundColor: entry.color + '18', borderColor: entry.color + '44' }]}>
          <Text style={[cl.versionText, { color: entry.color }]}>{entry.version}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cl.entryTitle} numberOfLines={2}>{entry.title}</Text>
          <View style={cl.metaRow}>
            <Text style={cl.metaDate}>{entry.date}</Text>
            <View style={cl.metaDot} />
            <Text style={cl.metaAuthor}>{entry.author}</Text>
          </View>
        </View>
        <View style={cl.statCol}>
          {addedCount > 0 ? (
            <View style={cl.statRow}>
              <View style={[cl.statDot, { backgroundColor: Colors.success }]} />
              <Text style={[cl.statText, { color: Colors.success }]}>+{addedCount}</Text>
            </View>
          ) : null}
          {removedCount > 0 ? (
            <View style={cl.statRow}>
              <View style={[cl.statDot, { backgroundColor: Colors.error }]} />
              <Text style={[cl.statText, { color: Colors.error }]}>-{removedCount}</Text>
            </View>
          ) : null}
        </View>
        <MaterialIcons
          name={open ? 'expand-less' : 'expand-more'}
          size={20}
          color={Colors.textMuted}
        />
      </Pressable>

      {open ? (
        <View style={cl.body}>
          {entry.items.map((item, idx) => {
            const typeColor = item.type === 'ADDED' ? Colors.success
              : item.type === 'REMOVED' ? Colors.error
              : item.type === 'CHANGED' ? Colors.warning
              : Colors.info;
            return (
              <View key={idx} style={cl.changeRow}>
                <View style={[cl.changePill, { backgroundColor: typeColor + '18', borderColor: typeColor + '44' }]}>
                  <Text style={[cl.changePillText, { color: typeColor }]}>{item.type}</Text>
                </View>
                <Text style={cl.changeText}>{item.text}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DevMasterAdmin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'manifest' | 'changelog' | 'identity' | 'health'>('manifest');

  const [healthStatus, setHealthStatus] = useState<SystemStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthLastUpdated, setHealthLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh]   = useState(false);
  const [countdown, setCountdown]       = useState(30);
  const [expandedMerchantId, setExpandedMerchantId] = useState<string | null>(null);
  const [merchantKeyMap, setMerchantKeyMap] = useState<Record<string, { publicKey: string; fingerprint: string; algorithm: string; keyId: string }>>({});
  const [copiedMerchantId, setCopiedMerchantId] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportedMerchantId, setExportedMerchantId] = useState<string | null>(null);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [auditLogOpen, setAuditLogOpen]             = useState(false);
  const [auditEntries, setAuditEntries]             = useState<any[]>([]);
  const [auditEntriesLoading, setAuditEntriesLoading] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Define fetchHealth BEFORE the autoRefresh useEffect that depends on it
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      if (!btngSovereignEngine.initialized) {
        await btngSovereignEngine.initialize('Health Check', 'btng_health_readonly', false);
      }
      const status = btngSovereignEngine.getSystemStatus();
      setHealthStatus(status);
      setHealthLastUpdated(new Date());
      const allMerchants = btngSovereignEngine.merchantEngine.getAll();
      const keyMap: Record<string, { publicKey: string; fingerprint: string; algorithm: string; keyId: string }> = {};
      for (const m of allMerchants) {
        keyMap[m.merchantId] = {
          publicKey:   m.wallet.keyPair.publicKey,
          fingerprint: m.wallet.keyPair.fingerprint,
          algorithm:   m.wallet.keyPair.algorithm,
          keyId:       m.wallet.keyPair.keyId,
        };
      }
      setMerchantKeyMap(keyMap);
    } catch (e) {
      setHealthStatus(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Auto-refresh effect — polls every 30 s when enabled
  useEffect(() => {
    if (autoRefresh) {
      setCountdown(30);
      // Fire every 30 s
      autoRefreshRef.current = setInterval(() => {
        fetchHealth();
        setCountdown(30);
      }, 30_000);
      // Tick countdown every 1 s
      countdownRef.current = setInterval(() => {
        setCountdown(prev => (prev <= 1 ? 30 : prev - 1));
      }, 1_000);
    } else {
      if (autoRefreshRef.current) { clearInterval(autoRefreshRef.current); autoRefreshRef.current = null; }
      if (countdownRef.current)   { clearInterval(countdownRef.current);   countdownRef.current   = null; }
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
      if (countdownRef.current)   clearInterval(countdownRef.current);
    };
  }, [autoRefresh, fetchHealth]);

  // Verify Signature tool state
  const [verifySigPubKey,  setVerifySigPubKey]  = useState('');
  const [verifySigMessage, setVerifySigMessage] = useState('');
  const [verifySigHex,     setVerifySigHex]     = useState('');
  const [verifySigResult,  setVerifySigResult]  = useState<'VALID' | 'INVALID' | null>(null);
  const [verifySigError,   setVerifySigError]   = useState('');

  useEffect(() => {
    if (activeTab === 'health') fetchHealth();
  }, [activeTab, fetchHealth]);

  const TABS: { id: 'manifest' | 'changelog' | 'identity' | 'health'; label: string; icon: string }[] = [
    { id: 'manifest',  label: 'Manifest',  icon: 'list-alt' },
    { id: 'changelog', label: 'Changelog', icon: 'history' },
    { id: 'identity',  label: 'Identity',  icon: 'verified' },
    { id: 'health',    label: 'Health',    icon: 'monitor-heart' },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.topBarCenter}>
          <Text style={s.topBarTitle}>Dev Master Admin</Text>
          <Text style={s.topBarSub}>Read-Only · BTNG Bank Reference</Text>
        </View>
        <View style={s.readOnlyBadge}>
          <MaterialIcons name="lock" size={11} color={Colors.warning} />
          <Text style={s.readOnlyText}>READ-ONLY</Text>
        </View>
      </View>

      {/* Hero Banner */}
      <View style={s.heroBanner}>
        <View style={s.heroIconWrap}>
          <Text style={s.heroEmoji}>🏅</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>BTNG SOVEREIGN BANK</Text>
          <Text style={s.heroSub}>Developer Master Admin Folder · v3.0 · June 2026</Text>
          <View style={s.heroTagsRow}>
            {['Ed25519', 'Triple-Key', '54 Nations', 'LIVE'].map(tag => (
              <View key={tag} style={s.heroTag}>
                <Text style={s.heroTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={s.tabRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[s.tab, activeTab === tab.id && s.tabActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={15}
              color={activeTab === tab.id ? Colors.bg : Colors.textMuted}
            />
            <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >

        {/* ── MANIFEST TAB ── */}
        {activeTab === 'manifest' && (
          <View style={s.tabContent}>

            {/* Stats row */}
            <View style={s.statsRow}>
              {[
                { label: 'Engines',    val: '2',  color: Colors.primary },
                { label: 'Services',   val: '23', color: Colors.success },
                { label: 'Tables',     val: '32', color: Colors.warning },
                { label: 'Screens',    val: '60+',color: '#3B82F6' },
                { label: 'Functions',  val: '13', color: '#9945FF' },
              ].map(stat => (
                <View key={stat.label} style={[s.statCard, { borderColor: stat.color + '44' }]}>
                  <Text style={[s.statVal, { color: stat.color }]}>{stat.val}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {/* Sovereign Engine */}
            <CollapsibleSection
              title="Sovereign Engine v3.0 · Classes"
              icon="security"
              iconColor="#9945FF"
              badge="services/btngSovereignEngineService.ts"
              badgeColor="#9945FF"
              items={CRYPTOGRAPHIC_ENGINE_CLASSES}
              defaultOpen
            />

            {/* Crypto Stack */}
            <CollapsibleSection
              title="Cryptographic Stack — ALL REAL, NO SIMULATION"
              icon="enhanced-encryption"
              iconColor={Colors.success}
              badge="Production"
              badgeColor={Colors.success}
              items={CRYPTO_STACK}
              defaultOpen
            />

            {/* Address Types */}
            <CollapsibleSection
              title="Address Engine · 7 Types (W/M/E/G/T/V/C)"
              icon="account-tree"
              iconColor={Colors.primary}
              badge="services/btngEngineService.ts"
              badgeColor={Colors.primary}
              items={ADDRESS_TYPES}
            />

            {/* 54 Nations */}
            <CollapsibleSection
              title="54 Nation Prefixes (BTNG1G → BTNG54D)"
              icon="public"
              iconColor={Colors.success}
              badge="54 Nations"
              badgeColor={Colors.success}
              items={NATION_PREFIXES}
            />

            {/* Service Files */}
            <CollapsibleSection
              title="Bank Infrastructure Services (23 files)"
              icon="folder-open"
              iconColor={Colors.warning}
              badge="services/"
              badgeColor={Colors.warning}
              items={SERVICE_FILES}
            />

            {/* Edge Functions */}
            <CollapsibleSection
              title="Edge Functions (13 deployed)"
              icon="cloud"
              iconColor="#3B82F6"
              badge="OnSpace Cloud"
              badgeColor="#3B82F6"
              items={EDGE_FUNCTIONS}
            />

            {/* Database Tables */}
            <CollapsibleSection
              title="Database Tables (32 tables · All RLS Enabled)"
              icon="storage"
              iconColor={Colors.primary}
              badge="32 tables"
              badgeColor={Colors.primary}
              items={DATABASE_TABLES}
            />

            {/* App Screens — Core */}
            <CollapsibleSection
              title="App Screens — Core Tabs (5)"
              icon="tab"
              iconColor={Colors.primary}
              badge="/(tabs)"
              badgeColor={Colors.primary}
              items={APP_SCREENS_CORE}
            />

            {/* App Screens — Bank */}
            <CollapsibleSection
              title="App Screens — Bank & Payments (11)"
              icon="account-balance"
              iconColor={Colors.warning}
              items={APP_SCREENS_BANK}
            />

            {/* App Screens — Crypto */}
            <CollapsibleSection
              title="App Screens — Crypto & Chain (12)"
              icon="currency-bitcoin"
              iconColor="#F7931A"
              items={APP_SCREENS_CRYPTO}
            />

            {/* App Screens — Trading */}
            <CollapsibleSection
              title="App Screens — Trading & Markets (7)"
              icon="show-chart"
              iconColor={Colors.success}
              items={APP_SCREENS_TRADING}
            />

            {/* App Screens — Dev */}
            <CollapsibleSection
              title="App Screens — Dev, AI & Tools (19)"
              icon="developer-mode"
              iconColor="#9945FF"
              items={APP_SCREENS_DEV}
            />

            {/* Footer note */}
            <View style={s.footerNote}>
              <MaterialIcons name="info-outline" size={13} color={Colors.success} />
              <Text style={s.footerNoteText}>
                This manifest is read-only. All engine source files are in{' '}
                <Text style={s.footerNoteCode}>services/</Text> at the project root.
                Edits must be committed with prefix{' '}
                <Text style={s.footerNoteCode}>[BTNG-MASTER]</Text>.
              </Text>
            </View>
          </View>
        )}

        {/* ── CHANGELOG TAB ── */}
        {activeTab === 'changelog' && (
          <View style={s.tabContent}>
            <View style={s.changelogHeader}>
              <View style={s.changelogIconWrap}>
                <MaterialIcons name="history" size={22} color={Colors.primary} />
              </View>
              <View>
                <Text style={s.changelogTitle}>BTNG Master Changelog</Text>
                <Text style={s.changelogSub}>{CHANGELOG.length} versions · Latest: v3.0.0 · June 2026</Text>
              </View>
            </View>

            {CHANGELOG.map(entry => (
              <ChangelogCard key={entry.version} entry={entry} />
            ))}

            <View style={s.footerNote}>
              <MaterialIcons name="verified-user" size={13} color={Colors.success} />
              <Text style={s.footerNoteText}>
                All versions are production deployments. No demo versions exist.
                BTNG Gold Coin · EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
              </Text>
            </View>
          </View>
        )}

        {/* ── HEALTH TAB ── */}
        {activeTab === 'health' && (
          <View style={s.tabContent}>
            {/* Header */}
            <View style={hs.header}>
              {/* Row 1 — icon + title + manual refresh */}
              <View style={hs.headerRow1}>
                <View style={hs.headerIconWrap}>
                  <MaterialIcons name="monitor-heart" size={22} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={hs.headerTitle}>Live Engine Health</Text>
                  <Text style={hs.headerSub}>
                    {healthLastUpdated
                      ? `Last refreshed ${healthLastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                      : 'Tap Refresh to load engine status'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[hs.refreshBtn, healthLoading && { opacity: 0.5 }]}
                  onPress={fetchHealth}
                  disabled={healthLoading}
                  activeOpacity={0.8}
                >
                  {healthLoading
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <MaterialIcons name="refresh" size={18} color={Colors.primary} />}
                </TouchableOpacity>
              </View>

              {/* Row 2 — auto-refresh toggle + countdown */}
              <View style={hs.autoRefreshRow}>
                <MaterialIcons
                  name="autorenew"
                  size={14}
                  color={autoRefresh ? Colors.success : Colors.textMuted}
                />
                <Text style={[hs.autoRefreshLabel, autoRefresh && { color: Colors.success }]}>
                  Auto-Refresh every 30 s
                </Text>
                {autoRefresh ? (
                  <View style={[hs.countdownPill, countdown <= 5 && { backgroundColor: Colors.warning + '22', borderColor: Colors.warning + '66' }]}>
                    <MaterialIcons
                      name="timer"
                      size={10}
                      color={countdown <= 5 ? Colors.warning : Colors.success}
                    />
                    <Text style={[hs.countdownText, countdown <= 5 && { color: Colors.warning }]}>
                      {countdown}s
                    </Text>
                  </View>
                ) : null}
                <View style={{ flex: 1 }} />
                <Switch
                  value={autoRefresh}
                  onValueChange={v => { setAutoRefresh(v); if (v && !healthStatus) fetchHealth(); }}
                  trackColor={{ false: Colors.bgElevated, true: Colors.success }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {healthLoading && !healthStatus ? (
              <View style={hs.loadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={hs.loadingText}>Loading engine status…</Text>
              </View>
            ) : !healthStatus ? (
              <View style={hs.offlineWrap}>
                <View style={hs.offlineIconWrap}>
                  <MaterialIcons name="cloud-off" size={38} color={Colors.textMuted} />
                </View>
                <Text style={hs.offlineTitle}>Engine Not Initialized</Text>
                <Text style={hs.offlineSub}>Tap Refresh to boot the Sovereign Engine and fetch live status.</Text>
                <TouchableOpacity style={hs.offlineBtn} onPress={fetchHealth} activeOpacity={0.85}>
                  <MaterialIcons name="bolt" size={16} color={Colors.bg} />
                  <Text style={hs.offlineBtnText}>Boot Engine</Text>
                </TouchableOpacity>
              </View>
            ) : (() => {
              // Determine status colors
              const initColor   = healthStatus.initialized ? Colors.success : Colors.error;
              const clientBal   = healthStatus.client?.balance ?? 0;
              const bankBal     = healthStatus.bank.balance;
              const pendingPay  = healthStatus.pendingPayments;
              const auditCount  = healthStatus.auditEntries;
              const merchantCnt = healthStatus.merchants.total;
              const activeMerch = healthStatus.merchants.active;

              const clientColor = clientBal > 100 ? Colors.success : clientBal > 0 ? Colors.warning : Colors.error;
              const bankColor   = bankBal > 1_000_000 ? Colors.success : bankBal > 100_000 ? Colors.warning : Colors.error;
              const pendColor   = pendingPay === 0 ? Colors.success : pendingPay < 3 ? Colors.warning : Colors.error;
              const auditColor  = auditCount > 0 ? Colors.success : Colors.warning;
              const merchColor  = activeMerch === merchantCnt && merchantCnt > 0 ? Colors.success : Colors.warning;

              return (
                <View style={{ gap: Spacing.md }}>
                  {/* Master status banner */}
                  <View style={[hs.statusBanner, { borderColor: initColor + '66', backgroundColor: initColor + '11' }]}>
                    <View style={[hs.statusBannerDot, { backgroundColor: initColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[hs.statusBannerTitle, { color: initColor }]}>
                        {healthStatus.initialized ? 'BTNG Sovereign Engine — ONLINE' : 'Engine Not Initialized'}
                      </Text>
                      <Text style={hs.statusBannerSub}>
                        Ed25519 · Triple-Key Architecture · BTNG-MAINNET
                      </Text>
                    </View>
                    <View style={[hs.statusPill, { backgroundColor: initColor + '22', borderColor: initColor + '55' }]}>
                      <Text style={[hs.statusPillText, { color: initColor }]}>
                        {healthStatus.initialized ? 'LIVE' : 'OFFLINE'}
                      </Text>
                    </View>
                  </View>

                  {/* Summary stats grid */}
                  <View style={hs.statsGrid}>
                    {[
                      { label: 'Merchants',     val: `${activeMerch}/${merchantCnt}`, color: merchColor, icon: 'store' },
                      { label: 'Pending Pay',   val: String(pendingPay),              color: pendColor,   icon: 'pending-actions' },
                      { label: 'Audit Entries', val: String(auditCount),              color: auditColor,  icon: 'history' },
                      { label: 'Client Txns',   val: String(healthStatus.client?.txCount ?? 0), color: Colors.primary, icon: 'receipt-long' },
                    ].map(stat => (
                      <View key={stat.label} style={[hs.statCard, { borderColor: stat.color + '44' }]}>
                        <MaterialIcons name={stat.icon as any} size={16} color={stat.color} />
                        <Text style={[hs.statVal, { color: stat.color }]}>{stat.val}</Text>
                        <Text style={hs.statLabel}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Client Wallet Card */}
                  <View style={[hs.healthCard, { borderLeftColor: clientColor }]}>
                    <View style={hs.healthCardHeader}>
                      <View style={[hs.healthCardIcon, { backgroundColor: clientColor + '18', borderColor: clientColor + '44' }]}>
                        <MaterialIcons name="account-balance-wallet" size={18} color={clientColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.healthCardTitle}>Client Wallet</Text>
                        <Text style={hs.healthCardSub}>{healthStatus.client?.name ?? 'Not loaded'}</Text>
                      </View>
                      <View style={[hs.statusIndicator, { backgroundColor: clientColor }]} />
                    </View>
                    <View style={hs.healthCardBody}>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Balance</Text>
                        <Text style={[hs.healthRowVal, { color: clientColor }]}>
                          {healthStatus.client ? `${healthStatus.client.balance.toFixed(4)} BTNGG` : '—'}
                        </Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Wallet ID</Text>
                        <Text style={hs.healthRowMono} numberOfLines={1}>
                          {healthStatus.client?.walletId?.slice(0, 16) ?? '—'}…
                        </Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Public Key</Text>
                        <Text style={hs.healthRowMono} numberOfLines={1}>
                          {healthStatus.client ? healthStatus.client.publicKey.slice(0, 20) + '…' : '—'}
                        </Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Transactions</Text>
                        <Text style={hs.healthRowVal}>{healthStatus.client?.txCount ?? 0}</Text>
                      </View>
                    </View>
                    <View style={[hs.statusBar, { backgroundColor: clientColor }]}>
                      <MaterialIcons name={clientBal > 0 ? 'check-circle' : 'warning'} size={11} color={Colors.bg} />
                      <Text style={hs.statusBarText}>
                        {clientBal > 100 ? 'Healthy — Sufficient Balance'
                          : clientBal > 0 ? 'Warning — Low Balance'
                          : 'Critical — Zero Balance'}
                      </Text>
                    </View>
                  </View>

                  {/* Bank Wallet Card */}
                  <View style={[hs.healthCard, { borderLeftColor: bankColor }]}>
                    <View style={hs.healthCardHeader}>
                      <View style={[hs.healthCardIcon, { backgroundColor: bankColor + '18', borderColor: bankColor + '44' }]}>
                        <MaterialIcons name="account-balance" size={18} color={bankColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.healthCardTitle}>Bank System Wallet</Text>
                        <Text style={hs.healthCardSub}>EKUYE DIGITAL GATEWAY TRUST LTD</Text>
                      </View>
                      <View style={[hs.statusIndicator, { backgroundColor: bankColor }]} />
                    </View>
                    <View style={hs.healthCardBody}>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Liquidity Balance</Text>
                        <Text style={[hs.healthRowVal, { color: bankColor }]}>
                          {healthStatus.bank.balance.toLocaleString('en-US', { maximumFractionDigits: 0 })} BTNGG
                        </Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Settlements</Text>
                        <Text style={hs.healthRowVal}>{healthStatus.bank.totalSettlements}</Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Bank Public Key</Text>
                        <Text style={hs.healthRowMono} numberOfLines={1}>
                          {healthStatus.bank.publicKey ? healthStatus.bank.publicKey.slice(0, 20) + '…' : 'Generating…'}
                        </Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Algorithm</Text>
                        <Text style={[hs.healthRowVal, { color: Colors.success }]}>Ed25519 · BTNG-MAINNET</Text>
                      </View>
                    </View>
                    <View style={[hs.statusBar, { backgroundColor: bankColor }]}>
                      <MaterialIcons name={bankBal > 1_000_000 ? 'check-circle' : 'warning'} size={11} color={Colors.bg} />
                      <Text style={hs.statusBarText}>
                        {bankBal > 1_000_000 ? 'Healthy — Full Liquidity Reserve'
                          : bankBal > 100_000 ? 'Warning — Reduced Liquidity'
                          : 'Critical — Low Bank Reserve'}
                      </Text>
                    </View>
                  </View>

                  {/* Merchants Card */}
                  <View style={[hs.healthCard, { borderLeftColor: merchColor }]}>
                    <View style={hs.healthCardHeader}>
                      <View style={[hs.healthCardIcon, { backgroundColor: merchColor + '18', borderColor: merchColor + '44' }]}>
                        <MaterialIcons name="storefront" size={18} color={merchColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.healthCardTitle}>Merchant Registry</Text>
                        <Text style={hs.healthCardSub}>{activeMerch} active of {merchantCnt} total</Text>
                      </View>
                      <View style={[hs.statusIndicator, { backgroundColor: merchColor }]} />
                    </View>
                    <View style={hs.healthCardBody}>
                      {healthStatus.merchants.list.map((m, i) => {
                        const isExpMerch = expandedMerchantId === m.id;
                        const keyInfo = merchantKeyMap[m.id];
                        return (
                          <View key={m.id}>
                            <TouchableOpacity
                              style={[hs.merchantRow, i < healthStatus.merchants.list.length - 1 && !isExpMerch && { borderBottomWidth: 1, borderBottomColor: Colors.border + '55' }]}
                              onPress={() => setExpandedMerchantId(isExpMerch ? null : m.id)}
                              activeOpacity={0.75}
                            >
                              <View style={hs.merchantDot} />
                              <Text style={hs.merchantName} numberOfLines={1}>{m.name}</Text>
                              <Text style={[hs.merchantBal, { color: m.balance > 0 ? Colors.success : Colors.textMuted }]}>
                                {m.balance.toFixed(2)} BTNGG
                              </Text>
                              <View style={hs.merchantInvoiceBadge}>
                                <Text style={hs.merchantInvoiceText}>{m.invoices} inv</Text>
                              </View>
                              <MaterialIcons
                                name={isExpMerch ? 'expand-less' : 'expand-more'}
                                size={15}
                                color={Colors.textMuted}
                              />
                            </TouchableOpacity>

                            {isExpMerch ? (
                              <View style={[hs.merchantDetail, i < healthStatus.merchants.list.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border + '55' }]}>
                                {/* Public Key */}
                                <View style={hs.merchantDetailRow}>
                                  <View style={hs.merchantDetailLabelRow}>
                                    <MaterialIcons name="vpn-key" size={11} color="#9945FF" />
                                    <Text style={hs.merchantDetailLabel}>Public Key (Ed25519)</Text>
                                  </View>
                                  <View style={hs.merchantPubKeyRow}>
                                    <Text style={[hs.merchantDetailMono, { flex: 1 }]} numberOfLines={3}>
                                      {keyInfo ? keyInfo.publicKey : '—'}
                                    </Text>
                                    {keyInfo ? (
                                      <TouchableOpacity
                                        style={[
                                          hs.copyKeyBtn,
                                          copiedMerchantId === m.id && hs.copyKeyBtnCopied,
                                        ]}
                                        onPress={() => {
                                          Clipboard.setStringAsync(keyInfo.publicKey);
                                          if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
                                          setCopiedMerchantId(m.id);
                                          copiedTimerRef.current = setTimeout(() => setCopiedMerchantId(null), 2000);
                                        }}
                                        activeOpacity={0.75}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                      >
                                        <MaterialIcons
                                          name={copiedMerchantId === m.id ? 'check' : 'content-copy'}
                                          size={12}
                                          color={copiedMerchantId === m.id ? Colors.success : '#9945FF'}
                                        />
                                        <Text
                                          style={[
                                            hs.copyKeyBtnText,
                                            copiedMerchantId === m.id && { color: Colors.success },
                                          ]}
                                        >
                                          {copiedMerchantId === m.id ? 'Copied!' : 'Copy'}
                                        </Text>
                                      </TouchableOpacity>
                                    ) : null}
                                  </View>
                                </View>
                                {/* Fingerprint */}
                                <View style={hs.merchantDetailRow}>
                                  <View style={hs.merchantDetailLabelRow}>
                                    <MaterialIcons name="fingerprint" size={11} color={Colors.primary} />
                                    <Text style={hs.merchantDetailLabel}>Fingerprint (SHA-256 · 8 bytes)</Text>
                                  </View>
                                  <View style={hs.merchantFingerprintBadge}>
                                    <Text style={hs.merchantFingerprintText}>
                                      {keyInfo ? keyInfo.fingerprint : '—'}
                                    </Text>
                                  </View>
                                </View>
                                {/* Algorithm */}
                                <View style={hs.merchantDetailRow}>
                                  <View style={hs.merchantDetailLabelRow}>
                                    <MaterialIcons name="security" size={11} color={Colors.success} />
                                    <Text style={hs.merchantDetailLabel}>Algorithm</Text>
                                  </View>
                                  <View style={hs.merchantAlgoBadge}>
                                    <MaterialIcons name="check-circle" size={10} color={Colors.success} />
                                    <Text style={hs.merchantAlgoText}>{keyInfo ? keyInfo.algorithm : 'Ed25519'}</Text>
                                  </View>
                                </View>
                                {/* Key ID */}
                                <View style={[hs.merchantDetailRow, { borderBottomWidth: 0 }]}>
                                  <View style={hs.merchantDetailLabelRow}>
                                    <MaterialIcons name="tag" size={11} color={Colors.textMuted} />
                                    <Text style={hs.merchantDetailLabel}>Key ID</Text>
                                  </View>
                                  <Text style={[hs.merchantDetailMono, { fontSize: 9, color: Colors.textMuted }]} numberOfLines={1}>
                                    {keyInfo ? keyInfo.keyId : '—'}
                                  </Text>
                                </View>
                                {/* Storage note */}
                                <View style={hs.merchantKeyNote}>
                                  <MaterialIcons name="lock" size={10} color={Colors.warning} />
                                  <Text style={hs.merchantKeyNoteText}>
                                    Private key secured in expo-secure-store (Keychain/Keystore) · Never exposed
                                  </Text>
                                </View>

                                {/* Export JSON */}
                                {keyInfo ? (
                                  <TouchableOpacity
                                    style={[
                                      hs.exportJsonBtn,
                                      exportedMerchantId === m.id && hs.exportJsonBtnCopied,
                                    ]}
                                    onPress={() => {
                                      const merchant = healthStatus.merchants.list.find(mer => mer.id === m.id);
                                      const json = JSON.stringify({
                                        merchant:    merchant?.name ?? '',
                                        publicKey:   keyInfo.publicKey,
                                        fingerprint: keyInfo.fingerprint,
                                        algorithm:   keyInfo.algorithm,
                                        keyId:       keyInfo.keyId,
                                      }, null, 2);
                                      Clipboard.setStringAsync(json);
                                      if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
                                      setExportedMerchantId(m.id);
                                      exportTimerRef.current = setTimeout(() => setExportedMerchantId(null), 2000);
                                    }}
                                    activeOpacity={0.75}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <MaterialIcons
                                      name={exportedMerchantId === m.id ? 'check-circle' : 'file-download'}
                                      size={12}
                                      color={exportedMerchantId === m.id ? Colors.success : Colors.primary}
                                    />
                                    <Text
                                      style={[
                                        hs.exportJsonBtnText,
                                        exportedMerchantId === m.id && { color: Colors.success },
                                      ]}
                                    >
                                      {exportedMerchantId === m.id ? 'Copied JSON!' : 'Export JSON'}
                                    </Text>
                                    {exportedMerchantId !== m.id ? (
                                      <View style={hs.exportJsonBadge}>
                                        <Text style={hs.exportJsonBadgeText}>5 fields</Text>
                                      </View>
                                    ) : null}
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                    <View style={[hs.statusBar, { backgroundColor: merchColor }]}>
                      <MaterialIcons name={activeMerch === merchantCnt ? 'check-circle' : 'warning'} size={11} color={Colors.bg} />
                      <Text style={hs.statusBarText}>
                        {activeMerch === merchantCnt ? `All ${merchantCnt} merchants active · Ed25519 keys loaded` : `${merchantCnt - activeMerch} merchant(s) inactive`}
                      </Text>
                    </View>
                  </View>

                  {/* Pending Payments Card */}
                  <View style={[hs.healthCard, { borderLeftColor: pendColor }]}>
                    <View style={hs.healthCardHeader}>
                      <View style={[hs.healthCardIcon, { backgroundColor: pendColor + '18', borderColor: pendColor + '44' }]}>
                        <MaterialIcons name="pending-actions" size={18} color={pendColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.healthCardTitle}>Payment Pipeline</Text>
                        <Text style={hs.healthCardSub}>Triple-Key Architecture · Client → Bank → Merchant</Text>
                      </View>
                      <View style={[hs.statusIndicator, { backgroundColor: pendColor }]} />
                    </View>
                    <View style={hs.healthCardBody}>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Pending Payments</Text>
                        <Text style={[hs.healthRowVal, { color: pendColor }]}>{pendingPay}</Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Required Signatures</Text>
                        <Text style={hs.healthRowVal}>3 (Client + Bank + Merchant)</Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Signing Algorithm</Text>
                        <Text style={[hs.healthRowVal, { color: Colors.success }]}>Ed25519 — Real Cryptography</Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Pipeline Status</Text>
                        <Text style={[hs.healthRowVal, { color: pendColor }]}>
                          {pendingPay === 0 ? 'All Clear — No Pending' : `${pendingPay} awaiting signature`}
                        </Text>
                      </View>
                    </View>
                    <View style={[hs.statusBar, { backgroundColor: pendColor }]}>
                      <MaterialIcons name={pendingPay === 0 ? 'check-circle' : 'schedule'} size={11} color={Colors.bg} />
                      <Text style={hs.statusBarText}>
                        {pendingPay === 0 ? 'Payment pipeline clear' : `${pendingPay} payment(s) in progress`}
                      </Text>
                    </View>
                  </View>

                  {/* Audit Log Card */}
                  <View style={[hs.healthCard, { borderLeftColor: auditColor }]}>
                    <View style={hs.healthCardHeader}>
                      <View style={[hs.healthCardIcon, { backgroundColor: auditColor + '18', borderColor: auditColor + '44' }]}>
                        <MaterialIcons name="history" size={18} color={auditColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.healthCardTitle}>Audit Log</Text>
                        <Text style={hs.healthCardSub}>Immutable engine event log · AsyncStorage</Text>
                      </View>
                      <View style={[hs.statusIndicator, { backgroundColor: auditColor }]} />
                    </View>
                    <View style={hs.healthCardBody}>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Total Entries</Text>
                        <Text style={[hs.healthRowVal, { color: auditColor }]}>{auditCount}</Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Storage</Text>
                        <Text style={hs.healthRowVal}>AsyncStorage · btng_sovereign_audit_log_v3</Text>
                      </View>
                      <View style={hs.healthRow}>
                        <Text style={hs.healthRowLabel}>Capacity</Text>
                        <Text style={hs.healthRowVal}>500 entries max (ring buffer)</Text>
                      </View>
                    </View>
                    <View style={[hs.statusBar, { backgroundColor: auditColor }]}>
                      <MaterialIcons name={auditCount > 0 ? 'check-circle' : 'info'} size={11} color={Colors.bg} />
                      <Text style={hs.statusBarText}>
                        {auditCount > 0 ? `${auditCount} audit entries recorded` : 'No entries yet — engine not booted'}
                      </Text>
                    </View>
                  </View>

                  {/* ── Audit Log Card ── */}
                  <View style={[hs.healthCard, { borderLeftColor: auditColor }]}>
                    <TouchableOpacity
                      style={hs.healthCardHeader}
                      onPress={async () => {
                        const next = !auditLogOpen;
                        setAuditLogOpen(next);
                        if (next && auditEntries.length === 0) {
                          setAuditEntriesLoading(true);
                          try {
                            const all = btngSovereignEngine.auditLogger.getAll?.() ?? [];
                            // Newest first, capped at 20
                            setAuditEntries([...all].reverse().slice(0, 20));
                          } catch {
                            setAuditEntries([]);
                          } finally {
                            setAuditEntriesLoading(false);
                          }
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={[hs.healthCardIcon, { backgroundColor: auditColor + '18', borderColor: auditColor + '44' }]}>
                        <MaterialIcons name="history" size={18} color={auditColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.healthCardTitle}>Audit Log</Text>
                        <Text style={hs.healthCardSub}>Immutable engine event log · last 20 entries</Text>
                      </View>
                      <View style={[hs.statusIndicator, { backgroundColor: auditColor }]} />
                      <MaterialIcons
                        name={auditLogOpen ? 'expand-less' : 'expand-more'}
                        size={18}
                        color={Colors.textMuted}
                      />
                    </TouchableOpacity>

                    {auditLogOpen ? (
                      <View style={hs.auditBody}>
                        {auditEntriesLoading ? (
                          <View style={hs.auditLoading}>
                            <ActivityIndicator size="small" color={auditColor} />
                            <Text style={hs.auditLoadingText}>Loading audit log…</Text>
                          </View>
                        ) : auditEntries.length === 0 ? (
                          <View style={hs.auditEmpty}>
                            <MaterialIcons name="info-outline" size={20} color={Colors.textMuted} />
                            <Text style={hs.auditEmptyText}>No audit entries yet — engine events will appear here after first boot.</Text>
                          </View>
                        ) : (
                          auditEntries.map((entry: any, idx: number) => {
                            const action: string = entry.action ?? entry.type ?? entry.event ?? 'EVENT';
                            const entity: string = entry.entity ?? entry.entityType ?? entry.walletType ?? 'ENGINE';
                            const ts: number     = entry.timestamp ?? entry.ts ?? entry.createdAt ?? 0;
                            const details: string = entry.details ?? entry.message ?? entry.data
                              ? (typeof (entry.details ?? entry.message ?? entry.data) === 'object'
                                  ? JSON.stringify(entry.details ?? entry.message ?? entry.data)
                                  : String(entry.details ?? entry.message ?? entry.data))
                              : '';
                            const tsDate = ts ? new Date(ts) : null;
                            const tsLabel = tsDate
                              ? tsDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                              : '—';

                            // Colour-code by entity type
                            const entityColor =
                              entity.toLowerCase().includes('bank')     ? Colors.primary
                              : entity.toLowerCase().includes('merchant') ? '#F59E0B'
                              : entity.toLowerCase().includes('client')   ? Colors.success
                              : entity.toLowerCase().includes('payment')  ? '#9945FF'
                              : Colors.textMuted;

                            return (
                              <View
                                key={`${ts}-${idx}`}
                                style={[
                                  hs.auditRow,
                                  idx < auditEntries.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
                                ]}
                              >
                                {/* Action label */}
                                <View style={hs.auditActionWrap}>
                                  <Text style={hs.auditAction} numberOfLines={1}>
                                    {action.toUpperCase().slice(0, 22)}
                                  </Text>
                                </View>

                                <View style={{ flex: 1, gap: 2 }}>
                                  {/* Entity badge + timestamp */}
                                  <View style={hs.auditMetaRow}>
                                    <View style={[hs.auditEntityBadge, { backgroundColor: entityColor + '18', borderColor: entityColor + '44' }]}>
                                      <Text style={[hs.auditEntityText, { color: entityColor }]} numberOfLines={1}>
                                        {entity.toUpperCase().slice(0, 14)}
                                      </Text>
                                    </View>
                                    <Text style={hs.auditTs}>{tsLabel}</Text>
                                    <View style={{ flex: 1 }} />
                                    <Text style={hs.auditIndex}>#{auditEntries.length - idx}</Text>
                                  </View>

                                  {/* Truncated details */}
                                  {details ? (
                                    <Text style={hs.auditDetails} numberOfLines={2}>
                                      {details.slice(0, 120)}{details.length > 120 ? '…' : ''}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                            );
                          })
                        )}
                        {/* Refresh entries button */}
                        <TouchableOpacity
                          style={hs.auditRefreshBtn}
                          onPress={async () => {
                            setAuditEntriesLoading(true);
                            try {
                              const all = btngSovereignEngine.auditLogger.getAll?.() ?? [];
                              setAuditEntries([...all].reverse().slice(0, 20));
                            } catch { setAuditEntries([]); }
                            finally { setAuditEntriesLoading(false); }
                          }}
                          activeOpacity={0.75}
                        >
                          <MaterialIcons name="refresh" size={13} color={Colors.textMuted} />
                          <Text style={hs.auditRefreshText}>Reload entries</Text>
                          <View style={hs.auditCountBadge}>
                            <Text style={hs.auditCountText}>{auditEntries.length} / 20</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <View style={[hs.statusBar, { backgroundColor: auditColor }]}>
                      <MaterialIcons name={auditCount > 0 ? 'check-circle' : 'info'} size={11} color={Colors.bg} />
                      <Text style={hs.statusBarText}>
                        {auditCount > 0 ? `${auditCount} audit entries recorded` : 'No entries yet — engine not booted'}
                      </Text>
                    </View>
                  </View>

                  {/* ── Gateway Card ── */}
                  <View style={[hs.healthCard, { borderLeftColor: '#F59E0B' }]}>
                    <View style={hs.healthCardHeader}>
                      <View style={[hs.healthCardIcon, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B44' }]}>
                        <MaterialIcons name="shield" size={18} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.healthCardTitle}>Enterprise Gateway</Text>
                        <Text style={hs.healthCardSub}>Master Key · Sandbox · Fraud Rules</Text>
                      </View>
                      <View style={hs.gatewayScaleBadge}>
                        <MaterialIcons name="credit-card" size={10} color="#F59E0B" />
                        <Text style={hs.gatewayScaleText}>Visa/Mastercard Scale</Text>
                      </View>
                    </View>

                    {/* MasterKeyAuthority section */}
                    <View style={hs.gatewaySection}>
                      <View style={hs.gatewaySectionHeader}>
                        <MaterialIcons name="lock" size={13} color="#9945FF" />
                        <Text style={[hs.gatewaySectionTitle, { color: '#9945FF' }]}>MasterKeyAuthority — Root of Trust</Text>
                        <View style={[hs.gatewaySectionBadge, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                          <Text style={[hs.gatewaySectionBadgeText, { color: '#9945FF' }]}>BTNG_MASTER_ROOT</Text>
                        </View>
                      </View>
                      {([
                        { k: 'Version',              v: 'v3.0 — Enterprise Grade',         hi: true },
                        { k: 'Algorithm',            v: 'Ed25519 (SHA-256 signed)',         c: Colors.success },
                        { k: 'Max Tx Amount',        v: '100,000 BTNGG',                   c: Colors.warning },
                        { k: 'Min Confirmations',    v: '3 required',                      c: Colors.primary },
                        { k: 'Master Sig Required',  v: 'Yes — amounts > 10,000 BTNGG',    c: Colors.error },
                        { k: 'Fraud Detection',      v: 'Enabled',                         c: Colors.success },
                        { k: 'Cert Validity',        v: '1 year per entity',               c: Colors.textSecondary },
                        { k: 'Certificate Revoke',   v: 'Instant via revokeCertificate()', c: Colors.warning },
                      ] as {k:string;v:string;hi?:boolean;c?:string}[]).map((row, i, arr) => (
                        <View key={row.k} style={[hs.gatewayRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border + '44' }, row.hi ? { backgroundColor: '#9945FF08' } : null]}>
                          <Text style={hs.gatewayRowKey}>{row.k}</Text>
                          <Text style={[hs.gatewayRowVal, row.c ? { color: row.c } : null]} numberOfLines={1}>{row.v}</Text>
                        </View>
                      ))}
                    </View>

                    {/* SandboxEnvironment section */}
                    <View style={[hs.gatewaySection, { borderTopWidth: 1, borderTopColor: Colors.border + '55' }]}>
                      <View style={hs.gatewaySectionHeader}>
                        <MaterialIcons name="science" size={13} color="#3B82F6" />
                        <Text style={[hs.gatewaySectionTitle, { color: '#3B82F6' }]}>SandboxEnvironment — Test Mode</Text>
                        <View style={[hs.gatewaySectionBadge, { backgroundColor: '#3B82F618', borderColor: '#3B82F644' }]}>
                          <Text style={[hs.gatewaySectionBadgeText, { color: '#3B82F6' }]}>SANDBOX</Text>
                        </View>
                      </View>
                      {([
                        { k: 'Default Test Funds',   v: '10,000 BTNGG (fake)',              hi: true },
                        { k: 'Max Tx (sandbox)',      v: '1,000 BTNGG',                     c: Colors.warning },
                        { k: 'Daily Limit',           v: '5,000 BTNGG',                    c: Colors.warning },
                        { k: 'Monthly Limit',         v: '25,000 BTNGG',                   c: Colors.warning },
                        { k: 'Sandbox Expiry',        v: '30 days per environment',        c: Colors.textSecondary },
                        { k: 'API Keys',              v: 'publicKey + secretKey + webhook', c: Colors.primary },
                        { k: 'Rate Limit',            v: '100 requests / min',             c: Colors.success },
                        { k: 'Mode Flag',             v: 'mode: SANDBOX (auto)',           c: Colors.textMuted },
                      ] as {k:string;v:string;hi?:boolean;c?:string}[]).map((row, i, arr) => (
                        <View key={row.k} style={[hs.gatewayRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border + '44' }, row.hi ? { backgroundColor: '#3B82F608' } : null]}>
                          <Text style={hs.gatewayRowKey}>{row.k}</Text>
                          <Text style={[hs.gatewayRowVal, row.c ? { color: row.c } : null]} numberOfLines={1}>{row.v}</Text>
                        </View>
                      ))}
                    </View>

                    {/* GatewaySecurityLayer fraud rules */}
                    <View style={[hs.gatewaySection, { borderTopWidth: 1, borderTopColor: Colors.border + '55' }]}>
                      <View style={hs.gatewaySectionHeader}>
                        <MaterialIcons name="security" size={13} color={Colors.error} />
                        <Text style={[hs.gatewaySectionTitle, { color: Colors.error }]}>GatewaySecurityLayer — Fraud Rules</Text>
                        <View style={[hs.gatewaySectionBadge, { backgroundColor: Colors.errorBg, borderColor: Colors.error + '44' }]}>
                          <Text style={[hs.gatewaySectionBadgeText, { color: Colors.error }]}>LIVE</Text>
                        </View>
                      </View>
                      {([
                        { k: 'Max per Transaction',  v: '50,000 BTNGG',          c: Colors.error,         hi: true },
                        { k: 'Max per Day',          v: '100,000 BTNGG',         c: Colors.error,         hi: true },
                        { k: 'Max per Month',        v: '500,000 BTNGG',         c: Colors.warning },
                        { k: 'KYC Required',         v: 'Yes — mandatory',       c: Colors.success,       hi: true },
                        { k: 'Velocity Limit',       v: '10 tx / minute',        c: Colors.warning },
                        { k: 'IP Whitelist',         v: 'Optional per merchant', c: Colors.textSecondary },
                        { k: 'Address Blacklist',    v: 'Configurable Set',      c: Colors.textSecondary },
                        { k: 'Allowlist Mode',       v: 'Off by default',        c: Colors.textMuted },
                        { k: 'Fraud Detection',      v: 'Enabled — 4 checks',    c: Colors.success },
                      ] as {k:string;v:string;hi?:boolean;c?:string}[]).map((row, i, arr) => (
                        <View key={row.k} style={[hs.gatewayRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border + '44' }, row.hi ? { backgroundColor: Colors.errorBg } : null]}>
                          <Text style={hs.gatewayRowKey}>{row.k}</Text>
                          <Text style={[hs.gatewayRowVal, row.c ? { color: row.c } : null]} numberOfLines={1}>{row.v}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Checks pipeline */}
                    <View style={hs.gatewayChecksRow}>
                      {([
                        { label: 'Limit',     icon: 'block',     color: Colors.error   },
                        { label: 'Rate',      icon: 'speed',     color: Colors.warning },
                        { label: 'Whitelist', icon: 'checklist', color: '#3B82F6'      },
                        { label: 'Blacklist', icon: 'gpp-bad',   color: Colors.error   },
                      ] as {label:string;icon:string;color:string}[]).map((check, i, arr) => (
                        <React.Fragment key={check.label}>
                          <View style={hs.gatewayCheckItem}>
                            <MaterialIcons name={check.icon as any} size={14} color={check.color} />
                            <Text style={[hs.gatewayCheckLabel, { color: check.color }]}>{check.label}</Text>
                          </View>
                          {i < arr.length - 1 ? (
                            <MaterialIcons name="arrow-forward" size={12} color={Colors.border} />
                          ) : null}
                        </React.Fragment>
                      ))}
                    </View>

                    <View style={[hs.statusBar, { backgroundColor: '#F59E0B' }]}>
                      <MaterialIcons name="verified-user" size={11} color={Colors.bg} />
                      <Text style={hs.statusBarText}>Enterprise Gateway v3.0 · Visa/Mastercard Scale Security Architecture</Text>
                    </View>
                  </View>

                  {/* Legend */}
                  <View style={hs.legend}>
                    <Text style={hs.legendTitle}>Status Legend</Text>
                    <View style={hs.legendRow}>
                      {[
                        { color: Colors.success, label: 'Healthy' },
                        { color: Colors.warning, label: 'Warning' },
                        { color: Colors.error,   label: 'Critical' },
                      ].map(l => (
                        <View key={l.label} style={hs.legendItem}>
                          <View style={[hs.legendDot, { backgroundColor: l.color }]} />
                          <Text style={[hs.legendLabel, { color: l.color }]}>{l.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* ── Verify Signature Tool ── */}
                  <View style={hs.verifyCard}>
                    <View style={hs.verifyCardHeader}>
                      <View style={[hs.healthCardIcon, { backgroundColor: '#9945FF18', borderColor: '#9945FF44' }]}>
                        <MaterialIcons name="verified" size={18} color="#9945FF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.healthCardTitle}>Verify Ed25519 Signature</Text>
                        <Text style={hs.healthCardSub}>Audit any signature — no production data touched</Text>
                      </View>
                    </View>

                    <View style={hs.verifyBody}>
                      <Text style={hs.verifyFieldLabel}>Public Key (hex · 64 chars)</Text>
                      <TextInput
                        style={hs.verifyInput}
                        value={verifySigPubKey}
                        onChangeText={v => { setVerifySigPubKey(v); setVerifySigResult(null); setVerifySigError(''); }}
                        placeholder="ed25519 public key hex…"
                        placeholderTextColor={Colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline
                      />

                      <Text style={hs.verifyFieldLabel}>Message (original text or tx hash)</Text>
                      <TextInput
                        style={hs.verifyInput}
                        value={verifySigMessage}
                        onChangeText={v => { setVerifySigMessage(v); setVerifySigResult(null); setVerifySigError(''); }}
                        placeholder="Original message or 0x… tx hash…"
                        placeholderTextColor={Colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline
                      />

                      <Text style={hs.verifyFieldLabel}>Signature (hex · 128 chars)</Text>
                      <TextInput
                        style={hs.verifyInput}
                        value={verifySigHex}
                        onChangeText={v => { setVerifySigHex(v); setVerifySigResult(null); setVerifySigError(''); }}
                        placeholder="ed25519 detached signature hex…"
                        placeholderTextColor={Colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline
                      />

                      {verifySigError ? (
                        <View style={hs.verifyErrorRow}>
                          <MaterialIcons name="error-outline" size={13} color={Colors.error} />
                          <Text style={hs.verifyErrorText}>{verifySigError}</Text>
                        </View>
                      ) : null}

                      {verifySigResult ? (
                        <View style={[
                          hs.verifyResultBanner,
                          {
                            backgroundColor: verifySigResult === 'VALID' ? Colors.success + '18' : Colors.error + '18',
                            borderColor:     verifySigResult === 'VALID' ? Colors.success + '66' : Colors.error + '66',
                          },
                        ]}>
                          <MaterialIcons
                            name={verifySigResult === 'VALID' ? 'check-circle' : 'cancel'}
                            size={22}
                            color={verifySigResult === 'VALID' ? Colors.success : Colors.error}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[hs.verifyResultLabel, { color: verifySigResult === 'VALID' ? Colors.success : Colors.error }]}>
                              {verifySigResult}
                            </Text>
                            <Text style={hs.verifyResultSub}>
                              {verifySigResult === 'VALID'
                                ? 'Signature is authentic — Ed25519 verification passed'
                                : 'Signature does not match — key or message mismatch'}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      <TouchableOpacity
                        style={[
                          hs.verifyBtn,
                          (!verifySigPubKey.trim() || !verifySigMessage.trim() || !verifySigHex.trim())
                            && { opacity: 0.38 },
                        ]}
                        disabled={!verifySigPubKey.trim() || !verifySigMessage.trim() || !verifySigHex.trim()}
                        onPress={() => {
                          try {
                            const isValid = UniversalKeyManager.verifySignature(
                              verifySigPubKey.trim(),
                              verifySigMessage.trim(),
                              verifySigHex.trim()
                            );
                            setVerifySigResult(isValid ? 'VALID' : 'INVALID');
                            setVerifySigError('');
                          } catch (e: any) {
                            setVerifySigError(e?.message ?? 'Verification error — check key / signature format');
                            setVerifySigResult(null);
                          }
                        }}
                        activeOpacity={0.85}
                      >
                        <MaterialIcons name="verified" size={16} color={Colors.bg} />
                        <Text style={hs.verifyBtnText}>Verify Signature</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={hs.verifyClearBtn}
                        onPress={() => {
                          setVerifySigPubKey('');
                          setVerifySigMessage('');
                          setVerifySigHex('');
                          setVerifySigResult(null);
                          setVerifySigError('');
                        }}
                        activeOpacity={0.75}
                      >
                        <MaterialIcons name="clear" size={14} color={Colors.textMuted} />
                        <Text style={hs.verifyClearBtnText}>Clear Fields</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })()}
          </View>
        )}

        {/* ── IDENTITY TAB ── */}
        {activeTab === 'identity' && (
          <View style={s.tabContent}>
            {/* Company identity */}
            <View style={s.identityHero}>
              <Text style={s.identityEmoji}>🏛️</Text>
              <Text style={s.identityCompany}>EKUYE DIGITAL GATEWAY TRUST LTD</Text>
              <Text style={s.identityTagline}>Sovereign Banking Infrastructure for Africa</Text>
            </View>

            {[
              {
                title: 'Legal Registration',
                icon: 'gavel',
                color: Colors.primary,
                rows: [
                  { k: 'Company Name',      v: 'EKUYE DIGITAL GATEWAY TRUST LTD', hi: true },
                  { k: 'Registration No.',  v: 'CS099020624',                      mono: true, hi: true },
                  { k: 'TIN',               v: 'C0064220206',                      mono: true },
                  { k: 'Legal Authority',   v: 'Ghana Companies Act 992' },
                  { k: 'Incorporation',     v: '24 June 2024' },
                  { k: 'Jurisdiction',      v: 'Republic of Ghana, West Africa' },
                ],
              },
              {
                title: 'Founder & Lead Architect',
                icon: 'person',
                color: Colors.primary,
                rows: [
                  { k: 'Full Name',  v: 'John Kojo Zi',                   hi: true },
                  { k: 'Role',       v: 'Founder & Lead Architect' },
                  { k: 'Title',      v: 'Bank Manager · Bituncoin Gold Bank' },
                  { k: 'Email',      v: 'info@bituncoin.io',               mono: true },
                  { k: 'Platform',   v: 'BTNG Gold Coin · Ghana & 54 Africa' },
                ],
              },
              {
                title: 'Merchant Identity (MTN MoMo)',
                icon: 'storefront',
                color: Colors.warning,
                rows: [
                  { k: 'Merchant ID',  v: '248059',          mono: true, hi: true },
                  { k: 'MSISDN',       v: '+233 54 041 8537', mono: true },
                  { k: 'Local Dial',   v: '054 041 8537' },
                  { k: 'Network',      v: 'MTN MoMo · Ghana' },
                  { k: 'Currency',     v: 'GHS — Ghanaian Cedi' },
                ],
              },
              {
                title: 'Node & Chain Configuration',
                icon: 'router',
                color: '#22C55E',
                rows: [
                  { k: 'Node IP',       v: '168.231.79.52:64799',                        mono: true, hi: true },
                  { k: 'Hostname',      v: 'srv1282934.hstgr.cloud',                     mono: true },
                  { k: 'Location',      v: 'Accra, Ghana — Ghana Mainnet' },
                  { k: 'Genesis Date',  v: '18 February 2026' },
                  { k: 'Chain',         v: 'BTNG Sovereign Mainnet' },
                  { k: 'Coin Type',     v: '9999 (BIP-44)' },
                  { k: 'Backend',       v: 'mebznlvyycuuddfkmebz.backend.onspace.ai', mono: true },
                ],
              },
              {
                title: 'Cryptographic Identity',
                icon: 'lock',
                color: '#9945FF',
                rows: [
                  { k: 'Algorithm',     v: 'Ed25519 (TweetNaCl)',          hi: true },
                  { k: 'Key Size',      v: '256-bit (32 bytes pubkey)',     mono: false },
                  { k: 'Sig Size',      v: '512-bit (64 bytes)',            mono: false },
                  { k: 'Security',      v: '~128-bit classical security' },
                  { k: 'Key Storage',   v: 'expo-secure-store (Keychain/Keystore)', hi: true },
                  { k: 'Key Derive',    v: 'PBKDF2-SHA256 × 4096 rounds' },
                  { k: 'Private Keys',  v: 'NEVER in AsyncStorage or DB' },
                ],
              },
              {
                title: 'Quick Reference IDs',
                icon: 'fingerprint',
                color: Colors.warning,
                rows: [
                  { k: 'Merchant ID (MTN)', v: '248059',                                           mono: true, hi: true },
                  { k: 'Reg. Number',       v: 'CS099020624',                                      mono: true, hi: true },
                  { k: 'TIN',               v: 'C0064220206',                                      mono: true },
                  { k: 'Node IP',           v: '168.231.79.52:64799',                              mono: true },
                  { k: 'Gold Anchor',       v: '$3,250 / troy oz (XAU)',                           mono: false },
                  { k: 'BTNGG/USD',         v: '$3.250',                                           mono: true },
                  { k: 'Chain',             v: 'BTNG-MAINNET',                                     mono: true },
                ],
              },
            ].map(card => (
              <View key={card.title} style={[s.identityCard, { borderLeftColor: card.color, borderLeftWidth: 3 }]}>
                <View style={s.identityCardHeader}>
                  <View style={[s.identityCardIcon, { backgroundColor: card.color + '18', borderColor: card.color + '44' }]}>
                    <MaterialIcons name={card.icon as any} size={16} color={card.color} />
                  </View>
                  <Text style={[s.identityCardTitle, { color: card.color }]}>{card.title}</Text>
                </View>
                {card.rows.map((row, i) => (
                  <View
                    key={i}
                    style={[
                      s.identityRow,
                      (row as any).hi && { backgroundColor: card.color + '08' },
                      i < card.rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border + '55' },
                    ]}
                  >
                    <Text style={s.identityRowKey}>{row.k}</Text>
                    <Text
                      style={[
                        s.identityRowVal,
                        (row as any).mono && s.identityRowMono,
                        (row as any).hi && { color: card.color, fontWeight: FontWeight.bold },
                      ]}
                      numberOfLines={2}
                    >
                      {row.v}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            {/* Seal */}
            <View style={s.seal}>
              <Text style={s.sealEmoji}>🏅</Text>
              <Text style={s.sealTitle}>BTNG SOVEREIGN PLATFORM</Text>
              <Text style={s.sealSub}>John Kojo Zi · Founder & Lead Architect</Text>
              <Text style={s.sealSub}>EKUYE DIGITAL GATEWAY TRUST LTD</Text>
              <Text style={s.sealSub}>Reg. CS099020624 · TIN C0064220206</Text>
              <Text style={s.sealSub}>Ghana Companies Act 992 · 24 June 2024</Text>
              <View style={s.sealDivider} />
              <Text style={s.sealFooter}>Ghana · 54 Africa Nations · Global Diaspora</Text>
              <Text style={[s.sealFooter, { color: Colors.primary }]}>info@bituncoin.io</Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Health Tab Styles ──────────────────────────────────────────────────────────
const hs = StyleSheet.create({
  header:            { flexDirection: 'column', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  headerRow1:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  autoRefreshRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderWidth: 1, borderColor: Colors.border },
  autoRefreshLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  countdownPill:     { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.success + '18', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.success + '55' },
  countdownText:     { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false, letterSpacing: 0.3 },
  headerIconWrap:    { width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.success + '18', borderWidth: 1, borderColor: Colors.success + '44', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitle:       { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  headerSub:         { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  refreshBtn:        { width: 44, height: 44, borderRadius: 13, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },

  loadingWrap:       { alignItems: 'center', paddingVertical: 60, gap: Spacing.md },
  loadingText:       { fontSize: FontSize.sm, color: Colors.textMuted, includeFontPadding: false },

  offlineWrap:       { alignItems: 'center', paddingVertical: 48, gap: Spacing.md, paddingHorizontal: Spacing.xl },
  offlineIconWrap:   { width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  offlineTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  offlineSub:        { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 19, includeFontPadding: false },
  offlineBtn:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  offlineBtnText:    { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },

  statusBanner:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5 },
  statusBannerDot:   { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  statusBannerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, includeFontPadding: false },
  statusBannerSub:   { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  statusPill:        { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, flexShrink: 0 },
  statusPillText:    { fontSize: 10, fontWeight: FontWeight.heavy, letterSpacing: 0.8, includeFontPadding: false },

  statsGrid:         { flexDirection: 'row', gap: Spacing.sm },
  statCard:          { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm + 2, borderWidth: 1, alignItems: 'center', gap: 4 },
  statVal:           { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:         { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  healthCard:        { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, overflow: 'hidden' },
  healthCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  healthCardIcon:    { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  healthCardTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  healthCardSub:     { fontSize: 10, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  statusIndicator:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },

  healthCardBody:    { padding: Spacing.md, gap: 6 },
  healthRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border + '44' },
  healthRowLabel:    { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  healthRowVal:      { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, includeFontPadding: false, maxWidth: '60%', textAlign: 'right' },
  healthRowMono:     { fontSize: 10, color: Colors.textSecondary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', maxWidth: '60%', textAlign: 'right', includeFontPadding: false },

  statusBar:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  statusBarText:     { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.bg, includeFontPadding: false },

  merchantRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  merchantDot:       { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.success, flexShrink: 0 },
  merchantName:      { flex: 1, fontSize: FontSize.xs, color: Colors.textPrimary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  merchantBal:       { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },
  merchantInvoiceBadge: { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  merchantInvoiceText:  { fontSize: 9, color: Colors.textMuted, includeFontPadding: false },

  merchantPubKeyRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  copyKeyBtn:             { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#9945FF18', borderRadius: Radius.md, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: '#9945FF44', flexShrink: 0, alignSelf: 'flex-start' },
  copyKeyBtnCopied:       { backgroundColor: Colors.successBg, borderColor: Colors.success + '66' },
  copyKeyBtnText:         { fontSize: 9, fontWeight: FontWeight.heavy, color: '#9945FF', includeFontPadding: false },
  merchantDetail:         { backgroundColor: Colors.bg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, gap: 0 },
  merchantDetailRow:      { paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border + '44', gap: 4 },
  merchantDetailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  merchantDetailLabel:    { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false, letterSpacing: 0.3 },
  merchantDetailMono:     { fontSize: 9, color: Colors.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14, includeFontPadding: false },
  merchantFingerprintBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44', alignSelf: 'flex-start' },
  merchantFingerprintText:  { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 0.5, includeFontPadding: false },
  merchantAlgoBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.successBg, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.success + '44', alignSelf: 'flex-start' },
  merchantAlgoText:       { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.success, includeFontPadding: false },
  merchantKeyNote:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningBg, borderRadius: Radius.md, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: Colors.warning + '44', marginTop: 4 },
  merchantKeyNoteText:    { flex: 1, fontSize: 9, color: Colors.warning, lineHeight: 13, includeFontPadding: false },
  exportJsonBtn:          { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryGlow, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.primary + '44', alignSelf: 'flex-start', marginTop: 6 },
  exportJsonBtnCopied:    { backgroundColor: Colors.successBg, borderColor: Colors.success + '66' },
  exportJsonBtnText:      { fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.primary, includeFontPadding: false },
  exportJsonBadge:        { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border, marginLeft: 2 },
  exportJsonBadgeText:    { fontSize: 8, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  legend:            { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  legendTitle:       { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },
  legendRow:         { flexDirection: 'row', gap: Spacing.md },
  legendItem:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:         { width: 10, height: 10, borderRadius: 5 },
  legendLabel:       { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Audit Log card
  auditBody:        { borderTopWidth: 1, borderTopColor: Colors.border, gap: 0 },
  auditLoading:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, justifyContent: 'center' },
  auditLoadingText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
  auditEmpty:       { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl },
  auditEmptyText:   { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 17, includeFontPadding: false },
  auditRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  auditActionWrap:  { width: 80, backgroundColor: Colors.bgElevated, borderRadius: Radius.sm, paddingHorizontal: 5, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  auditAction:      { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textPrimary, letterSpacing: 0.4, includeFontPadding: false, textAlign: 'center' },
  auditMetaRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  auditEntityBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  auditEntityText:  { fontSize: 8, fontWeight: FontWeight.heavy, letterSpacing: 0.3, includeFontPadding: false },
  auditTs:          { fontSize: 9, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false },
  auditIndex:       { fontSize: 9, color: Colors.border, fontWeight: FontWeight.bold, includeFontPadding: false },
  auditDetails:     { fontSize: 10, color: Colors.textSecondary, lineHeight: 14, includeFontPadding: false },
  auditRefreshBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2 },
  auditRefreshText: { fontSize: FontSize.xs, color: Colors.textMuted, flex: 1, includeFontPadding: false },
  auditCountBadge:  { backgroundColor: Colors.bgElevated, borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: Colors.border },
  auditCountText:   { fontSize: 9, color: Colors.textMuted, fontWeight: FontWeight.semibold, includeFontPadding: false },

  // Gateway card
  gatewayScaleBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B18', borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#F59E0B55', flexShrink: 0 },
  gatewayScaleText:        { fontSize: 9, fontWeight: FontWeight.heavy, color: '#F59E0B', includeFontPadding: false, letterSpacing: 0.3 },
  gatewaySection:          { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm + 2, paddingBottom: Spacing.sm, gap: 0 },
  gatewaySectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: Spacing.sm, flexWrap: 'wrap' },
  gatewaySectionTitle:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, includeFontPadding: false, flex: 1 },
  gatewaySectionBadge:     { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  gatewaySectionBadgeText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  gatewayRow:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  gatewayRowKey:           { fontSize: FontSize.xs, color: Colors.textMuted, flex: 1, includeFontPadding: false },
  gatewayRowVal:           { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textPrimary, maxWidth: '55%', textAlign: 'right', includeFontPadding: false },
  gatewayChecksRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, borderTopWidth: 1, borderTopColor: Colors.border + '55', backgroundColor: Colors.bgElevated },
  gatewayCheckItem:        { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.bgCard, borderRadius: Radius.md, paddingHorizontal: 7, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  gatewayCheckLabel:       { fontSize: 10, fontWeight: FontWeight.bold, includeFontPadding: false },

  // Verify Signature card
  verifyCard:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1.5, borderColor: '#9945FF44', overflow: 'hidden' },
  verifyCardHeader:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: '#9945FF0A', borderBottomWidth: 1, borderBottomColor: '#9945FF33' },
  verifyBody:         { padding: Spacing.md, gap: Spacing.sm },
  verifyFieldLabel:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  verifyInput:        { backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 4, color: Colors.textPrimary, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', includeFontPadding: false, minHeight: 52 },
  verifyErrorRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.errorBg, borderRadius: Radius.md, paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.sm, borderWidth: 1, borderColor: Colors.error + '44' },
  verifyErrorText:    { flex: 1, fontSize: FontSize.xs, color: Colors.error, lineHeight: 16, includeFontPadding: false },
  verifyResultBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5 },
  verifyResultLabel:  { fontSize: FontSize.lg, fontWeight: FontWeight.heavy, letterSpacing: 1, includeFontPadding: false },
  verifyResultSub:    { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, includeFontPadding: false },
  verifyBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#9945FF', borderRadius: Radius.lg, paddingVertical: Spacing.md, shadowColor: '#9945FF', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8, elevation: 4 },
  verifyBtnText:      { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.bg, includeFontPadding: false },
  verifyClearBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm },
  verifyClearBtnText: { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const MONO_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.bg, width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
  topBar:           { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  topBarCenter:     { flex: 1 },
  topBarTitle:      { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  topBarSub:        { fontSize: FontSize.xs, color: Colors.textMuted, includeFontPadding: false, marginTop: 1 },
  readOnlyBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.warningBg, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: Colors.warning + '55' },
  readOnlyText:     { fontSize: 9, fontWeight: FontWeight.heavy, color: Colors.warning, letterSpacing: 0.8, includeFontPadding: false },

  heroBanner:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginHorizontal: Spacing.xl, marginBottom: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1.5, borderColor: Colors.primary + '55', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4 },
  heroIconWrap:     { width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '55', alignItems: 'center', justifyContent: 'center' },
  heroEmoji:        { fontSize: 30 },
  heroTitle:        { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1, includeFontPadding: false },
  heroSub:          { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 3, includeFontPadding: false },
  heroTagsRow:      { flexDirection: 'row', gap: Spacing.sm, marginTop: 6, flexWrap: 'wrap' },
  heroTag:          { backgroundColor: Colors.primaryGlow, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: Colors.primary + '44' },
  heroTagText:      { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, includeFontPadding: false },

  tabRow:           { flexDirection: 'row', marginHorizontal: Spacing.xl, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: 3, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  tab:              { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md },
  tabActive:        { backgroundColor: Colors.primary },
  tabText:          { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textMuted, includeFontPadding: false },
  tabTextActive:    { color: Colors.bg },

  scrollContent:    { paddingBottom: 20 },
  tabContent:       { paddingHorizontal: Spacing.xl, gap: Spacing.md },

  statsRow:         { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  statCard:         { flex: 1, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, alignItems: 'center', gap: 3 },
  statVal:          { fontSize: FontSize.md, fontWeight: FontWeight.heavy, includeFontPadding: false },
  statLabel:        { fontSize: 9, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },

  // Section
  section:          { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  sectionIconWrap:  { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionTitle:     { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  sectionBadge:     { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, flexShrink: 1 },
  sectionBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, includeFontPadding: false },
  sectionChevron:   { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  sectionBody:      { borderTopWidth: 1, borderTopColor: Colors.border },
  itemRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, gap: Spacing.sm },
  itemLeft:         { flex: 1, gap: 3 },
  itemLabel:        { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium, includeFontPadding: false },
  itemLabelMono:    { fontFamily: MONO_FONT, fontSize: 11, color: Colors.textPrimary },
  itemValue:        { fontSize: FontSize.xs, color: Colors.textSecondary, includeFontPadding: false, lineHeight: 16 },
  itemValueMono:    { fontFamily: MONO_FONT, fontSize: 10 },
  itemSub:          { fontSize: 10, color: Colors.textMuted, includeFontPadding: false },
  itemTag:          { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  itemTagText:      { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },

  // Changelog
  changelogHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border },
  changelogIconWrap:{ width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primaryGlow, borderWidth: 1, borderColor: Colors.primary + '44', alignItems: 'center', justifyContent: 'center' },
  changelogTitle:   { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, includeFontPadding: false },
  changelogSub:     { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },

  footerNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: Colors.successBg, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, borderWidth: 1, borderColor: Colors.success + '33' },
  footerNoteText:   { flex: 1, fontSize: FontSize.xs, color: Colors.success, lineHeight: 17, includeFontPadding: false },
  footerNoteCode:   { fontFamily: MONO_FONT, fontSize: 11, color: Colors.primary, fontWeight: FontWeight.bold },

  // Identity
  identityHero:     { alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1.5, borderColor: Colors.primary + '55' },
  identityEmoji:    { fontSize: 44 },
  identityCompany:  { fontSize: FontSize.md, fontWeight: FontWeight.heavy, color: Colors.primary, textAlign: 'center', letterSpacing: 0.8, includeFontPadding: false },
  identityTagline:  { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', includeFontPadding: false },

  identityCard:     { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  identityCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.bgElevated, borderBottomWidth: 1, borderBottomColor: Colors.border },
  identityCardIcon: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  identityCardTitle:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, includeFontPadding: false },
  identityRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 3, gap: Spacing.sm },
  identityRowKey:   { width: 110, fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.semibold, flexShrink: 0, includeFontPadding: false },
  identityRowVal:   { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, includeFontPadding: false },
  identityRowMono:  { fontFamily: MONO_FONT, fontSize: 11 },

  seal:             { alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1.5, borderColor: Colors.primary + '44', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  sealEmoji:        { fontSize: 44 },
  sealTitle:        { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, color: Colors.primary, letterSpacing: 1.5, textAlign: 'center', includeFontPadding: false },
  sealSub:          { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', includeFontPadding: false },
  sealDivider:      { width: '60%', height: 1, backgroundColor: Colors.primary + '44', marginVertical: Spacing.sm },
  sealFooter:       { fontSize: 11, color: Colors.textMuted, textAlign: 'center', includeFontPadding: false },
});

// Changelog styles
const cl = StyleSheet.create({
  card:         { backgroundColor: Colors.bgCard, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  versionBadge: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, flexShrink: 0 },
  versionText:  { fontSize: FontSize.sm, fontWeight: FontWeight.heavy, includeFontPadding: false },
  entryTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 18, includeFontPadding: false },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  metaDate:     { fontSize: 11, color: Colors.textMuted, includeFontPadding: false },
  metaDot:      { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textMuted },
  metaAuthor:   { fontSize: 11, color: Colors.primary, fontWeight: FontWeight.semibold, includeFontPadding: false },
  statCol:      { alignItems: 'flex-end', gap: 3, flexShrink: 0 },
  statRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statDot:      { width: 6, height: 6, borderRadius: 3 },
  statText:     { fontSize: 11, fontWeight: FontWeight.bold, includeFontPadding: false },
  body:         { borderTopWidth: 1, borderTopColor: Colors.border, padding: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.bgElevated },
  changeRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  changePill:   { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, flexShrink: 0, minWidth: 68, alignItems: 'center' },
  changePillText: { fontSize: 9, fontWeight: FontWeight.heavy, includeFontPadding: false },
  changeText:   { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 17, includeFontPadding: false },
});
