#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  BTNG SOVEREIGN MESH — Multi-Node Deployment Script  ·  v1.0              ║
# ║  Deploys node-bootstrap.sh to all 54 African mesh nodes in parallel.      ║
# ║                                                                            ║
# ║  USAGE:                                                                    ║
# ║    chmod +x deploy-all-nodes.sh                                            ║
# ║    ./deploy-all-nodes.sh                          # deploy all nodes       ║
# ║    ./deploy-all-nodes.sh --nodes custom.txt       # custom node list       ║
# ║    ./deploy-all-nodes.sh --dry-run                # preview without SSH    ║
# ║    ./deploy-all-nodes.sh --serial                 # disable parallel mode  ║
# ║    COUNCIL_TIER=5 ./deploy-all-nodes.sh           # override tier          ║
# ║                                                                            ║
# ║  NODES FILE FORMAT (nodes.txt, one SSH target per line):                  ║
# ║    user@IP_OR_HOST                                                         ║
# ║    user@IP_OR_HOST:PORT                                                    ║
# ║    # comment lines and blank lines are ignored                             ║
# ║                                                                            ║
# ║  ENVIRONMENT OVERRIDES:                                                    ║
# ║    COUNCIL_TIER=3          (default 3 for mesh operators)                  ║
# ║    SKIP_FIREWALL=0         (default 0 — apply iptables on each node)       ║
# ║    SKIP_STRESS=0           (default 0 — run WDB gate test on each node)    ║
# ║    SKIP_SYNC=1             (default 1 — let anchor handle sync later)      ║
# ║    SSH_KEY=~/.ssh/btng_mesh                                                ║
# ║    SSH_TIMEOUT=30          (seconds per SSH operation)                     ║
# ║    REMOTE_WORK_DIR=/opt/btng/sovereign                                     ║
# ║    MAX_PARALLEL=8          (max concurrent SSH deployments)                ║
# ║    BTNG_GENESIS_HASH=0x11…  (override genesis hash for all nodes)          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m';    GREEN='\033[0;32m';  YELLOW='\033[1;33m'
CYAN='\033[0;36m';   BLUE='\033[0;34m';  MAGENTA='\033[0;35m'
BOLD='\033[1m';      DIM='\033[2m';       RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
fail()    { echo -e "${RED}[FAIL]${RESET}  $*" >&2; exit 1; }
dim()     { echo -e "${DIM}$*${RESET}"; }

# ── Argument parsing ───────────────────────────────────────────────────────────
NODES_FILE=""
DRY_RUN=0
SERIAL=0
SHOW_HELP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --nodes|-n)   NODES_FILE="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=1; shift ;;
    --serial)     SERIAL=1; shift ;;
    --help|-h)    SHOW_HELP=1; shift ;;
    *)            warn "Unknown argument: $1"; SHOW_HELP=1; shift ;;
  esac
done

if [[ "${SHOW_HELP}" -eq 1 ]]; then
  echo ""
  echo "Usage: ./deploy-all-nodes.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --nodes FILE     Path to nodes file (default: nodes.txt next to this script)"
  echo "  --dry-run        Preview what would be deployed without running SSH"
  echo "  --serial         Deploy nodes one at a time instead of in parallel"
  echo "  --help           Show this help"
  echo ""
  echo "See script header for environment variable overrides."
  echo ""
  exit 0
fi

# ── Config ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_SCRIPT="${SCRIPT_DIR}/node-bootstrap.sh"
BRAIN_DIR="${SCRIPT_DIR}/btng-ai-brain"
NODES_FILE="${NODES_FILE:-${SCRIPT_DIR}/nodes.txt}"
REPORT_DIR="${SCRIPT_DIR}/.deploy-reports"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
REPORT_FILE="${REPORT_DIR}/deploy_${TIMESTAMP}.log"

