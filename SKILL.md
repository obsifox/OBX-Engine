---
name: eng-orchestrator
description: >
  Master engineering orchestration control plane (Tier 0-3) with state machine,
  run manager, event log, agent contracts, permissions, model routing, playbook
  engine, preview, recovery, receipt. WHEN TO USE: any code task beyond Q&A,
  feature, bugfix, refactor, prod work, multi-file. WHEN NOT TO USE: one-line
  typo explanation, pure Q&A, chatting. Persian: "اینو بیلد کن"، "مهندسی حرفه‌ای"،
  "ارکستراسیون کن"، "از صفر بساز".
version: 1.2.1
---

# eng-orchestrator - Control Plane v1.1

> Evidence > Claims, Verification > Self-Assessment, State > Conversation, Contracts > Personas, Least Privilege > Unlimited Access, Deterministic Gates > Subjective.

## Core Principle
Smallest effective team. Roles are lenses/checklists, not personas. Agents are contracts (inputs/outputs/permissions/tools/model). Subagents only for independent verification and file-disjoint parallel. See `docs/architecture/overview.md`.

## 0. Run Manager & State Machine
- Create RUN: `./scripts/run_manager.sh create --type feature --domain web --tier T2 --task "desc"` -> `RUN-2026-000001` with `manifest.json`, `state.json`, `events.jsonl`, `artifacts/`, `checkpoints/`, `receipt.json`. See `config/state_machine.yaml`.
- States: INTAKE, BASELINE, CLASSIFICATION, PLANNING, EXECUTION, VALIDATION, REVIEW, REWORK, VERIFICATION, RELEASE_REVIEW, HUMAN_APPROVAL, COMPLETED, BLOCKED, FAILED, CANCELLED, ESCALATED, RECOVERY (17). See `docs/state-machine/states.md`.
- Validate transition: `./scripts/state_machine.sh validate --from EXECUTION --to COMPLETED` must reject. Use `transition --run RUN --from X --to Y --actor NAME`.
- Event log: `./scripts/event_log.sh append --run RUN --type GATE_PASSED --actor worker`. Append-only, no secrets. See `docs/architecture/overview.md`.

## 1. Intake & Triage
1. `scripts/detect_env.sh --json` -> capabilities, degrade gracefully if missing, mark NOT TESTED.
2. Create `.eng/` from templates, fill `brief.md`.
3. Classify: PROJECT TYPE, DOMAINS, RISK, COMPLEXITY, WORKFLOW TYPE (feature, bug-fix, refactor, migration, performance, security, investigation, testing, release, documentation, incident). See `workflows/`.
4. Choose Tier 0-3 per `references/tiers.md`. Tier != Model.
5. Max 3 batched questions upfront per `references/interaction-protocol.md`, else ASSUMED.
6. Select minimum lenses, load on demand.

## 2. Playbook Engine
- Compose: base workflow + domain overlay + risk overlay + tier + constraints.
- `scripts/playbook_engine.sh compose --type feature --domain wordpress --risk security:high --tier T3 --out .eng/plan.md`
- Workflows in `workflows/*.yaml` (11), domains in `domains/*.yaml` (extensible). See `docs/workflows/types.md`.
- Preview (no mutation): `./scripts/preview.sh --type feature --task "desc"` or `./scripts/eng.sh preview`. Must NOT mutate repo. Shows classification, tier, risk, agents, model policy, permissions, gates, artifacts, human approval, complexity.

## 2b. Project Profile (v1.2)
The repository declares its own commands in `.eng/project.yaml` (build/test/lint, gate extras, secret allow file). `scripts/project_profile.sh --check` validates it; `detect_cmds` prefers it over every heuristic; `G5_Project` runs the extras. Without a profile, detection is unchanged (v1.1 behaviour). See `docs/architecture/project-profile.md`.

## 3. Baseline First
Run `scripts/baseline.sh` BEFORE change. Produces `baseline_build.log` and `baseline_test.log` with `EXIT_CODE`. Save to `evidence.md`. See `references/evidence-rules.md`.

## 4. Branch / Checkpoint / Worktree
- Branch: `git checkout -b eng/<task>-<date>` or worktree isolation: `./scripts/worktree.sh create --run RUN --branch run/RUN`.
- Checkpoint: copy to `.eng/runs/RUN/checkpoints/` and emit `CHECKPOINT_CREATED`.
- Worktree detects uncommitted user changes, never destroys automatically. See `docs/recovery/recovery.md`.

