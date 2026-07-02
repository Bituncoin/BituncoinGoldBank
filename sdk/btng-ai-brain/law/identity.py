#!/usr/bin/env python3
"""
BTNG Sovereign Law — Identity Re-export
Exposes derive_tier_from_key under the brain.law.identity path so that
CLI and policy code can use the canonical import:

    from brain.law.identity import derive_tier_from_key

The implementation lives in core/identity.py (HMAC-signed tier derivation).
This module is a thin re-export shim — keep it that way.
"""
from btng_ai_brain.core.identity import (   # type: ignore
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