# Remote settings
COUNCIL_TIER="${COUNCIL_TIER:-3}"
SKIP_FIREWALL="${SKIP_FIREWALL:-0}"
SKIP_STRESS="${SKIP_STRESS:-0}"
SKIP_SYNC="${SKIP_SYNC:-1}"
SSH_KEY="${SSH_KEY:-}"
SSH_TIMEOUT="${SSH_TIMEOUT:-30}"
REMOTE_WORK_DIR="${REMOTE_WORK_DIR:-/opt/btng/sovereign}"
MAX_PARALLEL="${MAX_PARALLEL:-8}"
BTNG_GENESIS_HASH="${BTNG_GENESIS_HASH:-0x1111111111111111111111111111111111111111111111111111111111111111}"
PYTHON="python3"

# ── Runtime state ──────────────────────────────────────────────────────────────
declare -A NODE_STATUS        # ip → PASS | FAIL | SKIP | DRY
declare -A NODE_TIER          # ip → resolved tier (string)
declare -A NODE_RULING_COUNT  # ip → ruling count (string)
declare -A NODE_EXIT          # ip → exit code
declare -A NODE_DURATION      # ip → seconds
declare -A NODE_ERROR         # ip → error message
declare -a NODE_LIST          # ordered list of targets

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ── SSH helper — builds ssh options array ──────────────────────────────────────
ssh_opts() {
  local opts=(
    -o "StrictHostKeyChecking=no"
    -o "BatchMode=yes"
    -o "ConnectTimeout=${SSH_TIMEOUT}"
    -o "ServerAliveInterval=15"
    -o "ServerAliveCountMax=3"
  )
  [[ -n "${SSH_KEY}" ]] && opts+=(-i "${SSH_KEY}")
  echo "${opts[@]}"
}

# Parse user@host:port → user, host, port
parse_target() {
  local target="$1"
  local user_host port="22"
  if [[ "${target}" =~ ^(.+):([0-9]+)$ ]]; then
    user_host="${BASH_REMATCH[1]}"
    port="${BASH_REMATCH[2]}"
  else
    user_host="${target}"
  fi
  echo "${user_host} ${port}"
}

