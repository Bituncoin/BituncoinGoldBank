# BTNG SDK Complete Reference — All Files & Implementation Guide

> **UBL-1.0 Universal Banking Layer** — One backend, three native SDKs, one sovereign brain.
> Deploy once. All platforms connect.

---

## 📦 SDK Directory Structure

```
sdk/
├── README.md                          # Deployment & CLI reference
├── SOVEREIGN_STATUS.md                # Network status dashboard
├── main.py                            # FastAPI backend engine
├── BTNGClient.kt                      # Android (Kotlin) SDK
├── BTNGClient.swift                   # iOS (Swift) SDK
├── btngClient.js                      # Web/JavaScript SDK
├── btng-cli.py                        # Sovereign CLI (54KB)
├── btng-node-server.js                # Node mesh server
├── deploy-sovereign-node.sh           # Single-node deployment
├── deploy-all-nodes.sh                # 54-node parallel deployment
├── node-bootstrap.sh                  # Bootstrap script
├── nodes.txt                          # Mesh node registry
├── purge_hardcoded_key.py            # Security cleanup
├── btng54Engine.ts                    # 54-node orchestration
├── btngDerive.ts                      # HD key derivation (40KB)
├── btngAssistantAgent.ts              # AI assistant integration
├── btngRpcAdapter.ts                  # RPC adapter layer
├── btngEngine.js                      # JavaScript engine
├── assistantRoute.ts                  # Assistant routing
├── btngRuntime.ts                     # Runtime environment
└── btng-ai-brain/                     # Sovereign Brain module
    ├── core/router.py                 # Policy engine
    ├── anchor_genesis.py              # Genesis block anchor
    ├── log/
    │   ├── rulings.jsonl              # Append-only Law Journal
    │   └── verify_genesis.py          # Genesis verifier
```

---

## 🔌 Backend Engine — `main.py`

**FastAPI server** — Deploy once, all SDKs connect.

```python
# Core endpoints
GET    /wallet/{btng_id}      → Wallet lookup
POST   /loan/quote            → Loan calculator
POST   /card/activate         → Card activation
POST   /identity              → Identity registry
GET    /health                → Health check

# Constants
GOLD_SYMBOL   = "BTNGG"
CHAIN_PREFIX  = "btng1"
BASE_RATE_APR = 8%
MAX_LTV       = 70%
```

**Deploy:**
```bash
pip install fastapi uvicorn pydantic
uvicorn main:app --host 0.0.0.0 --port 8080
```

---

## 📱 Android SDK — `BTNGClient.kt`

**Kotlin + OkHttp** — Drop-in for any Android banking app.

```kotlin
// Setup
val btng = BTNGClient("https://btng-bank.yourdomain.com")

// Wallet Lookup
btng.getWallet("BTNG-1234-5678") { json ->
    // Update UI with: json["btng_id"], json["balance"], etc.
}

// Loan Quote
btng.loanQuote("BTNG-1234-5678", 10000.0, 90) { json ->
    // Show terms: max_borrow, interest, total_due
}

// Card Activation
btng.activateCard("BTNG-1234-5678", "btng1xyz", "2026-12-31") { json ->
    // json["card_number_masked"], json["expires"]
}

// Identity Registration
btng.registerIdentity("BTNG-1234-5678", "btng1xyz", "2027-06-10") { json ->
    // json["registered_at"], json["status"]
}

// Offline fallback (no network needed)
val quote = btng.localLoanQuote("BTNG-1234-5678", 10000.0, 90)
```

**Gradle:**
```gradle
implementation("com.squareup.okhttp3:okhttp:4.12.0")
```

---

## 🍎 iOS SDK — `BTNGClient.swift`

**Swift + URLSession** — Drop-in for any iOS banking app.

```swift
// Setup
let btng = BTNGClient(baseUrl: "https://btng-bank.yourdomain.com")

// Wallet Lookup
btng.getWallet(btngId: "BTNG-1234-5678") { json in
    DispatchQueue.main.async {
        // Update UI: json?["btng_id"], json?["balance"]
    }
}

// Loan Quote
btng.loanQuote(btngId: "BTNG-1234-5678", principal: 10000, days: 90) { json in
    DispatchQueue.main.async {
        // Show terms: max_borrow, interest, total_due
    }
}

// Card Activation
btng.activateCard(btngId: "BTNG-1234-5678", wallet: "btng1xyz") { json in
    DispatchQueue.main.async {
        // json?["card_number_masked"], json?["expires"]
    }
}

// Offline fallback
let quote = btng.localLoanQuote(btngId: "BTNG-1234-5678", principal: 10000, days: 90)
```

