# Control Plane v1.1

## Components

### Router
- Input: user task + repo detection (files, keywords)
- Output: workflow type, domain, tier, risk
- Implementation: `scripts/preview.sh` + `scripts/playbook_engine.sh`
- Deterministic: same input + same repo state + same config + same policy => same routing/tier/workflow/gates

### Policy
- Permissions: `config/permissions.yaml` + `scripts/permission_check.sh`
- Model routing: `config/model_policy.yaml` - Tier != Model
- Human approval: defined per workflow in `workflows/*.yaml`
- Risk overlays: security high => security-reviewer + G3

### Run Manager
- Creates RUN-YYYY-XXXXXX unique ID
- Directory: `.eng/runs/RUN-xxx/` with manifest.json, state.json, events.jsonl, decisions.jsonl, artifacts/, agents/, checkpoints/, verification/, receipt.json
- Script: `scripts/run_manager.sh`
- Commands: create, list, show

## Flow

```
USER task
  -> Router: classify project, select tier, workflow, domain, risk
  -> Policy: check permissions, model routing, human approval points
  -> Run Manager: create RUN-xxx with manifest
  -> State Machine: INTAKE -> BASELINE -> ...
```

## Evidence
- Every run has ID, manifest, events
- Routing decision logged in manifest.json + state.json
- Why tier selected logged in receipt.json routing.why_tier_selected
