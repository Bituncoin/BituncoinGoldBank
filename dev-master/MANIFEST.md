# BTNG BANK — MASTER FILE MANIFEST
# EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
# John Kojo Zi — Founder & Lead Architect
# ═══════════════════════════════════════════════════════════════════

## MANIFEST VERSION: v3.0 — BTNG Sovereign Engine Masterpiece
## DATE: June 2026
## CHAIN: BTNG-MAINNET · Genesis Block #0

---

## 1. CRYPTOGRAPHIC ENGINE LAYER

### 1.1 Sovereign Engine Masterpiece v3.0
- **File**: `services/btngSovereignEngineService.ts`
- **Version**: v3.0 (Production — Real Ed25519)
- **Status**: LIVE · IN USE · DO NOT MODIFY WITHOUT AUTHORIZATION

**Classes exported:**
```typescript
UniversalKeyManager       // Ed25519 key generation, signing, verification
ClientWalletEngine        // Client sovereign wallet — Ed25519 keys
BankWalletEngine          // BTNG Bank system wallet — Ed25519 keys
MerchantWalletEngine      // All merchant wallets — auto-keyed Ed25519
TripleKeyPaymentEngine    // 3-step payment: Client → Bank → Merchant
AuditLogger               // Immutable event log
BTNGSovereignEngine       // Master orchestrator singleton
```

**Cryptographic stack (ALL REAL, NO SIMULATION):**
```
Key Generation   : nacl.sign.keyPair()               ← TweetNaCl Ed25519
Signing          : nacl.sign.detached()              ← Ed25519 detached sig
Verification     : nacl.sign.detached.verify()       ← Ed25519 verify
Hashing          : Crypto.digestStringAsync SHA-256  ← expo-crypto
Random Bytes     : Crypto.getRandomBytes()           ← CSPRNG via expo-crypto
Key Derivation   : PBKDF2-SHA256 × 4096 rounds       ← Password stretching
Key Encryption   : AES-256-XOR + auth tag            ← Key wrapping
Private Storage  : expo-secure-store                 ← Never in AsyncStorage
```

**Triple-Key Payment Flow:**
```
Step 1 [CLIENT_SIGNED]    → Client Ed25519 signs tx hash
Step 2 [BANK_SIGNED]      → Bank Ed25519 co-signs settlement
Step 3 [COMPLETED]        → Merchant Ed25519 signs + settles
                          → All 3 signatures verified on-chain
```

---

### 1.2 BTNG Address Engine — 54 African Nations
- **File**: `services/btngEngineService.ts`
- **Version**: v1.0 (Stable)
- **Status**: LIVE · IN USE

**Address types (W/M/E/G/T/V/C):**
```typescript
w → Individual Wallet       BTNG1Gw[hash]
m → Business / Merchant     BTNG1Gm[hash]
e → Enterprise              BTNG1Ge[hash]
g → Government / Ministry   BTNG1Gg[hash]
t → Treasury / Central Bank BTNG1Gt[hash]
v → Validator / Node        BTNG1Gv[hash]
c → Coin / Asset            BTNG1Gc[hash]
```

**All 54 Nation Prefixes:**
```
Ghana          BTNG1G    Nigeria        BTNG2N    South Africa   BTNG3S
Kenya          BTNG4K    Egypt          BTNG5E    Ethiopia       BTNG6E
Morocco        BTNG7M    Uganda         BTNG8U    Tanzania       BTNG9T
Algeria        BTNG10A   Sudan          BTNG11S   Angola         BTNG12A
Mozambique     BTNG13M   Madagascar     BTNG14M   Cameroon       BTNG15C
Côte d'Ivoire  BTNG16C   Niger          BTNG17N   Burkina Faso   BTNG18B
Mali           BTNG19M   Malawi         BTNG20M   Zambia         BTNG21Z
Senegal        BTNG22S   Chad           BTNG23C   Somalia        BTNG24S
Zimbabwe       BTNG25Z   Guinea         BTNG26G   Rwanda         BTNG27R
Benin          BTNG28B   Burundi        BTNG29B   Tunisia        BTNG30T
South Sudan    BTNG31S   Togo           BTNG32T   Sierra Leone   BTNG33S
Libya          BTNG34L   DR Congo       BTNG35D   Congo          BTNG36C
Liberia        BTNG37L   C.A.R.         BTNG38C   Mauritania     BTNG39M
Eritrea        BTNG40E   Namibia        BTNG41N   Botswana       BTNG42B
Lesotho        BTNG43L   Eswatini       BTNG44E   Gabon          BTNG45G
Gambia         BTNG46G   Guinea-Bissau  BTNG47G   Eq. Guinea     BTNG48E
Cape Verde     BTNG49C   São Tomé       BTNG50S   Seychelles     BTNG51S
Mauritius      BTNG52M   Comoros        BTNG53C   Djibouti       BTNG54D
```

