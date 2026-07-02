"""
BTNG Sovereign Brain Router — v2.0
One brain. One law. One journal.

The classifier proposes. apply_law() disposes.
Every decision is written to brain/log/rulings.jsonl — append-only, owned.

Usage (local Python):
    from core.router import governed_route
    result = governed_route("open an account", context={"jurisdiction": "GH", "kyc_tier": 2})

Usage (CLI arm):
    python btng-cli.py banker perpetual-run --anchor GH
    # — sovereign_cli_gate() calls this module before any handler fires
"""

import json
import os
import time
import hashlib
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# SOVEREIGN CONFIG
# ─────────────────────────────────────────────────────────────────────────────
NETWORK_NODE  = os.environ.get("BTNG_NODE_ID", "btng-node-01")
BRAIN_VERSION = "btng-brain-2.0"
JOURNAL_PATH  = Path(__file__).parent.parent / "log" / "rulings.jsonl"

# Sovereign jurisdictions: Phase 1 financials + Phase 2 mesh nations
ALLOWED_JURISDICTIONS: set[str] = {
    # Core sovereign / financial hubs
    "GH", "NG", "KE",
    "SG", "CH", "AE", "KY", "LI",
    # African expansion (Phase 2)
    "ZA", "RW", "TZ", "ET", "MU", "BW",
    "SN", "CI", "EG", "GN", "CM", "CD",
    "UG", "MA", "MZ",
}

# Trusted mesh CIDRs for NET-001 (health-probe boundary check)
TRUSTED_MESH_CIDRS: set[str] = {
    "154.161.183.0/24",   # Ghana primary anchor /24 block
    "127.0.0.0/8",        # Loopback / local dev
    "10.0.0.0/8",         # RFC-1918 private (Docker / VPC)
    "172.16.0.0/12",
    "192.168.0.0/16",
}


def _ip_in_cidr(ip: str, cidr: str) -> bool:
    """Minimal octet-prefix CIDR check (no external deps)."""
    try:
        if "/" not in cidr:
            return ip == cidr
        base, bits_str = cidr.split("/")
        prefix_bits = int(bits_str)
        base_parts = [int(x) for x in base.split(".")]
        ip_parts   = [int(x) for x in ip.split(".")]
        if len(base_parts) != 4 or len(ip_parts) != 4:
            return False
        # Build integer representations
        base_int = sum(b << (24 - 8 * i) for i, b in enumerate(base_parts))
        ip_int   = sum(b << (24 - 8 * i) for i, b in enumerate(ip_parts))
        mask     = ((1 << 32) - 1) ^ ((1 << (32 - prefix_bits)) - 1)
        return (base_int & mask) == (ip_int & mask)
    except Exception:
        return False


def _is_trusted_ip(ip: str) -> bool:
    if not ip:
        return False
    for cidr in TRUSTED_MESH_CIDRS:
        if _ip_in_cidr(ip, cidr):
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# LAW JOURNAL  (append-only, local, sovereign-owned)
# ─────────────────────────────────────────────────────────────────────────────
def write_ruling(
    session_id: str,
    intent: str,
    confidence: float,
    policy_id: str,
    ruling: str,
    tool: "str | None",
    latency_ms: int,
    input_hash: str,
    extra: "dict | None" = None,
) -> None:
    """Write one ruling line to the append-only Law Journal."""
    entry: dict = {
        "ts":           datetime.now(timezone.utc).isoformat(),
        "session":      session_id,
        "intent":       intent,
        "confidence":   round(confidence, 4),
        "policy":       policy_id,
        "ruling":       ruling,
        "tool":         tool,
        "network_node": NETWORK_NODE,
        "latency_ms":   latency_ms,
        "input_hash":   input_hash,
        "version":      BRAIN_VERSION,
    }
    if extra:
        entry.update(extra)

    JOURNAL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(JOURNAL_PATH, "a") as fh:
        fh.write(json.dumps(entry, default=str) + "\n")


