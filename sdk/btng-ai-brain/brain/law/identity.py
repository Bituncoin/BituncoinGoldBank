#!/usr/bin/env python3
"""
BTNG Sovereign Law — Identity (brain.law.identity)
Re-exports the full identity API from core/identity.py.

This file satisfies the import path used when running scripts
directly from inside sdk/btng-ai-brain/:

    cp identity.py btng-ai-brain/brain/law/identity.py
    from brain.law.identity import derive_tier_from_key

The canonical implementation lives in:
    sdk/btng-ai-brain/core/identity.py

Import chain:
    brain.law.identity
      → (try) btng_ai_brain.core.identity    [when running from sdk/]
      → (fallback) core.identity             [when running from sdk/btng-ai-brain/]
"""
import sys, os

# ── Resolve import regardless of working directory ────────────────────────────
# When this file is loaded from inside btng-ai-brain/ the package is not
# importable as 'btng_ai_brain'. We detect which path works and use it.
_THIS_BRAIN_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# _THIS_BRAIN_DIR = sdk/btng-ai-brain

_loaded = False

# Path 1 — running from sdk/  (btng_ai_brain is a top-level package)
try:
    from btng_ai_brain.core.identity import (   # type: ignore
        derive_tier_from_key,
        enroll_operator,
        generate_session_token,
        verify_session_token,
        show_identity,
        IDENTITY_PATH,
        ROOT_KEY_PATH,
    )
    _loaded = True
except ImportError:
    pass

# Path 2 — running from sdk/btng-ai-brain/  (core is a top-level package)
if not _loaded:
    if _THIS_BRAIN_DIR not in sys.path:
        sys.path.insert(0, _THIS_BRAIN_DIR)
    from core.identity import (   # type: ignore
        derive_tier_from_key,
        enroll_operator,
        generate_session_token,
        verify_session_token,
        show_identity,
        IDENTITY_PATH,
        ROOT_KEY_PATH,
    )

__all__ = [
    "derive_tier_from_key",
    "enroll_operator",
    "generate_session_token",
    "verify_session_token",
    "show_identity",
    "IDENTITY_PATH",
    "ROOT_KEY_PATH",
]
