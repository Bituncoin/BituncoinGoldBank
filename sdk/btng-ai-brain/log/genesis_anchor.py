#!/usr/bin/env python3
"""
BTNG Sovereign Brain — Genesis Anchor (path alias)
Alias for sdk/btng-ai-brain/anchor_genesis.py

Referenced in deployment runbook as:
    python3 brain/log/genesis_anchor.py

This file re-exports the canonical anchor_genesis() function so both
the old path and the new path work without copying the source.
"""
import sys
import os

# Resolve the canonical anchor_genesis.py (two levels up from here)
_CANON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "anchor_genesis.py")
_CANON = os.path.normpath(_CANON)

if not os.path.isfile(_CANON):
    print(f"Error: canonical anchor_genesis.py not found at: {_CANON}", file=sys.stderr)
    sys.exit(1)

# Execute the canonical file in-place (shares globals, honours BTNG_NODE_ID)
with open(_CANON) as _fh:
    exec(compile(_fh.read(), _CANON, "exec"))  # noqa: S102