# ─────────────────────────────────────────────────────────────────────────────
# POLICY ENGINE  (all Phase 1 + Phase 2 intents)
# ─────────────────────────────────────────────────────────────────────────────
def apply_law(intent: str, context: dict) -> dict:
    """
    The sovereign gate.
    Returns a ruling dict:
        ruling    — ALLOW | ALLOW_FULL | ALLOW_REDUCED | DENY | ESCALATE_TO_BRANCH | PASS
        policy_id — which law applied
        tool      — the function the Face/Arm may call (None = talk only)
        reason    — human-readable explanation
    """
    auth        = context.get("auth_tier",    0)
    juris       = context.get("jurisdiction", "UNKNOWN").upper()
    risk        = context.get("risk_flag",    False)
    privacy     = context.get("privacy_level", "standard")
    is_customer = context.get("is_customer",  False)

    # ── NETWORK / HEALTH ────────────────────────────────────────────────────
    if intent == "intent_health_check_external":
        src_ip = context.get("source_ip", "0.0.0.0")
        if not _is_trusted_ip(src_ip):
            return {
                "ruling": "DENY", "policy_id": "NET-001", "tool": None,
                "reason": f"Health probe from untrusted sovereign boundary — source: {src_ip}",
            }
        return {
            "ruling": "ALLOW", "policy_id": "NET-001",
            "tool": "health_status_endpoint",
            "reason": "Trusted mesh node — health probe permitted",
        }

    # ── FACE / PRIVATE BANKER (Human Interface) ──────────────────────────────
    if intent == "intent_open_account":
        if risk:
            return {"ruling": "DENY", "policy_id": "ACC-001-RISK", "tool": None, "reason": "Active AML/risk flag"}
        if context.get("kyc_tier", 0) >= 2 and juris in ALLOWED_JURISDICTIONS:
            return {"ruling": "ALLOW", "policy_id": "ACC-001", "tool": "open_account_workflow", "reason": "KYC tier-2 clear + sovereign jurisdiction"}
        if context.get("kyc_tier", 0) >= 1:
            return {"ruling": "ESCALATE_TO_BRANCH", "policy_id": "ACC-001-KYC", "tool": "branch_handoff_queue", "reason": "KYC tier-1 only — human review required"}
        return {"ruling": "DENY", "policy_id": "ACC-001-NOKYC", "tool": None, "reason": "No verified identity — complete KYC first"}

    if intent in ("intent_explain_gold_card", "intent_gold_card_details"):
        if is_customer or auth >= 1:
            return {"ruling": "ALLOW", "policy_id": "PROD-001", "tool": "product_knowledge_base", "reason": "Authenticated holder — full product intelligence granted"}
        return {"ruling": "DENY", "policy_id": "PROD-001-AUTH", "tool": None, "reason": "Product intelligence restricted to BTNG card holders only"}

    if intent == "intent_branch_locator":
        if privacy == "maximum" or auth < 1:
            return {"ruling": "DENY", "policy_id": "GEO-001-PRIV", "tool": None, "reason": "Privacy lock active or unauthenticated"}
        if auth >= 2:
            return {"ruling": "ALLOW_FULL", "policy_id": "GEO-001", "tool": "branch_locator_precise", "reason": "Tier-2 auth — full branch address"}
        return {"ruling": "ALLOW_REDUCED", "policy_id": "GEO-001-LIM", "tool": "branch_locator_region_only", "reason": "Tier-1 auth — region only"}

    if intent == "intent_apply_loan":
        if risk:
            return {"ruling": "DENY", "policy_id": "LOAN-001-RISK", "tool": None, "reason": "Active risk flag — loan applications suspended"}
        if context.get("kyc_tier", 0) >= 2:
            return {"ruling": "ALLOW", "policy_id": "LOAN-001", "tool": "loan_application_engine", "reason": "Full KYC verified — gold-backed credit eligible"}
        return {"ruling": "ESCALATE_TO_BRANCH", "policy_id": "LOAN-001-KYC", "tool": "branch_handoff_queue", "reason": "KYC tier insufficient"}

    if intent == "intent_balance_inquiry":
        if auth >= 1:
            return {"ruling": "ALLOW", "policy_id": "BAL-001", "tool": "wallet_balance_query", "reason": "Authenticated — balance retrieval permitted"}
        return {"ruling": "DENY", "policy_id": "BAL-001-AUTH", "tool": None, "reason": "Authentication required for balance inquiry"}

    if intent == "intent_transfer_funds":
        if risk:
            return {"ruling": "DENY", "policy_id": "TXN-001-RISK", "tool": None, "reason": "Transfer blocked — active risk flag"}
        if context.get("kyc_tier", 0) >= 2:
            return {"ruling": "ALLOW", "policy_id": "TXN-001", "tool": "funds_transfer_workflow", "reason": "Full KYC — cross-border BTNG transfer permitted"}
        return {"ruling": "DENY", "policy_id": "TXN-001-KYC", "tool": None, "reason": "Transfer requires KYC tier-2"}

    # ── NFT: CREATIVE ASSETS ──────────────────────────────────────────────────
    if intent == "intent_nft_create_and_loan":
        loan = context.get("target_loan", 0)
        if risk:
            return {"ruling": "DENY", "policy_id": "NFT-001-RISK", "tool": None, "reason": "Risk flag active on artist/asset"}
        if juris not in ALLOWED_JURISDICTIONS:
            return {"ruling": "DENY", "policy_id": "NFT-001-JUR", "tool": None, "reason": "Jurisdiction not in sovereign mesh"}
        if loan > 500_000:
            return {"ruling": "ESCALATE_TO_BRANCH", "policy_id": "NFT-001-CAP", "tool": "council_review_queue", "reason": "Loan exceeds single-asset autonomous ceiling ($500k)"}
        return {"ruling": "ALLOW", "policy_id": "NFT-001", "tool": "create_and_loan_workflow", "reason": "Jurisdiction and ceiling clear"}

    if intent == "intent_nft_pilot_init":
        if auth < 4:
            return {"ruling": "DENY", "policy_id": "NFT-002-AUTH", "tool": None, "reason": "Pilot initialization requires council tier 4"}
        return {"ruling": "ALLOW", "policy_id": "NFT-002", "tool": "nft_pilot_manager", "reason": "Pilot batch authorized by council"}

    if intent == "intent_nft_finalize_lock":
        if auth < 3:
            return {"ruling": "DENY", "policy_id": "NFT-003-AUTH", "tool": None, "reason": "Finalize-lock is irreversible — operator tier 3 required"}
        return {"ruling": "ALLOW", "policy_id": "NFT-003", "tool": "finalize_lock_module", "reason": "30-year lock authorized by operator"}

    if intent == "intent_nft_generate_certificate":
        return {"ruling": "ALLOW", "policy_id": "NFT-004", "tool": "certificate_generator", "reason": "Certificate minting permitted to authenticated operators"}

    if intent == "intent_nft_verify":
        return {"ruling": "ALLOW", "policy_id": "NFT-005", "tool": "asset_verifier", "reason": "Read-only verification permitted to all"}

    # ── SECURITY ──────────────────────────────────────────────────────────────
    if intent == "intent_security_seal_disk_tank":
        if auth < 3:
            return {"ruling": "DENY", "policy_id": "SEC-001-AUTH", "tool": None, "reason": "Security seal requires operator tier 3 — irreversible action"}
        return {"ruling": "ALLOW", "policy_id": "SEC-001", "tool": "security_audit_seal", "reason": "Disk tank seal authorized by tier-3 operator"}

    # ── MESH / TREASURY ───────────────────────────────────────────────────────
    if intent == "intent_mesh_broadcast_directive":
        if auth < 4:
            return {"ruling": "DENY", "policy_id": "MESH-001-AUTH", "tool": None, "reason": "Global mesh directive requires council tier 4"}
        return {"ruling": "ALLOW", "policy_id": "MESH-001", "tool": "broadcast_manager", "reason": "Directive authorized by council"}

    if intent == "intent_mesh_sync":
        return {"ruling": "ALLOW", "policy_id": "MESH-002", "tool": "mesh_sync_protocol", "reason": "Read-only mesh sync permitted"}

    if intent in ("intent_mesh_scale", "intent_mesh_rebalance", "intent_mesh_release_liquidity"):
        if auth < 3:
            return {"ruling": "DENY", "policy_id": "MESH-003-AUTH", "tool": None, "reason": "Mesh treasury actions require operator tier 3"}
        return {"ruling": "ALLOW", "policy_id": "MESH-003", "tool": "mesh_treasury_module", "reason": "Treasury action authorized by operator"}

    # ── GOVERNANCE / COUNCIL ──────────────────────────────────────────────────
    if intent == "intent_governance_export_audit":
        return {"ruling": "ALLOW", "policy_id": "GOV-002", "tool": "audit_exporter", "reason": "Audit export permitted to authenticated operator"}

    if intent == "intent_council_report_broadcast":
        if auth < 4:
            return {"ruling": "DENY", "policy_id": "GOV-001-AUTH", "tool": None, "reason": "Council report broadcast requires tier 4 authority"}
        return {"ruling": "ALLOW", "policy_id": "GOV-001", "tool": "council_broadcast", "reason": "Council report broadcast authorized"}

    # ── BANKER AUTOMATION ─────────────────────────────────────────────────────
    if intent in ("intent_banker_perpetual_run", "intent_banker_forever_loop"):
        if auth < 3:
            return {"ruling": "DENY", "policy_id": "BNK-001-AUTH", "tool": None, "reason": "Automation arm requires operator tier 3 — prevents rogue loops"}
        return {"ruling": "ALLOW", "policy_id": "BNK-001", "tool": "automation_module", "reason": "Banker automation armed by operator"}

    # ── PHASE 2: Q2 2026 SCALING INTENTS ─────────────────────────────────────
    if intent == "intent_logistics_tarkwa_gold_hub":
        if auth < 3:
            return {"ruling": "DENY", "policy_id": "LOG-001-AUTH", "tool": None, "reason": "Rail logistics API requires operator tier 3"}
        return {"ruling": "ALLOW", "policy_id": "LOG-001", "tool": "tarkwa_logistics_api", "reason": "Western Corridor armed — Tarkwa Gold Hub API authorized"}

    if intent == "intent_wdb_merchant_onboard":
        batch_size = context.get("batch_size", 0)
        if auth < 2:
            return {"ruling": "DENY", "policy_id": "WDB-001-AUTH", "tool": None, "reason": "Merchant onboarding requires operator tier 2"}
        # Tier 3+ operators (automation / council) bypass the 10k human-review ceiling.
        # Every ALLOW at tier 3+ is still written to the Law Journal for audit.
        if auth >= 3:
            return {"ruling": "ALLOW", "policy_id": "WDB-001-OPR", "tool": "wdb_bulk_kyc_pipeline", "reason": "Operator tier 3+ — large batch ceiling bypassed, Act 1151 pipeline armed"}
        # Tier 2: enforce the 10k human-review gate
        if batch_size > 10_000:
            return {"ruling": "ESCALATE_TO_BRANCH", "policy_id": "WDB-001-BATCH", "tool": "council_review_queue", "reason": "Tier-2 batch >10,000 requires sovereign council sign-off under Act 1151"}
        return {"ruling": "ALLOW", "policy_id": "WDB-001", "tool": "wdb_bulk_kyc_pipeline", "reason": "Merchant cohort cleared for Act 1151 enrollment"}

    if intent == "intent_reserve_sync_cross_bloc":
        if auth < 5:
            return {"ruling": "DENY", "policy_id": "RES-005-AUTH", "tool": None, "reason": "Cross-bloc reserve sync requires council tier 5 — sovereign key required"}
        return {"ruling": "ALLOW", "policy_id": "RES-005", "tool": "brics_plus_bridge", "reason": "BRICS+ handshake authorized by sovereign council"}

    if intent == "intent_infrastructure_rail_expansion":
        if auth < 4:
            return {"ruling": "DENY", "policy_id": "INF-001-AUTH", "tool": None, "reason": "Infrastructure bond execution requires council tier 4 — Sahelian quorum needed"}
        return {"ruling": "ALLOW", "policy_id": "INF-001", "tool": "rail_bond_issuer", "reason": "Sahelian expansion armed — Pan-African rail bond issuer authorized"}

    # ── SYSTEM GENESIS (immutable origin anchor) ──────────────────────────────
    if intent == "intent_system_genesis":
        return {
            "ruling": "ANCHORED", "policy_id": "GEN-000",
            "tool": "law_journal_origin",
            "reason": "Genesis block — the immutable first entry. All rulings are measured from this sovereign origin.",
        }

    # ── DEFAULT: unknown intent — model may talk, CANNOT act ─────────────────
    return {
        "ruling": "PASS", "policy_id": "DEFAULT", "tool": None,
        "reason": "No sovereign gate defined — conversational response only; no tool may be invoked",
    }


