#!/usr/bin/env python3
"""
BTNG Sovereign HTTP Client
Drop-in replacement for requests.get / requests.post.

Usage:
    from law.client import sovereign_request

    # OLD: requests.post('http://154.161.183.158:38982/api/v1/loans/music', json=payload)
    # NEW: sovereign_request('POST', 'http://154.161.183.158:38982/api/v1/loans/music',
    #          'intent_nft_create_and_loan',
    #          context={'jurisdiction': 'GH', 'target_loan': 50000},
    #          json_data=payload)
"""
import os
import requests
from .identity import generate_session_token, derive_tier_from_key
from core.router import apply_law


def sovereign_request(method, url, intent, context=None, json_data=None, **kwargs):
    """
    Drop-in replacement for requests.post/get.
    Applies law locally, attaches HMAC session token, NEVER sends static key.

    Args:
        method      : HTTP verb — 'GET', 'POST', 'PUT', 'DELETE', etc.
        url         : Target endpoint URL.
        intent      : BTNG law intent string e.g. 'intent_nft_verify'.
        context     : Optional dict of context fields (jurisdiction, risk_flag …).
        json_data   : Request body forwarded as JSON (equivalent to requests json= param).
        **kwargs    : Any other requests.request kwargs (timeout, verify, params …).

    Returns:
        requests.Response

    Raises:
        PermissionError  if sovereign law rules DENY or ESCALATE_TO_BRANCH.
        RuntimeError     if no sovereign identity is enrolled (tier = 0).
    """
    # ── Build context with derived tier ──────────────────────────────────────
    ctx = dict(context or {})
    ctx['auth_tier'] = derive_tier_from_key(os.environ.get("BTNG_SOVEREIGN_KEY"))

    # ── Apply sovereign law locally (no network call) ─────────────────────────
    decision = apply_law(intent, ctx)
    ruling    = decision.get('ruling', 'DENY')
    policy_id = decision.get('policy_id', 'UNKNOWN')
    reason    = decision.get('reason', '')

    if ruling in ('DENY', 'ESCALATE_TO_BRANCH'):
        raise PermissionError(
            f"Sovereign Law: {ruling} | {policy_id} | {reason}"
        )

    # ── Issue a fresh time-bound HMAC token scoped to the permitted tool ──────
    scope = decision.get('tool', 'default')
    token = generate_session_token(scope=scope, ttl_seconds=60)

    # ── Attach token, remove any legacy static key ────────────────────────────
    headers = dict(kwargs.pop('headers', {}))
    headers['X-BTNG-Sovereign-Session'] = token
    headers.pop('X-BTNG-Sovereign-Key', None)   # static key must never leave the node
    kwargs['headers'] = headers

    return requests.request(method, url, json=json_data, **kwargs)


# ── Convenience wrappers ─────────────────────────────────────────────────────

def sovereign_get(url, intent, context=None, **kwargs):
    """Governed GET request."""
    return sovereign_request('GET', url, intent, context=context, **kwargs)


def sovereign_post(url, intent, context=None, json_data=None, **kwargs):
    """Governed POST request."""
    return sovereign_request('POST', url, intent, context=context, json_data=json_data, **kwargs)


def sovereign_put(url, intent, context=None, json_data=None, **kwargs):
    """Governed PUT request."""
    return sovereign_request('PUT', url, intent, context=context, json_data=json_data, **kwargs)


def sovereign_delete(url, intent, context=None, **kwargs):
    """Governed DELETE request."""
    return sovereign_request('DELETE', url, intent, context=context, **kwargs)
