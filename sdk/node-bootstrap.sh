#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  BTNG SOVEREIGN NODE — Full Bootstrap Runbook  ·  v2.1                    ║
# ║  Executes all 7 deployment steps in sequence:                             ║
# ║                                                                            ║
# ║  Step 0 — Genesis tamper check (blocks bootstrap on compromised journal)  ║
# ║  Step 1 — Deploy identity module (brain/law/identity.py)                  ║
# ║  Step 2 — Patch CLI context builder (auto, already wired)                 ║
# ║  Step 3 — Enroll council tier-5 identity                                  ║
# ║  Step 4 — Run WDB stress test (confirms law gates are hardened)           ║
# ║  Step 5 — Open port 38982 restricted to sovereign CIDR                    ║
# ║  Step 6 — Sync to all 54 mesh nodes                                       ║
# ║                                                                            ║
# ║  USAGE:                                                                    ║
# ║    chmod +x node-bootstrap.sh                                              ║
# ║    ./node-bootstrap.sh                          # standard (tier from env) ║
# ║    COUNCIL_TIER=3 ./node-bootstrap.sh           # enroll specific tier     ║
# ║    SKIP_FIREWALL=1 ./node-bootstrap.sh          # skip iptables step       ║
# ║    SKIP_STRESS=1 ./node-bootstrap.sh            # skip WDB stress test     ║
# ║    SKIP_SYNC=1 ./node-bootstrap.sh              # skip mesh sync           ║
# ║                                                                            ║
# ║  ENVIRONMENT OVERRIDES:                                                    ║
# ║    BTNG_NODE_ID=btng-node-gh-02                                            ║
# ║    BTNG_SOVEREIGN_PORT=38982                                               ║
# ║    BTNG_TRUSTED_CIDR=154.161.183.0/24                                      ║
# ║    COUNCIL_TIER=5   (tier to enroll, default 5)                           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}    $*"; }
success() { echo -e "${GREEN}[OK]${RESET}      $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}    $*"; }
step()    { echo -e "${BOLD}${CYAN}[STEP]${RESET}    $*"; }
fail()    { echo -e "${RED}[FAIL]${RESET}    $*" >&2; exit 1; }
header()  {
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  $*${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

# ── Config ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DIR="${SCRIPT_DIR}/btng-ai-brain"
JOURNAL_DIR="${BRAIN_DIR}/log"
JOURNAL_FILE="${JOURNAL_DIR}/rulings.jsonl"
SOVEREIGN_PORT="${BTNG_SOVEREIGN_PORT:-38982}"
TRUSTED_CIDR="${BTNG_TRUSTED_CIDR:-154.161.183.0/24}"
NODE_ID="${BTNG_NODE_ID:-btng-node-$(hostname)}"
PYTHON="${PYTHON:-python3}"
COUNCIL_TIER="${COUNCIL_TIER:-5}"
SKIP_FIREWALL="${SKIP_FIREWALL:-0}"
SKIP_STRESS="${SKIP_STRESS:-0}"
SKIP_SYNC="${SKIP_SYNC:-0}"

# ── Canonical genesis constants (must match verify_genesis.py + anchor_genesis.py) ──
CANONICAL_GENESIS_HASH="0x1111111111111111111111111111111111111111111111111111111111111111"

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  🪙  BTNG SOVEREIGN NODE  ·  Full Bootstrap  ·  v2.1              ║${RESET}"
echo -e "${BOLD}║  One brain. One law. One journal. Seven steps to sovereignty.      ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
info "Node ID       : ${NODE_ID}"
info "Brain dir     : ${BRAIN_DIR}"
info "Journal       : ${JOURNAL_FILE}"
info "Council tier  : ${COUNCIL_TIER}"
info "Sovereign port: ${SOVEREIGN_PORT}  (CIDR: ${TRUSTED_CIDR})"
echo ""

# ── Pre-flight ─────────────────────────────────────────────────────────────────
command -v "${PYTHON}" >/dev/null 2>&1 || fail "Python 3 not found."
[[ -d "${BRAIN_DIR}" ]] || fail "btng-ai-brain not found at: ${BRAIN_DIR}"
[[ -f "${BRAIN_DIR}/core/router.py" ]] || fail "core/router.py missing."
[[ -f "${BRAIN_DIR}/core/identity.py" ]] || fail "core/identity.py missing."

success "Pre-flight passed"

# ──────────────────────────────────────────────────────────────────────────────
# STEP 0 — GENESIS TAMPER CHECK
# Runs BEFORE any law is deployed or identity enrolled.
# If an existing Law Journal is found, its genesis block must match the
# canonical hash exactly — a modified, missing, or unparseable anchor means
# the node may have been compromised.  Bootstrap is BLOCKED until clean.
# On a brand-new node (no journal yet) this step is a pass-through no-op.
# ──────────────────────────────────────────────────────────────────────────────
header "STEP 0 · GENESIS TAMPER CHECK"

VERIFY_SCRIPT="${BRAIN_DIR}/log/verify_genesis.py"

if [[ ! -f "${VERIFY_SCRIPT}" ]]; then
  warn "verify_genesis.py not found at ${VERIFY_SCRIPT}"
  warn "Tamper check skipped — install the verifier before deploying to production."

elif [[ ! -f "${JOURNAL_FILE}" ]]; then
  info "No existing Law Journal found — first-time bootstrap, tamper check skipped."
  info "Genesis block will be written during the GENESIS ANCHOR step below."

else
  info "Existing journal detected: ${JOURNAL_FILE}"
  info "Canonical genesis hash   : ${CANONICAL_GENESIS_HASH}"
  info "Running verify_genesis.py --verbose ..."
  echo ""

  set +e
  BTNG_JOURNAL="${JOURNAL_FILE}" \
  BTNG_NODE_ID="${NODE_ID}" \
  "${PYTHON}" "${VERIFY_SCRIPT}" --journal "${JOURNAL_FILE}" --verbose
  VERIFY_EXIT=$?
  set -e

  echo ""

  if [[ "${VERIFY_EXIT}" -eq 0 ]]; then
    success "Genesis tamper check PASSED — journal is sovereign and intact ✓"

  elif [[ "${VERIFY_EXIT}" -eq 1 ]]; then
    # ── TAMPERED or MISSING genesis block ─────────────────────────────────
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${RED}║  🔴  SOVEREIGN ALERT: LAW JOURNAL TAMPER DETECTED                   ║${RESET}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "  ${RED}${BOLD}Bootstrap is BLOCKED.${RESET}"
    echo ""
    echo -e "  The genesis block in:"
    echo -e "    ${BOLD}${JOURNAL_FILE}${RESET}"
    echo -e "  does not match the canonical genesis hash:"
    echo -e "    ${BOLD}${CANONICAL_GENESIS_HASH}${RESET}"
    echo ""
    echo -e "  ${BOLD}Possible causes:${RESET}"
    echo -e "    1. The journal file was manually edited."
    echo -e "    2. A rogue process overwrote or prepended the first line."
    echo -e "    3. The file was replaced during a node compromise or bad deploy."
    echo -e "    4. The journal was created on a different genesis version."
    echo ""
    echo -e "  ${BOLD}Diagnostic command:${RESET}"
    echo -e "    ${CYAN}head -n 1 \"${JOURNAL_FILE}\" | python3 -m json.tool${RESET}"
    echo ""
    echo -e "  ${BOLD}Recovery options:${RESET}"
    echo -e "    a) Restore from a known-good backup:"
    echo -e "       ${CYAN}cp \"${JOURNAL_FILE}.bak\" \"${JOURNAL_FILE}\"${RESET}"
    echo -e "       ${CYAN}./node-bootstrap.sh${RESET}"
    echo ""
    echo -e "    b) Re-anchor a fresh journal (audit data loss — council sign-off required):"
    echo -e "       ${CYAN}mv \"${JOURNAL_FILE}\" \"${JOURNAL_FILE}.$(date +%Y%m%d%H%M%S).tampered\"${RESET}"
    echo -e "       ${CYAN}python3 \"${BRAIN_DIR}/anchor_genesis.py\"${RESET}"
    echo -e "       ${CYAN}./node-bootstrap.sh${RESET}"
    echo ""
    echo -e "    c) Escalate to the sovereign council before taking any action."
    echo -e "       All rulings since the last known-good state must be treated as suspect."
    echo ""
    echo -e "  ${RED}${BOLD}The AI is not loose. It is clerk to your court.${RESET}"
    echo -e "  ${RED}${BOLD}This court has been tampered with. Convene the council.${RESET}"
    echo ""
    exit 1

  else
    # ── Exit code 2 = parse / file error in verify_genesis.py ─────────────
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${RED}║  🔴  GENESIS VERIFIER ERROR (exit code ${VERIFY_EXIT})                        ║${RESET}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "  ${BOLD}The journal exists but could not be parsed by verify_genesis.py.${RESET}"
    echo -e "  The first line may be corrupt JSON or a non-UTF-8 binary."
    echo ""
    echo -e "  ${BOLD}Diagnostic commands:${RESET}"
    echo -e "    ${CYAN}head -n 1 \"${JOURNAL_FILE}\" | python3 -m json.tool${RESET}"
    echo -e "    ${CYAN}file \"${JOURNAL_FILE}\"${RESET}"
    echo -e "    ${CYAN}hexdump -C \"${JOURNAL_FILE}\" | head -3${RESET}"
    echo ""
    echo -e "  ${BOLD}Bootstrap is BLOCKED until the journal is readable.${RESET}"
    echo ""
    exit 2
  fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# STEP 1 — DEPLOY IDENTITY MODULE
# cp identity.py btng-ai-brain/brain/law/identity.py
# ──────────────────────────────────────────────────────────────────────────────
header "STEP 1 · DEPLOY IDENTITY MODULE"

# Ensure package skeleton exists
mkdir -p "${BRAIN_DIR}/brain/law"
mkdir -p "${BRAIN_DIR}/law"
mkdir -p "${BRAIN_DIR}/core"

for pkg_dir in \
  "${BRAIN_DIR}" \
  "${BRAIN_DIR}/core" \
  "${BRAIN_DIR}/law" \
  "${BRAIN_DIR}/brain" \
  "${BRAIN_DIR}/brain/law" \
  "${BRAIN_DIR}/tests"; do
  touch "${pkg_dir}/__init__.py"
done

# The brain/law/identity.py re-export shim should already exist
# (written by OnSpace AI). If not, generate a minimal one.
BRAIN_LAW_ID="${BRAIN_DIR}/brain/law/identity.py"
if [[ ! -f "${BRAIN_LAW_ID}" ]]; then
  warn "brain/law/identity.py not found — generating minimal re-export shim..."
  cat > "${BRAIN_LAW_ID}" <<'PYEOF'
# Auto-generated re-export shim
import sys, os
_brain_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _brain_dir not in sys.path:
    sys.path.insert(0, _brain_dir)
try:
    from btng_ai_brain.core.identity import *  # noqa
except ImportError:
    from core.identity import *  # noqa
PYEOF
  success "brain/law/identity.py generated"
else
  success "brain/law/identity.py present ✓"
fi

# Also ensure the law/identity.py shim is up to date
LAW_ID="${BRAIN_DIR}/law/identity.py"
if [[ ! -f "${LAW_ID}" ]]; then
  cp "${BRAIN_LAW_ID}" "${LAW_ID}"
  success "law/identity.py deployed from brain/law/identity.py"
else
  success "law/identity.py present ✓"
fi

export BTNG_NODE_ID="${NODE_ID}"
mkdir -p "${JOURNAL_DIR}"
success "Identity module deployed · BTNG_NODE_ID=${NODE_ID}"

# ──────────────────────────────────────────────────────────────────────────────
# STEP 2 — PATCH CLI CONTEXT BUILDER
# (derive_tier_from_key is already wired in btng-cli.py via brain.law.identity)
# ──────────────────────────────────────────────────────────────────────────────
header "STEP 2 · CLI CONTEXT BUILDER — VERIFY PATCH"

CLI_SCRIPT="${SCRIPT_DIR}/btng-cli.py"
if [[ ! -f "${CLI_SCRIPT}" ]]; then
  warn "btng-cli.py not found — skipping verification."
else
  if grep -q "derive_tier_from_key" "${CLI_SCRIPT}"; then
    success "CLI context builder: derive_tier_from_key wired ✓"
  else
    warn "derive_tier_from_key not found in btng-cli.py — manual patch may be required."
    warn "See: _build_cli_context() in btng-cli.py"
  fi

  if grep -q "brain.law.identity" "${CLI_SCRIPT}"; then
    success "CLI import path: brain.law.identity found ✓"
  else
    warn "brain.law.identity import not found — btng-ai-brain package path required."
  fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# STEP 3 — ENROLL COUNCIL IDENTITY (tier = COUNCIL_TIER)
# python3 -c "... enroll_operator(tier=5) ..."
# ──────────────────────────────────────────────────────────────────────────────
header "STEP 3 · ENROLL COUNCIL IDENTITY  (tier ${COUNCIL_TIER})"

ENROLL_SCRIPT="${BRAIN_DIR}/enroll_council.py"
IDENTITY_FILE="${HOME}/.btng/sovereign.id"

if [[ -f "${IDENTITY_FILE}" ]]; then
  EXISTING_TIER=$(BTNG_NODE_ID="${NODE_ID}" ${PYTHON} - <<'PYEOF' 2>/dev/null || echo "?"
import sys, os
sys.path.insert(0, os.path.join(os.getcwd(), "btng-ai-brain"))
try:
    from btng_ai_brain.core.identity import derive_tier_from_key
except ImportError:
    from core.identity import derive_tier_from_key
print(derive_tier_from_key(os.environ.get("BTNG_SOVEREIGN_KEY")))
PYEOF
  )
  info "Existing identity at ${IDENTITY_FILE}  (resolved tier: ${EXISTING_TIER})"

  if [[ "${EXISTING_TIER}" == "${COUNCIL_TIER}" ]]; then
    success "Tier ${COUNCIL_TIER} identity already enrolled — skipping re-enrollment."
  else
    info "Re-enrolling as tier ${COUNCIL_TIER} (was ${EXISTING_TIER})..."
    BTNG_NODE_ID="${NODE_ID}" ${PYTHON} - <<PYEOF
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath("${BRAIN_DIR}")), "btng-ai-brain"))
sys.path.insert(0, "${BRAIN_DIR}")
try:
    from btng_ai_brain.core.identity import enroll_operator
