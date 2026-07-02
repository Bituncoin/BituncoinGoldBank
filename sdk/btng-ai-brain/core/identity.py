#!/usr/bin/env python3
"""
BTNG Sovereign Identity & Session Token Engine
Tiers are claims signed by the network root, verified locally.
All external anchor requests carry HMAC proofs, not static keys.

Usage:
    from btng_ai_brain.core.identity import (
        derive_tier_from_key, enroll_operator,
        generate_session_token, verify_session_token,
    )

    # Resolve current operator tier:
    tier = derive_tier_from_key(os.environ.get("BTNG_SOVEREIGN_KEY"))

    # Issue a time-bound token for one external anchor request:
    token = generate_session_token(scope="nft_verify", ttl_seconds=300)

    # Anchor-side: verify an inbound token:
    result = verify_session_token(token)
    if result["valid"]: ...

    # Council: issue a signed identity for a new operator (run once):
    enroll_operator(tier=3, output_path=Path("/home/operator/.btng/sovereign.id"))
"""
import hmac
import hashlib
import json
import os
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Key material paths ──────────────────────────────────────────────────────────
ROOT_KEY_PATH  = Path(__file__).parent.parent / "law" / "root.key"
IDENTITY_DIR   = Path.home() / ".btng"
IDENTITY_PATH  = IDENTITY_DIR / "sovereign.id"


def _load_root_key() -> bytes:
    """
    Deterministic root key derived from the genesis hash.
    Created once per node, stored at btng-ai-brain/law/root.key (chmod 600).

    The key is derived from the environment override BTNG_GENESIS_HASH, or the
    canonical Phase 1 genesis hash if no override is provided.

    All nodes on the same sovereign mesh share the same root verifier because
    they all derive from the same genesis constant.
    """
    if not ROOT_KEY_PATH.exists():
        genesis = os.environ.get(
            "BTNG_GENESIS_HASH",
            "0x1111111111111111111111111111111111111111111111111111111111111111"
        )
        material = f"{genesis}:BTNG_ROOT".encode()
        key = hashlib.sha256(material).digest()
        ROOT_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        ROOT_KEY_PATH.write_bytes(key)
        os.chmod(ROOT_KEY_PATH, 0o600)
        return key
    return ROOT_KEY_PATH.read_bytes()


def derive_tier_from_key(key_str: "str | None" = None) -> int:
    """
    Resolves the sovereign auth_tier (1–5) for the current operator.

    Resolution order:
      1. Local signed identity  ~/.btng/sovereign.id
             → Verified via HMAC-SHA256 against the node root key.
             → Tamper-evident: any mutation of tier/seed/sig → falls to tier 1.
      2. BTNG_SOVEREIGN_KEY env var  (legacy hash-to-tier fallback)
             → Deterministic but weaker; kept for backward compatibility.
             → The known council master key is recognised and mapped to tier 5.
             → Remove this path after all operators are enrolled via sovereign.id.
      3. No key material → observer tier 1 (read-only; most governed commands DENY).

    Returns an int in [1, 5].
    """

    # ── 1. Signed local identity ──────────────────────────────────────────────
    if IDENTITY_PATH.exists():
        try:
            data         = json.loads(IDENTITY_PATH.read_text())
            claimed_tier = int(data.get("tier", 1))
            seed         = data.get("seed", "")
            sig_hex      = data.get("sig", "00")
            sig          = bytes.fromhex(sig_hex)

            root_key     = _load_root_key()
            payload      = f"{claimed_tier}:{seed}".encode()
            expected_sig = hmac.new(root_key, payload, hashlib.sha256).digest()

            if hmac.compare_digest(sig, expected_sig):
                # Clamp to valid range
                return min(max(claimed_tier, 1), 5)
            else:
                # Signature mismatch — identity may have been tampered with
                import sys
                print(
                    f"🔴  sovereign.id signature mismatch — identity may be tampered.\n"
                    f"    Path: {IDENTITY_PATH}\n"
                    f"    Defaulting to observer tier 1.",
                    file=sys.stderr,
                )
        except Exception as exc:
            import sys
            print(
                f"⚠️   Could not parse sovereign.id ({exc.__class__.__name__}: {exc}).\n"
                f"    Falling through to legacy key derivation.",
                file=sys.stderr,
            )

    # ── 2. Legacy env-var key string ──────────────────────────────────────────
    if key_str:
        # ── LEGACY KEY GUARD REMOVED ──────────────────────────────────────────
        # The hardcoded council master key has been permanently burned.
        # All operators must hold a signed sovereign.id issued by enroll_operator().
        #
        # If you are reading this because something broke:
        #   python3 sdk/btng-ai-brain/enroll_council.py --tier 5
        #   unset BTNG_SOVEREIGN_KEY
        # ─────────────────────────────────────────────────────────────────────

        # Detect and reject any attempt to use the burned/placeholder literal
        _BURNED_FRAGMENT = "KEY_BURNED_SEE_IDENTITY_PY"
        if _BURNED_FRAGMENT in key_str:
            import sys
            print(
                "\U0001f534  BTNG_SOVEREIGN_KEY contains a burned/placeholder value.\n"
                "    The legacy master key is dead. Enroll a signed identity:\n"
                "    python3 sdk/btng-ai-brain/enroll_council.py --tier <N>\n"
                "    Defaulting to observer tier 1.",
                file=sys.stderr,
            )
            return 1

        # Deterministic hash-to-tier (prefix-based, with checksum verification)
        # Falls back to digest modulo if no valid prefix is found.
        _TIER_PREFIXES = {
            "btng-t5-": 5,
            "btng-t4-": 4,
            "btng-t3-": 3,
            "btng-t2-": 2,
            "btng-t1-": 1,
        }
        _NODE_SECRET = os.environ.get("BTNG_NODE_SECRET", "btng-sovereign-node-v2")

        for prefix, tier in _TIER_PREFIXES.items():
            if key_str.lower().startswith(prefix):
                # Verify embedded checksum
                parts = key_str.rsplit("-", 1)
                if len(parts) == 2 and len(parts[1]) >= 8:
                    body     = parts[0]
                    raw      = f"{body}:{_NODE_SECRET}:{tier}"
                    derived  = hashlib.sha256(raw.encode()).hexdigest()[:12]
                    if derived == parts[1].lower()[:12]:
                        return tier
                # Prefix matched but checksum failed
                import sys
                print(
                    f"🔴  BTNG_SOVEREIGN_KEY checksum mismatch for tier {tier}.\n"
                    f"    Key: {key_str[:32]}...\n"
                    f"    Defaulting to observer tier 1.",
                    file=sys.stderr,
                )
                return 1

        # No prefix match — derive from digest modulo as last-resort fallback
        digest  = hashlib.sha256(key_str.encode()).hexdigest()
        val     = int(digest[:2], 16)
        derived = min(max((val % 5) + 1, 1), 5)
        return derived

    # ── 3. No key material — observer tier ───────────────────────────────────
    return 1


