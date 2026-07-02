# BTNG Enterprise Gateway v3.0 — Architecture Reference

**Author:** John Kojo Zi — Founder & Lead Architect  
**Company:** EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624  
**Date:** June 2026  
**File:** `dev-master/engines/btng-enterprise-v3.js`

---

## Security Architecture (Visa/Mastercard Model)

```
┌─────────────────────────────────────────────────────────┐
│                  MASTER KEY AUTHORITY                    │
│                 (Root of Trust — BTNG)                   │
│  • Issues certificates to all merchants                  │
│  • Signs high-value transactions (> 10,000 BTNG)        │
│  • Can revoke compromised entities                       │
│  • One-year certificate validity                         │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │  SANDBOX     │ │  PRODUCTION  │ │  GATEWAY     │
  │  Environment │ │  Environment │ │  Security    │
  │  • Test mode │ │  • Live BTNG │ │  • IP whitelist│
  │  • Fake funds│ │  • Settlement│ │  • Rate limit │
  │  • API keys  │ │  • Receipts  │ │  • Fraud check│
  └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Classes

### MasterKeyAuthority
Root of trust for the entire BTNG payment network.

| Method | Description |
|--------|-------------|
| `getMasterPublicKey()` | Returns Ed25519 master public key (PEM) |
| `signWithMaster(data)` | Signs any data with master private key |
| `verifyMasterSignature(data, sig)` | Verifies master signature |
| `issueChildCertificate(id, type, pubKey)` | Issues 1-year cert to merchant/bank/client |
| `revokeCertificate(entityId)` | Revokes a compromised entity |
| `resetMasterKey()` | Archives old key, generates new master key |

### SandboxEnvironment
Test environment with fake BTNG funds (10,000 BTNG default per sandbox).

| Method | Description |
|--------|-------------|
| `createSandbox(merchantId, name, config)` | Creates isolated test environment |
| `generateApiKeys()` | Generates publicKey, secretKey, webhookSecret |
| `processSandboxTransaction(id, amount, data)` | Processes test transaction |
| `getSandboxStats(sandboxId)` | Returns usage stats, remaining funds, limits |

**Sandbox defaults per merchant:**
- Test funds: 10,000 BTNG
- Max transaction: 1,000 BTNG
- Daily limit: 5,000 BTNG
- Monthly limit: 25,000 BTNG
- Expiry: 30 days

### GatewaySecurityLayer
Fraud prevention and merchant onboarding.

**Fraud Rules:**
| Rule | Default |
|------|---------|
| Max per transaction | 50,000 BTNG |
| Max per day | 100,000 BTNG |
| Max per month | 500,000 BTNG |
| Suspicious velocity | 10 tx/min |
| KYC required | Yes |
| IP whitelist | Optional |
| Address blacklist | Configurable |

| Method | Description |
|--------|-------------|
| `onboardMerchant(data)` | Full merchant onboarding flow |
| `validateMerchantOnboarding(data)` | Validates required fields + KYC |
| `verifyMerchant(id)` | Activates merchant (master-signed) |
| `checkTransaction(tx, merchantId)` | All fraud checks before processing |
| `generateGatewaySignature(id, payload)` | Merchant + optional master signature |

### EnterpriseMerchantGateway
Full payment processing pipeline.

**`processPayment()` flow:**
1. Security check (limits, rate, IP, blacklist)
2. Verify client Ed25519 signature
3. Master signature check for amounts > 10,000 BTNG
4. Route to Sandbox or Production
5. Generate cryptographic receipt with gateway + master signatures

### BTNGEnterpriseSystem
Unified orchestrator — single entry point for all enterprise operations.

---

## How to Run (Node.js)

```bash
# From project root
node dev-master/engines/btng-enterprise-v3.js
```

**Requirements:**
- Node.js 18+
- No external dependencies (uses built-in `crypto`, `fs`, `path`)

---

## Merchant Onboarding Flow

```
1. POST /onboard
   { name, email, settlementAddress, kycCompleted, dailyLimit, ... }
       ↓
2. Validate fields + KYC status
       ↓
3. Generate Ed25519 merchant key pair
       ↓
4. Issue Master Key certificate (1-year validity)
       ↓
5. Create Sandbox environment + API keys
       ↓
6. Return merchantId + publicKey + sandboxId + sandboxApiKeys
       ↓
7. Admin verifies → merchant.status = 'ACTIVE' (master-signed)
```

---

## Certificate Structure

```json
{
  "entityId": "uuid",
  "entityType": "merchant",
  "entityPublicKey": "-----BEGIN PUBLIC KEY-----...",
  "issuedBy": "BTNG_MASTER_ROOT",
  "issuedAt": 1750000000000,
  "expiresAt": 1781536000000,
  "masterSignature": "hex_ed25519_signature"
}
```

---

## Integration with Production Engine

The production React Native engine is in:
```
services/btngSovereignEngineService.ts
```

This enterprise JS reference maps to:

| Enterprise Class | Production Service |
|-----------------|-------------------|
| `MasterKeyAuthority` | `BankWalletEngine` (system-level signing) |
| `SandboxEnvironment` | Practice wallet + test mode (app/practice.tsx) |
| `GatewaySecurityLayer` | BTNG Pay gateway + btng-pay-gateway edge function |
| `EnterpriseMerchantGateway` | `TripleKeyPaymentEngine` |
| `BTNGEnterpriseSystem` | `BTNGSovereignEngine` singleton |

---

## Maintainers

| Name | Role | Contact |
|------|------|---------|
| John Kojo Zi | Founder & Lead Architect | info@bituncoin.io |

**Do NOT modify production files without:**
1. Testing in Sandbox first
2. Committing with prefix `[BTNG-MASTER]`
3. Updating CHANGELOG.md