except ImportError:
    from core.identity import enroll_operator
from pathlib import Path
enroll_operator(tier=${COUNCIL_TIER})
PYEOF
    success "Council tier ${COUNCIL_TIER} identity enrolled at ${IDENTITY_FILE} ✓"
  fi
else
  info "No existing identity found — enrolling tier ${COUNCIL_TIER}..."
  cd "${BRAIN_DIR}" && BTNG_NODE_ID="${NODE_ID}" ${PYTHON} - <<PYEOF
import sys, os
sys.path.insert(0, ".")
try:
    from btng_ai_brain.core.identity import enroll_operator
except ImportError:
    from core.identity import enroll_operator
from pathlib import Path
enroll_operator(tier=${COUNCIL_TIER})
PYEOF
  cd "${SCRIPT_DIR}"
  success "Council tier ${COUNCIL_TIER} identity enrolled ✓"
fi

# Verify the enrolled tier resolves correctly
RESOLVED_TIER=$(cd "${BRAIN_DIR}" && BTNG_NODE_ID="${NODE_ID}" ${PYTHON} - <<'PYEOF' 2>/dev/null || echo "1"
import sys, os
sys.path.insert(0, ".")
try:
    from btng_ai_brain.core.identity import derive_tier_from_key
except ImportError:
    from core.identity import derive_tier_from_key
print(derive_tier_from_key(os.environ.get("BTNG_SOVEREIGN_KEY")))
PYEOF
)
info "Identity resolves to tier: ${RESOLVED_TIER}"
[[ "${RESOLVED_TIER}" == "${COUNCIL_TIER}" ]] && success "Tier ${COUNCIL_TIER} verified ✓" || warn "Expected tier ${COUNCIL_TIER}, got ${RESOLVED_TIER} — check sovereign.id"

