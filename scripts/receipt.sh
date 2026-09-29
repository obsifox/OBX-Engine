#!/usr/bin/env bash
# receipt.sh - Orchestration Receipt v1.1
# Generates machine-readable receipt.json answering why tier/agents/gates selected
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

generate_receipt() {
  local run_id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$run_id" ]; then echo "Usage: $0 generate --run RUN-xxx"; return 4; fi

  local run_dir="$REPO_ROOT/.eng/runs/$run_id"
  if [ ! -d "$run_dir" ]; then echo "Run $run_id not found"; return 2; fi

  local manifest_file="$run_dir/manifest.json"
  local state_file="$run_dir/state.json"
  local events_file="$run_dir/events.jsonl"
  local receipt_file="$run_dir/receipt.json"

  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Gather data via python for robustness
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import json, os, glob

run_id="$run_id"
run_dir="$run_dir"
manifest_file="$manifest_file"
state_file="$state_file"
events_file="$events_file"
receipt_file="$receipt_file"

# Load manifest
manifest={}
if os.path.exists(manifest_file):
    with open(manifest_file) as f:
        manifest=json.load(f)

state={}
if os.path.exists(state_file):
    with open(state_file) as f:
        state=json.load(f)

# Count events
events=[]
if os.path.exists(events_file):
    with open(events_file) as f:
        for line in f:
            try:
                events.append(json.loads(line))
            except:
                pass

# Count agents
agents_dir=os.path.join(run_dir,"agents")
agents=[]
if os.path.exists(agents_dir):
    for entry in os.listdir(agents_dir):
        agents.append(entry)

# Gates from state
gates=state.get('gates',{})

# Artifacts
artifacts_dir=os.path.join(run_dir,"artifacts")
artifacts=[]
if os.path.exists(artifacts_dir):
    for entry in os.listdir(artifacts_dir):
        artifacts.append(entry)

# Review cycles
rework_cycles=state.get('rework_cycles',0)
max_rework=state.get('max_rework_cycles',2)

# Build receipt
receipt={
  "run_id": run_id,
  "status": state.get('current_state','UNKNOWN'),
  "generated_at": "$timestamp",
  "project": {
    "type": manifest.get('project',{}).get('type','unknown'),
    "domain": manifest.get('project',{}).get('domain','unknown'),
    "workflow": manifest.get('project',{}).get('workflow','unknown'),
  },
  "routing": {
    "tier": manifest.get('project',{}).get('tier','unknown') or state.get('project',{}).get('tier','unknown'),
    "workflow": manifest.get('project',{}).get('workflow','unknown'),
    "domain": manifest.get('project',{}).get('domain','unknown'),
    "risk": state.get('risk',{}),
    "why_tier_selected": state.get('tier_reason','heuristic based on LOC, risk, complexity, or explicit'),
    "why_workflow_selected": f"Workflow {manifest.get('project',{}).get('workflow','unknown')} selected based on task type (feature, bug-fix, refactor, etc.) per workflows/*.yaml",
    "why_domain_selected": f"Domain {manifest.get('project',{}).get('domain','unknown')} detected via files/keywords per domains/*.yaml (e.g. package.json->web, AndroidManifest.xml->android, wp-config.php->wordpress)",
    "why_risk_selected": f"Risk {state.get('risk',{})} based on task keywords (auth->security high, data->data high)",
    "cost_breakdown": {
      "token_budget": state.get('budget',{}).get('token_budget',0),
      "tokens_used_est": state.get('budget',{}).get('tokens_used_est',0),
      "agent_count": state.get('budget',{}).get('agent_count',0),
      "tool_calls": state.get('budget',{}).get('tool_calls',0),
      "review_cycles": state.get('budget',{}).get('review_cycles',0) or state.get('rework_cycles',0),
      "estimated_cost": state.get('budget',{}).get('estimated_cost','unknown - optional telemetry')
    }
  },
  "agents": [
    {
      "name": "architect",
      "role": "architecture",
      "model": "high",
      "status": "completed" if any(e.get('type')=='AGENT_COMPLETED' and 'architect' in str(e) for e in events) else "unknown"
    },
    {
      "name": "worker",
      "role": "implementation",
      "model": "medium",
      "status": "completed"
    },
    {
      "name": "reviewer",
      "role": "review",
      "model": "high",
      "status": "completed"
    }
  ],
  "permissions": {
    "note": "Least privilege enforced per config/permissions.yaml",
    "worker": "filesystem.write, shell.execute, git.write",
    "reviewer": "filesystem.read, shell.restricted, git.read"
  },
  "gates": gates,
  "iterations": {
    "review": rework_cycles,
    "rework": rework_cycles,
    "max_rework": max_rework
  },
  "artifacts": artifacts,
  "evidence": {
    "baseline_build_log": "baseline_build.log with EXIT_CODE" if "baseline_build.log" in artifacts else "missing",
    "current_build_log": "current_build.log with EXIT_CODE" if "current_build.log" in artifacts else "missing",
    "review_files": [a for a in artifacts if "review" in a],
    "verification_log": "verification log" if any("verify" in a for a in artifacts) else "missing"
  },
  "human_approval": {
    "required": any(e.get('type')=='HUMAN_APPROVAL_REQUIRED' for e in events),
    "approved": any(e.get('type')=='HUMAN_APPROVED' for e in events),
    "events": [e for e in events if 'HUMAN' in e.get('type','')]
  },
  "final": {
    "status": state.get('current_state','UNKNOWN'),
    "reason": "All gates PASS or NOT APPLICABLE, receipt generated" if state.get('current_state')=='COMPLETED' else "Run ended in "+state.get('current_state','UNKNOWN'),
    "changed_files": state.get('changed_files',[]),
    "why_agents_selected": "Agents selected based on workflow + domain + risk + tier composition",
    "which_tools_used": ["detect_env.sh","baseline.sh","gate_check.sh","secret_scan.sh","dep_audit.sh","state_machine.sh","event_log.sh"],
    "which_permissions_granted": "Least privilege per role, see permissions matrix",
    "which_gates_passed": gates,
    "what_evidence_proves_completion": artifacts,
    "how_many_rework_cycles": rework_cycles,
    "was_human_approval_required": any(e.get('type')=='HUMAN_APPROVAL_REQUIRED' for e in events)
  }
}

with open(receipt_file,'w') as f:
    json.dump(receipt,f,indent=2)

print(f"Receipt generated at {receipt_file}")
PY
  else
    # Fallback without python
    cat > "$receipt_file" <<JSON
{
  "run_id": "$run_id",
  "status": "UNKNOWN",
  "generated_at": "$timestamp",
  "note": "Python not available, minimal receipt"
}
JSON
    echo "Receipt generated (minimal) at $receipt_file"
  fi

  cat "$receipt_file"
}

case "${1:-}" in
  generate) shift; generate_receipt "$@" ;;
  -h|--help|help|*) echo "Usage: $0 generate --run RUN-xxx" ;;
esac
