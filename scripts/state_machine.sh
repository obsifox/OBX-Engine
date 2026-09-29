#!/usr/bin/env bash
# state_machine.sh - Formal state machine v1.1
# Validates transitions, enforces preconditions, prevents invalid jumps
# Usage:
#   ./scripts/state_machine.sh list-states
#   ./scripts/state_machine.sh validate --from X --to Y
#   ./scripts/state_machine.sh transition --run RUN-xxx --from X --to Y --actor worker [--evidence file]
#   ./scripts/state_machine.sh current --run RUN-xxx
#   ./scripts/state_machine.sh history --run RUN-xxx
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config/state_machine.yaml"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# States list (from config, but hardcoded for bash portability)
STATES=("INTAKE" "BASELINE" "CLASSIFICATION" "PLANNING" "EXECUTION" "VALIDATION" "REVIEW" "REWORK" "VERIFICATION" "RELEASE_REVIEW" "HUMAN_APPROVAL" "COMPLETED" "BLOCKED" "FAILED" "CANCELLED" "ESCALATED" "RECOVERY")
TERMINAL=("COMPLETED" "FAILED" "CANCELLED" "BLOCKED" "ESCALATED")

# Valid transitions map (from->to)
declare -A VALID
VALID["INTAKE->BASELINE"]=1
VALID["BASELINE->CLASSIFICATION"]=1
VALID["CLASSIFICATION->PLANNING"]=1
VALID["PLANNING->EXECUTION"]=1
VALID["EXECUTION->VALIDATION"]=1
VALID["VALIDATION->REVIEW"]=1
VALID["REVIEW->VERIFICATION"]=1
VALID["REVIEW->REWORK"]=1
VALID["REWORK->VALIDATION"]=1
VALID["REWORK->ESCALATED"]=1
VALID["VERIFICATION->RELEASE_REVIEW"]=1
VALID["RELEASE_REVIEW->HUMAN_APPROVAL"]=1
VALID["RELEASE_REVIEW->COMPLETED"]=1
VALID["HUMAN_APPROVAL->COMPLETED"]=1
VALID["HUMAN_APPROVAL->CANCELLED"]=1
VALID["ESCALATED->HUMAN_APPROVAL"]=1
VALID["ESCALATED->RECOVERY"]=1
VALID["RECOVERY->EXECUTION"]=1
VALID["RECOVERY->FAILED"]=1
# Wildcard to FAILED/BLOCKED/CANCELLED allowed from any non-terminal
for s in "${STATES[@]}"; do
  VALID["$s->FAILED"]=1
  VALID["$s->BLOCKED"]=1
  VALID["$s->CANCELLED"]=1
done

# Invalid transitions with reasons
declare -A INVALID_REASON
INVALID_REASON["EXECUTION->COMPLETED"]="Must go through VALIDATION, REVIEW, VERIFICATION"
INVALID_REASON["INTAKE->COMPLETED"]="Must complete full lifecycle"
INVALID_REASON["PLANNING->VERIFICATION"]="Missing EXECUTION and REVIEW"
INVALID_REASON["BASELINE->EXECUTION"]="Missing CLASSIFICATION and PLANNING"
INVALID_REASON["VALIDATION->COMPLETED"]="Missing REVIEW and VERIFICATION"
INVALID_REASON["CLASSIFICATION->EXECUTION"]="Missing PLANNING"
INVALID_REASON["INTAKE->REVIEW"]="Missing BASELINE, CLASSIFICATION, PLANNING, EXECUTION, VALIDATION"

is_terminal() {
  local s="$1"
  for t in "${TERMINAL[@]}"; do
    if [ "$t" = "$s" ]; then return 0; fi
  done
  return 1
}

list_states() {
  echo "States:"
  for s in "${STATES[@]}"; do
    if is_terminal "$s"; then
      echo "  $s (terminal)"
    else
      echo "  $s"
    fi
  done
}

validate_transition() {
  local from="$1" to="$2"
  # Check if from and to are valid states
  local found_from=0 found_to=0
  for s in "${STATES[@]}"; do
    if [ "$s" = "$from" ]; then found_from=1; fi
    if [ "$s" = "$to" ]; then found_to=1; fi
  done
  if [ $found_from -eq 0 ]; then
    echo "INVALID: Unknown source state $from"
    return 1
  fi
  if [ $found_to -eq 0 ]; then
    echo "INVALID: Unknown target state $to"
    return 1
  fi

  # Check explicit invalid
  local key="$from->$to"
  if [ -n "${INVALID_REASON[$key]:-}" ]; then
    echo "INVALID: $from -> $to forbidden: ${INVALID_REASON[$key]}"
    return 1
  fi

  # Check if valid
  if [ -n "${VALID[$key]:-}" ]; then
    # Additional check: terminal -> non-terminal without RECOVERY
    if is_terminal "$from" && [ "$from" != "ESCALATED" ] && [ "$to" != "RECOVERY" ] && [ "$from" != "$to" ]; then
      # Allow FAILED/BLOCKED/CANCELLED from any, but not from terminal to non-terminal
      if [[ "$to" != "FAILED" && "$to" != "BLOCKED" && "$to" != "CANCELLED" && "$to" != "COMPLETED" && "$to" != "RECOVERY" ]]; then
        # Actually terminal states should not transition except via RECOVERY or to terminal
        if [ "$from" = "ESCALATED" ]; then
          # ESCALATED can go to HUMAN_APPROVAL or RECOVERY
          if [[ "$to" != "HUMAN_APPROVAL" && "$to" != "RECOVERY" && "$to" != "FAILED" && "$to" != "BLOCKED" ]]; then
            echo "INVALID: Terminal $from cannot go to $to"
            return 1
          fi
        elif [ "$from" != "RECOVERY" ]; then
          echo "INVALID: Terminal state $from cannot transition to $to (except RECOVERY path)"
          return 1
        fi
      fi
    fi
    echo "VALID: $from -> $to"
    return 0
  else
    echo "INVALID: Transition $from -> $to not defined in valid transitions"
    return 1
  fi
}

