#!/usr/bin/env python3
"""
BTNG Sovereign Council — Identity Enrollment Tool
Generates a tier-5 (or any tier 1–5) signed sovereign identity.

Usage (from project root):
    python3 sdk/btng-ai-brain/enroll_council.py --tier 5

Usage (from sdk/):
    python3 btng-ai-brain/enroll_council.py --tier 5

Usage (from sdk/btng-ai-brain/):
    python3 enroll_council.py --tier 5

One-liner equivalent:
    python3 sdk/btng-ai-brain/enroll_council.py --tier 5
"""
import sys
import os
import argparse

# ── Path resolution: works from any directory ──────────────────────────────────
# We need btng-ai-brain's own directory on sys.path so that
# 'from core.identity import ...' resolves correctly.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))  # .../sdk/btng-ai-brain/

if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

# Import directly from core (no aliasing layer needed)
try:
    from core.identity import enroll_operator, derive_tier_from_key, show_identity, IDENTITY_PATH  # type: ignore
except ImportError as exc:
    print(f"❌  Could not import identity module: {exc}", file=sys.stderr)
    print(f"    Ensure you are running from sdk/, sdk/btng-ai-brain/, or project root.", file=sys.stderr)
    sys.exit(1)

# ── Tier labels ────────────────────────────────────────────────────────────────
TIER_LABELS = {
    1: "Observer          (read-only, most commands DENY)",
    2: "Operator (KYC)    (merchant ops, balance, small batches)",
    3: "Operator          (automation, mesh treasury, logistics)",
    4: "Council           (directives, rail bonds, report broadcast)",
    5: "Sovereign Council (BRICS+ bridge, genesis, cross-bloc reserve)",
}

def main():
    parser = argparse.ArgumentParser(
        prog="enroll_council.py",
        description="Enroll a BTNG sovereign identity — creates ~/.btng/sovereign.id",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Tier reference:
  1 — Observer          (read-only; most commands DENY without higher key)
  2 — Operator (KYC)    (merchant onboard, WDB batches ≤10k)
  3 — Operator          (automation, mesh treasury, Tarkwa logistics)
  4 — Council           (directives, rail expansion, report broadcast)
  5 — Sovereign Council (BRICS+ sync, genesis ops, cross-bloc reserve)

After enrollment:
  python3 sdk/btng-cli.py identity whoami
  python3 sdk/btng-cli.py mesh sync          # tier 1+ allowed
  python3 sdk/btng-cli.py banker perpetual-run  # requires tier 3+

The enrolled identity is stored at ~/.btng/sovereign.id (mode 600).
Protect this file — it is the sole source of your sovereign authority on the mesh.
        """,
    )
    parser.add_argument(
        "--tier", type=int, default=5,
        help="Tier to enroll (1–5, default: 5 = Sovereign Council)"
    )
    parser.add_argument(
        "--output", default=None,
        help="Output path for sovereign.id (default: ~/.btng/sovereign.id)"
    )
    parser.add_argument(
        "--whoami", action="store_true",
        help="Show current resolved tier without enrolling anything"
    )
    args = parser.parse_args()

    print()
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  BTNG SOVEREIGN COUNCIL — Identity Enrollment                  ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()

    if args.whoami:
        show_identity()
        return

    # Show existing identity before overwriting
    if IDENTITY_PATH.exists():
        existing_tier = derive_tier_from_key(os.environ.get("BTNG_SOVEREIGN_KEY"))
        print(f"  ⚠️   Existing identity detected at {IDENTITY_PATH}")
        print(f"        Current tier: {existing_tier}  ({TIER_LABELS.get(existing_tier, 'Unknown')})")
        ans = input("  Overwrite? [y/N] ").strip().lower()
        if ans != "y":
            print("  Enrollment cancelled. Existing identity preserved.")
            print()
            return
        print()

    tier = args.tier
    if tier < 1 or tier > 5:
        print(f"❌  Invalid tier {tier}. Must be 1–5.", file=sys.stderr)
        sys.exit(1)

    print(f"  Enrolling tier {tier}: {TIER_LABELS.get(tier, '')}")
    print()

    from pathlib import Path
    output_path = Path(args.output) if args.output else None
    identity = enroll_operator(tier=tier, output_path=output_path)

    print()
    print(f"  Tier label    : {TIER_LABELS.get(tier, '')}")
    print(f"  Seed (prefix) : {identity['seed'][:8]}...  (keep private)")
    print(f"  Issued        : {identity['issued']}")
    print()
    print("  To verify enrollment:")
    print(f"    python3 sdk/btng-ai-brain/enroll_council.py --whoami")
    print()
    print("  To test a governed command:")
    if tier >= 3:
        print("    python3 sdk/btng-cli.py banker perpetual-run --anchor GH")
    elif tier >= 2:
        print("    python3 sdk/btng-cli.py wdb merchant-onboard --batch 500 --region GH")
    else:
        print("    python3 sdk/btng-cli.py nft verify --anchor BTNG-NFT-001")
    print()
    print("  ─────────────────────────────────────────────────────────────────")
    print("  ⚠️   KEEP ~/.btng/sovereign.id PRIVATE.")
    print("       Do NOT commit it to source control.")
    print("       This file IS your sovereign authority on the BTNG mesh.")
    print("  ─────────────────────────────────────────────────────────────────")
    print()


if __name__ == "__main__":
    main()