# ── Load nodes from file ───────────────────────────────────────────────────────
load_nodes() {
  if [[ ! -f "${NODES_FILE}" ]]; then
    fail "Nodes file not found: ${NODES_FILE}\n  Create it with one SSH target per line: user@IP"
  fi

  while IFS= read -r line || [[ -n "${line}" ]]; do
    # Strip whitespace, skip blanks and comments
    line="${line//[$'\t\r\n']/}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "${line}" ]] && continue
    [[ "${line}" == \#* ]] && continue
    NODE_LIST+=("${line}")
  done < "${NODES_FILE}"

  if [[ "${#NODE_LIST[@]}" -eq 0 ]]; then
    fail "No valid node targets found in: ${NODES_FILE}"
  fi
}

# ── Deploy to a single node ────────────────────────────────────────────────────
deploy_node() {
  local target="$1"
  local log_file="${REPORT_DIR}/node_${target//[@:\/]/_}_${TIMESTAMP}.log"
  local start_time end_time elapsed

  start_time="$(date +%s)"

  # ── DRY RUN ──────────────────────────────────────────────────────────────────
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    NODE_STATUS["${target}"]="DRY"
    NODE_TIER["${target}"]="${COUNCIL_TIER}"
    NODE_RULING_COUNT["${target}"]="N/A"
    NODE_EXIT["${target}"]=0
    NODE_DURATION["${target}"]=0
    NODE_ERROR["${target}"]="dry-run"
    return 0
  fi

  # ── Parse target ─────────────────────────────────────────────────────────────
  read -r user_host port <<< "$(parse_target "${target}")"

  # ── Build SSH options ─────────────────────────────────────────────────────────
  local ssh_opt_str
  ssh_opt_str="$(ssh_opts)"

  {
    echo "══════════════════════════════════════════════════════════════"
    echo "  TARGET  : ${target}"
    echo "  TIME    : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "  TIER    : ${COUNCIL_TIER}"
    echo "  WORK_DIR: ${REMOTE_WORK_DIR}"
    echo "══════════════════════════════════════════════════════════════"
  } >> "${log_file}" 2>&1

  # ── Step A: Ensure remote working directory ───────────────────────────────────
  # shellcheck disable=SC2086
  if ! ssh -p "${port}" ${ssh_opt_str} "${user_host}" \
       "mkdir -p '${REMOTE_WORK_DIR}/btng-ai-brain/core' \
               '${REMOTE_WORK_DIR}/btng-ai-brain/law' \
               '${REMOTE_WORK_DIR}/btng-ai-brain/brain/law' \
               '${REMOTE_WORK_DIR}/btng-ai-brain/log' \
               '${REMOTE_WORK_DIR}/btng-ai-brain/tests'" \
       >> "${log_file}" 2>&1; then
    end_time="$(date +%s)"
    NODE_STATUS["${target}"]="FAIL"
    NODE_TIER["${target}"]="N/A"
    NODE_RULING_COUNT["${target}"]="N/A"
    NODE_EXIT["${target}"]=1
    NODE_DURATION["${target}"]="$((end_time - start_time))"
    NODE_ERROR["${target}"]="SSH mkdir failed — connection refused or auth error"
    return 1
  fi

  # ── Step B: SCP bootstrap script + brain directory ───────────────────────────
  local scp_opts=()
  [[ -n "${SSH_KEY}" ]] && scp_opts+=(-i "${SSH_KEY}")
  scp_opts+=(
    -P "${port}"
    -o "StrictHostKeyChecking=no"
    -o "BatchMode=yes"
    -o "ConnectTimeout=${SSH_TIMEOUT}"
    -r
  )

  # Upload bootstrap script
  if ! scp "${scp_opts[@]}" \
       "${BOOTSTRAP_SCRIPT}" \
       "${user_host}:${REMOTE_WORK_DIR}/node-bootstrap.sh" \
       >> "${log_file}" 2>&1; then
    end_time="$(date +%s)"
    NODE_STATUS["${target}"]="FAIL"
    NODE_TIER["${target}"]="N/A"
    NODE_RULING_COUNT["${target}"]="N/A"
    NODE_EXIT["${target}"]=2
    NODE_DURATION["${target}"]="$((end_time - start_time))"
    NODE_ERROR["${target}"]="SCP node-bootstrap.sh failed"
    return 1
  fi

  # Upload btng-ai-brain directory (contains router, identity, tests etc.)
  if [[ -d "${BRAIN_DIR}" ]]; then
    if ! scp "${scp_opts[@]}" \
         "${BRAIN_DIR}" \
         "${user_host}:${REMOTE_WORK_DIR}/" \
         >> "${log_file}" 2>&1; then
      end_time="$(date +%s)"
      NODE_STATUS["${target}"]="FAIL"
      NODE_TIER["${target}"]="N/A"
      NODE_RULING_COUNT["${target}"]="N/A"
      NODE_EXIT["${target}"]=2
      NODE_DURATION["${target}"]="$((end_time - start_time))"
      NODE_ERROR["${target}"]="SCP btng-ai-brain/ failed"
      return 1
    fi
  fi

  # ── Step C: Run bootstrap remotely ───────────────────────────────────────────
  local remote_cmd
  remote_cmd=$(cat <<EOF
set -euo pipefail
cd '${REMOTE_WORK_DIR}'
chmod +x node-bootstrap.sh
COUNCIL_TIER=${COUNCIL_TIER} \
SKIP_FIREWALL=${SKIP_FIREWALL} \
SKIP_STRESS=${SKIP_STRESS} \
SKIP_SYNC=${SKIP_SYNC} \
BTNG_GENESIS_HASH='${BTNG_GENESIS_HASH}' \
BTNG_NODE_ID="btng-node-\$(hostname -s)" \
  bash node-bootstrap.sh
EOF
)

  local bootstrap_exit=0
  # shellcheck disable=SC2086
  if ! ssh -p "${port}" ${ssh_opt_str} "${user_host}" "${remote_cmd}" \
       >> "${log_file}" 2>&1; then
    bootstrap_exit=$?
  fi

  # ── Step D: Collect resolved tier and ruling count ────────────────────────────
  local resolved_tier="N/A"
  local ruling_count="N/A"
  local collect_cmd
  collect_cmd=$(cat <<'EOF'
cd '${REMOTE_WORK_DIR}' 2>/dev/null || cd /opt/btng/sovereign 2>/dev/null || true
JOURNAL="${PWD}/btng-ai-brain/log/rulings.jsonl"
TIER=""

# Try to resolve tier from signed identity
if command -v python3 >/dev/null 2>&1 && [[ -f btng-ai-brain/core/identity.py ]]; then
  TIER=$(cd btng-ai-brain && python3 - <<'PYEOF' 2>/dev/null || echo "N/A"
import sys, os
sys.path.insert(0, ".")
try:
    from core.identity import derive_tier_from_key
except ImportError:
    print("N/A"); sys.exit(0)
print(derive_tier_from_key(os.environ.get("BTNG_SOVEREIGN_KEY")))
PYEOF
  )
fi

[[ -z "${TIER}" ]] && TIER="N/A"

# Count rulings
if [[ -f "${JOURNAL}" ]]; then
  COUNT=$(wc -l < "${JOURNAL}" | tr -d ' ')
else
  COUNT="0"
fi

echo "BTNG_TIER=${TIER}"
echo "BTNG_RULINGS=${COUNT}"
EOF
)
  # shellcheck disable=SC2086
  local collected
  collected=$(ssh -p "${port}" ${ssh_opt_str} "${user_host}" \
    "REMOTE_WORK_DIR='${REMOTE_WORK_DIR}'; $(printf '%s' "${collect_cmd}")" 2>/dev/null || true)

  while IFS= read -r cline; do
    case "${cline}" in
      BTNG_TIER=*)    resolved_tier="${cline#BTNG_TIER=}" ;;
      BTNG_RULINGS=*) ruling_count="${cline#BTNG_RULINGS=}" ;;
    esac
  done <<< "${collected}"

  end_time="$(date +%s)"
  elapsed="$((end_time - start_time))"

  NODE_TIER["${target}"]="${resolved_tier}"
  NODE_RULING_COUNT["${target}"]="${ruling_count}"
  NODE_DURATION["${target}"]="${elapsed}"
  NODE_EXIT["${target}"]="${bootstrap_exit}"

  if [[ "${bootstrap_exit}" -eq 0 ]]; then
    NODE_STATUS["${target}"]="PASS"
    NODE_ERROR["${target}"]=""
  else
    NODE_STATUS["${target}"]="FAIL"
    NODE_ERROR["${target}"]="bootstrap exit ${bootstrap_exit} — see ${log_file}"
  fi
}