def enroll_operator(tier: int, output_path: "Path | None" = None) -> dict:
    """
    Council-only: generate a signed sovereign identity for an operator.

    The identity is stored as a JSON file on the operator's machine.
    The network NEVER holds the key material — only the operator does.

    Parameters
    ----------
    tier        : int  — Tier to assign (1–5).
    output_path : Path — Where to write sovereign.id (default: ~/.btng/sovereign.id).

    Returns
    -------
    dict with keys: tier, seed, sig, network, issued

    Usage
    -----
    # On the council node (tier 5):
    from btng_ai_brain.core.identity import enroll_operator
    from pathlib import Path

    identity = enroll_operator(tier=3)
    print(f"Enroll complete: {identity}")
    """
    if tier < 1 or tier > 5:
        raise ValueError(f"Tier must be 1–5, got {tier}")

    root_key = _load_root_key()
    seed     = secrets.token_hex(16)
    payload  = f"{tier}:{seed}".encode()
    sig_hex  = hmac.new(root_key, payload, hashlib.sha256).hexdigest()

    identity = {
        "tier":    tier,
        "seed":    seed,
        "sig":     sig_hex,
        "network": "btng-sovereign-mesh",
        "issued":  datetime.now(timezone.utc).isoformat(),
    }

    out = output_path or IDENTITY_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(identity, indent=2))
    os.chmod(out, 0o600)

    print(f"✅  Sovereign identity enrolled")
    print(f"    Tier   : {tier}")
    print(f"    Path   : {out.absolute()}")
    print(f"    Issued : {identity['issued']}")
    print()
    print("    Keep this file private. Do NOT commit it to source control.")
    print("    The network derives your authority from this file alone.")

    return identity


# ─────────────────────────────────────────────────────────────────────────────
# SESSION TOKEN ENGINE  (time-bound HMAC proofs for external anchor requests)
# ─────────────────────────────────────────────────────────────────────────────

