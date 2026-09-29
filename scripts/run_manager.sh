#!/usr/bin/env bash
# run_manager.sh - First-class Run concept v1.1
# Every orchestration execution has unique ID: RUN-YYYY-XXXXXX
# Directory: .eng/runs/RUN-xxx/{manifest.json, state.json, events.jsonl, decisions.jsonl, artifacts/, agents/, checkpoints/, verification/, receipt.json}
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

generate_run_id() {
  local date_part
  date_part=$(date -u +"%Y")
  local seq_file="$REPO_ROOT/.eng/runs/.seq"
  mkdir -p "$REPO_ROOT/.eng/runs"
  local seq=1
  if [ -f "$seq_file" ]; then
    seq=$(cat "$seq_file")
    seq=$((seq+1))
  fi
  echo "$seq" > "$seq_file"
  printf "RUN-%s-%06d" "$date_part" "$seq"
}

create_run() {
  local project_type="" domain="" workflow="" tier="" task_desc=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --type) project_type="$2"; shift 2 ;;
      --domain) domain="$2"; shift 2 ;;
      --workflow) workflow="$2"; shift 2 ;;
      --tier) tier="$2"; shift 2 ;;
      --task) task_desc="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  local run_id
  run_id=$(generate_run_id)
  local run_dir="$REPO_ROOT/.eng/runs/$run_id"
  mkdir -p "$run_dir"/{artifacts,agents,checkpoints,verification}

  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # manifest.json
  cat > "$run_dir/manifest.json" <<JSON
{
  "run_id": "$run_id",
  "created_at": "$timestamp",
  "project": {
    "type": "${project_type:-unknown}",
    "domain": "${domain:-unknown}",
    "workflow": "${workflow:-feature}",
    "tier": "${tier:-T1}"
  },
  "task": "${task_desc:-}",
  "state": "INTAKE",
  "version": "1.2.1"
}
JSON

  # state.json
  cat > "$run_dir/state.json" <<JSON
{
  "run_id": "$run_id",
  "current_state": "INTAKE",
  "previous_state": null,
  "created_at": "$timestamp",
  "updated_at": "$timestamp",
  "project": {
    "type": "${project_type:-unknown}",
    "domain": "${domain:-unknown}",
    "workflow": "${workflow:-feature}",
    "tier": "${tier:-T1}"
  },
  "gates": {},
  "tasks": [],
  "budget": {
    "tokens_used_est": 0,
    "token_budget": 60000,
    "subagent_calls": 0,
    "max_subagents": 1
  },
  "rework_cycles": 0,
  "max_rework_cycles": 2
}
JSON

  # decisions.jsonl empty
  touch "$run_dir/decisions.jsonl"
  # events.jsonl with RUN_CREATED
  "$SCRIPT_DIR/event_log.sh" append --run "$run_id" --type RUN_CREATED --actor orchestrator --state INTAKE --payload "{\"task\":\"$task_desc\",\"project_type\":\"$project_type\"}" >/dev/null

  echo "$run_id"
  echo "Run created: $run_dir" >&2
}

list_runs() {
  local runs_dir="$REPO_ROOT/.eng/runs"
  if [ ! -d "$runs_dir" ]; then echo "No runs"; return 0; fi
  echo "Runs:"
  for d in "$runs_dir"/RUN-*; do
    if [ -d "$d" ]; then
      local id
      id=$(basename "$d")
      local state
      state=$("$SCRIPT_DIR/state_machine.sh" current --run "$id" 2>/dev/null || echo "UNKNOWN")
      echo "  $id - $state"
    fi
  done
}

show_run() {
  local run_id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$run_id" ]; then echo "Usage: $0 show --run RUN-xxx"; return 4; fi
  local run_dir="$REPO_ROOT/.eng/runs/$run_id"
  if [ ! -d "$run_dir" ]; then echo "Run $run_id not found"; return 2; fi
  echo "=== Manifest ==="
  cat "$run_dir/manifest.json"
  echo ""
  echo "=== State ==="
  cat "$run_dir/state.json"
  echo ""
  echo "=== Events (last 20) ==="
  "$SCRIPT_DIR/event_log.sh" tail --run "$run_id" -n 20
}

# CLI
case "${1:-}" in
  create) shift; create_run "$@" ;;
  list) list_runs ;;
  show) shift; show_run "$@" ;;
  -h|--help|help|*)
    echo "Usage: $0 {create [--type TYPE] [--domain DOMAIN] [--workflow WF] [--tier TIER] [--task DESC]|list|show --run RUN-xxx}"
    ;;
esac