## 5. Agent Contracts & Permissions
- Contracts in `agents/*.yaml`: name, role, purpose, inputs, outputs, capabilities, permissions, tools, model_policy, delegation, termination, failure_policy, evidence_required. See `docs/agents/contracts.md`.
- Permissions in `config/permissions.yaml`: filesystem.read/write, shell restricted/execute, network deny/limited, git read/write, dependency limited, secret.read deny (only human). Enforce via `scripts/permission_check.sh check --agent NAME --tool TOOL`. See `docs/security/permissions.md`.
- Model routing in `config/model_policy.yaml`: Tier != Model, low/medium/high reasoning, adapters in `adapters/` (claude, codex, copilot, generic). See `docs/architecture/model-routing.md`.

## 6. Build & Hard Gates (Executable Only, No state.json Trust)
- Use `scripts/lib_run.sh`: `run_step current build <cmd>` -> log with `EXIT_CODE`.
- Gates: G0 Build `build exit 0`, G1 Tests `tests >= baseline AND no new failures`, G2 Lens `no open HIGH+` structured `- [F-XXX] severity=HIGH status=OPEN`, G3 Security `secret_scan exit 0 AND no HIGH vuln`, G4 Release `artifact hash verified`.
- Check: `./scripts/gate_check.sh <gate> [--no-run]`. See `references/tiers.md`.

## 7. Review / Rework Bounded Loop
- IMPLEMENT -> VALIDATION -> REVIEW -> PASS -> VERIFY / FAIL -> REWORK -> VALIDATION -> REVIEW. Max cycles 2 per gate (from tier), then ESCALATED. No infinite loop. See `docs/state-machine/transitions.md`.

## 8. Independent Verification (Tier 1+)
Verifier fresh context: only spec+diff+logs. Runs `gate_check.sh --no-run`. Mark NOT TESTED if cannot run. See `references/evidence-rules.md`.

## 9. Recovery
- Detect stale RUN: `scripts/recovery.sh detect`
- Inspect: `recovery.sh inspect --run RUN` shows last valid state/event/artifact/checkpoint/git/fs/worktree/unfinished transitions
- Reconcile: checks uncommitted changes, branch divergence, checkpoint age, never blindly resume unsafe
- Recover: `recovery.sh recover --run RUN` -> restore checkpoint -> resume EXECUTION or escalate. See `docs/recovery/recovery.md`.

## 10. Receipt & Audit
- Generate receipt: `scripts/receipt.sh generate --run RUN` -> `receipt.json` answering why tier/agents/gates selected, tools used, permissions, evidence, rework cycles, human approval. See spec section 18.
- Event log append-only, no secrets.

## 11. Skill Registry & Security
- Registry: `scripts/skill_registry.sh {discover|inspect|validate|load|disable}`. Validates manifest, permissions, integrity, suspicious patterns. No auto remote code exec. See `docs/architecture/skill-registry.md`.

## 12. Anti-Sycophancy & Evidence
No PASS without artifact. Statuses: SOLVED, UNSOLVED, BLOCKED, NOT TESTED, NOT APPLICABLE, ASSUMED. Run `report_lint.sh` before final report. Structured findings required.

## 13. Stopping Rules (Measurable)
Stop when: requirements met + acceptance criteria + required gates PASS/NA + no BLOCKED HIGH + report_lint PASS. Stop on token budget (T0 20k, T1 60k, T2 150k, T3 350k) or loop cap.

## 14. Final Delivery
Report from `references/report-template.md` + `receipt.json`. User-facing language = user's language (Persian if user writes Persian). Record lessons in structured knowledge `.eng/knowledge/` per promotion rule (freq>=3 or 1 CRITICAL).

## File Map v1.1
- `config/state_machine.yaml`, `permissions.yaml`, `model_policy.yaml`
- `agents/*.yaml` - executable contracts
- `workflows/*.yaml` (11) - work types, `domains/*.yaml` - overlays
- `adapters/*/` - provider abstraction
- `scripts/state_machine.sh`, `event_log.sh`, `run_manager.sh`, `playbook_engine.sh`, `preview.sh`, `recovery.sh`, `worktree.sh`, `receipt.sh`, `permission_check.sh`, `skill_registry.sh`, `eng.sh` - control plane
- `scripts/lib_run.sh`, `detect_env.sh`, `baseline.sh`, `gate_check.sh`, `secret_scan.sh`, `dep_audit.sh`, `report_lint.sh`
- `docs/` - architecture, state-machine, agents, workflows, security, recovery, evaluation, adapters, audit
- `references/` - tiers, lenses, playbooks (backward compat)
