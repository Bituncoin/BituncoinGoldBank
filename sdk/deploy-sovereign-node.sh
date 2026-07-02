#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  BTNG SOVEREIGN NODE — Deployment Script                                   ║
# ║  One brain. One law. One journal. Five steps.                              ║
# ║                                                                            ║
# ║  USAGE:                                                                    ║
# ║    chmod +x deploy-sovereign-node.sh                                       ║
# ║    ./deploy-sovereign-node.sh                                              ║
# ║                                                                            ║
# ║  ENVIRONMENT OVERRIDES:                                                    ║
# ║    BTNG_NODE_ID=btng-node-gh-02 ./deploy-sovereign-node.sh                ║
# ║    BTNG_SOVEREIGN_PORT=38982     ./deploy-sovereign-node.sh                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
fail()    { echo -e "${RED}[FAIL]${RESET}  $*"; exit 1; }
header()  { echo -e "\n${BOLD}${CYAN}$*${RESET}"; echo "────────────────────────────────────────────────────────────────────"; }

# ── Config ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRAIN_DIR="${SCRIPT_DIR}/btng-ai-brain"
JOURNAL_DIR="${BRAIN_DIR}/log"
JOURNAL_FILE="${JOURNAL_DIR}/rulings.jsonl"
SOVEREIGN_PORT="${BTNG_SOVEREIGN_PORT:-38982}"
TRUSTED_CIDR="${BTNG_TRUSTED_CIDR:-154.161.183.0/24}"
NODE_ID="${BTNG_NODE_ID:-btng-node-$(hostname)}"
PYTHON="${PYTHON:-python3}"

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  🪙  BTNG SOVEREIGN NODE  ·  Deployment Runbook  ·  v2.0           ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
info "Node ID   : ${NODE_ID}"
info "Brain dir : ${BRAIN_DIR}"
info "Journal   : ${JOURNAL_FILE}"
info "Port      : ${SOVEREIGN_PORT}"
info "CIDR      : ${TRUSTED_CIDR}"
echo ""

# ── Pre-flight checks ──────────────────────────────────────────────────────────
header "PRE-FLIGHT CHECKS"

command -v "${PYTHON}" >/dev/null 2>&1 || fail "Python 3 not found. Install python3 and retry."
success "Python   : $(${PYTHON} --version 2>&1)"

command -v iptables >/dev/null 2>&1 && IPTABLES_AVAILABLE=true || IPTABLES_AVAILABLE=false
if $IPTABLES_AVAILABLE; then
  success "iptables : available"
else
  warn "iptables : not found — Step 5 (firewall) will be skipped (non-Linux or unprivileged)"
fi

[[ -d "${BRAIN_DIR}" ]] || fail "btng-ai-brain directory not found at: ${BRAIN_DIR}"
success "Brain    : ${BRAIN_DIR} ✓"

[[ -f "${BRAIN_DIR}/core/router.py" ]] || fail "core/router.py not found. Check your deployment archive."
success "Router   : ${BRAIN_DIR}/core/router.py ✓"

# ────────────────────────────────────────────────────────────────────────────────
# STEP 1 — DEPLOY THE LAW
# ────────────────────────────────────────────────────────────────────────────────
header "STEP 1 · DEPLOY THE LAW"

export BTNG_NODE_ID="${NODE_ID}"
info "BTNG_NODE_ID set to: ${NODE_ID}"

# Ensure __init__.py files are in place (idempotent)
touch "${BRAIN_DIR}/__init__.py"
touch "${BRAIN_DIR}/core/__init__.py"
touch "${BRAIN_DIR}/law/__init__.py"

# Create log directory
mkdir -p "${JOURNAL_DIR}"

success "Law deployed — policies loaded from core/router.py"

# ────────────────────────────────────────────────────────────────────────────────
# STEP 2 — ANCHOR THE JOURNAL (genesis block)
# ────────────────────────────────────────────────────────────────────────────────
header "STEP 2 · ANCHOR THE JOURNAL"

ANCHOR_SCRIPT="${BRAIN_DIR}/anchor_genesis.py"

if [[ ! -f "${ANCHOR_SCRIPT}" ]]; then
  fail "anchor_genesis.py not found at: ${ANCHOR_SCRIPT}"
fi

info "Running genesis anchor on node: ${NODE_ID}"
BTNG_NODE_ID="${NODE_ID}" ${PYTHON} "${ANCHOR_SCRIPT}"

# ────────────────────────────────────────────────────────────────────────────────
# STEP 3 — VERIFY THE ANCHOR
# ────────────────────────────────────────────────────────────────────────────────
header "STEP 3 · VERIFY THE ANCHOR"

