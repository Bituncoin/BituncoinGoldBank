# BTNG TRIPLE-KEY PAYMENT ARCHITECTURE
# Technical Reference — Bank Developer Edition
# ═══════════════════════════════════════════════════════════════════
# EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
# John Kojo Zi — Founder & Lead Architect

---

## WHAT IS TRIPLE-KEY?

The BTNG Triple-Key Payment Architecture requires **3 independent
cryptographic signatures** before any payment settles on the BTNG
Sovereign Mainnet. No single entity can approve a payment alone.

```
CLIENT (Payer)      BANK (Authority)     MERCHANT (Recipient)
     │                    │                      │
     │  Ed25519 Sign       │  Ed25519 Co-Sign     │  Ed25519 Settle
     │  (Step 1)           │  (Step 2)            │  (Step 3)
     │                    │                      │
     └────────────────────┴──────────────────────┘
                          │
                    SETTLEMENT
                   (All 3 verified)
```

This design prevents:
- **Single-point compromise** — one stolen key cannot move funds
- **Unauthorized payments** — bank must co-sign every payment
- **Merchant fraud** — client must initiate, bank must validate
- **Replay attacks** — CSPRNG nonce in every txHash

---

## PAYMENT STATES

```
INITIATED       → Payment created (optimistic UI state)
CLIENT_SIGNED   → Client Ed25519 signature collected
BANK_SIGNED     → Bank Ed25519 co-signature added
COMPLETED       → Merchant signed + settlement executed
FAILED          → Any step failed
```

---

## STEP 1: CLIENT SIGNS

**Triggered by:** User tapping "Step 1 — Client Sign" button

**Input:**
- `amount: number` — payment amount in BTNGG
- `merchantId: string` — target merchant UUID
- `description: string` — payment description
- `password: string` — client wallet password

**Process:**
```
1. Validate client balance >= amount
2. Build txData = {
     type: 'TRIPLE_SIGN_PAYMENT_V3',
     amount, merchantId, merchantPublicKey, clientPublicKey,
     description, nonce: randomHex(8), chain: 'BTNG-MAINNET',
     timestamp: Date.now()
   }
3. Load clientPrivateKey from SecureStore (decrypt with password)
4. txHash = SHA-256(txData)
5. clientSignature = Ed25519.sign(txHash, clientPrivateKey)
6. Store payment { status: 'CLIENT_SIGNED', clientSignature, txHash }
```

**Output:** `TripleSignPayment` with `status: 'CLIENT_SIGNED'`

---

## STEP 2: BANK SIGNS

**Triggered by:** User/Bank tapping "Step 2 — Bank Sign" button

**Input:**
- `paymentId: string` — payment UUID from Step 1

**Process:**
```
1. Verify payment exists and status === 'CLIENT_SIGNED'
2. Load bankPrivateKey from SecureStore (system password)
3. bankPayload = JSON.stringify({ merchantId, amount, txHash, bankId, ts })
4. bankSignature = Ed25519.sign(bankPayload, bankPrivateKey)
5. Update payment { status: 'BANK_SIGNED', bankSignature }
```

**Output:** `TripleSignPayment` with `status: 'BANK_SIGNED'`

---

## STEP 3: MERCHANT SIGNS + SETTLE

**Triggered by:** User/Merchant tapping "Step 3 — Merchant Sign & Settle"

**Input:**
- `paymentId: string` — payment UUID from Step 2

**Process:**
```
1. Verify payment exists and status === 'BANK_SIGNED'
2. Create merchant invoice (PENDING)
3. Load merchantPrivateKey from SecureStore
4. merchantPayload = JSON.stringify({ invoiceId, txHash, amount })
5. merchantSignature = Ed25519.sign(merchantPayload, merchantPrivKey)
6. Create SettlementRecord {
     clientSignature, bankSignature, merchantSignature,
     txHash, amount, verifiedAt: Date.now()
   }
7. Update invoice.status = 'SETTLED'
8. Deduct from client balance
9. Credit merchant balance
10. Add SEND transaction to client ledger
11. Update payment { status: 'COMPLETED', completedAt }
```

**Output:** `TripleSignPayment` with `status: 'COMPLETED'` + `SettlementRecord`

---

## SIGNATURE VERIFICATION

```typescript
const result = tripleEngine.verifyTripleSignature(paymentId);

// Returns:
{
  allValid:      boolean,  // true only if ALL 3 are valid
  clientValid:   boolean,  // client Ed25519 verified
  bankValid:     boolean,  // bank Ed25519 verified
  merchantValid: boolean,  // merchant Ed25519 verified
}
```

**Verification payloads:**
```typescript
// Client: verify against txHash
nacl.verify(txHash, clientSignature, clientPublicKey)

// Bank: verify against settlement payload
nacl.verify(
  JSON.stringify({ merchantId, amount, txHash }),
  bankSignature,
  bankPublicKey
)

// Merchant: verify against settlement payload
nacl.verify(
  JSON.stringify({ invoiceId, txHash, amount }),
  merchantSignature,
  merchantPublicKey
)
```

---

## BTNG PAY INTEGRATION

The Triple-Key flow is exposed in the BTNG Pay screen (`/btng-pay`)
via the Security tab's "Sovereign Engine Sign" card. Users can:

1. Navigate to `/btng-sovereign-engine` before paying
2. Initialize their client wallet
3. Execute the triple-sign flow
4. Return to BTNG Pay and submit the transaction

The UCAF code in BTNG Pay serves as an additional authentication
layer on top of the triple-key signatures.

---

## STORAGE

```
AsyncStorage key: btng_sovereign_payments_v3
Format: JSON array of TripleSignPayment[]
Max retention: All payments (no auto-purge)
```

---

*BTNG Triple-Key Payment · Technical Reference v3.0*
*EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624*
