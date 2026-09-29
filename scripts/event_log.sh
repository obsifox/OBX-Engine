#!/usr/bin/env bash
# event_log.sh - Append-only event log v1.1
# Implements RUN_CREATED, BASELINE_STARTED, etc.
# Usage:
#   ./scripts/event_log.sh append --run RUN-xxx --type EVENT_TYPE --actor NAME --state STATE --payload '{"key":"val"}'
#   ./scripts/event_log.sh list --run RUN-xxx [--type TYPE]
#   ./scripts/event_log.sh tail --run RUN-xxx -n 20
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Valid event types per spec
VALID_TYPES=(
  RUN_CREATED
  BASELINE_STARTED BASELINE_COMPLETED
  CLASSIFICATION_STARTED CLASSIFICATION_COMPLETED
  PLAN_CREATED PLAN_APPROVED
  AGENT_STARTED AGENT_COMPLETED AGENT_FAILED
  TOOL_STARTED TOOL_COMPLETED TOOL_FAILED
  GATE_STARTED GATE_PASSED GATE_FAILED
  REVIEW_STARTED REVIEW_COMPLETED
  REWORK_STARTED REWORK_COMPLETED
  VERIFICATION_STARTED VERIFICATION_COMPLETED
  CHECKPOINT_CREATED
  RECOVERY_STARTED RECOVERY_COMPLETED
  HUMAN_APPROVAL_REQUIRED HUMAN_APPROVED HUMAN_REJECTED
  TRANSITION_COMPLETED TRANSITION_REJECTED TRANSITION_ATTEMPTED
  RUN_COMPLETED RUN_FAILED RUN_CANCELLED
)

is_valid_type() {
  local t="$1"
  for v in "${VALID_TYPES[@]}"; do
    if [ "$v" = "$t" ]; then return 0; fi
  done
  return 1
}

append_event() {
  local run_id="" type="" actor="orchestrator" state="" payload="{}"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      --type) type="$2"; shift 2 ;;
      --actor) actor="$2"; shift 2 ;;
      --state) state="$2"; shift 2 ;;
      --payload) payload="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  if [ -z "$run_id" ] || [ -z "$type" ]; then
    echo "Usage: $0 append --run RUN-xxx --type TYPE [--actor NAME] [--state STATE] [--payload JSON]"
    return 4
  fi

  if ! is_valid_type "$type"; then
    echo "WARNING: Event type $type not in canonical list, but allowing (may be custom)"
  fi

  local run_dir="$REPO_ROOT/.eng/runs/$run_id"
  mkdir -p "$run_dir"
  local events_file="$run_dir/events.jsonl"

  local event_id="evt-$(date +%s)-$$-$RANDOM"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Ensure payload is valid JSON, fallback to string
  if ! echo "$payload" | python3 -m json.tool >/dev/null 2>&1; then
    # If not JSON, wrap as string
    payload=$(python3 -c "import json,sys; print(json.dumps({'raw': sys.argv[1]}))" "$payload" 2>/dev/null || echo "{\"raw\":\"$payload\"}")
  fi

  # Construct event JSON
  local event_json
  if command -v python3 >/dev/null 2>&1; then
    event_json=$(python3 - <<PY
import json, sys
event={
  "event_id": "$event_id",
  "run_id": "$run_id",
  "timestamp": "$timestamp",
  "type": "$type",
  "actor": "$actor",
  "state": "$state",
  "payload": $payload
}
print(json.dumps(event))
PY
)
  else
    # Fallback without python
    event_json="{\"event_id\":\"$event_id\",\"run_id\":\"$run_id\",\"timestamp\":\"$timestamp\",\"type\":\"$type\",\"actor\":\"$actor\",\"state\":\"$state\",\"payload\":$payload}"
  fi

  echo "$event_json" >> "$events_file"
  echo "Event appended: $type for $run_id at $timestamp"
  return 0
}

list_events() {
  local run_id="" filter_type=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      --type) filter_type="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$run_id" ]; then echo "Usage: $0 list --run RUN-xxx [--type TYPE]"; return 4; fi
  local events_file="$REPO_ROOT/.eng/runs/$run_id/events.jsonl"
  if [ ! -f "$events_file" ]; then echo "No events for $run_id"; return 2; fi
  if [ -n "$filter_type" ]; then
    grep "\"type\"[[:space:]]*:[[:space:]]*\"$filter_type\"" "$events_file" || echo "No events of type $filter_type"
  else
    cat "$events_file"
  fi
}

tail_events() {
  local run_id="" n=20
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      -n) n="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$run_id" ]; then echo "Usage: $0 tail --run RUN-xxx -n 20"; return 4; fi
  local events_file="$REPO_ROOT/.eng/runs/$run_id/events.jsonl"
  if [ -f "$events_file" ]; then tail -n "$n" "$events_file"; else echo "No events"; return 2; fi
}

case "${1:-}" in
  append) shift; append_event "$@" ;;
  list) shift; list_events "$@" ;;
  tail) shift; tail_events "$@" ;;
  -h|--help|help|*)
    echo "Usage: $0 {append --run RUN --type TYPE [--actor NAME] [--state STATE] [--payload JSON]|list --run RUN [--type TYPE]|tail --run RUN -n 20}"
    echo "Valid types: ${VALID_TYPES[*]}"
    ;;
esac
