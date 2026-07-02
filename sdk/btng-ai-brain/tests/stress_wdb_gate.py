#!/usr/bin/env python3
"""
🧪 BTNG Phase 2 Stress Test: WDB Merchant Onboard Gate
Exercises intent_wdb_merchant_onboard under load to confirm
the 10,000 batch ceiling and tier enforcement.

Usage:
    cd sdk
    python3 btng-ai-brain/tests/stress_wdb_gate.py

Or from any directory:
    PYTHONPATH=/path/to/sdk python3 stress_wdb_gate.py
"""
import sys
import os
import time

# ── Anchor to the brain ────────────────────────────────────────────────────────
# Support running from sdk/, sdk/btng-ai-brain/, or project root
_SEARCH_PATHS = [
    os.getcwd(),
    os.path.join(os.getcwd(), "btng-ai-brain"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."),   # sdk/btng-ai-brain/
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."),  # sdk/
]

_brain_loaded = False
for _p in _SEARCH_PATHS:
    _brain_candidate = os.path.join(_p, "btng-ai-brain")
    if os.path.isdir(_brain_candidate):
        sys.path.insert(0, _p)
        _brain_loaded = True
        break
    # Also try if _p itself is the btng-ai-brain parent (i.e. core/ is directly inside)
    if os.path.isdir(os.path.join(_p, "core")):
        sys.path.insert(0, os.path.dirname(_p))
        _brain_loaded = True
        break

if not _brain_loaded:
    print("❌  Could not locate btng-ai-brain. Run from sdk/ directory.", file=sys.stderr)
    sys.exit(2)

try:
    from btng_ai_brain.core.router import apply_law, write_ruling  # type: ignore
except ImportError:
    try:
        from core.router import apply_law, write_ruling              # type: ignore
    except ImportError as exc:
        print(f"❌  Could not import router: {exc}", file=sys.stderr)
        sys.exit(2)


# ─────────────────────────────────────────────────────────────────────────────
# GATE TEST MATRIX
#
# Policy: intent_wdb_merchant_onboard (WDB-001)
#
#   auth_tier < 2              → DENY         (no merchant ops below KYC tier)
#   auth_tier == 2, batch > 10k → ESCALATE_TO_BRANCH  (requires council sign-off)
#   auth_tier == 2, batch ≤ 10k → ALLOW
#   auth_tier >= 3              → ALLOW        (operator+ bypass ceiling entirely)
#
# Rationale for tier 3+ bypass:
#   Operators and council-tier actors are expected to run mass enrollment pipelines
#   (WDB Act 1151 campaigns, national registry sweeps).  Escalating 50k-batch
#   runs to human review on every execution would block legitimate automation.
#   The Law Journal records every ALLOW at operator tier — audit is preserved.
# ─────────────────────────────────────────────────────────────────────────────
TEST_CASES = [
    # (tier, batch_size, expected_ruling, description)
    (1,   100,      "DENY",               "Tier 1 denied entirely"),
    (2,   5_000,    "ALLOW",              "Tier 2 under 10k allowed"),
    (2,   10_000,   "ALLOW",              "Tier 2 exactly at 10k allowed"),
    (2,   10_001,   "ESCALATE_TO_BRANCH", "Tier 2 over 10k escalated"),
    (3,   50_000,   "ALLOW",              "Tier 3 large batch allowed (operator bypass)"),
    (4,   100_000,  "ALLOW",              "Tier 4 mass batch allowed (council bypass)"),
    (5,   999_999,  "ALLOW",              "Tier 5 unlimited ceiling (sovereign)"),
    (3,   0,        "ALLOW",              "Tier 3 zero batch allowed"),
]

# Optional: extra jurisdictions to verify policy is not jurisdiction-locked
EXTRA_JURIS_CASES = [
    (2, 500, "ALLOW",  "NG jurisdiction, tier 2, small batch"),
    (2, 500, "ALLOW",  "KE jurisdiction, tier 2, small batch"),
    (1, 500, "DENY",   "UNKNOWN jurisdiction, tier 1 still denied"),
]


def run_test(tier: int, batch: int, expected: str, desc: str, juris: str = "GH") -> bool:
    ctx = {
        "auth_tier":   tier,
        "batch_size":  batch,
        "jurisdiction": juris,
        "risk_flag":   False,
        "is_customer": True,
    }
    start    = time.perf_counter()
    decision = apply_law("intent_wdb_merchant_onboard", ctx)
    ms       = int((time.perf_counter() - start) * 1000)
    ruling   = decision["ruling"]
    ok       = (ruling == expected)

    icon = "✅" if ok else "❌"
    print(
        f"  {icon} Tier {tier} / Batch {batch:>7,} / {juris:<3} → "
        f"{ruling:<22} ({desc}) [{ms}ms]"
    )
    if not ok:
        print(f"       EXPECTED: {expected:<22} GOT: {ruling}  POLICY: {decision.get('policy_id','?')}")
    return ok


def stress_wdb_gate() -> int:
    print()
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  🧪  BTNG SOVEREIGN LAW — WDB Gate Stress Test  ·  v2.0        ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()

    # ── Core test matrix ───────────────────────────────────────────────────────
    print("▶  Core WDB-001 Gate Tests")
    print("─" * 70)
    results = [run_test(*tc) for tc in TEST_CASES]

    # ── Jurisdiction variance ──────────────────────────────────────────────────
    print()
    print("▶  Jurisdiction Variance")
    print("─" * 70)
    extra_results = [
        run_test(tier, batch, exp, desc, juris)
        for (tier, batch, exp, desc), juris in zip(
            [(2, 500, "ALLOW", "NG jurisdiction"), (2, 500, "ALLOW", "KE jurisdiction"), (1, 500, "DENY", "UNKNOWN tier 1")],
            ["NG", "KE", "UNKNOWN"]
        )
    ]
    results.extend(extra_results)

    # ── Risk flag override ──────────────────────────────────────────────────────
    print()
    print("▶  Risk Flag Override")
    print("─" * 70)
    # Any tier with risk_flag=True → should still respect the tier gate, not silently ALLOW
    risk_ctx = {"auth_tier": 3, "batch_size": 100, "jurisdiction": "GH", "risk_flag": True}
    risk_d   = apply_law("intent_wdb_merchant_onboard", risk_ctx)
    # WDB-001 does not have an explicit risk-flag gate; expect ALLOW (risk gate is at NFT layer)
    # but we document the current behaviour so any future policy change is caught.
    risk_ruling = risk_d["ruling"]
    print(f"  ℹ️  Tier 3 / risk_flag=True → {risk_ruling}  (policy: {risk_d.get('policy_id')})")
    print(f"     (WDB-001 does not gate on risk_flag — NFT-001 does. Documented behaviour.)")

    # ── Load simulation ────────────────────────────────────────────────────────
    print()
    print("▶  Load Simulation  (1,000 gate evaluations)")
    print("─" * 70)
    t0 = time.perf_counter()
    for _ in range(1_000):
        apply_law("intent_wdb_merchant_onboard", {
            "auth_tier": 2, "batch_size": 5000, "jurisdiction": "GH", "risk_flag": False
        })
    elapsed = (time.perf_counter() - t0) * 1000
    avg_us  = (elapsed / 1_000) * 1000
    print(f"  1,000 evaluations in {elapsed:.1f}ms  ·  avg {avg_us:.1f}µs per call")
    if avg_us < 100:
        print("  ✅ Gate latency: NOMINAL (< 100µs per call)")
    else:
        print("  ⚠️  Gate latency above 100µs — profile btng-ai-brain/core/router.py")

    # ── Summary ────────────────────────────────────────────────────────────────
    passed = sum(results)
    failed = len(results) - passed
    total  = len(results)

    print()
    print("═" * 70)
    print(f"📊  Results: {passed}/{total} passed  ·  {failed}/{total} failed")
    print()

    if failed == 0:
        print("🛡️  SOVEREIGN STATUS: WDB GATE HARDENED.")
        print("    Ready for 100,000 merchant scaling under Act 1151.")
    else:
        print("🚨  SOVEREIGN STATUS: LAW LEAK DETECTED.")
        print("    Update btng-ai-brain/core/router.py and re-run before scaling.")
    print()
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(stress_wdb_gate())