---

## 2. BANK INFRASTRUCTURE SERVICES

| # | Service File | Purpose | Status |
|---|---|---|---|
| 1 | `services/btngBankEngine.ts` | Core bank ledger & accounts | LIVE |
| 2 | `services/btngWalletService.ts` | Genesis wallet operations | LIVE |
| 3 | `services/btng3WalletService.ts` | HD wallet — Base58Check | LIVE |
| 4 | `services/cashRailService.ts` | MTN MoMo cash rail (Merchant 248059) | LIVE |
| 5 | `services/mintingPipelineService.ts` | BTNGG minting pipeline btngd v1.0 | LIVE |
| 6 | `services/verificationPipelineService.ts` | Identity KYC pipeline | LIVE |
| 7 | `services/kycService.ts` | KYC submission management | LIVE |
| 8 | `services/tradingService.ts` | Spot trading engine | LIVE |
| 9 | `services/p2pService.ts` | P2P marketplace | LIVE |
| 10 | `services/portfolioService.ts` | Portfolio value tracking | LIVE |
| 11 | `services/pipelineHubService.ts` | Pipeline hub orchestrator | LIVE |
| 12 | `services/productEngineService.ts` | BTNG product engine | LIVE |
| 13 | `services/authService.ts` | Authentication service | LIVE |
| 14 | `services/cryptoPriceService.ts` | Live crypto price feeds | LIVE |
| 15 | `services/exchangeRateService.ts` | FX exchange rates | LIVE |
| 16 | `services/blogService.ts` | Blog CMS service | LIVE |
| 17 | `services/profileStorageService.ts` | User profile storage | LIVE |
| 18 | `services/twoFactorService.ts` | 2FA TOTP management | LIVE |
| 19 | `services/btngCertificatesService.ts` | Equity certificates | LIVE |
| 20 | `services/brainRouterService.ts` | AI brain router | LIVE |
| 21 | `services/liveDataBootstrap.ts` | App boot + data seed | LIVE |

---

## 3. EDGE FUNCTIONS (Supabase / OnSpace Cloud)

| Function | Route | Purpose |
|---|---|---|
| `btng-brain-router` | /functions/btng-brain-router | AI brain routing |
| `btng-pay-gateway` | /functions/btng-pay-gateway | BTNG Pay settlement |
| `btng-reserve-status` | /functions/btng-reserve-status | Gold reserve status |
| `btng-support-chat` | /functions/btng-support-chat | AI support |
| `btng-terminal` | /functions/btng-terminal | Trading terminal |
| `btng-wallet-generate` | /functions/btng-wallet-generate | Wallet generation |
| `coingecko-prices` | /functions/coingecko-prices | Live price feeds |
| `eth-blockchain` | /functions/eth-blockchain | Ethereum bridge |
| `gold-oracle` | /functions/gold-oracle | Gold price oracle |
| `send-otp-email` | /functions/send-otp-email | OTP email sender |
| `send-statement-email` | /functions/send-statement-email | Account statements |
| `stripe-onramp` | /functions/stripe-onramp | Stripe fiat onramp |
| `verify-otp-email` | /functions/verify-otp-email | OTP verification |

---

## 4. APP SCREENS — FULL REGISTRY

