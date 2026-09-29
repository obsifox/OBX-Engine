# Architecture Overview v1.1 - Engineering Control Plane

## Vision
`eng-orchestrator` evolves from "large engineering skill" into "engineering orchestration control plane" with Routing + State + Policy + Execution + Verification + Recovery + Evidence + Auditability.

## Principles (Non-Negotiable)
```
Evidence > Claims
Verification > Self-Assessment
State > Conversation
Contracts > Personas
Capabilities > Titles
Minimum Necessary Agents > Agent Explosion
Least Privilege > Unlimited Tool Access
Deterministic Gates > Subjective Approval
Reproducibility > Hidden Context
Recovery > Restart From Zero
Auditability > Black-Box Execution
```

## Conceptual Distinctions (Must Remain Independent)
```
Role != Agent
Agent != Model
Tier != Model
Role != Permission
Domain != Workflow
Workflow != Playbook
Evidence != Claim
Review != Verification
```

## Target Architecture Diagram

```
                         USER
                           │
                           ▼
                  ┌─────────────────┐
                  │ ENG ORCHESTRATOR│
                  │   CONTROL PLANE │
                  └────────┬────────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
          ROUTER         POLICY        RUN MANAGER
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                    STATE MACHINE
                           │
                           ▼
                    PLAYBOOK ENGINE
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
          WORKFLOW       DOMAIN         RISK
           TYPE          OVERLAY        OVERLAY
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                    AGENT DISPATCHER
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      ARCHITECT          WORKER          REVIEWER
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                    EXECUTION PLANE
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
       WORKTREE          TOOLS           SANDBOX
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                      GATE ENGINE
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
        BUILD            TEST           SECURITY
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                  INDEPENDENT VERIFY
                           │
                     HUMAN GATE
                           │
                         RELEASE
                           │
                           ▼
                    AUDIT / RECEIPT
```

## Components

### Control Plane
- **Router:** Selects workflow, domain, tier based on task + repo detection
- **Policy:** Permissions, model routing, human approval points
- **Run Manager:** Creates RUN-xxx with isolated directory

### State Machine
- 17 canonical states, deterministic transitions, invalid rejection
- Implemented in `scripts/state_machine.sh` + `config/state_machine.yaml`

### Playbook Engine
- Composes: base workflow + domain overlay + risk overlay + tier + constraints
- Workflows: feature, bug-fix, refactor, migration, performance, security, investigation, testing, release, documentation, incident (11)
- Domains: wordpress, android, web, backend, etc. (extensible)
- Script: `scripts/playbook_engine.sh`

### Agent Dispatcher
- Agent contracts in `agents/*.yaml` with inputs/outputs/capabilities/permissions/tools/model_policy/delegation/termination/failure_policy/evidence_required
- Roles: architect, worker, reviewer, security-reviewer, verifier, release-manager
- No persona theater (CEO, Wizard, etc.)

### Execution Plane
- **Worktree Isolation:** `scripts/worktree.sh` creates isolated worktree per run
- **Tools:** bash, python, git, with permission checks via `permission_check.sh`
- **Sandbox:** Restricted shell per permission matrix

### Gate Engine
- G0 Build, G1 Tests, G2 Lens, G3 Security, G4 Release
- Uses `lib_run.sh` with EXIT_CODE, no state.json trust
- Implemented in `scripts/gate_check.sh`

### Verification & Release
- Independent verifier (fresh context)
- Human gate when required
- Release review with sha256 verification
- Receipt generation via `scripts/receipt.sh`

### Audit
- Event log append-only `events.jsonl` via `scripts/event_log.sh`
- Receipt `receipt.json` answering why tier/agents/gates selected
- Recovery via `scripts/recovery.sh`

## Directory Structure v1.1

```
.
├── SKILL.md
├── config/
│   ├── state_machine.yaml
│   ├── permissions.yaml
│   └── model_policy.yaml
├── agents/ (contracts)
│   ├── architect.yaml
│   ├── worker.yaml
│   ├── reviewer.yaml
│   ├── security-reviewer.yaml
│   ├── verifier.yaml
│   └── release-manager.yaml
├── workflows/ (11 types)
│   ├── feature.yaml
│   ├── bug-fix.yaml
│   └── ...
├── domains/ (overlays)
│   ├── wordpress.yaml
│   ├── android.yaml
│   └── ...
├── adapters/
│   ├── claude/adapter.yaml
│   ├── codex/adapter.yaml
│   ├── copilot/adapter.yaml
│   └── generic/adapter.yaml
├── scripts/
│   ├── lib_run.sh
│   ├── state_machine.sh
│   ├── event_log.sh
│   ├── run_manager.sh
│   ├── playbook_engine.sh
│   ├── preview.sh
│   ├── recovery.sh
│   ├── worktree.sh
│   ├── receipt.sh
│   ├── permission_check.sh
│   ├── skill_registry.sh
│   ├── detect_env.sh
│   ├── baseline.sh
│   ├── gate_check.sh
│   ├── secret_scan.sh
│   ├── dep_audit.sh
│   └── report_lint.sh
├── docs/
│   ├── audit/
│   ├── architecture/
│   ├── state-machine/
│   ├── agents/
│   ├── workflows/
│   ├── security/
│   ├── recovery/
│   ├── evaluation/
│   └── adapters/
├── .eng/
│   ├── templates/
│   ├── runs/RUN-xxx/
│   │   ├── manifest.json
│   │   ├── state.json
│   │   ├── events.jsonl
│   │   ├── decisions.jsonl
│   │   ├── artifacts/
│   │   ├── agents/
│   │   ├── checkpoints/
│   │   ├── verification/
│   │   └── receipt.json
│   ├── knowledge/
│   │   ├── lessons/
│   │   ├── failures/
│   │   ├── decisions/
│   │   ├── patterns/
│   │   └── regressions/
│   └── skill_registry/
└── tests/
```

## Backward Compatibility

- Existing commands preserved: detect_env, baseline, gate_check, secret_scan, dep_audit, report_lint
- SKILL.md still under 150 lines (81)
- Existing playbooks preserved in references/playbooks/
- Existing lenses preserved
- Existing tests/gates.test.sh still PASS

## Security

- Least privilege per config/permissions.yaml
- No secret.read except human
- Skill registry validates manifest, permissions, integrity
- No auto remote code execution

## Recovery

- detect stale RUN -> inspect last valid state/event/artifact/checkpoint/git/fs/worktree -> reconcile -> restore checkpoint -> resume or escalate
- Never destroy user changes automatically
- Never blindly resume unsafe operation
