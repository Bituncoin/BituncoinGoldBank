# BTNG SOVEREIGN BANK — CRYPTOGRAPHIC SECURITY SPECIFICATION
# EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
# John Kojo Zi — Founder & Lead Architect
# ═══════════════════════════════════════════════════════════════════

## CLASSIFICATION: BANK CONFIDENTIAL — DEVELOPER MASTER

---

## 1. CRYPTOGRAPHIC PRIMITIVES

### 1.1 Key Algorithm: Ed25519 (via TweetNaCl)

```
Algorithm        : Ed25519 (Edwards-curve Digital Signature Algorithm)
Library          : tweetnacl · nacl.sign.keyPair()
Key Size         : 256-bit (32 bytes public, 64 bytes secret key)
Signature Size   : 512-bit (64 bytes)
Security Level   : ~128-bit classical security
Side Channels    : TweetNaCl is timing-attack resistant
```

### 1.2 Hashing: SHA-256 (via expo-crypto)

```
Algorithm        : SHA-256
Library          : expo-crypto · digestStringAsync()
Output           : 256-bit hex string
Usage            : Transaction hashing, key fingerprinting, auth tags
```

### 1.3 Random Number Generation: CSPRNG

```
Source           : expo-crypto · getRandomBytes()
Entropy          : Hardware RNG / OS entropy pool
Fallback         : None — hard error if unavailable
Usage            : Key generation, nonces, UUIDs, salts
```

### 1.4 Key Derivation: PBKDF2-SHA256 (emulated)

```
Algorithm        : Iterative SHA-256 (4096 rounds)
Input            : password + salt
Salt Size        : 256-bit (32 random bytes)
Rounds           : 4096 iterations
Purpose          : Password-based key derivation for private key wrapping
Security Note    : Provides PBKDF2-equivalent protection on mobile
```

### 1.5 Private Key Encryption: AES-256-XOR

```
Scheme           : PBKDF2-derived key + XOR cipher + SHA-256 auth tag
Key Size         : 256-bit derived from PBKDF2
Auth Tag         : SHA-256(salt + cipher + password).slice(0,32)
Purpose          : Wrap Ed25519 private keys before storage
```

---

## 2. KEY STORAGE ARCHITECTURE

### 2.1 Private Key Storage — NEVER in Plain Storage

```
┌─────────────────────────────────────────────────────────┐
│  PRIVATE KEYS → expo-secure-store (Keychain / Keystore) │
│                                                          │
│  Client Private Key : btng_client_privkey_v3            │
│  Bank Private Key   : btng_bank_privkey_v3              │
│  Merchant Keys      : btng_merchant_privkey_v3_[id]     │
│                                                          │
│  Encrypted with PBKDF2-SHA256 × 4096 before storage    │
│  Auth tag prevents wrong-password silent decryption     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Public Data Storage — AsyncStorage

```
┌─────────────────────────────────────────────────────────┐
│  PUBLIC DATA → AsyncStorage (device local storage)      │
│                                                          │
│  Client Wallet State : btng_sovereign_client_wallet_v3  │
│  Bank Wallet State   : btng_sovereign_bank_wallet_v3    │
│  Merchants           : btng_sovereign_merchants_v3      │
│  Payments            : btng_sovereign_payments_v3       │
│  Audit Log           : btng_sovereign_audit_log_v3      │
│                                                          │
│  Public keys, balances, transaction hashes only         │
│  NEVER contains private key material                    │
└─────────────────────────────────────────────────────────┘
```

### 2.3 In-Memory Fallback (Web / Emulator Only)

```
┌─────────────────────────────────────────────────────────┐
│  Web / Emulator : inMemoryKeyStore (Map<string,string>) │
│                                                          │
│  Keys lost on app restart — NOT for production use      │
│  Automatic fallback only when SecureStore unavailable   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. TRIPLE-KEY PAYMENT SECURITY MODEL

### 3.1 Architecture Overview

```
PAYMENT FLOW — 3 MANDATORY SIGNATURES

 CLIENT WALLET              BANK SYSTEM            MERCHANT WALLET
 ─────────────              ───────────            ───────────────
 Ed25519 Private Key        Ed25519 Private Key    Ed25519 Private Key
       │                          │                       │
       ▼                          ▼                       ▼
 [Step 1] Client Signs       [Step 2] Bank Signs    [Step 3] Merchant
 nacl.sign.detached()        nacl.sign.detached()   Signs + Settles
       │                          │                 nacl.sign.detached()
       └──────────────────────────┴───────────────────────┘
                                  │
                                  ▼
                          ALL 3 VERIFIED BEFORE SETTLEMENT
                          verifyTripleSignature(paymentId)
```

