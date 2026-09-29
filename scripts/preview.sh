#!/usr/bin/env bash
# preview.sh - eng preview mode v1.1
# MUST NOT mutate repository. Shows classification without execution.
# Usage: ./scripts/preview.sh [--type feature] [--task "description"]
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TYPE="feature"
TASK=""
DOMAIN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type) TYPE="$2"; shift 2 ;;
    --task) TASK="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--type TYPE] [--domain DOMAIN] [--task DESC]"; exit 0 ;;
    *) TASK="$1"; shift ;;
  esac
done

echo "=== ENG PREVIEW MODE (no mutation) ==="
echo "Task: ${TASK:-none provided}"
echo ""

# Detect env (read-only)
echo "--- Environment ---"
"$SCRIPT_DIR/detect_env.sh" --json 2>/dev/null | python3 -m json.tool 2>/dev/null || "$SCRIPT_DIR/detect_env.sh" --json
echo ""

# Detect project type
echo "--- Project Classification ---"
if [ -f "$REPO_ROOT/package.json" ]; then
  echo "Detected: Node.js project (web/backend)"
  DETECTED_DOMAIN="web"
elif [ -f "$REPO_ROOT/AndroidManifest.xml" ]; then
  echo "Detected: Android"
  DETECTED_DOMAIN="android"
elif [ -f "$REPO_ROOT/wp-config.php" ] || ls "$REPO_ROOT"/*.php 2>/dev/null | head -1 | grep -q php; then
  echo "Detected: WordPress (heuristic)"
  DETECTED_DOMAIN="wordpress"
elif [ -f "$REPO_ROOT/go.mod" ]; then
  echo "Detected: Go backend"
  DETECTED_DOMAIN="backend"
else
  echo "Detected: Generic"
  DETECTED_DOMAIN="generic"
fi

if [ -n "$DOMAIN" ]; then
  DETECTED_DOMAIN="$DOMAIN"
fi
echo "Domain: $DETECTED_DOMAIN"
echo ""

# Tier estimation (heuristic)
echo "--- Tier Estimation ---"
# Simple heuristic: if task mentions prod/security/migration -> T3, etc.
if echo "$TASK" | grep -qi "prod\|security\|migration\|legacy\|large\|platform"; then
  TIER="T3"
  REASON="Task mentions high-risk keyword"
elif echo "$TASK" | grep -qi "feature\|refactor\|api\|screen"; then
  TIER="T2"
  REASON="Medium feature"
elif echo "$TASK" | grep -qi "small\|cli\|fix\|typo"; then
  TIER="T1"
  REASON="Small task"
else
  TIER="T1"
  REASON="Default T1 for unknown"
fi
echo "Tier: $TIER ($REASON)"
echo ""

# Workflow
echo "--- Workflow ---"
echo "Work Type: $TYPE"
echo "Base workflow file: workflows/${TYPE}.yaml"
if [ -f "$REPO_ROOT/workflows/${TYPE}.yaml" ]; then
  echo "Found"
else
  echo "Not found, using feature as fallback"
fi
echo ""

# Risk
echo "--- Risk ---"
if echo "$TASK" | grep -qi "auth\|secret\|security\|password"; then
  echo "Security: High"
else
  echo "Security: Medium"
fi
if echo "$TASK" | grep -qi "data\|database\|migration"; then
  echo "Data: High"
else
  echo "Data: Low"
fi
echo ""

# Agents
echo "--- Required Agents (from workflow composition) ---"
WF_FILE="$REPO_ROOT/workflows/${TYPE}.yaml"
if [ -f "$WF_FILE" ]; then
  grep -A 10 "agents_required" "$WF_FILE" | head -n 20
else
  echo "  architect, worker, reviewer, verifier"
fi
echo ""

# Model policy
echo "--- Model Policy ---"
if [ -f "$REPO_ROOT/config/model_policy.yaml" ]; then
  echo "Tier $TIER routing:"
  grep -A 15 "  $TIER:" "$REPO_ROOT/config/model_policy.yaml" | head -n 20
fi
echo ""

# Permissions
echo "--- Permissions ---"
echo "Worker: filesystem.write, shell.execute, git.write, network.limited"
echo "Reviewer: filesystem.read, shell.restricted, git.read"
echo "Security: filesystem.read, shell.restricted"
echo "Human approval required for: deployment, destructive actions"
echo ""

# Tools
echo "--- Tools ---"
echo "  detect_env.sh, baseline.sh, gate_check.sh, secret_scan.sh, dep_audit.sh, state_machine.sh, event_log.sh"
echo ""

# Gates
echo "--- Gates ---"
if [ -f "$WF_FILE" ]; then
  grep -A 10 "gates:" "$WF_FILE"
else
  echo "  G0 Build, G1 Tests, G2 Lens, G3 Security"
fi
echo ""

# Artifacts
echo "--- Expected Artifacts ---"
echo "  plan.md, changed_files, current_build.log, current_test.log, review_files, verification_log, receipt.json"
echo ""

# Human approval points
echo "--- Human Approval Points ---"
echo "  Required before: deployment, DB schema change, arch change, adding deps, deleting files"
echo "  For Tier $TIER: $(if [ "$TIER" = "T3" ]; then echo "Yes, arch changes need approval"; else echo "Only for destructive"; fi)"
echo ""

# Complexity
echo "--- Estimated Execution Complexity ---"
case "$TIER" in
  T0) echo "Low: ~5k tokens, 0 subagents, 1 gate" ;;
  T1) echo "Medium: ~60k tokens, 1 subagent, 2 gates" ;;
  T2) echo "High: ~150k tokens, 3 subagents, 3-4 gates" ;;
  T3) echo "Very High: ~350k tokens, 6 subagents, 5 gates, human approval" ;;
esac
echo ""
echo "=== END PREVIEW (no files mutated) ==="
echo "To execute: ./scripts/run_manager.sh create --type $TYPE --domain $DETECTED_DOMAIN --tier $TIER --task \"$TASK\""