# ── Progress printer for parallel mode ────────────────────────────────────────
print_node_result() {
  local target="$1"
  local status="${NODE_STATUS[${target}]:-UNKNOWN}"
  local tier="${NODE_TIER[${target}]:-N/A}"
  local rulings="${NODE_RULING_COUNT[${target}]:-N/A}"
  local secs="${NODE_DURATION[${target}]:-0}"
  local err="${NODE_ERROR[${target}]:-}"

  # Pad target to 40 chars
  local padded
  padded="$(printf '%-40s' "${target}")"

  case "${status}" in
    PASS) echo -e "  ${GREEN}✅ PASS${RESET}  ${padded}  tier=${BOLD}${tier}${RESET}  rulings=${BOLD}${rulings}${RESET}  (${secs}s)" ;;
    FAIL) echo -e "  ${RED}❌ FAIL${RESET}  ${padded}  tier=${tier}  rulings=${rulings}  (${secs}s)  ${DIM}${err}${RESET}" ;;
    SKIP) echo -e "  ${YELLOW}⏭  SKIP${RESET}  ${padded}  (skipped)" ;;
    DRY)  echo -e "  ${BLUE}🔵 DRY ${RESET}  ${padded}  tier=${tier}  rulings=N/A  (dry-run)" ;;
    *)    echo -e "  ${MAGENTA}❓ UNKN${RESET}  ${padded}" ;;
  esac
}

