# BTNG Universal Banking Layer — UBL-1.0 / Sovereign Brain v2.0

> One backend. Three SDKs. One Brain. One Law. One Journal.
> The AI is not loose. It is clerk to your court.

---

## Package Contents

| File / Directory              | Purpose                                          |
|-------------------------------|--------------------------------------------------|
| `main.py`                     | FastAPI UBL banking engine                       |
| `BTNGClient.kt`               | Android Native SDK (Kotlin)                      |
| `BTNGClient.swift`            | iOS Native SDK (Swift)                           |
| `btngClient.js`               | Web / Any OS SDK (JavaScript)                    |
| `btng-cli.py`                 | Sovereign CLI — all commands governed by Brain   |
| `btng-node-server.js`         | BTNG Node mesh server                            |
| `deploy-sovereign-node.sh`    | **One-command single-node deployment script**    |
| `deploy-all-nodes.sh`         | **54-node parallel mesh deployment script**      |
| `nodes.txt`                   | Mesh node registry (SSH targets, one per line)   |
| `btng-ai-brain/`              | Sovereign Brain Router (Python)                  |
| `btng-ai-brain/core/router.py`| Policy engine + Law Journal writer               |
| `btng-ai-brain/anchor_genesis.py` | Genesis block anchor (run once per node)    |
| `btng-ai-brain/log/rulings.jsonl` | Append-only Law Journal (created at runtime)|
| `btng-ai-brain/log/verify_genesis.py` | Genesis block verifier                 |

---

## Sovereign Mesh Deployment — All 54 Nodes

### Deploy all nodes in parallel

```bash
chmod +x deploy-all-nodes.sh
./deploy-all-nodes.sh
```

Edit `nodes.txt` with your real SSH targets first (format: `user@IP` or `user@IP:PORT`).

Override tier and options:

```bash
# Operator tier-3 on all nodes, skip firewall in staging
COUNCIL_TIER=3 SKIP_FIREWALL=1 ./deploy-all-nodes.sh

# Preview without any SSH connections
./deploy-all-nodes.sh --dry-run

# Retry only failed nodes from a previous run
./deploy-all-nodes.sh --nodes .deploy-reports/retry_TIMESTAMP.txt

# Use a dedicated SSH key
SSH_KEY=~/.ssh/btng_mesh ./deploy-all-nodes.sh

# Limit concurrency (default 8)
MAX_PARALLEL=4 ./deploy-all-nodes.sh
```

#### Final PASS/FAIL Grid (example output)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BTNG SOVEREIGN MESH — DEPLOYMENT RESULTS  ·  20260608_142301
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  #   NODE (SSH TARGET)                         STATUS    TIER    RULINGS    TIME
  ─────────────────────────────────────────────────────────────────────────────
    1  btng@154.161.183.158                    ✅ PASS    3       12         28s
    2  btng@154.161.183.159                    ✅ PASS    3       12         31s
    3  btng@41.203.64.10                       ✅ PASS    3       12         35s
   ...
   51  btng@23.133.0.10                        ❌ FAIL    N/A     N/A        30s  bootstrap exit 1
  ─────────────────────────────────────────────────────────────────────────────

  Summary: 54 nodes total
    PASS : 53
    FAIL :  1
```

---

## Single-Node Deployment — 7 Steps

### One-Command Deploy

```bash
chmod +x node-bootstrap.sh
./node-bootstrap.sh
```

Override node identity or port:

```bash
BTNG_NODE_ID=btng-node-gh-02 BTNG_SOVEREIGN_PORT=38982 ./deploy-sovereign-node.sh
```

---

### Manual Steps (what the script does)

#### Step 1 — Deploy the Law

```bash
# From the sdk/ directory:
export BTNG_NODE_ID="btng-node-$(hostname)"
# All policies live in btng-ai-brain/core/router.py — already in place.
```

#### Step 2 — Anchor the Journal

```bash
# Canonical path:
python3 btng-ai-brain/anchor_genesis.py