# ──────────────────────────────────────────────────────────────────────────────
# STEP 4 — RUN WDB GATE STRESS TEST
# python3 tests/stress_wdb_gate.py
# ──────────────────────────────────────────────────────────────────────────────
header "STEP 4 · WDB GATE STRESS TEST"

STRESS_SCRIPT="${BRAIN_DIR}/tests/stress_wdb_gate.py"

if [[ "${SKIP_STRESS}" == "1" ]]; then
  warn "SKIP_STRESS=1 — skipping stress test."
elif [[ ! -f "${STRESS_SCRIPT}" ]]; then
  warn "stress_wdb_gate.py not found at ${STRESS_SCRIPT} — skipping."
else
  info "Running WDB gate stress test (1,000 evaluations)..."
  set +e
  cd "${BRAIN_DIR}" && BTNG_NODE_ID="${NODE_ID}" ${PYTHON} "tests/stress_wdb_gate.py"
  STRESS_EXIT=$?
  cd "${SCRIPT_DIR}"
  set -e

  if [[ "${STRESS_EXIT}" -eq 0 ]]; then
    success "WDB gate stress test PASSED — law is hardened ✓"
  else
    fail "WDB gate stress test FAILED (exit ${STRESS_EXIT}). Do not scale — fix core/router.py first."
  fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# STEP 5 — OPEN SOVEREIGN PORT 38982 (restricted iptables)
