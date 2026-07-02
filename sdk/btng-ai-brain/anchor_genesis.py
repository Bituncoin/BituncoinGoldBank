#!/usr/bin/env python3
"""
BTNG Sovereign Brain — Genesis Anchor
Seals the immutable origin block to the Law Journal (rulings.jsonl).
Run once per node. Subsequent calls are idempotent.

Usage:
    python anchor_genesis.py
    BTNG_NODE_ID=btng-node-gh-02 python anchor_genesis.py
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

JOURNAL_PATH = Path(__file__).parent / "log" / "rulings.jsonl"
GENESIS_HASH = "0x1111111111111111111111111111111111111111111111111111111111111111"
BLOCK_HEIGHT = 12458
NODE_ID      = os.environ.get("BTNG_NODE_ID", "btng-node-01")


def anchor_genesis() -> None:
    JOURNAL_PATH.parent.mkdir(parents=True, exist_ok=True)

    genesis_entry = {
        "ts":           datetime.now(timezone.utc).isoformat(),
        "session":      "genesis",
        "intent":       "intent_system_genesis",
        "confidence":   1.0,
        "policy":       "GEN-000",
        "ruling":       "ANCHORED",
        "tool":         "law_journal_origin",
        "network_node": NODE_ID,
        "latency_ms":   0,
        "input_hash":   GENESIS_HASH,
        "version":      "btng-brain-2.0",
        "block_height": BLOCK_HEIGHT,
        "note":         "Journal origin sealed to Phase 1 genesis transaction",
    }

    # ── Idempotency guard: never write a second genesis line ─────────────────
    if JOURNAL_PATH.exists():
        with open(JOURNAL_PATH, "r") as fh:
            first_line = fh.readline().strip()
            if first_line:
                try:
                    if json.loads(first_line).get("session") == "genesis":
                        print(f"⚓  Genesis anchor already present on {NODE_ID}.")
                        print(f"    Journal : {JOURNAL_PATH.absolute()}")
                        return
                except json.JSONDecodeError:
                    pass  # Corrupt first line — overwrite safely below

    # ── Prepend genesis entry; preserve any existing rulings ─────────────────
    temp_path = JOURNAL_PATH.with_suffix(".tmp")
    try:
        with open(temp_path, "w") as tmp:
            tmp.write(json.dumps(genesis_entry) + "\n")
            if JOURNAL_PATH.exists():
                with open(JOURNAL_PATH, "r") as orig:
                    tmp.write(orig.read())
        temp_path.replace(JOURNAL_PATH)
    except Exception as exc:
        # Clean up temp file on failure
        if temp_path.exists():
            temp_path.unlink()
        raise RuntimeError(f"Genesis anchor failed: {exc}") from exc

    print(f"✅  Genesis anchor written on {NODE_ID}")
    print(f"🔗  Hash     : {GENESIS_HASH}")
    print(f"🔗  Height   : {BLOCK_HEIGHT}")
    print(f"📓  Journal  : {JOURNAL_PATH.absolute()}")
    print()
    print("    This is the immutable first line of the BTNG Sovereign Law Journal.")
    print("    All rulings that follow are jurisprudence measured from this origin.")


if __name__ == "__main__":
    anchor_genesis()