---

## 🌐 Web SDK — `btngClient.js`

**JavaScript ES Modules** — Works in all browsers & Node.js.

```javascript
import { 
  getWallet, 
  loanQuote, 
  activateCard, 
  registerIdentity,
  healthCheck,
  localLoanQuote 
} from './btngClient.js';

// Wallet Lookup
const wallet = await getWallet('BTNG-1234-5678');
console.log(wallet.balance, wallet.asset);

// Loan Quote
const quote = await loanQuote('BTNG-1234-5678', 10000, 90);
console.log(quote.max_borrow, quote.interest, quote.total_due);

// Card Activation
const card = await activateCard('BTNG-1234-5678', 'btng1xyz', '2026-12-31');
console.log(card.card_number_masked, card.expires);

// Identity Registration
const identity = await registerIdentity('BTNG-1234-5678', 'btng1xyz', '2027-06-10');
console.log(identity.registered_at);

// Health Check
const health = await healthCheck();
console.log(health.engine);  // "UBL-1.0"

// Offline fallback
const localQuote = localLoanQuote('BTNG-1234-5678', 10000, 90);
console.log(localQuote.source);  // "local"
```

---

## ⚙️ CLI Tool — `btng-cli.py`

**Sovereign command-line interface** — All commands governed by Brain policy engine.

### NFT Operations
```bash
# Create & loan against NFT
python3 btng-cli.py nft create-and-loan --region GH --loan 50000 --anchor GH-AU-001

# Verify NFT
python3 btng-cli.py nft verify --anchor BTNG-NFT-001

# Generate certificate
python3 btng-cli.py nft generate-certificate --anchor GH-AU-001

# Initialize pilot with 3 nodes
python3 btng-cli.py nft pilot-init --nodes 3 --region GH

# Finalize lock
python3 btng-cli.py nft finalize-lock --anchor GH-AU-001
```

### Mesh Network
```bash
# Sync all nodes
python3 btng-cli.py mesh sync

# Health check
python3 btng-cli.py mesh health-check --src_ip 154.161.183.158

# Broadcast directive to 54 nations
python3 btng-cli.py mesh broadcast-directive --nations 54 --directive SOVEREIGN_UPDATE_V3

# Scale replicas
python3 btng-cli.py mesh scale --replicas 5 --region GH

# Rebalance load
python3 btng-cli.py mesh rebalance --region GH

# Release liquidity
python3 btng-cli.py mesh release-liquidity --amount 500000 --region GH
```

### Banking Engine
```bash
# Register identity
python3 btng-cli.py bank register-identity --btng_id BTNG-GH-001 --wallet btng1xyz

# Wallet lookup
python3 btng-cli.py bank wallet-lookup --btng_id BTNG-GH-001

# Loan quote
python3 btng-cli.py bank loan-quote --btng_id BTNG-GH-001 --principal 25000 --days 180

# Activate card
python3 btng-cli.py bank card-activate --btng_id BTNG-GH-001 --wallet btng1xyz
```

### Governance & Audit
```bash
# Export audit trail
python3 btng-cli.py governance export-audit --since 2025-01-01 --format jsonl

# Council report
python3 btng-cli.py council report-broadcast --nations 54
```

### Private Banker Automation
```bash
# Perpetual automation
python3 btng-cli.py banker perpetual-run --anchor GH

# Forever loop
python3 btng-cli.py banker forever-loop --anchor GH
```

### Security
```bash
# Seal disk tank
python3 btng-cli.py security seal-disk-tank --tank prod-tank --region GH
```

### Phase 2 Q2 2026
```bash
# Logistics hub
python3 btng-cli.py logistics tarkwa-hub --region GH

# Merchant onboarding
python3 btng-cli.py wdb merchant-onboard --batch 5000 --region GH

# Cross-bloc reserve sync
python3 btng-cli.py reserve cross-bloc-sync --blocs "BRICS+,AU,AfCFTA"

# Infrastructure expansion
python3 btng-cli.py infra rail-expansion --amount 100000000 --corridors "Sahelian,EAC,ECOWAS"
```

---

## 🚀 Mesh Deployment

### 54-Node Parallel Deployment

```bash
chmod +x deploy-all-nodes.sh
./deploy-all-nodes.sh
```