# ─────────────────────────────────────────────────────────────────────────────
# GOVERNED ROUTER  (wraps your existing brain classifier)
# ─────────────────────────────────────────────────────────────────────────────
def governed_route(
    user_input: str,
    session_id: "str | None" = None,
    context: "dict | None" = None,
) -> dict:
    """
    Main entry point.
    1. Classifier proposes an intent (with confidence).
    2. apply_law() disposes — the network decides.
    3. Ruling is written to the append-only Law Journal.
    4. Returns the full decision envelope.
    """
    start      = time.perf_counter()
    session_id = session_id or str(uuid.uuid4())[:12]
    context    = context or {}
    input_hash = hashlib.sha256(user_input.encode()).hexdigest()[:16]

    raw_intent = classify_intent(user_input)
    intent     = raw_intent.get("intent",     "unknown")
    confidence = raw_intent.get("confidence", 0.0)

    decision   = apply_law(intent, context)
    latency_ms = int((time.perf_counter() - start) * 1000)

    write_ruling(
        session_id, intent, confidence,
        decision["policy_id"], decision["ruling"],
        decision["tool"], latency_ms, input_hash,
    )

    return {
        "session_id":   session_id,
        "intent":       intent,
        "confidence":   confidence,
        "ruling":       decision["ruling"],
        "tool":         decision["tool"],
        "policy":       decision["policy_id"],
        "reason":       decision["reason"],
        "network_node": NETWORK_NODE,
        "governed":     True,
        "latency_ms":   latency_ms,
        "version":      BRAIN_VERSION,
    }