# Or via the runbook alias path:
python3 btng-ai-brain/log/genesis_anchor.py
```

Both are idempotent — safe to run multiple times.

Expected output:
```
✅  Genesis anchor written on btng-node-gh-01
🔗  Hash     : 0x1111111111111111111111111111111111111111111111111111111111111111
🔗  Height   : 12458
📓  Journal  : /opt/btng/sdk/btng-ai-brain/log/rulings.jsonl
```

#### Step 3 — Verify the Anchor

```bash
# Quick check (head + json.tool):
head -n 1 btng-ai-brain/log/rulings.jsonl | python3 -m json.tool

# Full verifier with tamper detection:
python3 btng-ai-brain/log/verify_genesis.py

# With ruling count:
python3 btng-ai-brain/log/verify_genesis.py --verbose
```

Expected output:
```
⚓  VERIFIED  —  Genesis block is intact

  ts            : 2026-06-08T09:00:00Z
  session       : genesis
  intent        : intent_system_genesis
  ruling        : ANCHORED
  policy        : GEN-000
  network_node  : btng-node-gh-01
  input_hash    : 0x111111111111...
  block_height  : 12458
  version       : btng-brain-2.0
```

#### Step 4 — Test a Governed CLI Intent

```bash
python3 btng-cli.py nft verify --anchor BTNG-NFT-001

# Verify ruling was written:
grep -c '"intent": "intent_nft_verify"' btng-ai-brain/log/rulings.jsonl
# Expected: 1
```

#### Step 5 — Open the Sovereign Port (Linux VPS / Root)

```bash
# Accept only from BTNG mesh CIDR:
sudo iptables -I INPUT -p tcp --dport 38982 -s 154.161.183.0/24 -j ACCEPT
# Drop all other sources:
sudo iptables -I INPUT -p tcp --dport 38982 -j DROP

# Persist across reboots:
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

> **Never open port 38982 to `0.0.0.0/0`.** Only trusted sovereign mesh CIDRs.

---

## CLI Command Reference

```bash
# NFT Operations
python3 btng-cli.py nft create-and-loan --region GH --loan 50000 --anchor GH-AU-001
python3 btng-cli.py nft verify           --anchor CERT-001
python3 btng-cli.py nft generate-certificate --anchor GH-AU-001
python3 btng-cli.py nft pilot-init       --nodes 3 --region GH
python3 btng-cli.py nft finalize-lock    --anchor GH-AU-001

# Mesh Network
python3 btng-cli.py mesh sync
python3 btng-cli.py mesh health-check    --src_ip 154.161.183.158
python3 btng-cli.py mesh broadcast-directive --nations 54 --directive SOVEREIGN_UPDATE_V3
python3 btng-cli.py mesh scale           --replicas 5 --region GH
python3 btng-cli.py mesh rebalance       --region GH
python3 btng-cli.py mesh release-liquidity --amount 500000 --region GH

# Banking Engine
python3 btng-cli.py bank register-identity --btng_id BTNG-GH-001 --wallet btng1xyz
python3 btng-cli.py bank wallet-lookup     --btng_id BTNG-GH-001
python3 btng-cli.py bank loan-quote        --btng_id BTNG-GH-001 --principal 25000 --days 180
python3 btng-cli.py bank card-activate     --btng_id BTNG-GH-001 --wallet btng1xyz

# Governance / Audit
python3 btng-cli.py governance export-audit --since 2025-01-01 --format jsonl
python3 btng-cli.py council report-broadcast --nations 54

# Private Banker Automation
python3 btng-cli.py banker perpetual-run --anchor GH
python3 btng-cli.py banker forever-loop  --anchor GH

# Security
python3 btng-cli.py security seal-disk-tank --tank prod-tank --region GH

# Phase 2 Q2 2026
python3 btng-cli.py logistics tarkwa-hub     --region GH
python3 btng-cli.py wdb merchant-onboard     --batch 5000 --region GH
python3 btng-cli.py reserve  cross-bloc-sync --blocs "BRICS+,AU,AfCFTA"
python3 btng-cli.py infra    rail-expansion  --amount 100000000 --corridors "Sahelian,EAC,ECOWAS"
```

