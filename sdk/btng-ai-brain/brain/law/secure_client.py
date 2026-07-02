#!/usr/bin/env python3
"""
brain.law.secure_client — canonical import path for the BTNG Sovereign HTTP Client.

Re-exports everything from law.client so callers can use either path:
    from brain.law.secure_client import sovereign_request   # preferred
    from law.client import sovereign_request                 # also works

Usage (replacing old burned-key pattern):
    # OLD (burned — never use):
    # headers = {"X-BTNG-Sovereign-Key": "<burned>", ...}
    # response = requests.post(url, json=payload, headers=headers, timeout=15)

    # NEW:
    from brain.law.secure_client import sovereign_request
    response = sovereign_request(
        "POST", url,
        intent="intent_nft_create_and_loan",
        context={"jurisdiction": "GH", "target_loan": 50000, "auth_tier": 3},
        json_data=payload,
        timeout=15
    )
"""
import sys
import os

# Resolve the root btng-ai-brain directory so law.client is importable
# regardless of where the caller is running from.
_here = os.path.dirname(__file__)                        # brain/law/
_brain_root = os.path.abspath(os.path.join(_here, '..', '..'))  # btng-ai-brain/
if _brain_root not in sys.path:
    sys.path.insert(0, _brain_root)

from law.client import (           # noqa: E402 (path fix must come first)
    sovereign_request,
    sovereign_get,
    sovereign_post,
    sovereign_put,
    sovereign_delete,
)

__all__ = [
    "sovereign_request",
    "sovereign_get",
    "sovereign_post",
    "sovereign_put",
    "sovereign_delete",
]