| Screen | Route | Category |
|---|---|---|
| Market | `/(tabs)/index` | Core |
| Trade | `/(tabs)/trade` | Core |
| P2P | `/(tabs)/p2p` | Core |
| Wallet | `/(tabs)/wallet` | Core |
| Profile | `/(tabs)/profile` | Core |
| Admin Dashboard | `/admin` | Bank Admin |
| App Builder | `/app-builder` | Dev |
| Sovereign Engine | `/btng-sovereign-engine` | Crypto |
| BTNG Pay | `/btng-pay` | Payments |
| Genesis Wallet | `/btng-genesis` | Wallet |
| BTNG3 Wallet | `/btng3-wallet` | Wallet |
| Private Banker AI | `/btng-private-banker` | AI |
| Block Explorer | `/btng-explorer` | Chain |
| Cash Rail | `/cash-rail` | Banking |
| Minting Pipeline | `/btng-minting-pipeline` | Tokenomics |
| Verification Pipeline | `/btng-verification-pipeline` | KYC |
| Pipeline Hub | `/btng-pipeline-hub` | Ops |
| Cert Scanner | `/cert-scanner` | Compliance |
| Sovereign Dashboard | `/btng-sovereign-dashboard` | Ops |
| Sovereign Docs | `/btng-sovereign-docs` | Legal |
| Governance | `/btng-governance` | DAO |
| Node Dashboard | `/btng-node` | Infrastructure |
| Node Engine | `/btng-node-engine` | Infrastructure |
| Node Generator | `/btng-node-generator` | Infrastructure |
| BTNG Deploy | `/btng-deploy` | DevOps |
| API Manager | `/btng-api-manager` | Dev |
| API Key Generator | `/btng-api-key-generator` | Dev |
| API Extension | `/btng-api-extension` | Dev |
| BTNG SDK | `/btng-sdk` | Dev |
| Developer Library | `/developer` | Dev |
| Contract Deploy | `/btng-contract-deploy` | Smart Contracts |
| NFT Creator | `/nft-creator` | Digital Assets |
| BTNG Card | `/btng-card` | Cards |
| Proof of Value | `/btng-proof-of-value` | Legal |
| Copy Trading | `/copy-trading` | Trading |
| Binary Trading | `/binary-trading` | Trading |
| Practice Wallet | `/practice` | Training |
| Africa Free Trade | `/africa-free-trade` | AfCFTA |
| Africa Value Engine | `/africa-value-engine` | AfCFTA |
| BTNG Global Panel | `/btng-global-panel` | Markets |
| BTNG Terminal | `/btng-terminal` | Markets |
| AI Creator | `/ai-creator` | AI |
| Eternal Service | `/btng-eternal-service` | Services |
| KYC | `/kyc` | Compliance |
| Watchlist | `/watchlist` | Markets |
| FX Converter | `/fx-converter` | Finance |
| Fee Calculator | `/fee-calculator` | Finance |
| Deposit | `/deposit` | Banking |
| Withdraw | `/withdraw` | Banking |
| Transfer | `/transfer` | Banking |
| Referral | `/referral` | Marketing |
| Notifications | `/notifications` | System |
| 2FA Security | `/two-factor` | Security |
| Edit Profile | `/edit-profile` | Account |
| Blog | `/blog` | Content |
| Blog Article | `/blog-article` | Content |
| Support Chat | `/support-chat` | Support |
| Contact | `/contact` | Support |
| Privacy Policy | `/privacy-policy` | Legal |
| Terms | `/terms` | Legal |
| QR Generator | `/cert-qr-generator` | Utility |
| Currency Selector | `/currency-selector` | Settings |
| Onboarding | `/onboarding` | Onboard |
| Login | `/login` | Auth |

---

## 5. DATABASE TABLES (OnSpace Cloud / Supabase)

| Table | Purpose | RLS |
|---|---|---|
| `user_profiles` | User accounts | Enabled |
| `btng_cards` | HD vault cards (W/M/E/G/T/V/C) | Enabled |
| `btng_identities` | BTNG identities | Enabled |
| `btng_wallets` | BTNG wallet records | Enabled |
| `btng_certificates` | Equity certificates | Enabled |
| `btng_loans` | Loan records | Enabled |
| `btng_mint_receipts` | Minting receipts | Enabled |
| `btng_oracle_cache` | Gold price cache | Enabled |
| `btng_pay_transactions` | BTNG Pay transactions | Enabled |
| `btng_equity_pool` | Equity pool | Enabled |
| `btng_product_credits` | Product credits | Enabled |
| `btng_credit_transactions` | Credit history | Enabled |
| `btng_verification_receipts` | KYC verification | Enabled |
| `btng_rulings` | AI ruling log | Enabled |
| `btng_user_roles` | User roles | Enabled |
| `kyc_submissions` | KYC submissions | Enabled |
| `orders` | Spot trade orders | Enabled |
| `trade_history` | Trade history | Enabled |
| `p2p_listings` | P2P marketplace listings | Enabled |
| `p2p_orders` | P2P orders | Enabled |
| `copy_traders` | Copy trading profiles | Enabled |
| `user_copy_subscriptions` | Copy trading subs | Enabled |
| `blog_articles` | Blog CMS | Enabled |
| `blog_bookmarks` | Article bookmarks | Enabled |
| `notifications` | User notifications | Enabled |
| `cash_rail_transactions` | MTN MoMo transactions | Enabled |
| `terminal_traders` | Terminal traders | Enabled |
| `terminal_assets` | Terminal assets | Enabled |
| `terminal_orders` | Terminal orders | Enabled |
| `security_events` | Admin audit trail | Enabled |
| `user_2fa` | 2FA secrets | Enabled |
| `email_otps` | OTP codes | Enabled |

---

*BTNG Gold Coin · Bituncoin Sovereign Platform*
*EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624*
*info@bituncoin.io · Ghana · 54 Africa Nations*
