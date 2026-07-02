# BTNG WALLET SECURITY ARCHITECTURE
# Technical Reference — Bank Developer Edition
# ═══════════════════════════════════════════════════════════════════
# EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
# John Kojo Zi — Founder & Lead Architect

---

## WALLET TYPES IN BTNG PLATFORM

| Wallet | File | Technology | Purpose |
|---|---|---|---|
| Sovereign Wallet | `btngSovereignEngineService.ts` | Ed25519 · SecureStore | Triple-key payments |
| Genesis Wallet | `btngWalletService.ts` | BTNG Chain HD | Main user wallet |
| BTNG3 Wallet | `btng3WalletService.ts` | Base58Check · HD | Address derivation |
| HD Vault Cards | `btng_cards` table | 54-nation addresses | Address management |

---

## SOVEREIGN WALLET ARCHITECTURE

### Key Hierarchy

```
Master Password (user-set)
        │
        ▼ PBKDF2-SHA256 × 4096 rounds
Derived Key (256-bit)
        │
        ▼ XOR cipher + auth tag
Encrypted Private Key (stored in SecureStore)
        │
        ▼ Decrypted on-demand
Raw Ed25519 Private Key (64 bytes, in-memory only)
        │
        ├─▶ nacl.sign.detached(message, secretKey) → signature
        └─▶ nacl.sign.keyPair.fromSecretKey() → public key
```

### Public Key Format

```
Raw:     32-byte Ed25519 public key
Hex:     64 hex chars (stored in WalletState.keyPair.publicKey)
Base64:  44 chars (stored in WalletState.keyPair.publicKeyBase64)
KeyID:   KID-{timestamp_hex}-{4rand_hex}
Fingerprint: SHA-256(pubHex).slice(0,16) — 16 hex chars
```

### WalletState Schema

```typescript
interface WalletState {
  id: string;           // UUID (CSPRNG)
  name: string;         // Display name
  entityType:           // 'CLIENT' | 'BANK' | 'MERCHANT'
  keyPair: {
    publicKey: string;  // 64 hex chars (32 bytes Ed25519 pubkey)
    publicKeyBase64: string;
    keyId: string;
    algorithm: 'Ed25519';
    fingerprint: string; // 16 hex chars
    createdAt: number;
    // ⛔ NO privateKey field — stored ONLY in SecureStore
  };
  balance: number;      // BTNGG balance
  totalVolume: number;  // Lifetime volume
  transactions: TransactionRecord[];
  createdAt: number;
  lastActive: number;
  metadata: Record<string, string>;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}
```

---

## TRANSACTION RECORD SCHEMA

```typescript
interface TransactionRecord {
  txId: string;                  // UUID
  type: 'SEND' | 'RECEIVE' | 'REWARD' | 'SETTLEMENT' | 'FEE' | 'MINT';
  amount: number;                // BTNGG amount
  currency: 'BTNGG';
  from: string;                  // Public key hex or 'BTNG_BANK_SYSTEM'
  to: string;                    // Public key hex or merchantId
  txHash: string;                // SHA-256 of tx data (0x prefixed)
  signature: string;             // Ed25519 signature hex (128 chars)
  bankSignature?: string;        // Bank co-signature (triple-key)
  merchantSignature?: string;    // Merchant signature (triple-key)
  status: 'PENDING' | 'BANK_SIGNED' | 'MERCHANT_SIGNED' | 'COMPLETED' | 'FAILED';
  timestamp: number;
  note?: string;
}
```

---

## WALLET LIFECYCLE

### Creation
```
1. generateKeyPair() → { keyPair (public), rawPrivateKey }
2. storePrivateKey(SS_KEY, rawPrivateKey, password)
   → encryptKey(rawPrivateKey, password)
      → PBKDF2(password, salt, 4096 rounds) → derivedKey
      → XOR(rawPrivateKey, derivedKey) → cipherBytes
      → sha256(salt + cipher + password).slice(0,32) → authTag
      → JSON { v:3, alg, salt, cipher, auth }
   → SecureStore.setItemAsync(SS_KEY, encrypted)
3. WalletState saved to AsyncStorage (public data only)
```

### Usage (Signing)
```
1. loadPrivateKey(SS_KEY, password)
   → SecureStore.getItemAsync(SS_KEY) → encrypted JSON
   → PBKDF2(password, salt, 4096 rounds) → derivedKey
   → Verify authTag (wrong password → return null)
   → XOR(cipherBytes, derivedKey) → rawPrivateKey
2. signData(rawPrivateKey, message)
   → nacl.sign.detached(encodeUtf8(message), rawPrivateKey)
   → uint8ArrayToHex(sigBytes) → 128 hex chars
```

### Reset (Key Rotation)
```
1. Archive current WalletState to 'btng_client_archives_v3'
   (keeps last 5 archives)
2. deletePrivateKey(SS_KEY) — removes from SecureStore
3. Create new wallet → new Ed25519 key pair generated
4. topUp(500, 'Wallet Reset — New Ed25519 Keys Generated')
```

---

## HD VAULT CARDS (btng_cards table)

HD Vault Cards are BTNG chain addresses derived and stored for the user.
They are separate from the Sovereign Engine wallets.

### Card Fields
```
id                 UUID primary key
user_id            Foreign key → user_profiles.id
btng_id            Full BTNG address (e.g. BTNG1Gw[hash])
wallet_address     Same as btng_id (full address)
card_number_masked First 10 + **** + last 4 of btng_id
activated_at       Date string
expires            Expiry date string
tier               'Silver' | 'Gold' | 'Bronze'
status             'ACTIVE'
source             'hd_derive' (set by Private Banker AI)
nickname           User-defined label (optional)
```

### Type Detection
```typescript
// Detect type from btng_id character after country prefix
const match = btngId.match(/^BTNG\d+[A-Z]([wmegtvco])/i);
const typeKey = match?.[1]?.toLowerCase() ?? 'w';
```

---

## BANK WALLET SPECIFICS

The Bank Wallet is a special singleton with elevated privileges:

```
ID               : 'BTNG_BANK_SYSTEM' (fixed)
Password         : 'BTNG_BANK_SOVEREIGN_2026' (system constant)
Initial Balance  : 10,000,000 BTNGG
Purpose          : Signs all settlement transactions
Key Storage      : btng_bank_privkey_v3 in SecureStore
```

The bank private key is loaded into memory (`rawSecretKey`) at
engine initialization and refreshed from SecureStore on-demand
if the in-memory copy is null.

---

## MERCHANT WALLET SPECIFICS

Each merchant gets:
- Unique UUID as merchantId
- Unique Ed25519 key pair (auto-generated at registration)
- Unique password: `'BTNG_MERCHANT_KEY_2026_' + merchantId`
- Private key stored as `btng_merchant_privkey_v3_[id.slice(0,16)]`

Merchant keys are pre-loaded into `rawSecretKeys` Map at startup
for fast signing during settlement.

---

*BTNG Wallet Architecture · Technical Reference v3.0*
*EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624*