# sudo iptables -I INPUT -p tcp --dport 38982 -s 154.161.183.0/24 -j ACCEPT
# sudo iptables -I INPUT -p tcp --dport 38982 -j DROP
# ──────────────────────────────────────────────────────────────────────────────
header "STEP 5 · SOVEREIGN FIREWALL — PORT ${SOVEREIGN_PORT}"

apply_firewall() {
  # Remove duplicates first
  iptables -D INPUT -p tcp --dport "${SOVEREIGN_PORT}" -s "${TRUSTED_CIDR}" -j ACCEPT 2>/dev/null || true
  iptables -D INPUT -p tcp --dport "${SOVEREIGN_PORT}" -j DROP 2>/dev/null || true

  # Insert: DROP first (lowest priority in INPUT), then ACCEPT trusted CIDR (highest)
  iptables -I INPUT -p tcp --dport "${SOVEREIGN_PORT}" -j DROP
  iptables -I INPUT -p tcp --dport "${SOVEREIGN_PORT}" -s "${TRUSTED_CIDR}" -j ACCEPT

  success "iptables rules applied:"
  info "  ACCEPT : ${TRUSTED_CIDR} → port ${SOVEREIGN_PORT}"
  info "  DROP   : all other sources → port ${SOVEREIGN_PORT}"

  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save
    success "Rules persisted via netfilter-persistent ✓"
  elif command -v iptables-save >/dev/null 2>&1; then
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
    info "Rules saved to /etc/iptables/rules.v4"
    warn "Install iptables-persistent to auto-restore on reboot:"
    warn "  sudo apt-get install -y iptables-persistent"
  fi
}