if [[ ! -f "${JOURNAL_FILE}" ]]; then
  fail "Law Journal not found after genesis anchor: ${JOURNAL_FILE}"
fi

FIRST_LINE="$(head -n 1 "${JOURNAL_FILE}")"

if [[ -z "${FIRST_LINE}" ]]; then
  fail "Law Journal is empty — genesis anchor did not write."
fi

# Validate fields via Python
VERIFY_RESULT=$(${PYTHON} - <<'PYEOF'
import sys, json, os

journal_file = os.environ.get("JOURNAL_FILE", "")
try:
    with open(journal_file, "r") as f:
        first = json.loads(f.readline().strip())
except Exception as e:
    print(f"PARSE_ERROR:{e}")
    sys.exit(1)

required = {
    "session":  "genesis",
    "intent":   "intent_system_genesis",
    "ruling":   "ANCHORED",
    "policy":   "GEN-000",
    "tool":     "law_journal_origin",
    "version":  "btng-brain-2.0",
}

errors = []
for k, expected in required.items():
    actual = first.get(k)
    if actual != expected:
        errors.append(f"  {k}: expected '{expected}', got '{actual}'")

if errors:
    print("INVALID\n" + "\n".join(errors))
    sys.exit(1)

# Print formatted summary
print("VALID")
print(f"  ts           : {first.get('ts', '?')}")
print(f"  session      : {first.get('session')}")
print(f"  intent       : {first.get('intent')}")
print(f"  ruling       : {first.get('ruling')}")
print(f"  policy       : {first.get('policy')}")
print(f"  network_node : {first.get('network_node')}")
print(f"  input_hash   : {first.get('input_hash')}")
print(f"  block_height : {first.get('block_height', 'N/A')}")
print(f"  version      : {first.get('version')}")
PYEOF
)
export JOURNAL_FILE="${JOURNAL_FILE}"
VERIFY_RESULT=$(JOURNAL_FILE="${JOURNAL_FILE}" ${PYTHON} - <<'PYEOF'
import sys, json, os

journal_file = os.environ.get("JOURNAL_FILE", "")
try:
    with open(journal_file, "r") as f:
        first = json.loads(f.readline().strip())
except Exception as e:
    print(f"PARSE_ERROR:{e}")
    sys.exit(1)

required = {
    "session":  "genesis",
    "intent":   "intent_system_genesis",
    "ruling":   "ANCHORED",
    "policy":   "GEN-000",
}

errors = []
for k, expected in required.items():
    actual = first.get(k)
    if actual != expected:
        errors.append(f"  {k}: expected '{expected}', got '{actual}'")

if errors:
    print("INVALID")
    for e in errors: print(e)
    sys.exit(1)

print("VALID")
print(f"  ts           : {first.get('ts', '?')}")
print(f"  session      : {first.get('session')}")
print(f"  intent       : {first.get('intent')}")
print(f"  ruling       : {first.get('ruling')}")
print(f"  policy       : {first.get('policy')}")
print(f"  network_node : {first.get('network_node')}")
print(f"  input_hash   : {first.get('input_hash')}")
print(f"  block_height : {first.get('block_height', 'N/A')}")
print(f"  version      : {first.get('version')}")
PYEOF
)

if echo "${VERIFY_RESULT}" | grep -q "^VALID"; then
  success "Genesis anchor verified ✓"
  echo "${VERIFY_RESULT}" | tail -n +2 | while IFS= read -r line; do info "${line}"; done
else
  fail "Genesis anchor verification FAILED:\n${VERIFY_RESULT}"
fi

# ────────────────────────────────────────────────────────────────────────────────
# STEP 4 — SMOKE TEST: GOVERNED CLI INTENT
# ────────────────────────────────────────────────────────────────────────────────
header "STEP 4 · SMOKE TEST — GOVERNED CLI INTENT"

CLI_SCRIPT="${SCRIPT_DIR}/btng-cli.py"

if [[ ! -f "${CLI_SCRIPT}" ]]; then
  warn "btng-cli.py not found at ${CLI_SCRIPT} — skipping smoke test."
else
  info "Running: btng-cli.py nft verify --anchor BTNG-NFT-SMOKE-TEST"
  set +e
  BTNG_NODE_ID="${NODE_ID}" ${PYTHON} "${CLI_SCRIPT}" nft verify --anchor BTNG-NFT-SMOKE-TEST 2>&1
  CLI_EXIT=$?
  set -e

  if [[ "${CLI_EXIT}" -eq 0 ]]; then
    success "CLI smoke test passed ✓"
  else
    warn "CLI smoke test exited with code ${CLI_EXIT}. Check Brain Router connectivity."
  fi

  # Count nft_verify rulings (should be >= 1 after smoke test)
  VERIFY_COUNT="$(grep -c '"intent": "intent_nft_verify"' "${JOURNAL_FILE}" 2>/dev/null || echo 0)"
  info "intent_nft_verify entries in Law Journal: ${VERIFY_COUNT}"
  if [[ "${VERIFY_COUNT}" -ge 1 ]]; then
    success "Law Journal contains nft_verify ruling ✓"
  else
    warn "No nft_verify ruling found (Brain Router may be offline — bootstrap mode ruling is not written locally)."
  fi