# ─────────────────────────────────────────────────────────────────────────────
# INTENT CLASSIFIER  (stub — replace with your local embedding / NLP model)
# ─────────────────────────────────────────────────────────────────────────────
def classify_intent(text: str) -> dict:
    """
    Proposes an intent from user input.
    Replace the body with your BTNG AI Brain embedding / classification logic.
    The router above will dispose of whatever this function returns.

    Return format: {"intent": str, "confidence": float 0–1}
    """
    t = text.lower().strip()

    # Keyword heuristics (quick fallback for offline / bootstrap mode)
    patterns: list[tuple[list[str], str, float]] = [
        (["open account", "create account", "new account", "register"],    "intent_open_account",              0.92),
        (["gold card", "btng card", "card details", "card benefits"],       "intent_explain_gold_card",         0.89),
        (["branch", "location", "office", "nearest branch", "atm"],        "intent_branch_locator",            0.91),
        (["loan", "borrow", "credit", "apply loan", "need funding"],        "intent_apply_loan",                0.90),
        (["balance", "my wallet", "wallet balance", "how many btng"],       "intent_balance_inquiry",           0.93),
        (["transfer", "send money", "wire", "remit", "move funds"],         "intent_transfer_funds",            0.92),
        (["nft create", "create and loan", "mint nft"],                     "intent_nft_create_and_loan",       0.95),
        (["nft verify", "verify asset", "check nft"],                       "intent_nft_verify",                0.94),
        (["nft pilot", "pilot init"],                                       "intent_nft_pilot_init",            0.93),
        (["finalize lock", "lock asset", "seal asset"],                     "intent_nft_finalize_lock",         0.94),
        (["generate certificate", "issue cert"],                            "intent_nft_generate_certificate",  0.93),
        (["seal disk", "seal tank", "security seal"],                       "intent_security_seal_disk_tank",   0.96),
        (["broadcast directive", "mesh broadcast", "global directive"],     "intent_mesh_broadcast_directive",  0.95),
        (["mesh scale", "scale mesh"],                                      "intent_mesh_scale",                0.94),
        (["release liquidity", "mesh liquidity"],                           "intent_mesh_release_liquidity",    0.94),
        (["mesh sync", "sync nodes"],                                       "intent_mesh_sync",                 0.96),
        (["mesh rebalance", "rebalance treasury"],                          "intent_mesh_rebalance",            0.94),
        (["export audit", "audit log", "governance export"],                "intent_governance_export_audit",   0.93),
        (["council report", "report broadcast"],                            "intent_council_report_broadcast",  0.95),
        (["perpetual run", "banker run"],                                   "intent_banker_perpetual_run",      0.95),
        (["forever loop", "banker loop"],                                   "intent_banker_forever_loop",       0.95),
        (["health check", "health probe", "node health", "mesh health"],    "intent_health_check_external",     0.97),
        (["genesis", "origin anchor", "first block", "genesis block"],      "intent_system_genesis",            1.00),
        # Phase 2
        (["tarkwa", "gold hub", "western rail", "logistics hub"],           "intent_logistics_tarkwa_gold_hub",     0.95),
        (["merchant onboard", "wdb merchant", "bulk kyc", "act 1151"],      "intent_wdb_merchant_onboard",          0.94),
        (["brics", "reserve sync", "cross bloc", "brics+"],                 "intent_reserve_sync_cross_bloc",       0.96),
        (["rail expansion", "infrastructure bond", "pan african rail"],     "intent_infrastructure_rail_expansion", 0.95),
    ]

    for keywords, intent_name, base_conf in patterns:
        if any(k in t for k in keywords):
            conf = base_conf - 0.08 if len(t) < 12 else base_conf
            return {"intent": intent_name, "confidence": round(min(conf, 0.99), 4)}

    if "help" in t or "support" in t:
        return {"intent": "intent_general_support", "confidence": 0.75}

    return {"intent": "intent_unknown", "confidence": 0.50}
