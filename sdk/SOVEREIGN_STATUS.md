# BTNG Sovereign System — Final Status Matrix

> Sealed at bootstrap completion. Update only after a verified mesh sync.

---

## Component Hardening Status

| Component    | Before (Compromised)                          | After (Sovereign / Hardened)                                          | File(s)                                              |
|--------------|-----------------------------------------------|------------------------------------------------------------------------|------------------------------------------------------|
| **Key**      | Hardcoded literal in source files             | Burned via `purge_hardcoded_key.py`; HMAC session tokens only          | `sdk/purge_hardcoded_key.py`                         |
| **Face**     | HTML → direct anchor call                     | HTML → `brain_server.py:8087` → sovereign law → `external_token` → anchor | `sdk/btng-ai-brain/static/sovereign-bridge.js`   |
| **Arm (CLI)**| CLI → direct `requests.post` with static key  | CLI → `sovereign_request()` → law gate → HMAC token → anchor          | `sdk/btng-ai-brain/brain/law/secure_client.py`       |
| **Brain**    | Unverified; no audit trail                    | `rulings.jsonl` sealed to genesis; every decision logged + anchored    | `sdk/btng-ai-brain/core/router.py`                   |
| **Identity** | Static string (`al-A-cKa4Yh49...`)           | `~/.btng/sovereign.id` — tiered, HMAC-signed, local only               | `sdk/btng-ai-brain/core/identity.py`                 |
| **Network**  | Unchecked claims ("892 nodes")               | Port test (`38982`) + sovereign law gate on every outbound packet      | `sdk/deploy-all-nodes.sh`, `sdk/nodes.txt`           |
| **Mobile App**| Direct Supabase / anchor calls              | `btngGovern()` / `btngFetch()` — Brain Gate first, Edge Function fallback | `services/brainRouterService.ts`                  |

---

## Bootstrap Sequence (Run in Order)

```bash
# 0. Verify genesis integrity (blocks bootstrap if journal tampered)
python sdk/btng-ai-brain/log/verify_genesis.py --verbose

# 1. Purge any remaining hardcoded key material
python sdk/purge_hardcoded_key.py

# 2. Enroll sovereign council identity (tier 5)
python sdk/btng-ai-brain/enroll_council.py --tier 5

# 3. Start the Brain Gate (keep running in background)
cd sdk/btng-ai-brain && python brain_server.py

# 4. Confirm anchor is reachable (PowerShell)
Test-NetConnection 154.161.183.158 -Port 38982

# 5. Run the WDB stress gate (must be 8/8 PASS)
python sdk/btng-ai-brain/tests/stress_wdb_gate.py

# 6. Deploy to all 54 mesh nodes
bash sdk/deploy-all-nodes.sh
```

---

## Expected Outputs

### `purge_hardcoded_key.py`
```
Files scanned : N
Files burned  : 0          ← must be 0 after first purge
✅  No leaked key material found.  Source is clean.
```

### `stress_wdb_gate.py` (last 3 lines)
```
📊 Results: 8/8 gates passed | 0/0 failures
🛡️  SOVEREIGN STATUS: WDB GATE HARDENED. Ready for 100,000 merchant scaling.
```

### `verify_genesis.py`
```
✅  Genesis anchor VALID
    input_hash: 1111111111111111
```

---

## Tier Reference

| Tier | Role                    | WDB Ceiling     | Notes                          |
|------|-------------------------|-----------------|--------------------------------|
| 1    | Observer (anonymous)    | DENY            | Read-only; no governed actions |
| 2    | Operator (KYC Lite)     | 10,000 batch    | Escalate above ceiling         |
| 3    | Operator (Full KYC)     | Unlimited        | Council-granted signed identity|
| 4    | Council                 | Unlimited        | Policy edit rights             |
| 5    | Sovereign Council       | Unlimited        | Full mesh authority            |

---

## Security Invariants

- **Static keys NEVER leave the node** — `sovereign_request()` and `btngFetch()` both `delete headers['X-BTNG-Sovereign-Key']`
- **Every anchor call is governed** — no direct `requests.post()` / `fetch()` to `154.161.183.158:38982`
- **All decisions are logged** — `btng_rulings` table (cloud) + `rulings.jsonl` (local file journal)
- **Tokens are time-bound** — 60 s external tokens, 600 s max clock skew on verification
- **Identity is tamper-evident** — HMAC-SHA256 over `tier:seed`; any mutation → tier 1 fallback

---

*Last updated: 2026-06-08 | BTNG Sovereign Mesh v2.1*