print_firewall_manual() {
  warn "Manual firewall commands:"
  echo ""
  echo "  sudo iptables -I INPUT -p tcp --dport ${SOVEREIGN_PORT} -s ${TRUSTED_CIDR} -j ACCEPT"
  echo "  sudo iptables -I INPUT -p tcp --dport ${SOVEREIGN_PORT} -j DROP"
  echo ""
  echo "  # Persist (Debian/Ubuntu):"
  echo "  sudo apt-get install -y iptables-persistent"
  echo "  sudo netfilter-persistent save"
  echo ""
}

if [[ "${SKIP_FIREWALL}" == "1" ]]; then
  warn "SKIP_FIREWALL=1 — skipping firewall step."
  print_firewall_manual
elif ! command -v iptables >/dev/null 2>&1; then
  warn "iptables not available (non-Linux or container environment)."
  print_firewall_manual
elif [[ "${EUID}" -ne 0 ]]; then
  warn "Not running as root — cannot apply firewall rules automatically."
  print_firewall_manual
else
  apply_firewall
fi

# ──────────────────────────────────────────────────────────────────────────────
# STEP 6 — SYNC TO ALL 54 MESH NODES
# btng-cli.py mesh sync --anchor 154.161.183.158
# ──────────────────────────────────────────────────────────────────────────────
header "STEP 6 · SYNC TO ALL 54 MESH NODES"

CLI_SCRIPT="${SCRIPT_DIR}/btng-cli.py"

if [[ "${SKIP_SYNC}" == "1" ]]; then
  warn "SKIP_SYNC=1 — skipping mesh sync."