**Options:**
```bash
# Custom tier on all nodes
COUNCIL_TIER=3 ./deploy-all-nodes.sh

# Skip firewall (staging only)
SKIP_FIREWALL=1 ./deploy-all-nodes.sh

# Dry run (no SSH)
./deploy-all-nodes.sh --dry-run

# Retry failed nodes
./deploy-all-nodes.sh --nodes .deploy-reports/retry_TIMESTAMP.txt

# Custom SSH key
SSH_KEY=~/.ssh/btng_mesh ./deploy-all-nodes.sh

# Limit concurrency
MAX_PARALLEL=4 ./deploy-all-nodes.sh
```

### Single-Node Deployment

```bash
chmod +x deploy-sovereign-node.sh
./deploy-sovereign-node.sh

# Or with custom settings
BTNG_NODE_ID=btng-node-gh-02 BTNG_SOVEREIGN_PORT=38982 ./deploy-sovereign-node.sh
```

---

## 📓 Sovereign Brain & Law Journal

**`btng-ai-brain/`** — The governance engine.

```bash
# Anchor genesis block (idempotent)
python3 btng-ai-brain/anchor_genesis.py

# Verify anchor integrity
python3 btng-ai-brain/log/verify_genesis.py --verbose

# Watch live rulings
tail -f btng-ai-brain/log/rulings.jsonl

# Count denials
grep '"ruling": "DENY"' btng-ai-brain/log/rulings.jsonl | wc -l

# Export to CSV for compliance
python3 -c "
import json, csv, sys
rows = [json.loads(l) for l in open('btng-ai-brain/log/rulings.jsonl')]
fields = ['ts','session','intent','confidence','ruling','policy','tool','network_node','latency_ms','reason']
w = csv.DictWriter(sys.stdout, fieldnames=fields, extrasaction='ignore')
w.writeheader(); w.writerows(rows)
" > audit-$(date +%Y%m%d).csv
```

---

## 🔐 Advanced Modules

### HD Key Derivation — `btngDerive.ts` (40KB)
- BIP-39 mnemonic generation
- HD wallet tree derivation
- Multi-signature support
- Export to QR codes

### RPC Adapter — `btngRpcAdapter.ts`
- Ethereum-compatible RPC
- Transaction signing
- Block height queries

### 54-Node Orchestration — `btng54Engine.ts`
- Parallel node coordination
- Failure recovery
- Leader election

### Assistant Agent — `btngAssistantAgent.ts`
- AI routing to CLI commands
- Intent classification
- Policy enforcement

---

## 🛡️ Security Checklist

✅ **Never open port 38982 to `0.0.0.0/0`** — Only trusted sovereign mesh CIDRs:
```bash
sudo iptables -I INPUT -p tcp --dport 38982 -s 154.161.183.0/24 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 38982 -j DROP
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

✅ **Use SSH keys** for mesh deployment:
```bash
SSH_KEY=~/.ssh/btng_mesh deploy-all-nodes.sh
```

✅ **Purge hardcoded keys** before production:
```bash
python3 purge_hardcoded_key.py
```

✅ **Export audit logs regularly**:
```bash
python3 btng-cli.py governance export-audit --since 2025-01-01 --format jsonl
```

---

## 📊 Sovereign Policy Tiers

| Tier | Identity | Capabilities |
|------|----------|--------------|
| 0 | Anonymous | Read-only public data |
| 1 | Email verified | Balance inquiry, reduced branch locator |
| 2 | KYC tier-2 | Accounts, transfers, merchant ops |
| 3 | Operator | Automation, mesh treasury, logistics |
| 4 | Council | Global directives, bond issuance |
| 5 | Sovereign Council | Cross-bloc BRICS+ reserve sync |

---

## 📌 Quick Reference

| Use Case | SDK/Tool | Command |
|----------|----------|---------|
| Android app wallet | `BTNGClient.kt` | `btng.getWallet()` |
| iOS app wallet | `BTNGClient.swift` | `btng.getWallet()` |
| Web dashboard | `btngClient.js` | `getWallet()` |
| Deploy 54 nodes | `deploy-all-nodes.sh` | `./deploy-all-nodes.sh` |
| Local testing | `main.py` | `uvicorn main:app --port 8080` |
| Governance audit | `btng-cli.py` | `governance export-audit` |
| Mesh health | `btng-cli.py` | `mesh health-check` |
| Genesis anchor | `anchor_genesis.py` | `python3 anchor_genesis.py` |

---

## License

BTNG Sovereign Banking Infrastructure — Ghana & Africa 🌍  
Ekuye Digital Gateway Trust Ltd · Merchant ID 248059

*"One network, one brain, one face — and one ledger of rulings. That is self-ownership with receipts."*
