# State Format - .eng/ Versioned Project State

All state on disk, not only chat memory. Versioned for forward compatibility.

## Directory Layout
```
.eng/
  state.json          # machine-readable source of truth
  brief.md            # product + technical discovery
  plan.md             # task graph (Tier 1+)
  decisions.md        # ADR log
  evidence.md         # evidence ledger
  checkpoint/         # copy of files before risky change (if no git)
  artifacts/          # build/test outputs
```

## state.json Schema (v1)
```json
{
  "version": "1.0.0",
  "project": {
    "name": "string",
    "type": "web|mobile|plugin|api|game|cli|...",
    "tier": "0|1|2|3",
    "domains": ["backend", "frontend"]
  },
  "environment": {
    "has_git": true,
    "has_test_runner": true,
    "has_subagents": false,
    "can_run_code": true,
    "can_persist_files": true,
    "detected_at": "ISO8601"
  },
  "gates": {
    "G0_Build": "PASS|FAIL|NOT_TESTED|NOT_APPLICABLE",
    "G1_Tests": "PASS|FAIL|NOT_TESTED",
    "G2_Lens": "PASS|FAIL|NOT_TESTED",
    "G3_Security": "PASS|FAIL|NOT_TESTED",
    "G4_Release": "PASS|FAIL|NOT_APPLICABLE"
  },
  "tasks": [
    {
      "id": "T1",
      "desc": "string",
      "owner_lens": "security|testing|...",
      "status": "TODO|DOING|DONE|BLOCKED",
      "evidence_ref": "evidence.md#T1"
    }
  ],
  "evidence": [
    {
      "task_id": "T1",
      "type": "command|file|diff",
      "ref": "path or command",
      "result": "exit code or hash",
      "timestamp": "ISO8601"
    }
  ],
  "risks": [
    {"id": "R1", "desc": "string", "severity": "LOW|MED|HIGH|CRITICAL", "status": "OPEN|MITIGATED"}
  ],
  "assumptions": ["string"],
  "budget": {
    "tokens_used_est": 0,
    "token_budget": 150000,
    "subagent_calls": 0,
    "max_subagents": 3
  }
}
```

## Rules
- Every gate status change must have evidence entry.
- Never edit state.json manually without updating evidence.md.
- Version field mandatory. If version mismatch, migrate or abort with BLOCKED.
- brief.md, decisions.md, evidence.md must be human-readable and reference state.json IDs.
- On Tier 0, plan.md may be minimal (3 bullet tasks).
- All timestamps ISO8601 UTC.

## Persistence
- On each major step: update state.json + append evidence.md.
- If file persistence unavailable (per detect_env.sh), degrade: keep in chat but mark state as VOLATILE and warn user final report will lack reproducibility.