elif [[ ! -f "${CLI_SCRIPT}" ]]; then
  warn "btng-cli.py not found — skipping mesh sync."
  warn "Run manually:  python3 btng-cli.py mesh sync --anchor 154.161.183.158"
else
  info "Running: btng-cli.py mesh sync --anchor 154.161.183.158"
  set +e
  BTNG_NODE_ID="${NODE_ID}" ${PYTHON} "${CLI_SCRIPT}" mesh sync --anchor 154.161.183.158 2>&1
  SYNC_EXIT=$?
  set -e

  if [[ "${SYNC_EXIT}" -eq 0 ]]; then
    success "Mesh sync complete ✓  — all reachable nodes checked"
  else
    warn "Mesh sync exited with code ${SYNC_EXIT} (Brain Router may be offline in bootstrap mode — nodes will sync on next heartbeat)"
  fi
fi

# ──────────────────────────────────────────────────────────────────────────────
# GENESIS ANCHOR — write / confirm journal origin after all steps
# ──────────────────────────────────────────────────────────────────────────────
header "GENESIS ANCHOR — FINAL VERIFY"

ANCHOR_SCRIPT="${BRAIN_DIR}/anchor_genesis.py"
if [[ -f "${ANCHOR_SCRIPT}" ]]; then
  BTNG_NODE_ID="${NODE_ID}" ${PYTHON} "${ANCHOR_SCRIPT}"
  success "Genesis anchor written / confirmed ✓"
fi

# Post-anchor tamper check — confirms the anchor round-trips correctly
if [[ -f "${VERIFY_SCRIPT}" && -f "${JOURNAL_FILE}" ]]; then
  info "Running post-anchor genesis verification ..."
  set +e
  BTNG_JOURNAL="${JOURNAL_FILE}" \
  BTNG_NODE_ID="${NODE_ID}" \
  "${PYTHON}" "${VERIFY_SCRIPT}" --journal "${JOURNAL_FILE}"
  POST_VERIFY_EXIT=$?
  set -e

  if [[ "${POST_VERIFY_EXIT}" -eq 0 ]]; then
    success "Post-anchor tamper check PASSED ✓  — genesis is sovereign"
  else
    warn "Post-anchor tamper check returned exit ${POST_VERIFY_EXIT} — review anchor_genesis.py output above."
  fi
fi

RULING_COUNT="$(wc -l < "${JOURNAL_FILE}" 2>/dev/null | tr -d ' ' || echo 0)"

# ──────────────────────────────────────────────────────────────────────────────
# BOOTSTRAP COMPLETE
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║  ✅  BTNG SOVEREIGN NODE — BOOTSTRAP COMPLETE  ·  v2.1             ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Node            :${RESET} ${NODE_ID}"
echo -e "  ${BOLD}Identity tier   :${RESET} ${COUNCIL_TIER}  (~/.btng/sovereign.id)"
echo -e "  ${BOLD}Law Journal     :${RESET} ${JOURNAL_FILE}  (${RULING_COUNT} ruling(s))"
echo -e "  ${BOLD}Sovereign port  :${RESET} ${SOVEREIGN_PORT}  (${TRUSTED_CIDR} only)"
echo -e "  ${BOLD}Genesis hash    :${RESET} ${CANONICAL_GENESIS_HASH}"
echo ""
echo -e "  ${BOLD}Next commands:${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py identity whoami${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py mesh sync${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py mesh health-check --src_ip 154.161.183.158${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py banker perpetual-run --anchor GH${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py governance export-audit${RESET}"
echo ""
echo -e "  ${BOLD}Monitor the Law Journal:${RESET}"
echo -e "    ${CYAN}tail -f ${JOURNAL_FILE}${RESET}"
echo -e "    ${CYAN}grep '\"ruling\": \"DENY\"' ${JOURNAL_FILE} | wc -l${RESET}"
echo ""
echo -e "  ${BOLD}Re-run tamper check at any time:${RESET}"
echo -e "    ${CYAN}python3 ${BRAIN_DIR}/log/verify_genesis.py --verbose${RESET}"
echo ""
echo -e "  ${BOLD}The AI is not loose. It is clerk to your court.${RESET}"
echo -e "  ${BOLD}The operators are too.${RESET}"
echo ""
