# BTNG SOVEREIGN BANK — DEVELOPER MAINTENANCE GUIDE
# EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
# John Kojo Zi — Founder & Lead Architect
# ═══════════════════════════════════════════════════════════════════

## FOR: BTNG Bank Development Team & Client Maintenance Staff

---

## 1. HOW TO EDIT ENGINE CODE

### 1.1 Source Files Location

All engine source files are in `services/` at the project root.
The `dev-master/` folder contains documentation only — the actual
running code is in `services/`.

**To edit an engine:**
1. Open the file in `services/`
2. Make your change
3. Test in the app preview
4. Document the change in `dev-master/CHANGELOG.md`

### 1.2 Sovereign Engine (services/btngSovereignEngineService.ts)

This is the most critical file in the entire bank platform.

**Before editing:**
- Read `dev-master/SECURITY.md` completely
- Understand the Triple-Key architecture
- Test in dev environment ONLY

**Safe to edit:**
- `BTNGSovereignEngine.seedMerchants()` — add/remove default merchants
- `AuditLogger` — add new audit event types
- `BankWalletEngine.BANK_INITIAL_BALANCE` — adjust initial bank balance
- Error messages in payment flow methods

**DO NOT edit without full security review:**
- `UniversalKeyManager` class — any cryptographic method
- `ClientWalletEngine.create()` — key generation flow
- `TripleKeyPaymentEngine.initiatePaymentAsync()` — signing flow
- Any method that touches `SecureStore` or `nacl`

### 1.3 Address Engine (services/btngEngineService.ts)

Stable file — low risk to edit.

**Safe to edit:**
- `BTNG_PREFIXES` — add new prefixes
- `COUNTRY_META` — add country metadata
- `ADDRESS_TYPE_LABELS` — change label strings

**Do not edit:**
- `createEngine()` factory function — used by all 54 nations
- `lookupBtngAddress()` — address routing logic

---

## 2. ADDING A NEW MERCHANT

To register a new default merchant that appears on every fresh install:

```typescript
// In services/btngSovereignEngineService.ts
// Inside BTNGSovereignEngine.seedMerchants():

await this.merchantEngine.register(
  'Your Merchant Name',     // Display name
  'Category',              // Category (Crypto, Finance, Trade, etc.)
  {
    country: 'Ghana',      // Metadata
    verified: 'true',
    merchantId: '248059',  // Optional: link to MTN MoMo merchant
  }
);
```

---

## 3. CHANGING BANK SETTINGS

### 3.1 Initial Bank Balance

```typescript
// In services/btngSovereignEngineService.ts
// In BankWalletEngine class:
private readonly BANK_INITIAL_BALANCE = 10_000_000; // ← Change this
```

### 3.2 Welcome Bonus

```typescript
// In BTNGSovereignEngine.initialize():
await this.clientEngine.topUp(1000, 'Welcome Bonus — ...');
//                           ^^^^
//                    Change the bonus amount here
```

### 3.3 MTN MoMo Merchant ID

```typescript
// In constants/merchantConfig.ts
// Edit BTNG_MERCHANT.merchantId
```

---

## 4. PAYMENT FLOW MAINTENANCE

### 4.1 Test a Triple-Key Payment

1. Open the app → Profile → Sovereign Engine
2. Initialize with a test name and password
3. Go to Payments tab
4. Enter amount, select merchant
5. Step 1 → Client Sign
6. Step 2 → Bank Sign
7. Step 3 → Merchant Sign & Settle
8. Verify all 3 signature checkmarks appear green

### 4.2 Verify Signature Integrity

```typescript
// In your test or debug code:
const result = btngSovereignEngine.tripleEngine.verifyTripleSignature(paymentId);
console.log(result);
// { allValid: true, clientValid: true, bankValid: true, merchantValid: true }
```

### 4.3 Reset Bank Keys (Emergency)

