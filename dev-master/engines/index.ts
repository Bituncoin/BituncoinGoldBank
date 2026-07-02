/**
 * BTNG SOVEREIGN BANK — DEVELOPER MASTER ENGINE INDEX
 * ═══════════════════════════════════════════════════════════════════
 *
 * EKUYE DIGITAL GATEWAY TRUST LTD · Reg. CS099020624
 * John Kojo Zi — Founder & Lead Architect
 * Ghana · 54 Africa Nations · BTNG Sovereign Mainnet
 *
 * ─────────────────────────────────────────────────────────────────
 * This is the UNIFIED EXPORT of all BTNG bank engine classes,
 * types, and utilities. Import from this file for clean access
 * to all bank engine functionality.
 * ─────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   import { btngSovereignEngine, UniversalKeyManager } from '@/dev-master/engines';
 *   import { generateBtngAddress, COUNTRY_META } from '@/dev-master/engines';
 *
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── SOVEREIGN ENGINE MASTERPIECE v3.0 ───────────────────────────────────────
// Production-grade Triple-Key Architecture
// Real Ed25519 · Real SHA-256 · Real CSPRNG · SecureStore
export {
  // Master singleton — use this for all bank operations
  btngSovereignEngine,

  // Individual engine classes
  BTNGSovereignEngine,
  UniversalKeyManager,
  ClientWalletEngine,
  BankWalletEngine,
  MerchantWalletEngine,
  TripleKeyPaymentEngine,
  AuditLogger,

  // TypeScript interfaces
  type KeyPair,
  type WalletState,
  type TransactionRecord,
  type MerchantRecord,
  type InvoiceRecord,
  type SettlementRecord,
  type TripleSignPayment,
  type AuditLogEntry,
  type SystemStatus,
} from '@/services/btngSovereignEngineService';

// ─── 54-NATION ADDRESS ENGINE ─────────────────────────────────────────────────
// Generates BTNG addresses for all 54 African nations
// Address types: W (Wallet) M (Merchant) E (Enterprise)
//                G (Gov) T (Treasury) V (Validator) C (Coin)
export {
  // Engine map — keyed by country name (e.g. btngEngines['GHANA'])
  btngEngines,

  // High-level address operations
  generateBtngAddress,
  lookupBtngAddress,
  routeByAddress,
  verifyBtngAddress,
  getCountryByCode,
  getCountryByKey,

  // Data tables
  BTNG_PREFIXES,
  COUNTRY_META,
  ADDRESS_TYPE_LABELS,
  ADDRESS_TYPE_ICONS,

  // Types
  type AddressType,
  type CountryMeta,
  type AddressInfo,
  type GeneratedAddress,
} from '@/services/btngEngineService';


// ─── USAGE EXAMPLES ────────────────────────────────────────────────────────────
/*

// 1. Initialize the Sovereign Engine
await btngSovereignEngine.initialize('John Kojo Zi', 'yourPassword');

// 2. Get system status
const status = btngSovereignEngine.getSystemStatus();
console.log('Client Balance:', status.client?.balance, 'BTNGG');
console.log('Bank Balance:', status.bank.balance, 'BTNGG');
console.log('Active Merchants:', status.merchants.active);

// 3. Create a Triple-Key Payment (all 3 signatures required)
// Step 1: Client signs
const p1 = await btngSovereignEngine.tripleEngine.initiatePaymentAsync(
  10,              // amount in BTNGG
  merchantId,      // merchant UUID
  'Gold purchase', // description
  'yourPassword'   // client wallet password
);
// Step 2: Bank signs
const p2 = await btngSovereignEngine.tripleEngine.addBankSignature(p1.payment.paymentId);
// Step 3: Merchant signs + settle
const p3 = await btngSovereignEngine.tripleEngine.addMerchantSignatureAndComplete(p2.payment.paymentId);
console.log('Payment completed:', p3.payment.status); // 'COMPLETED'

// 4. Verify all 3 signatures
const verified = btngSovereignEngine.tripleEngine.verifyTripleSignature(p3.payment.paymentId);
console.log('All valid:', verified.allValid); // true

// 5. Generate a BTNG Ghana Wallet address
const addr = generateBtngAddress('GHANA', 'w');
console.log('Address:', addr?.address); // 'BTNG1Gw[hash]'

// 6. Look up any BTNG address
const info = lookupBtngAddress('BTNG1Gw1234567890abcdef');
console.log('Country:', info.country?.name); // 'Ghana'
console.log('Type:', info.typeLabel);        // 'Individual Wallet'

// 7. Register a new merchant
const merchant = await btngSovereignEngine.registerMerchant(
  'Kumasi Gold Market',
  'Trade',
  { country: 'Ghana', region: 'Ashanti' }
);
console.log('Merchant Key:', merchant.wallet.keyPair.fingerprint);

// 8. View all public keys
const keys = btngSovereignEngine.getAllPublicKeys();
console.log('Client PubKey:', keys.client);
console.log('Bank PubKey:', keys.bank);
keys.merchants.forEach(m => console.log(m.name, ':', m.key));

*/