# ── Parallel deployment with MAX_PARALLEL semaphore ───────────────────────────
deploy_parallel() {
  local pids=()
  local targets=("$@")
  local semaphore=0

  for target in "${targets[@]}"; do
    # Throttle: wait if we've hit the parallel cap
    while [[ "${semaphore}" -ge "${MAX_PARALLEL}" ]]; do
      sleep 0.5
      # Recount active jobs
      local active=0
      for pid in "${pids[@]}"; do
        kill -0 "${pid}" 2>/dev/null && ((active++)) || true
      done
      semaphore="${active}"
    done

    (
      deploy_node "${target}"
    ) &
    pids+=($!)
    ((semaphore++))
    dim "  → Dispatched: ${target}  (jobs active: ${semaphore})"
  done

  # Wait for all background jobs
  local wait_exit=0
  for pid in "${pids[@]}"; do
    wait "${pid}" || wait_exit=$?
  done
}

# ── Final PASS/FAIL grid ────────────────────────────────────────────────────────
print_grid() {
  local total="${#NODE_LIST[@]}"

  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  BTNG SOVEREIGN MESH — DEPLOYMENT RESULTS  ·  ${TIMESTAMP}${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
  printf "  ${BOLD}%-5s  %-40s  %-8s  %-6s  %-9s  %s${RESET}\n" \
    "#" "NODE (SSH TARGET)" "STATUS" "TIER" "RULINGS" "TIME"
  echo -e "  ${DIM}$(printf '%.0s─' {1..90})${RESET}"

  local idx=1
  for target in "${NODE_LIST[@]}"; do
    local status="${NODE_STATUS[${target}]:-UNKNOWN}"
    local tier="${NODE_TIER[${target}]:-N/A}"
    local rulings="${NODE_RULING_COUNT[${target}]:-N/A}"
    local secs="${NODE_DURATION[${target}]:-0}"
    local err="${NODE_ERROR[${target}]:-}"

    local status_col
    case "${status}" in
      PASS) status_col="${GREEN}✅ PASS${RESET}" ;;
      FAIL) status_col="${RED}❌ FAIL${RESET}" ;;
      SKIP) status_col="${YELLOW}⏭  SKIP${RESET}" ;;
      DRY)  status_col="${BLUE}🔵  DRY${RESET}" ;;
      *)    status_col="${MAGENTA}❓ UNKN${RESET}" ;;
    esac

    local num
    num="$(printf '%3d' "${idx}")"

    printf "  ${DIM}%3s${RESET}  %-40s  " "${num}" "${target}"
    printf "${status_col}"
    printf "  %-6s  %-9s  %ss" "${tier}" "${rulings}" "${secs}"

    # Inline error hint for failures
    if [[ "${status}" == "FAIL" && -n "${err}" ]]; then
      printf "  ${DIM}%s${RESET}" "${err}"
    fi
    echo ""

    ((idx++))
  done

  echo -e "  ${DIM}$(printf '%.0s─' {1..90})${RESET}"
  echo ""

  # Tally
  PASS_COUNT=0; FAIL_COUNT=0; SKIP_COUNT=0
  for target in "${NODE_LIST[@]}"; do
    case "${NODE_STATUS[${target}]:-UNKNOWN}" in
      PASS|DRY) ((PASS_COUNT++)) ;;
      FAIL)     ((FAIL_COUNT++)) ;;
      SKIP)     ((SKIP_COUNT++)) ;;
    esac
  done

  echo -e "  ${BOLD}Summary: ${total} nodes total${RESET}"
  echo -e "    ${GREEN}${BOLD}PASS : ${PASS_COUNT}${RESET}"
  echo -e "    ${RED}${BOLD}FAIL : ${FAIL_COUNT}${RESET}"
  [[ "${SKIP_COUNT}" -gt 0 ]] && echo -e "    ${YELLOW}${BOLD}SKIP : ${SKIP_COUNT}${RESET}"
  [[ "${DRY_RUN}" -eq 1 ]]    && echo -e "    ${BLUE}${BOLD}(dry-run — no nodes contacted)${RESET}"
  echo ""

  if [[ "${FAIL_COUNT}" -eq 0 ]]; then
    echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${GREEN}║  ✅  ALL ${total} SOVEREIGN NODES DEPLOYED — MESH IS LIVE             ║${RESET}"
    echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
  else
    echo -e "${BOLD}${RED}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${RED}║  ⚠️   ${FAIL_COUNT} NODE(S) FAILED — REVIEW LOGS BEFORE SCALING           ║${RESET}"
    echo -e "${BOLD}${RED}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
    echo ""
    echo -e "  ${BOLD}Per-node logs:${RESET}"
    for target in "${NODE_LIST[@]}"; do
      [[ "${NODE_STATUS[${target}]:-}" == "FAIL" ]] || continue
      local slug="${target//[@:\/]/_}"
      echo -e "    ${DIM}${REPORT_DIR}/node_${slug}_${TIMESTAMP}.log${RESET}"
    done
  fi

  echo ""
  echo -e "  ${BOLD}Full report:${RESET} ${REPORT_FILE}"
  echo ""
}