```typescript
// This archives the old bank wallet and generates new Ed25519 keys
const newWallet = await btngSovereignEngine.resetBankSystem();
console.log('New Bank Fingerprint:', newWallet.keyPair.fingerprint);
```

---

## 5. DATABASE MAINTENANCE

### 5.1 Key Tables for Bank Operations

```sql
-- View all BTNG Pay transactions
SELECT reference, amount_satoshi/1e8 as amount_btngg, 
       status, sender_first_name, recipient_merchant_id,
       created_at
FROM btng_pay_transactions
ORDER BY created_at DESC
LIMIT 50;

-- View HD Vault Cards for a user
SELECT btng_id, wallet_address, card_number_masked, 
       tier, status, nickname, created_at
FROM btng_cards
WHERE user_id = '<user_uuid>'
ORDER BY created_at DESC;

-- View KYC submissions pending review
SELECT id, user_id, full_name, id_type, country, 
       status, submitted_at
FROM kyc_submissions
WHERE status = 'pending'
ORDER BY submitted_at ASC;
```

### 5.2 Admin Access (Bank Manager Only)

The Admin Dashboard at `/admin` is locked to:
- Email: `info@bituncoin.io`
- `is_admin = true` in `user_profiles`

To grant temporary admin access to a developer:
1. Log in to OnSpace Cloud Dashboard
2. Navigate to Data → user_profiles
3. Find the user record
4. Set `is_admin = true`

---

## 6. EDGE FUNCTION MAINTENANCE

### 6.1 Deployed Functions

All functions in `supabase/functions/` are deployed to OnSpace Cloud.

**Key functions for bank operations:**
```
btng-pay-gateway   ← Processes BTNG Pay transactions
gold-oracle        ← Fetches live gold price (XAU/USD)
send-otp-email     ← Sends OTP verification emails
verify-otp-email   ← Verifies OTP codes
btng-brain-router  ← Routes AI requests
```

### 6.2 Environment Variables (Secrets)

Set in OnSpace Cloud Dashboard → Secrets:
```
STRIPE_SECRET_KEY          ← Stripe payments
COINGECKO_API_KEY          ← Crypto price feeds
ONSPACE_AI_API_KEY         ← AI features
ETHEREUM_API_KEY           ← ETH blockchain
ONSPACE_AI_BASE_URL        ← AI base URL
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ← Client-side Stripe
```

---

## 7. APP PUBLISHING

### 7.1 Android APK (Quick Share)
1. Click Download button (top-right in OnSpace builder)
2. Select "Download APK"
3. Install on Android device for testing

### 7.2 App Store (iOS)
1. Click Publish button
2. Follow Expo EAS guided workflow
3. Bundle ID: `com.bituncoin.btng`

### 7.3 Play Store (Android)
1. Click Publish button
2. Follow Google Play deployment guide
3. See `PUBLISHING_GUIDE.md` in project root

---

## 8. SUPPORT AND ESCALATION

| Issue | Contact | Priority |
|---|---|---|
| Cryptographic bug | John Kojo Zi — info@bituncoin.io | CRITICAL |
| Payment flow failure | Bank Dev Team | HIGH |
| Database/RLS issue | OnSpace Cloud support | HIGH |
| UI/UX bug | App Builder Admin Center | MEDIUM |
| Feature request | info@bituncoin.io | NORMAL |

---

## 9. COMMIT CONVENTIONS

All changes to engine files MUST use this commit prefix:

```
[BTNG-MASTER] <description>

Examples:
[BTNG-MASTER] Add new merchant: Gold Market Kumasi
[BTNG-MASTER] Increase welcome bonus to 2000 BTNGG
[BTNG-MASTER] Fix audit log entry for reset event
[BTNG-MASTER] Update bank initial balance to 50M BTNGG
```

Changes to documentation only:
```
[BTNG-DOCS] <description>
```

---

*BTNG Gold Coin · Developer Maintenance Guide v3.0*
*EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624*
*info@bituncoin.io · Ghana · 54 Africa Nations*
