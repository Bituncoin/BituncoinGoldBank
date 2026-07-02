#!/usr/bin/env python3
"""
BTNG Brain HTTP Gate — localhost:8087
The Face (HTML) asks here before touching any external API.

Endpoints:
  POST /govern  — Apply sovereign law; returns ruling + external_token on ALLOW
  GET  /health  — Quick liveness probe
  GET  /status  — Full node status: tier, rulings count, last ruling timestamp
"""
import sys, os, hashlib, json, secrets, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from flask import Flask, request, jsonify
from flask_cors import CORS
from core.router import apply_law, write_ruling
from law.identity import verify_session_token, generate_session_token

app = Flask(__name__)
CORS(app, origins=["http://localhost:8086", "http://127.0.0.1:8086", 
                   "http://localhost:8081", "http://127.0.0.1:8081"])

BRAIN_NODE = os.environ.get("BTNG_NODE_ID", "btng-node-local")
_BOOT_TIME = time.time()

@app.route('/govern', methods=['POST'])
def govern():
    data = request.get_json(force=True)
    intent = data.get('intent', 'intent_unknown')
    ctx = data.get('context', {})
    session = data.get('session_id', 'web-' + secrets.token_hex(6))
    
    # Honor existing session if presented
    auth_hdr = request.headers.get('X-BTNG-Sovereign-Session', '')
    if auth_hdr:
        v = verify_session_token(auth_hdr)
        if v['valid']:
            ctx['auth_tier'] = v['tier']
        else:
            ctx['auth_tier'] = 1
    
    # Apply sovereign law
    decision = apply_law(intent, ctx)
    input_hash = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]
    write_ruling(session, intent, 1.0, decision['policy_id'],
                 decision['ruling'], decision.get('tool'), 0, input_hash,
                 extra={"source": "dashboard", "node": BRAIN_NODE})
    
    # If allowed, issue a one-time external token for the anchor call
    if decision['ruling'] in ('ALLOW', 'ALLOW_FULL', 'ALLOW_REDUCED'):
        tool = decision.get('tool', 'default')
        decision['external_token'] = generate_session_token(scope=tool, ttl_seconds=60)
    
    return jsonify(decision)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "BRAIN_ALIVE", "node": BRAIN_NODE})


@app.route('/status', methods=['GET'])
def status():
    """
    Full node status — consumed by the mobile Sovereign Dashboard.

    Returns
    -------
    JSON:
      node          : str   — BTNG_NODE_ID env or "btng-node-local"
      status        : str   — always "BRAIN_ALIVE" when reachable
      operator_tier : int   — resolved from ~/.btng/sovereign.id (HMAC-signed)
      tier_label    : str   — human-readable tier name
      rulings_count : int   — total lines in rulings.jsonl (0 if not yet created)
      last_ruling   : dict  — last ruling entry parsed from rulings.jsonl,
                              or null if journal is empty
      uptime_s      : int   — seconds since this process started
      brain_version : str
      timestamp     : str   — ISO-8601 UTC
    """
    from datetime import datetime, timezone

    # ── Tier resolution ───────────────────────────────────────────────────────
    try:
        from law.identity import derive_tier_from_key
        tier = derive_tier_from_key(os.environ.get("BTNG_SOVEREIGN_KEY"))
    except Exception:
        tier = 1

    TIER_LABELS = {
        1: "Observer",
        2: "Operator (KYC Lite)",
        3: "Operator",
        4: "Council",
        5: "Sovereign Council",
    }

    # ── Rulings journal ───────────────────────────────────────────────────────
    journal_path = os.path.join(os.path.dirname(__file__), "log", "rulings.jsonl")
    rulings_count = 0
    last_ruling = None
    try:
        if os.path.isfile(journal_path):
            with open(journal_path, "r", encoding="utf-8") as fh:
                lines = [ln.strip() for ln in fh if ln.strip()]
            rulings_count = len(lines)
            if lines:
                last_ruling = json.loads(lines[-1])
    except Exception as exc:
        last_ruling = {"error": str(exc)}

    # ── Uptime ────────────────────────────────────────────────────────────────
    uptime_s = int(time.time() - _BOOT_TIME)

    return jsonify({
        "node":          BRAIN_NODE,
        "status":        "BRAIN_ALIVE",
        "operator_tier": tier,
        "tier_label":    TIER_LABELS.get(tier, "Unknown"),
        "rulings_count": rulings_count,
        "last_ruling":   last_ruling,
        "uptime_s":      uptime_s,
        "brain_version": "btng-brain-1.0",
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    })


@app.route('/history', methods=['GET'])
def history():
    """
    GET /history?limit=20

    Returns the last ``limit`` ruling entries from rulings.jsonl as a JSON array,
    ordered oldest-first so the mobile chart can plot a left-to-right timeline.

    Each entry is the raw JSONL object written by write_ruling():
      { ts, session_id, intent, confidence, policy_id, ruling, tool,
        latency_ms, input_hash, ... }

    Query params
    ------------
    limit : int (1–100, default 20)
    """
    try:
        raw_limit = request.args.get('limit', '20')
        limit = max(1, min(100, int(raw_limit)))
    except (ValueError, TypeError):
        limit = 20

    journal_path = os.path.join(os.path.dirname(__file__), 'log', 'rulings.jsonl')
    entries = []
    try:
        if os.path.isfile(journal_path):
            with open(journal_path, 'r', encoding='utf-8') as fh:
                lines = [ln.strip() for ln in fh if ln.strip()]
            # Take the last `limit` lines, parse each as JSON
            for line in lines[-limit:]:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    except Exception as exc:
        return jsonify({'error': str(exc), 'entries': []}), 500

    return jsonify({'count': len(entries), 'entries': entries})


if __name__ == '__main__':
    print("🧠 BTNG Brain Gate starting on http://localhost:8087")
    app.run(host='127.0.0.1', port=8087, debug=False)
