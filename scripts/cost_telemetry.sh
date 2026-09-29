#!/usr/bin/env bash
# cost_telemetry.sh - Optional telemetry for agent count, model usage, duration, tool calls, review cycles, tokens, cost
# v1.1 - Never requires telemetry to be enabled, provider-independent
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Telemetry is optional, disabled by default
# Enable via env: ENG_TELEMETRY=1

record_telemetry() {
  local run_id="" metric="" value=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      --metric) metric="$2"; shift 2 ;;
      --value) value="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  if [ -z "$run_id" ] || [ -z "$metric" ]; then
    echo "Usage: $0 record --run RUN --metric NAME --value VAL"
    return 4
  fi

  # Check if telemetry enabled
  if [ "${ENG_TELEMETRY:-0}" != "1" ] && [ "${1:-}" != "--force" ]; then
    # Still record to state.json budget even if telemetry disabled, but not to telemetry file
    :
  fi

  local run_dir="$REPO_ROOT/.eng/runs/$run_id"
  mkdir -p "$run_dir"
  local telemetry_file="$run_dir/telemetry.jsonl"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Append to telemetry.jsonl
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import json, datetime
event={
  "timestamp": "$timestamp",
  "run_id": "$run_id",
  "metric": "$metric",
  "value": "$value"
}
with open("$telemetry_file","a") as f:
    f.write(json.dumps(event)+"\n")
PY
  else
    echo "{\"timestamp\":\"$timestamp\",\"run_id\":\"$run_id\",\"metric\":\"$metric\",\"value\":\"$value\"}" >> "$telemetry_file"
  fi

  # Also update state.json budget if metric is tokens or cost
  if [ -f "$run_dir/state.json" ] && command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import json
run_dir="$run_dir"
state_file=f"{run_dir}/state.json"
try:
    with open(state_file) as f:
        data=json.load(f)
    budget=data.get('budget',{})
    metric="$metric"
    value="$value"
    # Try to parse value as int
    try:
        iv=int(value)
        if metric=="tokens":
            budget['tokens_used_est']=budget.get('tokens_used_est',0)+iv
        elif metric=="agent_count":
            budget['agent_count']=iv
        elif metric=="tool_calls":
            budget['tool_calls']=budget.get('tool_calls',0)+iv
        elif metric=="review_cycles":
            budget['review_cycles']=iv
        elif metric=="rework_cycles":
            budget['rework_cycles']=iv
        elif metric=="cost":
            budget['estimated_cost']=value
    except:
        pass
    data['budget']=budget
    with open(state_file,'w') as f:
        json.dump(data,f,indent=2)
except Exception as e:
    print(f"Failed to update state.json: {e}")
PY
  fi

  echo "Telemetry recorded: $metric=$value for $run_id"
}

show_telemetry() {
  local run_id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$run_id" ]; then echo "Usage: $0 show --run RUN"; return 4; fi
  local telemetry_file="$REPO_ROOT/.eng/runs/$run_id/telemetry.jsonl"
  if [ -f "$telemetry_file" ]; then
    cat "$telemetry_file"
  else
    echo "No telemetry for $run_id"
  fi
  echo ""
  echo "--- State budget ---"
  cat "$REPO_ROOT/.eng/runs/$run_id/state.json" 2>/dev/null | python3 -m json.tool 2>/dev/null | grep -A 10 budget || cat "$REPO_ROOT/.eng/runs/$run_id/state.json" | grep -A 10 budget || echo "No state.json"
}

case "${1:-}" in
  record) shift; record_telemetry "$@" ;;
  show) shift; show_telemetry "$@" ;;
  -h|--help|help|*) echo "Usage: $0 {record --run RUN --metric NAME --value VAL|show --run RUN}"; echo "Metrics: agent_count, model_usage, execution_duration, tool_calls, review_cycles, rework_cycles, tokens, cost"; echo "Enable via ENG_TELEMETRY=1 (optional, not required)"; ;;
esac