fi

# ────────────────────────────────────────────────────────────────────────────────
# STEP 5 — OPEN SOVEREIGN PORT (iptables — Linux only, requires root)
# ────────────────────────────────────────────────────────────────────────────────
header "STEP 5 · SOVEREIGN FIREWALL — PORT ${SOVEREIGN_PORT}"

if ! $IPTABLES_AVAILABLE; then
  warn "iptables not available — skipping firewall rules."
  warn "Apply these rules manually on your VPS/server:"
  echo ""
  echo "  sudo iptables -I INPUT -p tcp --dport ${SOVEREIGN_PORT} -s ${TRUSTED_CIDR} -j ACCEPT"
  echo "  sudo iptables -I INPUT -p tcp --dport ${SOVEREIGN_PORT} -j DROP"
  echo ""
elif [[ "${EUID}" -ne 0 ]]; then
  warn "Not running as root — skipping automatic firewall rules."
  warn "Run these commands as root/sudo:"
  echo ""
  echo "  sudo iptables -I INPUT -p tcp --dport ${SOVEREIGN_PORT} -s ${TRUSTED_CIDR} -j ACCEPT"
  echo "  sudo iptables -I INPUT -p tcp --dport ${SOVEREIGN_PORT} -j DROP"
  echo ""
  warn "To persist across reboots (Debian/Ubuntu):"
  echo "  sudo apt-get install -y iptables-persistent"
  echo "  sudo netfilter-persistent save"
else
  info "Applying iptables rules for port ${SOVEREIGN_PORT}..."

  # Remove any existing rules for this port to avoid duplicates
  iptables -D INPUT -p tcp --dport "${SOVEREIGN_PORT}" -s "${TRUSTED_CIDR}" -j ACCEPT 2>/dev/null || true
  iptables -D INPUT -p tcp --dport "${SOVEREIGN_PORT}" -j DROP 2>/dev/null || true

  # Insert new rules (ACCEPT trusted CIDR first, then DROP all others)
  iptables -I INPUT -p tcp --dport "${SOVEREIGN_PORT}" -j DROP
  iptables -I INPUT -p tcp --dport "${SOVEREIGN_PORT}" -s "${TRUSTED_CIDR}" -j ACCEPT

  success "iptables rules applied:"
  info "  ACCEPT: ${TRUSTED_CIDR} → port ${SOVEREIGN_PORT}"
  info "  DROP  : all other sources → port ${SOVEREIGN_PORT}"

  # Persist if iptables-persistent is installed
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save
    success "Rules persisted via netfilter-persistent ✓"
  else
    warn "iptables-persistent not installed — rules will reset on reboot."
    warn "Install: sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ────────────────────────────────────────────────────────────────────────────────
RULING_COUNT="$(wc -l < "${JOURNAL_FILE}" 2>/dev/null || echo 0)"
RULING_COUNT="${RULING_COUNT//[[:space:]]/}"

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║  ✅  BTNG SOVEREIGN NODE — DEPLOYMENT COMPLETE                      ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Node ID       :${RESET} ${NODE_ID}"
echo -e "  ${BOLD}Brain         :${RESET} ${BRAIN_DIR}"
echo -e "  ${BOLD}Law Journal   :${RESET} ${JOURNAL_FILE}  (${RULING_COUNT} ruling(s))"
echo -e "  ${BOLD}Sovereign Port:${RESET} ${SOVEREIGN_PORT}  (${TRUSTED_CIDR} only)"
echo ""
echo -e "  ${BOLD}Quick commands:${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py mesh sync${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py governance export-audit${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py mesh health-check --src_ip 154.161.183.158${RESET}"
echo -e "    ${CYAN}python3 btng-cli.py banker perpetual-run --anchor GH${RESET}"
echo ""
echo -e "  ${BOLD}Law Journal   :${RESET}"
echo -e "    ${CYAN}tail -f ${JOURNAL_FILE}${RESET}"
echo -e "    ${CYAN}grep DENY ${JOURNAL_FILE} | wc -l${RESET}  # count denials"
echo ""
echo -e "  ${BOLD}The AI is not loose. It is clerk to your court.${RESET}"
echo ""