### 3.2 Transaction Hash Construction

```typescript
txHash = SHA-256({
  type: 'TRIPLE_SIGN_PAYMENT_V3',
  version: 3,
  amount: number,
  merchantId: string,
  merchantPublicKey: hex,
  clientPublicKey: hex,
  description: string,
  nonce: randomHex(8),       // CSPRNG nonce — replay protection
  chain: 'BTNG-MAINNET',
  timestamp: Date.now()
})
```

### 3.3 Signature Binding

```
clientSignature  = Ed25519.sign(txHash, clientPrivateKey)
bankSignature    = Ed25519.sign(JSON.stringify({merchantId, amount, txHash}), bankPrivateKey)
merchantSignature = Ed25519.sign(JSON.stringify({invoiceId, txHash, amount}), merchantPrivateKey)
```

### 3.4 Replay Attack Protection

```
Each payment has a unique 8-byte CSPRNG nonce embedded in the txHash.
Reusing a signature from a different payment will fail verification
because the txHash will differ.
```

---

## 4. BANK SYSTEM PASSWORDS

### 4.1 Bank System Password

```
The BTNG Bank System uses a hardcoded system password stored only
in the compiled application binary:

  BANK_PASSWORD = 'BTNG_BANK_SOVEREIGN_2026'

This derives the key used to encrypt/decrypt the bank's Ed25519
private key from expo-secure-store. Only the bank engine class
has access to this constant.
```

### 4.2 Merchant Key Derivation

```
Each merchant's private key is protected with a unique password:
  merchantPassword = 'BTNG_MERCHANT_KEY_2026_' + merchantId

The merchantId is a random UUID (CSPRNG-seeded), so each merchant
has a cryptographically unique key protection password.
```

### 4.3 Client Password

```
Set by the user at wallet initialization.
Min length enforced by UI: 6 characters.
Used for PBKDF2 key derivation before SecureStore storage.
```

---

## 5. SECURITY RULES FOR DEVELOPERS

### 5.1 MUST-DO Rules

```
✅ Always load private keys via UniversalKeyManager.loadPrivateKey()
✅ Always store private keys via UniversalKeyManager.storePrivateKey()
✅ Always verify signatures before updating state
✅ Always use UniversalKeyManager.getRandomBytes() for entropy
✅ Always use SHA-256 from expo-crypto, never custom hash functions
✅ Always check auth tag before decrypting keys (wrong password → null)
✅ Always archive old keys before reset (never silently overwrite)
```

### 5.2 MUST-NOT Rules

```
🚫 NEVER store raw private keys in AsyncStorage
🚫 NEVER store raw private keys in database (Supabase/OnSpace)
🚫 NEVER log private keys to console
🚫 NEVER transmit private keys over any network
🚫 NEVER use Math.random() for cryptographic operations
🚫 NEVER skip signature verification
🚫 NEVER bypass triple-key requirement for payments
🚫 NEVER modify the KeyPair type to include privateKey field
```

---

## 6. AUDIT AND COMPLIANCE

### 6.1 Audit Logger

```
Every significant action is logged to the AuditLogger:
  - Wallet creation / reset
  - Bank system initialization / reset
  - Merchant registration
  - Payment initiation (each step)
  - Reward distribution
  - Engine initialization

Audit entries are stored in AsyncStorage (device-local) and
include: action, entity, entityId, details, timestamp, publicKey
```

### 6.2 Security Events (Database)

```
Critical admin actions are logged to the security_events table
in OnSpace Cloud. These are RLS-restricted to:
  info@bituncoin.io (is_admin = true)
```

---

## 7. PRODUCTION DEPLOYMENT CHECKLIST

```
□ expo-secure-store installed and functional on target devices
□ tweetnacl installed: npm install tweetnacl @stablelib/base64 @stablelib/utf8
□ expo-crypto available (bundled with Expo SDK)
□ BANK_PASSWORD rotated from default for production bank deployment
□ SecureStore availability tested on iOS Keychain + Android Keystore
□ Audit log backup strategy in place
□ Key recovery procedure documented for bank staff
□ Triple-key payment flow tested end-to-end on physical device
```

---

*BTNG Gold Coin · Sovereign Cryptographic Security Spec v3.0*
*EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624*
*info@bituncoin.io · Ghana · 54 Africa Nations*
