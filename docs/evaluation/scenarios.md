# Evaluation v1.1 - 50 Scenarios

## Existing
- `evals/scenarios.md`: 15 scenarios S1-S15
- `evals/scenarios_v1_1.md`: 35 new scenarios (R1-R5, D1-D5, S16-S20, RC1-RC6, V1-V5, G1-G5, A1-A9) = total 50

## Categories

### Routing (5)
- small, medium, large, ambiguous, high-risk

### Delegation (5)
- unnecessary, required, nested, failure, file-disjoint parallel

### Security (5)
- prompt injection, malicious skill, dangerous shell, secret access, unsafe deployment

### Recovery (6)
- agent crash, tool crash, interruption, stale checkpoint, changed worktree, user modification

### Verification (5)
- false success, missing evidence, conflicting evidence, test failure, review disagreement

### Governance (5)
- invalid transition, permission escalation, unauthorized deployment, infinite rework, missing human approval

### Additional v1.1 (9)
- preview no mutation, run ID uniqueness, event log append-only, receipt generation, knowledge promotion, skill registry, worktree isolation, model routing independence, playbook composition

## Execution

```bash
./tests/gates.test.sh  # 15 assertions
./tests/state_machine.test.sh  # 37 transition tests
./tests/permissions.test.sh  # 21 auth tests
./tests/recovery.test.sh  # 8 scenarios
./tests/playbook.test.sh  # composition tests
./evals/run_all.sh  # runs all 50 scenarios
```

## Target

Minimum 50 deterministic scenarios, prefer quality and coverage over arbitrary count.
All existing tests must still pass (backward compatibility).
