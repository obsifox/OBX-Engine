# State Machine - States v1.1

## Canonical States (17)

### Flow States
1. **INTAKE** - Run created, manifest initialized, user request captured
2. **BASELINE** - Existing build/tests run, recorded for regression detection
3. **CLASSIFICATION** - Project type, domains, risk, tier selected
4. **PLANNING** - Task graph, dependencies, file partition, risks
5. **EXECUTION** - Workers implement per plan
6. **VALIDATION** - Build + tests run via gate_check G0/G1
7. **REVIEW** - Lens reviews (security, testing, etc.) via G2
8. **REWORK** - Fix findings, bounded cycles
9. **VERIFICATION** - Independent verifier, fresh context
10. **RELEASE_REVIEW** - G3 security, G4 release artifact check
11. **HUMAN_APPROVAL** - Human gate if required (destructive, deploy, escalation)
12. **COMPLETED** - All gates pass, receipt generated

### Terminal / Exception States
13. **BLOCKED** - Cannot proceed, needs external dependency or policy
14. **FAILED** - Unrecoverable error, execution failed
15. **CANCELLED** - Cancelled by human
16. **ESCALATED** - Rework cycles exceeded max, needs human
17. **RECOVERY** - Attempting to resume from checkpoint after crash

## State Properties

Each state has:
- `entry_actions`: what to do on entry
- `exit_actions`: what to do on exit
- `allowed_actors`: who can trigger transition
- `required_evidence`: what must exist
- `timeout`: optional max duration
- `human_approval`: whether human gate may be required

## State Details

### INTAKE
- Entry: create RUN-xxx, manifest.json, events.jsonl with RUN_CREATED
- Exit: brief.md created
- Evidence: run_id, manifest.json
- Next: BASELINE

### BASELINE
- Entry: run baseline.sh via lib_run
- Exit: baseline_build.log, baseline_test.log with EXIT_CODE
- Evidence: baseline logs
- Next: CLASSIFICATION
- Failure: -> FAILED if baseline script error (not test failure)

### CLASSIFICATION
- Entry: detect_env.sh, analyze repo, select tier
- Exit: brief.md updated with tier, domains, risk
- Evidence: brief.md, classification_result in state.json
- Next: PLANNING
- Failure: -> BLOCKED if ambiguous and no assumptions allowed

### PLANNING
- Entry: create plan.md with task graph
- Exit: plan approved (auto for Tier 0-1, human may be required for Tier 3 arch changes)
- Evidence: plan.md, task_graph, file partition proof
- Next: EXECUTION

### EXECUTION
- Entry: workers start per task graph, file-disjoint check
- Exit: implementation exists, changed_files list
- Evidence: changed_files, execution_result, current_build.log
- Next: VALIDATION
- Invalid: EXECUTION -> COMPLETED forbidden

### VALIDATION
- Entry: gate_check G0 Build, G1 Tests
- Exit: validation result
- Evidence: current_build.log, current_test.log
- Next: REVIEW
- Failure: -> REWORK if validation fails but rework possible

### REVIEW
- Entry: lens reviews run, produce structured findings
- Exit: review files with severity/status
- Evidence: *review.md, gate G2 result
- Next: VERIFICATION if no HIGH OPEN, else REWORK if cycles < max, else ESCALATED

### REWORK
- Entry: fix findings
- Exit: rework changes
- Evidence: rework_changes, updated files
- Next: VALIDATION (loop)
- Max cycles: configurable, default 2 per gate (from tiers.md)
- Exceed: -> ESCALATED

### VERIFICATION
- Entry: independent verifier, fresh context, only spec+diff+logs
- Exit: verification log
- Evidence: verification_log, independent_evidence
- Next: RELEASE_REVIEW if pass, else REWORK

### RELEASE_REVIEW
- Entry: G3 security, G4 release checks
- Exit: release-review.md with sha256
- Evidence: release-review.md, artifact_hash
- Next: HUMAN_APPROVAL if human required, else COMPLETED

### HUMAN_APPROVAL
- Entry: event HUMAN_APPROVAL_REQUIRED
- Exit: HUMAN_APPROVED or HUMAN_REJECTED
- Evidence: human approval event
- Next: COMPLETED or CANCELLED

### COMPLETED
- Terminal success
- Entry: generate receipt.json
- Evidence: receipt.json, all gates PASS/NA, report_lint PASS

### BLOCKED / FAILED / CANCELLED / ESCALATED
- Terminal failure or needs human
- Must have reason and evidence

### RECOVERY
- Entry: detect stale RUN, inspect last valid state/event/artifact/checkpoint/git/fs/worktree
- Exit: checkpoint restored, reconciled state
- Next: EXECUTION if safe, else FAILED
- Never blindly resume unsafe operation

## State Persistence
- Current state stored in `.eng/runs/RUN-xxx/state.json` and `manifest.json`
- Events appended to `events.jsonl`
- Transitions validated by state_machine.sh
