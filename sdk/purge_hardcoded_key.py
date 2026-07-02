#!/usr/bin/env python3
"""
BTNG Sovereign Key Purge Utility
=================================
Scans every .py, .ts, .js, and .env file under the project root for any
hardcoded sovereign key material and replaces it with the burned placeholder.

Run once before scaling to production:
    python sdk/purge_hardcoded_key.py

Safe to re-run — idempotent.  Already-burned files are skipped.
"""
import os
import re
import sys

# ── Targets ──────────────────────────────────────────────────────────────────
BURNED_PLACEHOLDER = "KEY_BURNED_SEE_IDENTITY_PY"

# Any key patterns that should NEVER appear in source.
# Add additional patterns as future key material is rotated.
BURN_PATTERNS: list[tuple[str, str]] = [
    # Legacy council master key (exact match)
    (
        r"al-A-cKa4Yh49mpq59IgyPGQd5jO4iMykOtBW2OoSs814R",
        BURNED_PLACEHOLDER,
    ),
    # Header dict entries carrying the static key (remove the whole line)
    (
        r'"X-BTNG-Sovereign-Key"\s*:\s*"KEY_BURNED_SEE_IDENTITY_PY"\s*,?\s*\n?',
        "",
    ),
    (
        r"'X-BTNG-Sovereign-Key'\s*:\s*'KEY_BURNED_SEE_IDENTITY_PY'\s*,?\s*\n?",
        "",
    ),
]

# File extensions to scan
SCAN_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".env", ".sh"}

# Directories to skip entirely
SKIP_DIRS = {"node_modules", ".git", ".expo", "__pycache__", ".venv", "venv"}


def scan_and_purge(root: str) -> tuple[int, int]:
    """
    Walk the directory tree, find and burn any leaked key material.

    Returns
    -------
    (files_scanned, files_burned) counts.
    """
    scanned = 0
    burned  = 0

    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skipped dirs in-place so os.walk won't descend into them
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in SCAN_EXTENSIONS:
                continue

            path = os.path.join(dirpath, fname)
            scanned += 1

            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
            except OSError:
                continue

            new_content = content
            for pattern, replacement in BURN_PATTERNS:
                new_content = re.sub(pattern, replacement, new_content)

            if new_content != content:
                try:
                    with open(path, "w", encoding="utf-8") as f:
                        f.write(new_content)
                    rel = os.path.relpath(path, root)
                    print(f"  🔥 BURNED: {rel}")
                    burned += 1
                except OSError as exc:
                    print(f"  ⚠️  Could not write {path}: {exc}", file=sys.stderr)

    return scanned, burned


def main() -> int:
    # Resolve project root (one level up from sdk/)
    script_dir   = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, ".."))

    print("╔═══════════════════════════════════════════════════════╗")
    print("║   BTNG Sovereign Key Purge — scanning for leaked keys ║")
    print("╚═══════════════════════════════════════════════════════╝")
    print(f"  Root : {project_root}\n")

    scanned, burned = scan_and_purge(project_root)

    print()
    print("═" * 55)
    print(f"  Files scanned : {scanned}")
    print(f"  Files burned  : {burned}")
    print()

    if burned == 0:
        print("  ✅  No leaked key material found.  Source is clean.")
    else:
        print(f"  ✅  Burned in {burned} file(s).  Legacy key is dead.")
        print()
        print("  ⚠️   NEXT STEPS:")
        print("       1. git add -A && git commit -m 'chore: purge leaked sovereign key'")
        print("       2. Rotate: python sdk/btng-ai-brain/enroll_council.py --tier 5")
        print("       3. Unset:  unset BTNG_SOVEREIGN_KEY")

    print("═" * 55)
    return 0


if __name__ == "__main__":
    sys.exit(main())