# ── Write structured report ────────────────────────────────────────────────────
write_report() {
  {
    echo "BTNG SOVEREIGN MESH — DEPLOYMENT REPORT"
    echo "Generated  : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Nodes file : ${NODES_FILE}"
    echo "Total nodes: ${#NODE_LIST[@]}"
    echo "Council tier: ${COUNCIL_TIER}"
    echo "Dry-run    : ${DRY_RUN}"
    echo ""
    printf "%-40s  %-8s  %-6s  %-9s  %-6s  %s\n" \
      "NODE" "STATUS" "TIER" "RULINGS" "TIME_S" "ERROR"
    printf '%.0s─' {1..100}; echo ""
    for target in "${NODE_LIST[@]}"; do
      printf "%-40s  %-8s  %-6s  %-9s  %-6s  %s\n" \
        "${target}" \
        "${NODE_STATUS[${target}]:-UNKNOWN}" \
        "${NODE_TIER[${target}]:-N/A}" \
        "${NODE_RULING_COUNT[${target}]:-N/A}" \
        "${NODE_DURATION[${target}]:-0}" \
        "${NODE_ERROR[${target}]:-}"
    done
    echo ""
    echo "PASS=${PASS_COUNT}  FAIL=${FAIL_COUNT}  SKIP=${SKIP_COUNT}"
  } > "${REPORT_FILE}"
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  🌍  BTNG SOVEREIGN MESH — Multi-Node Deploy  ·  v1.0             ║${RESET}"
echo -e "${BOLD}║  One brain. One law. One journal. 54 sovereign nodes.             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════════╝${RESET}"
echo ""
info  "Nodes file    : ${NODES_FILE}"
info  "Bootstrap     : ${BOOTSTRAP_SCRIPT}"
info  "Council tier  : ${COUNCIL_TIER}"
info  "Skip firewall : ${SKIP_FIREWALL}"
info  "Skip stress   : ${SKIP_STRESS}"
info  "Max parallel  : ${MAX_PARALLEL}"
info  "Report dir    : ${REPORT_DIR}"
[[ "${DRY_RUN}" -eq 1 ]]  && warn "DRY-RUN mode — no SSH connections will be made."
[[ "${SERIAL}"  -eq 1 ]]  && info "Serial mode — nodes deployed one at a time."
echo ""

# ── Pre-flight ─────────────────────────────────────────────────────────────────
[[ -f "${BOOTSTRAP_SCRIPT}" ]] || fail "node-bootstrap.sh not found at: ${BOOTSTRAP_SCRIPT}"
[[ -x "${BOOTSTRAP_SCRIPT}" ]] || chmod +x "${BOOTSTRAP_SCRIPT}"

mkdir -p "${REPORT_DIR}"

if [[ "${DRY_RUN}" -eq 0 ]]; then
  command -v ssh  >/dev/null 2>&1 || fail "ssh not found — install OpenSSH client."
  command -v scp  >/dev/null 2>&1 || fail "scp not found — install OpenSSH client."
fi

# ── Load nodes ─────────────────────────────────────────────────────────────────
load_nodes

total="${#NODE_LIST[@]}"
info "Loaded ${total} node target(s) from ${NODES_FILE}"
echo ""

# Print node list preview
echo -e "  ${BOLD}Deployment targets:${RESET}"
local_idx=0
for n in "${NODE_LIST[@]}"; do
  ((local_idx++))
  printf "    ${DIM}%3d${RESET}  %s\n" "${local_idx}" "${n}"
done
echo ""

# Confirm (skip in dry-run or non-interactive)
if [[ "${DRY_RUN}" -eq 0 ]] && [[ -t 0 ]]; then
  read -r -p "  Deploy node-bootstrap.sh (COUNCIL_TIER=${COUNCIL_TIER}) to all ${total} nodes? [y/N] " confirm
  echo ""
  [[ "${confirm}" =~ ^[Yy]$ ]] || { warn "Deployment cancelled."; exit 0; }
fi

echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  DEPLOYING${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

DEPLOY_START="$(date +%s)"

# ── Dispatch deployments ───────────────────────────────────────────────────────
if [[ "${DRY_RUN}" -eq 1 ]]; then
  # Dry-run: populate results without SSH
  for target in "${NODE_LIST[@]}"; do
    deploy_node "${target}"
    print_node_result "${target}"
  done

elif [[ "${SERIAL}" -eq 1 ]]; then
  # Serial: one node at a time
  for target in "${NODE_LIST[@]}"; do
    dim "  → Deploying: ${target}"
    deploy_node "${target}" || true
    print_node_result "${target}"
  done

else
  # Parallel: up to MAX_PARALLEL concurrent SSH sessions
  # Launch all jobs, then collect results as they finish
  declare -A pids_map  # target → pid

  for target in "${NODE_LIST[@]}"; do
    # Semaphore: wait until a slot is free
    while true; do
      local_active=0
      for t in "${!pids_map[@]}"; do
        kill -0 "${pids_map[${t}]}" 2>/dev/null && ((local_active++)) || true
      done
      [[ "${local_active}" -lt "${MAX_PARALLEL}" ]] && break
      sleep 0.4
    done

    (
      deploy_node "${target}"
    ) &
    pids_map["${target}"]=$!
    dim "  → Dispatched [pid ${pids_map[${target}]}]: ${target}"
  done

  # Harvest results in order
  for target in "${NODE_LIST[@]}"; do
    wait "${pids_map[${target}]}" 2>/dev/null || true
    print_node_result "${target}"
  done
fi

DEPLOY_END="$(date +%s)"
DEPLOY_ELAPSED="$((DEPLOY_END - DEPLOY_START))"

echo ""
info "Total deployment time: ${DEPLOY_ELAPSED}s"

# ── Print grid & write report ──────────────────────────────────────────────────
print_grid
write_report

# ── Emit retry snippet for failed nodes ───────────────────────────────────────
FAILED_NODES=()
for target in "${NODE_LIST[@]}"; do
  [[ "${NODE_STATUS[${target}]:-}" == "FAIL" ]] && FAILED_NODES+=("${target}")
done

if [[ "${#FAILED_NODES[@]}" -gt 0 ]]; then
  RETRY_FILE="${REPORT_DIR}/retry_${TIMESTAMP}.txt"
  printf '%s\n' "${FAILED_NODES[@]}" > "${RETRY_FILE}"
  echo -e "  ${BOLD}Retry failed nodes:${RESET}"
  echo -e "    ${CYAN}./deploy-all-nodes.sh --nodes '${RETRY_FILE}'${RESET}"
  echo ""
fi

# Exit with error if any node failed (useful for CI pipelines)
[[ "${FAIL_COUNT}" -eq 0 ]] && exit 0 || exit 1
