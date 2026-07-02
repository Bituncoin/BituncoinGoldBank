#!/usr/bin/env python3
"""
BTNG Sovereign Brain — Genesis Verifier
Reads the first line of the Law Journal and confirms it is a valid genesis block.

Usage:
    python3 verify_genesis.py
    python3 verify_genesis.py --journal path/to/rulings.jsonl
    python3 verify_genesis.py --verbose

Exit codes:
    0  — genesis block is present and valid (VERIFIED)
    1  — genesis block is missing or tampered (TAMPERED / MISSING)
    2  — argument / file error
"""
import sys
import json
import argparse
import os
from pathlib import Path
from datetime import datetime, timezone

# ── Canonical genesis constants ────────────────────────────────────────────────
GENESIS_HASH     = "0x1111111111111111111111111111111111111111111111111111111111111111"
GENESIS_BLOCK    = 12458
GENESIS_VERSION  = "btng-brain-2.0"

REQUIRED_FIELDS: dict[str, object] = {
    "session":  "genesis",
    "intent":   "intent_system_genesis",
    "ruling":   "ANCHORED",
    "policy":   "GEN-000",
    "tool":     "law_journal_origin",
    "version":  GENESIS_VERSION,
}


def _colour(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if sys.stdout.isatty() else text


def verify(journal_path: Path, verbose: bool = False) -> int:
    """
    Returns 0 (VERIFIED), 1 (TAMPERED/MISSING), or 2 (error).
    """
    if not journal_path.exists():
        print(_colour("31", f"\n⚠️  MISSING  —  Law Journal not found: {journal_path}"))
        print("   Run anchor_genesis.py to create the genesis block first.")
        return 1

    # Read first line
    with open(journal_path, "r") as fh:
        first_line = fh.readline().strip()

    if not first_line:
        print(_colour("31", "\n⚠️  MISSING  —  Law Journal is empty."))
        return 1

    try:
        entry = json.loads(first_line)
    except json.JSONDecodeError as exc:
        print(_colour("31", f"\n🔴  PARSE ERROR  —  First line is not valid JSON: {exc}"))
        return 2

    # ── Field validation ───────────────────────────────────────────────────────
    errors: list[str] = []
    for field, expected in REQUIRED_FIELDS.items():
        actual = entry.get(field)
        if actual != expected:
            errors.append(f"  {field:14}: expected {expected!r}  got {actual!r}")

    # Hash check (stored hash must start with canonical prefix)
    stored_hash = entry.get("input_hash", "")
    if not stored_hash.startswith("0x111111111111"):
        errors.append(f"  {'input_hash':14}: expected canonical genesis hash  got {stored_hash!r}")

    # Block height check
    stored_height = entry.get("block_height")
    if stored_height is not None and stored_height != GENESIS_BLOCK:
        errors.append(f"  {'block_height':14}: expected {GENESIS_BLOCK}  got {stored_height!r}")

    if errors:
        print(_colour("31", "\n🔴  TAMPERED  —  Genesis block has been modified!"))
        print(_colour("31", "   Violations:"))
        for e in errors:
            print(_colour("31", e))
        print()
        print("   The sovereign Law Journal has been compromised.")
        print("   Do not process any rulings until the genesis block is restored.")
        return 1

    # ── VERIFIED ───────────────────────────────────────────────────────────────
    print(_colour("32", "\n⚓  VERIFIED  —  Genesis block is intact"))
    print()
    print(f"  {'ts':14}: {entry.get('ts', '?')}")
    print(f"  {'session':14}: {entry.get('session')}")
    print(f"  {'intent':14}: {entry.get('intent')}")
    print(f"  {'ruling':14}: {_colour('32', entry.get('ruling', ''))}")
    print(f"  {'policy':14}: {entry.get('policy')}")
    print(f"  {'network_node':14}: {entry.get('network_node', '?')}")
    print(f"  {'input_hash':14}: {entry.get('input_hash', '?')}")
    print(f"  {'block_height':14}: {entry.get('block_height', 'N/A')}")
    print(f"  {'version':14}: {entry.get('version')}")

    if verbose:
        # Count total rulings
        with open(journal_path, "r") as fh:
            total = sum(1 for _ in fh)
        print()
        print(f"  {'Total rulings':14}: {total}")
        print(f"  {'Journal path':14}: {journal_path.absolute()}")
        print(f"  {'Verified at':14}: {datetime.now(timezone.utc).isoformat()}")

    print()
    print("  All rulings that follow are jurisprudence measured from this sovereign origin.")
    print()
    return 0


def main() -> None:
    _DEFAULT_JOURNAL = Path(__file__).parent / "rulings.jsonl"

    parser = argparse.ArgumentParser(
        prog="verify_genesis",
        description="Verify the BTNG Sovereign Law Journal genesis block.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 verify_genesis.py
  python3 verify_genesis.py --verbose
  python3 verify_genesis.py --journal /opt/btng/brain/log/rulings.jsonl
  BTNG_JOURNAL=/data/rulings.jsonl python3 verify_genesis.py
        """,
    )
    parser.add_argument(
        "--journal", "-j",
        default=os.environ.get("BTNG_JOURNAL", str(_DEFAULT_JOURNAL)),
        help="Path to rulings.jsonl (default: %(default)s)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show total ruling count and journal path",
    )
    args = parser.parse_args()

    sys.exit(verify(Path(args.journal), verbose=args.verbose))


if __name__ == "__main__":
    main()
