#!/usr/bin/env bash
# detect_env.sh - Detect environment capabilities
# Usage: ./scripts/detect_env.sh [--json] [--out .eng/state.json]
# Exit codes: 0 success, 1 error
set -euo pipefail

JSON_OUTPUT=false
OUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON_OUTPUT=true; shift ;;
    --out) OUT_FILE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--json] [--out <state.json>]"
      echo "Detects: git, test runners, subagents, code execution, file persistence"
      echo "Exit 0 on success"
      exit 0
      ;;
    *) shift ;;
  esac
done

has_git=false; command -v git >/dev/null 2>&1 && has_git=true
has_node=false; command -v node >/dev/null 2>&1 && has_node=true
has_npm=false; command -v npm >/dev/null 2>&1 && has_npm=true
has_python=false; command -v python3 >/dev/null 2>&1 && has_python=true
has_pytest=false; command -v pytest >/dev/null 2>&1 && has_pytest=true
has_go=false; command -v go >/dev/null 2>&1 && has_go=true
has_gradle=false; command -v gradle >/dev/null 2>&1 || ls ./gradlew >/dev/null 2>&1 && has_gradle=true || true
has_java=false; command -v java >/dev/null 2>&1 && has_java=true

# test runner detection
has_test_runner=false
if $has_npm && [ -f package.json ]; then
  if grep -q '"test"' package.json; then has_test_runner=true; fi
fi
if $has_python && ( [ -f pytest.ini ] || [ -f pyproject.toml ] || ls tests/ >/dev/null 2>&1 ); then has_test_runner=true; fi
if $has_go; then has_test_runner=true; fi
if $has_gradle; then has_test_runner=true; fi

# subagents: check env var or assume false in generic env
has_subagents=false
if [ "${AGENT_HAS_SUBAGENTS:-}" = "true" ]; then has_subagents=true; fi

# file persistence: try write
can_persist=false
tmpfile=".eng/.persist_test_$$"
mkdir -p .eng 2>/dev/null || true
if echo test > "$tmpfile" 2>/dev/null; then can_persist=true; rm -f "$tmpfile"; fi

can_run_code=true

timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

json=$(cat <<EOF
{
  "has_git": $has_git,
  "has_node": $has_node,
  "has_npm": $has_npm,
  "has_python": $has_python,
  "has_pytest": $has_pytest,
  "has_go": $has_go,
  "has_gradle": $has_gradle,
  "has_java": $has_java,
  "has_test_runner": $has_test_runner,
  "has_subagents": $has_subagents,
  "can_run_code": $can_run_code,
  "can_persist_files": $can_persist,
  "detected_at": "$timestamp"
}
EOF
)

if $JSON_OUTPUT; then
  echo "$json"
else
  echo "Environment Detection @ $timestamp"
  echo "$json" | python3 -m json.tool 2>/dev/null || echo "$json"
fi

# Optionally merge into state.json if provided
if [ -n "$OUT_FILE" ]; then
  mkdir -p "$(dirname "$OUT_FILE")"
  if [ -f "$OUT_FILE" ]; then
    # merge using python if available
    if command -v python3 >/dev/null; then
      python3 - <<PY
import json, sys, os
out_path=os.path.expanduser("$OUT_FILE")
with open(out_path) as f:
  data=json.load(f)
env=json.loads('''$json''')
data['environment']=env
with open(out_path,'w') as f:
  json.dump(data,f,indent=2)
print(f"Merged into {out_path}")
PY
    else
      echo "$json" > "$OUT_FILE.env.json"
      echo "Saved env to $OUT_FILE.env.json (no python for merge)"
    fi
  else
    echo "$json" > "$OUT_FILE"
    echo "Created $OUT_FILE"
  fi
fi

exit 0
