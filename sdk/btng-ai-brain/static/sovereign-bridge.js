/* === BTNG SOVEREIGN BRIDGE v2.0 ===
   Every API call MUST pass through the Brain on localhost:8087 first.
   The Face does not touch the anchor until the Brain rules ALLOW.

   Drop this script into any HTML face page:
       <script src="sovereign-bridge.js"></script>

   Then replace direct fetch() calls with btngFetch() — see USAGE below.
*/

const BRAIN_URL     = 'http://localhost:8087/govern';
const BRAIN_HEALTH  = 'http://localhost:8087/health';
const SESSION_KEY   = 'btng_session_token';
const BRAIN_TIMEOUT = 4000; // ms — if Brain doesn't respond, hard fail

// ── Internal: timed fetch (prevents hanging if server is down) ───────────────
async function _timedFetch(url, options, timeout) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(id);
    }
}

// ── Check if the Brain server is reachable ───────────────────────────────────
async function btngBrainAlive() {
    try {
        const res = await _timedFetch(BRAIN_HEALTH, {}, BRAIN_TIMEOUT);
        return res.ok;
    } catch {
        return false;
    }
}

// ── Core governance call ─────────────────────────────────────────────────────
async function btngGovern(intent, context = {}) {
    const sessionId   = 'web-' + Math.random().toString(36).slice(2, 10);
    const headers     = { 'Content-Type': 'application/json' };
    const savedToken  = localStorage.getItem(SESSION_KEY);
    if (savedToken) headers['X-BTNG-Sovereign-Session'] = savedToken;

    let res;
    try {
        res = await _timedFetch(BRAIN_URL, {
            method:  'POST',
            headers,
            body:    JSON.stringify({ intent, context, session_id: sessionId }),
        }, BRAIN_TIMEOUT);
    } catch (err) {
        throw new Error(
            'Brain unreachable. Is brain_server.py running?\n' +
            'Start with: cd sdk/btng-ai-brain && python brain_server.py'
        );
    }

    if (!res.ok) {
        throw new Error(`Brain HTTP ${res.status}. Check brain_server.py logs.`);
    }

    const ruling = await res.json();

    // Persist the external token for the next request in the session
    if (ruling.external_token) {
        localStorage.setItem(SESSION_KEY, ruling.external_token);
    }

    const level = ruling.ruling === 'ALLOW' || ruling.ruling === 'ALLOW_FULL' || ruling.ruling === 'ALLOW_REDUCED'
        ? 'info' : 'warn';
    console[level](
        `[SOVEREIGN LAW] ${intent}`,
        `→ ${ruling.ruling}`,
        `| ${ruling.policy_id ?? ruling.policy ?? '?'}`,
        `| ${ruling.reason ?? ''}`
    );

    if (ruling.ruling === 'DENY') {
        const msg =
            `🛡️ SOVEREIGN LAW: DENIED\n` +
            `Policy : ${ruling.policy_id ?? ruling.policy ?? 'UNKNOWN'}\n` +
            `Reason : ${ruling.reason ?? 'No reason provided'}`;
        alert(msg);
        throw new Error(`LAW_DENY:${ruling.policy_id ?? ruling.policy ?? 'UNKNOWN'}`);
    }

    if (ruling.ruling === 'ESCALATE_TO_BRANCH') {
        const msg =
            `🏛️ ESCALATED TO BRANCH\n` +
            `Policy : ${ruling.policy_id ?? ruling.policy ?? 'UNKNOWN'}\n` +
            `Reason : ${ruling.reason ?? ''}\n\n` +
            `A sovereign officer will contact you.`;
        alert(msg);
        throw new Error(`LAW_ESCALATE:${ruling.policy_id ?? ruling.policy ?? 'UNKNOWN'}`);
    }

    return ruling; // Contains external_token if ALLOW
}

// ── Governed drop-in replacement for fetch() ────────────────────────────────
/**
 * btngFetch(url, fetchOptions, intent, context)
 *
 * Usage:
 *   OLD: fetch('http://154.161.183.158:38982/api/v1/loans/music', { method: 'POST', body: JSON.stringify(payload) })
 *   NEW: btngFetch(
 *           'http://154.161.183.158:38982/api/v1/loans/music',
 *           { method: 'POST', body: JSON.stringify(payload) },
 *           'intent_nft_create_and_loan',
 *           { jurisdiction: 'GH', target_loan: 50000, auth_tier: 3 }
 *        )
 */
async function btngFetch(url, options = {}, intent, context = {}) {
    const ruling = await btngGovern(intent, context);

    options.headers = options.headers || {};

    // Attach the short-lived external token; NEVER the static key
    if (ruling.external_token) {
        options.headers['X-BTNG-Sovereign-Session'] = ruling.external_token;
    }

    // Hard safety net — static key must never reach the anchor
    delete options.headers['X-BTNG-Sovereign-Key'];

    return fetch(url, options);
}

// ── Clear session token (call on logout) ─────────────────────────────────────
function btngClearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// ── Export for module environments ───────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { btngGovern, btngFetch, btngBrainAlive, btngClearSession };
}
