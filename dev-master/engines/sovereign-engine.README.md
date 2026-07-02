# BTNG SOVEREIGN ENGINE MASTERPIECE v3.0
# Deep-Dive Technical Documentation
# ═══════════════════════════════════════════════════════════════════
# EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624
# John Kojo Zi — Founder & Lead Architect

## SOURCE FILE
`services/btngSovereignEngineService.ts`

---

## ARCHITECTURE OVERVIEW

```
BTNGSovereignEngine (Master Singleton)
├── ClientWalletEngine          ← Individual user wallet (Ed25519)
├── BankWalletEngine            ← Bank system wallet (Ed25519)
├── MerchantWalletEngine        ← All merchant wallets (Ed25519)
├── TripleKeyPaymentEngine      ← 3-step payment pipeline
└── AuditLogger                 ← Immutable event log
```

---

## CLASS REFERENCE

### UniversalKeyManager (Static Methods)

| Method | Description |
|---|---|
| `generateKeyPair()` | Generate real Ed25519 key pair via nacl |
| `storePrivateKey(key, raw, password)` | Encrypt + store in SecureStore |
| `loadPrivateKey(key, password)` | Decrypt from SecureStore |
| `deletePrivateKey(key)` | Remove from SecureStore |
| `sha256(input)` | SHA-256 via expo-crypto |
| `hashData(data)` | SHA-256 of JSON stringified data |
| `encryptKey(keyBytes, password)` | PBKDF2-XOR encryption |
| `decryptKey(encrypted, password)` | PBKDF2-XOR decryption |
| `signData(secretKey, message)` | Ed25519 detached sign |
| `verifySignature(pubKey, msg, sig)` | Ed25519 verify |
| `randomHexSync(n)` | CSPRNG hex string |
| `randomUUID()` | CSPRNG UUID v4 |
| `maskKey(key, show)` | Display-safe key mask |
| `uint8ArrayToHex(bytes)` | Bytes → hex |
| `hexToUint8Array(hex)` | Hex → bytes |

---

### ClientWalletEngine

| Method | Description |
|---|---|
| `load()` | Load wallet from AsyncStorage |
| `create(name, password, metadata)` | Create wallet + generate Ed25519 keys |
| `reset(password, newName?)` | Archive + regenerate keys |
| `signTransaction(txData, password)` | Sign with Ed25519 private key |
| `verifyOwnSignature(msg, sig)` | Verify against stored public key |
| `addTransaction(tx)` | Add to ledger |
| `topUp(amount, note)` | Mint BTNGG to balance |
| `state` | Current WalletState (no private key) |

---

### BankWalletEngine

| Method | Description |
|---|---|
| `loadOrCreate()` | Load or generate bank keys |
| `reset()` | Archive + regenerate bank keys |
| `signSettlement(merchantId, amount, txHash)` | Bank Ed25519 sign |
| `verifyBankSignature(msg, sig)` | Verify bank signature |
| `distributeReward(toPubKey, amount, reason)` | Send reward + sign |
| `state` | Current bank WalletState |

---

### MerchantWalletEngine

| Method | Description |
|---|---|
| `loadAll()` | Load all merchants + pre-load keys |
| `register(name, category, metadata)` | Register + generate Ed25519 keys |
| `createInvoice(merchantId, amount, desc)` | Create BTNG Pay invoice |
| `settle(merchantId, invoiceId, c-sig, b-sig, txHash)` | Merchant signs settlement |
| `verifyMerchantSignature(id, msg, sig)` | Verify merchant signature |
| `get(merchantId)` | Get single merchant |
| `getAll()` | Get all merchants |

---

### TripleKeyPaymentEngine

| Method | Description |
|---|---|
| `load()` | Load payments from AsyncStorage |
| `initiatePaymentAsync(amount, merchantId, desc, password)` | Step 1: Client signs |
| `initiatePayment(amount, merchantId, desc, password)` | Sync wrapper (optimistic UI) |
| `addBankSignature(paymentId)` | Step 2: Bank signs |
| `addMerchantSignatureAndComplete(paymentId)` | Step 3: Merchant signs + settle |
| `verifyTripleSignature(paymentId)` | Verify all 3 signatures |
| `getAllPayments()` | All payments descending |
| `get(paymentId)` | Single payment |

---

### BTNGSovereignEngine (Singleton)

| Method | Description |
|---|---|
| `initialize(name, password, forceNew?)` | Boot all engines |
| `resetClientWallet(password, newName?)` | Client wallet key rotation |
| `resetBankSystem()` | Bank key rotation |
| `registerMerchant(name, category, metadata)` | Add merchant |
| `getSystemStatus()` | Full system health + balances |
| `getAllPublicKeys()` | All entity public keys |
| `initialized` | Boolean init state |

---

## DATA FLOW — PAYMENT LIFECYCLE

```
USER ACTION                    ENGINE OPERATION
───────────                    ────────────────

User enters amount             UI collects: amount, merchantId, password
  + selects merchant
  + enters password
         │
         ▼
[initiatePaymentAsync]         1. Load client state
                               2. Find merchant record
                               3. Check balance >= amount
                               4. Build txData JSON (with CSPRNG nonce)
                               5. Load client privateKey from SecureStore
                                  → PBKDF2-derive key from password
                                  → Verify auth tag
                                  → XOR decrypt private key bytes
                               6. nacl.sign.detached(SHA-256(txData), privKey)
                               7. Store TripleSignPayment { status: CLIENT_SIGNED }
                               8. Return { payment, error? }
         │
         ▼
[addBankSignature]             1. Load bank private key (system password)
                               2. Build settlement payload JSON
                               3. nacl.sign.detached(payload, bankPrivKey)
                               4. Update payment { status: BANK_SIGNED }
                               5. Return { payment, error? }
         │
         ▼
[addMerchantSignatureAndComplete]
                               1. Create invoice for merchant
                               2. Load merchant private key from SecureStore
                               3. Build settlement payload JSON
                               4. nacl.sign.detached(payload, merchantPrivKey)
                               5. Create SettlementRecord (all 3 signatures)
                               6. Update invoice status → SETTLED
                               7. Credit merchant balance
                               8. Deduct client balance
                               9. Log SEND transaction on client ledger
                              10. Update payment { status: COMPLETED }
                              11. Return { payment, settlement, error? }
         │
         ▼
[verifyTripleSignature]        1. nacl.sign.detached.verify(client)  ✓
                               2. nacl.sign.detached.verify(bank)    ✓
                               3. nacl.sign.detached.verify(merchant) ✓
                               4. Return { allValid: true }
```

---

## DEFAULT SEEDED MERCHANTS

On first initialization (no existing merchants), 4 are auto-created:

| Name | Category | Metadata |
|---|---|---|
| BTNG Gold Store | Crypto | flagship, verified, Ghana |
| Accra Digital Market | Marketplace | Ghana, West Africa |
| AfCFTA Trade Hub | Trade | 54 Nations, AfCFTA |
| EKUYE Gateway | Finance | CS099020624 |

All 4 get real Ed25519 key pairs generated automatically.

---

*BTNG Sovereign Engine · Technical Reference v3.0*
*EKUYE DIGITAL GATEWAY TRUST LTD · CS099020624*
