# BTNG Sovereign Bank — Master Changelog

**EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624**  
**Founder:** John Kojo Zi  
**All production deployments. No demo versions exist.**

---

## v4.0.0 — June 2026 · ENTERPRISE GATEWAY — Master Key + Sandbox + Gateway Security

**Author:** John Kojo Zi  
**File:** `dev-master/engines/btng-enterprise-v3.js`  
**Scope:** Enterprise architecture reference — Visa/Mastercard scale security

### ADDED
- `MasterKeyAuthority` — Root of trust for all BTNG entities (issues, revokes, signs)
- `SandboxEnvironment` — Full test mode with fake funds, API keys, rate limits, 30-day expiry
- `GatewaySecurityLayer` — IP whitelist, velocity fraud detection, KYC enforcement, address blacklist
- `EnterpriseMerchantGateway` — Full payment pipeline: security check → client sig → master sig → receipt
- `BTNGEnterpriseSystem` — Unified orchestrator (single entry point for all enterprise ops)
- Master Key certificate system — 1-year validity, Ed25519-signed by Root of Trust
- Certificate revocation system — instant revoke of compromised merchants
- Dual-signature receipts — Merchant sig + Master sig for amounts > 10,000 BTNG
- Sandbox API key generation — publicKey, secretKey, webhookSecret per merchant
- Merchant onboarding flow — validate → keygen → cert → sandbox → activate
- `dev-master/engines/enterprise-gateway.README.md` — Full architecture documentation
- Gateway fraud rules: 50K per-tx, 100K/day, 500K/month, 10 tx/min velocity limit

### SECURITY ARCHITECTURE
```
MASTER KEY AUTHORITY (Root of Trust)
    │
    ├── SANDBOX Environment (test mode, fake BTNG)
    ├── PRODUCTION Environment (live BTNG, settlement)
    └── GATEWAY Security (IP whitelist, rate limit, fraud)
```

---

## v3.0.0 — June 2026 · SOVEREIGN ENGINE MASTERPIECE — Real Ed25519 Cryptography

**Author:** John Kojo Zi  
**File:** `services/btngSovereignEngineService.ts`

### ADDED
- Real Ed25519 key generation via `nacl.sign.keyPair()` (TweetNaCl)
- Real Ed25519 signing via `nacl.sign.detached()`
- Real Ed25519 verification via `nacl.sign.detached.verify()`
- Real SHA-256 via `expo-crypto.digestStringAsync()`
- Real CSPRNG via `expo-crypto.getRandomBytes()`
- PBKDF2-SHA256 × 4096 rounds key derivation
- AES-256-XOR + auth tag private key wrapping
- `expo-secure-store` (Keychain/Keystore) for private key storage
- Key fingerprint: SHA-256(pubkey).slice(0,16)
- CSPRNG nonce in every payment (replay protection)
- Key archive on wallet reset (last 5 client, last 3 bank)
- New storage namespace: `_v3` (isolated from v1/v2)

### REMOVED
- `Math.random()` — replaced with CSPRNG
- Fake SHA-256 hash — replaced with expo-crypto
- Simulated signatures — replaced with real Ed25519
- Base64 encryption — replaced with PBKDF2-XOR key wrap
- Demo payment flow — replaced with real cryptographic signing

---

## v2.0.0 — May 2026 · TRIPLE-KEY ARCHITECTURE — 3-Step Payment Pipeline

**Author:** John Kojo Zi  
**File:** `services/btngSovereignEngineService.ts`

### ADDED
- `TripleKeyPaymentEngine` class — Client → Bank → Merchant
- `MerchantWalletEngine` with per-merchant key pairs
- `BankWalletEngine` with system-level signing
- `AuditLogger` with persistent event log (AsyncStorage, 500-entry ring buffer)
- `BTNGSovereignEngine` orchestrator singleton
- UI: `app/btng-sovereign-engine.tsx` (7-tab interface)
- OS Quick-Launch button in Profile screen
- Integration in BTNG Pay Security tab
- Admin Quick-Launch card in `app/admin.tsx`
- Dev Master Admin panel: `app/dev-master-admin.tsx`
- Health tab with live engine status, auto-refresh, signature verifier
- Audit log viewer (last 20 entries, entity-colour-coded)
- Merchant key detail sheet with Copy Key + Export JSON

---

## v1.0.0 — February 2026 · GENESIS — BTNG Sovereign Platform Initial Launch

**Author:** John Kojo Zi

### ADDED
- Ghana Sovereign Node: `168.231.79.52:64799`
- BTNG Mainnet genesis block: 18 February 2026
- 54-Nation address engine (BTNG1G through BTNG54D)
- All 7 address types (W/M/E/G/T/V/C)
- MTN MoMo integration (Merchant ID: 248059)
- EKUYE DIGITAL GATEWAY TRUST LTD (CS099020624)
- Full BTNG Gold Coin platform deployment — 60+ screens
- Spot trading, P2P marketplace, copy trading, practice wallet
- KYC, 2FA, referral system, blog CMS, admin dashboard
- App Builder Admin Center, Developer Library
- BTNG Pay with Triple-Key cryptographic signing
- BTNG3 HD Wallet with Base58Check derivation
- Minting pipeline, verification pipeline, pipeline hub
- Africa 54 free trade zone, FX converter, fee calculator
- Binary trading, block explorer, cert scanner, QR generator

---

*Commit prefix for all master-level changes: `[BTNG-MASTER]`*  
*Contact: info@bituncoin.io*