---

## Law Journal — The Sovereign Ledger

The Law Journal (`btng-ai-brain/log/rulings.jsonl`) is **append-only**.
Every CLI command, every chat intent, every health probe writes one line.

```bash
# Watch live rulings as they come in:
tail -f btng-ai-brain/log/rulings.jsonl

# Count denials:
grep '"ruling": "DENY"' btng-ai-brain/log/rulings.jsonl | wc -l

# Count all escalations:
grep '"ruling": "ESCALATE_TO_BRANCH"' btng-ai-brain/log/rulings.jsonl | wc -l

# See all intents that fired today:
grep "$(date -u +%Y-%m-%d)" btng-ai-brain/log/rulings.jsonl | python3 -c \
  "import sys,json; [print(json.loads(l)['intent']) for l in sys.stdin]"

# Export to CSV for compliance:
python3 -c "
import json, csv, sys
from pathlib import Path
rows = [json.loads(l) for l in open('btng-ai-brain/log/rulings.jsonl')]
fields = ['ts','session','intent','confidence','ruling','policy','tool','network_node','latency_ms','reason']
w = csv.DictWriter(sys.stdout, fieldnames=fields, extrasaction='ignore')
w.writeheader(); w.writerows(rows)
" > audit-$(date +%Y%m%d).csv
```

---

## Backend Deployment (UBL Engine)

```bash
pip install fastapi uvicorn
uvicorn main:app --host 0.0.0.0 --port 8080
```

---

## SDK Usage

### Android (Kotlin)

```kotlin
val btng = BTNGClient("https://btng-bank.yourdomain.com")
btng.getWallet("BTNG-GH-001") { json -> /* update UI */ }
btng.loanQuote("BTNG-GH-001", 10000.0, 90) { json -> /* show terms */ }
```

### iOS (Swift)

```swift
let btng = BTNGClient(baseUrl: "https://btng-bank.yourdomain.com")
btng.getWallet(btngId: "BTNG-GH-001") { json in DispatchQueue.main.async { } }
```

### Web / JavaScript

```javascript
import { getWallet, loanQuote, activateCard } from './btngClient.js';
const wallet = await getWallet('BTNG-GH-001');
const quote  = await loanQuote('BTNG-GH-001', 10000, 90);
```

---

## Sovereign Policy Tiers

| Tier | Identity          | Capabilities                              |
|------|-------------------|-------------------------------------------|
| 0    | Anonymous         | Read-only public data                     |
| 1    | Email verified    | Balance inquiry, branch locator (reduced) |
| 2    | KYC tier-2        | Account opening, transfers, merchant ops  |
| 3    | Operator          | Automation, mesh treasury, logistics      |
| 4    | Council           | Global directives, bond issuance          |
| 5    | Sovereign Council | Cross-bloc reserve sync (BRICS+)          |

---

## API Endpoints

| Method | Path                | Description          |
|--------|---------------------|----------------------|
| GET    | `/wallet/:btng_id`  | Wallet lookup        |
| POST   | `/loan/quote`       | Loan calculator      |
| POST   | `/card/activate`    | Card activation      |
| POST   | `/identity`         | Identity registry    |
| GET    | `/health`           | Health check         |

---

## Constants

| Constant      | Value  | Description           |
|---------------|--------|-----------------------|
| GOLD_SYMBOL   | BTNGG  | BTNG Gold coin symbol |
| CHAIN_PREFIX  | btng1  | Wallet address prefix |
| BASE_RATE_APR | 8%     | Sovereign loan rate   |
| MAX_LTV       | 70%    | Loan-to-value ratio   |

---

## License

BTNG Sovereign Banking Infrastructure — Ghana & Africa 🌍
Ekuye Digital Gateway Trust Ltd · Merchant ID 248059

*"One network, one brain, one face — and one ledger of rulings. That is self-ownership with receipts."*