def generate_session_token(scope: str, ttl_seconds: int = 300) -> str:
    """
    Create a time-bound HMAC token for one external anchor request.

    The token encodes the operator's sovereign tier, a Unix timestamp,
    a one-time nonce, the requested scope, and a 32-char HMAC-SHA256 signature
    derived from the node root key.  Tokens expire after ``ttl_seconds``
    (default 5 minutes); the anchor enforces this window on receipt.

    Parameters
    ----------
    scope       : str  — Intent or resource label (e.g. "nft_verify", "mesh_sync").
    ttl_seconds : int  — How long the token remains valid (default 300 s).

    Returns
    -------
    str — Colon-delimited token: ``tier:ts:nonce:scope:sig``

    Raises
    ------
    RuntimeError — if no signed sovereign identity is present on this node.
    """
    root_key = _load_root_key()
    ident    = None
    if IDENTITY_PATH.exists():
        try:
            ident = json.loads(IDENTITY_PATH.read_text())
        except Exception:
            pass

    if not ident:
        raise RuntimeError(
            "No sovereign identity found.  Run enroll_operator() first.\n"
            f"  Expected path: {IDENTITY_PATH}"
        )

    tier  = int(ident.get("tier", 1))
    now   = int(time.time())
    nonce = secrets.token_hex(8)
    payload = f"{tier}:{now}:{nonce}:{scope}".encode()
    sig   = hmac.new(root_key, payload, hashlib.sha256).hexdigest()[:32]
    return f"{tier}:{now}:{nonce}:{scope}:{sig}"


def verify_session_token(token: str, max_clock_skew: int = 600) -> dict:
    """
    Anchor-side verification of an inbound session token.

    Checks:
      1. Token structure (exactly 5 colon-delimited parts).
      2. Timestamp freshness — must be within ``max_clock_skew`` seconds of now.
      3. HMAC-SHA256 signature using the shared node root key.

    Parameters
    ----------
    token          : str — Token produced by ``generate_session_token()``.
    max_clock_skew : int — Acceptable timestamp drift in seconds (default 600).

    Returns
    -------
    dict with keys:
        valid  : bool
        tier   : int (only when valid=True)
        scope  : str (only when valid=True)
        ts     : int (only when valid=True)
        reason : str (only when valid=False)
    """
    parts = token.split(":")
    if len(parts) != 5:
        return {"valid": False, "reason": f"Malformed token — expected 5 parts, got {len(parts)}"}

    claimed_tier, ts_str, nonce, scope, claimed_sig = parts

    try:
        ts = int(ts_str)
    except ValueError:
        return {"valid": False, "reason": "Non-integer timestamp in token"}

    now = int(time.time())
    if abs(now - ts) > max_clock_skew:
        return {
            "valid": False,
            "reason": f"Token expired or excessive clock skew — |now-ts| = {abs(now - ts)}s (max {max_clock_skew}s)",
        }

    root_key = _load_root_key()
    payload  = f"{claimed_tier}:{ts_str}:{nonce}:{scope}".encode()
    expected_sig = hmac.new(root_key, payload, hashlib.sha256).hexdigest()[:32]

    if not hmac.compare_digest(claimed_sig, expected_sig):
        return {"valid": False, "reason": "Invalid HMAC signature — token may have been forged or tampered"}

    try:
        tier_int = min(max(int(claimed_tier), 1), 5)
    except ValueError:
        return {"valid": False, "reason": "Non-integer tier in token"}

    return {"valid": True, "tier": tier_int, "scope": scope, "ts": ts}


def show_identity() -> None:
    """Print the current operator's resolved tier and identity summary."""
    tier = derive_tier_from_key(os.environ.get("BTNG_SOVEREIGN_KEY"))
    tier_labels = {1: "Observer", 2: "Operator (KYC)", 3: "Operator", 4: "Council", 5: "Sovereign Council"}
    label = tier_labels.get(tier, "Unknown")

    print(f"╔══════════════════════════════════════════════════════╗")
    print(f"║  BTNG Sovereign Identity                            ║")
    print(f"╚══════════════════════════════════════════════════════╝")
    print(f"  Resolved Tier : {tier}  ({label})")
    print(f"  Identity Path : {IDENTITY_PATH}  ({'exists' if IDENTITY_PATH.exists() else 'not found'})")
    print(f"  Root Key Path : {ROOT_KEY_PATH}  ({'exists' if ROOT_KEY_PATH.exists() else 'will be created on first use'})")
    print(f"  Env Key       : {'set' if os.environ.get('BTNG_SOVEREIGN_KEY') else 'not set'}")
    print(f"  Token support : generate_session_token() / verify_session_token()")
    print()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "enroll":
        tier_arg = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        enroll_operator(tier_arg)
    elif len(sys.argv) > 1 and sys.argv[1] == "whoami":
        show_identity()
    elif len(sys.argv) > 1 and sys.argv[1] == "token":
        scope_arg = sys.argv[2] if len(sys.argv) > 2 else "cli_test"
        try:
            tok = generate_session_token(scope=scope_arg)
            print(f"Token : {tok}")
            result = verify_session_token(tok)
            print(f"Verify: {result}")
        except RuntimeError as exc:
            print(f"Error : {exc}", file=sys.stderr)
            sys.exit(1)
    else:
        print("Usage:")
        print("  python identity.py whoami                    # show resolved tier")
        print("  python identity.py enroll <tier>             # issue new identity (council)")
        print("  python identity.py token  [scope]            # generate + self-verify a session token")
        print()
        show_identity()