current_state() {
  local run_id="$1"
  local run_dir="$REPO_ROOT/.eng/runs/$run_id"
  if [ ! -d "$run_dir" ]; then
    echo "Run $run_id not found"
    return 2
  fi
  if [ -f "$run_dir/state.json" ]; then
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "import json; print(json.load(open('$run_dir/state.json')).get('current_state','UNKNOWN'))"
    else
      grep -o '"current_state"[[:space:]]*:[[:space:]]*"[^"]*"' "$run_dir/state.json" | cut -d'"' -f4
    fi
  elif [ -f "$run_dir/manifest.json" ]; then
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "import json; print(json.load(open('$run_dir/manifest.json')).get('state','UNKNOWN'))"
    else
      grep -o '"state"[[:space:]]*:[[:space:]]*"[^"]*"' "$run_dir/manifest.json" | cut -d'"' -f4
    fi
  else
    echo "UNKNOWN - no state.json"
    return 2
  fi
}

transition() {
  local run_id="" from="" to="" actor="orchestrator" evidence=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      --from) from="$2"; shift 2 ;;
      --to) to="$2"; shift 2 ;;
      --actor) actor="$2"; shift 2 ;;
      --evidence) evidence="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  if [ -z "$run_id" ] || [ -z "$from" ] || [ -z "$to" ]; then
    echo "Usage: $0 transition --run RUN-xxx --from X --to Y [--actor NAME] [--evidence FILE]"
    return 4
  fi

  echo "Validating transition $from -> $to for run $run_id by $actor"
  if ! validate_transition "$from" "$to"; then
    echo "Transition REJECTED"
    # Log rejection event if run exists
    local run_dir="$REPO_ROOT/.eng/runs/$run_id"
    if [ -d "$run_dir" ]; then
      "$SCRIPT_DIR/event_log.sh" append --run "$run_id" --type TRANSITION_REJECTED --actor "$actor" --state "$from" --payload "{\"from\":\"$from\",\"to\":\"$to\",\"reason\":\"invalid transition\"}" || true
    fi
    return 1
  fi

  # Check preconditions would go here - for now we check evidence file exists if provided
  if [ -n "$evidence" ] && [ ! -f "$evidence" ]; then
    echo "Precondition FAILED: evidence file $evidence missing"
    return 1
  fi

  local run_dir="$REPO_ROOT/.eng/runs/$run_id"
  mkdir -p "$run_dir"

  # Update state.json
  local state_file="$run_dir/state.json"
  if [ ! -f "$state_file" ]; then
    echo "{\"run_id\":\"$run_id\",\"current_state\":\"$to\",\"previous_state\":\"$from\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"actor\":\"$actor\"}" > "$state_file"
  else
    if command -v python3 >/dev/null 2>&1; then
      python3 - <<PY
import json, datetime
with open("$state_file") as f:
    data=json.load(f)
data['previous_state']=data.get('current_state','$from')
data['current_state']='$to'
data['updated_at']=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
data['actor']='$actor'
with open("$state_file",'w') as f:
    json.dump(data,f,indent=2)
PY
    else
      # Fallback simple
      echo "{\"run_id\":\"$run_id\",\"current_state\":\"$to\",\"previous_state\":\"$from\",\"updated_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$state_file"
    fi
  fi

  # Append event
  "$SCRIPT_DIR/event_log.sh" append --run "$run_id" --type TRANSITION_COMPLETED --actor "$actor" --state "$to" --payload "{\"from\":\"$from\",\"to\":\"$to\",\"evidence\":\"$evidence\"}" || true

  echo "Transition COMPLETED: $from -> $to for $run_id"
  return 0
}

history() {
  local run_id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$run_id" ]; then echo "Usage: $0 history --run RUN-xxx"; return 4; fi
  local run_dir="$REPO_ROOT/.eng/runs/$run_id"
  if [ -f "$run_dir/events.jsonl" ]; then
    cat "$run_dir/events.jsonl"
  else
    echo "No events for $run_id"
    return 2
  fi
}

case "${1:-}" in
  list-states) list_states ;;
  validate)
    shift
    FROM=""; TO=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --from) FROM="$2"; shift 2 ;;
        --to) TO="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    validate_transition "$FROM" "$TO"
    ;;
  transition)
    shift
    transition "$@"
    ;;
  current)
    shift
    RUN_ID=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --run) RUN_ID="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    current_state "$RUN_ID"
    ;;
  history)
    shift
    history "$@"
    ;;
  -h|--help|help|*)
    echo "Usage: $0 {list-states|validate --from X --to Y|transition --run RUN --from X --to Y|current --run RUN|history --run RUN}"
    ;;
esac
