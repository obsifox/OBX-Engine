# State Transitions v1.1

## Transition Schema

```yaml
from: SOURCE_STATE
to: TARGET_STATE
preconditions:
  - condition_1
required_evidence:
  - evidence_1
allowed_actor: actor_name
on_failure: FAILURE_STATE
```

## Valid Transitions

| From | To | Preconditions | Evidence | Actor |
|------|----|---------------|----------|-------|
| INTAKE | BASELINE | run_created, manifest_exists | run_id, manifest.json | orchestrator |
| BASELINE | CLASSIFICATION | baseline_completed | baseline_build.log, baseline_test.log | orchestrator |
| CLASSIFICATION | PLANNING | classification_completed, tier_selected | brief.md, classification_result | architect |
| PLANNING | EXECUTION | plan_exists, plan_approved | plan.md, task_graph | architect |
| EXECUTION | VALIDATION | implementation_exists, execution_not_failed | changed_files, execution_result, current_build.log | worker |
| VALIDATION | REVIEW | validation_completed | current_build.log, current_test.log | orchestrator |
| REVIEW | VERIFICATION | review_completed, no_open_high | review_files, gate_G2 | reviewer |
| REVIEW | REWORK | review_failed, rework_cycles_lt_max | review_findings_open_high | reviewer |
| REWORK | VALIDATION | rework_completed, cycles_lt_max | rework_changes | worker |
| REWORK | ESCALATED | cycles_gte_max | cycle_count, last_review | orchestrator |
| VERIFICATION | RELEASE_REVIEW | verification_passed | verification_log, independent_evidence | verifier |
| RELEASE_REVIEW | HUMAN_APPROVAL | release_review_completed, human_required | release-review.md, artifact_hash | release-manager |
| RELEASE_REVIEW | COMPLETED | release_passed, no_human_required | all_gates, receipt.json | orchestrator |
| HUMAN_APPROVAL | COMPLETED | human_approved | human_approval_event, receipt.json | human |
| HUMAN_APPROVAL | CANCELLED | human_rejected | human_rejection_event | human |
| ESCALATED | HUMAN_APPROVAL | escalation_requires_human | escalation_reason | orchestrator |
| ESCALATED | RECOVERY | recovery_possible | last_checkpoint | orchestrator |
| RECOVERY | EXECUTION | recovery_completed, checkpoint_restored | recovery_log, reconciled_state | orchestrator |
| RECOVERY | FAILED | recovery_failed | recovery_failure_reason | orchestrator |
| * | FAILED | unrecoverable_error | error_log | any |
| * | BLOCKED | blocked_by_dependency | blocker_description | any |
| * | CANCELLED | cancelled_by_human | cancellation_event | human |

## Invalid Transitions (Deterministically Rejected)

These must be rejected by state_machine.sh:

- EXECUTION -> COMPLETED (must go through VALIDATION, REVIEW, VERIFICATION)
- INTAKE -> COMPLETED (must complete lifecycle)
- PLANNING -> VERIFICATION (missing EXECUTION)
- BASELINE -> EXECUTION (missing CLASSIFICATION, PLANNING)
- VALIDATION -> COMPLETED (missing REVIEW, VERIFICATION)
- Any terminal -> non-terminal without RECOVERY

## Transition Validation Logic

```bash
./scripts/state_machine.sh validate --from EXECUTION --to COMPLETED
# -> INVALID: Must go through VALIDATION, REVIEW, VERIFICATION (reason from invalid_transitions)

./scripts/state_machine.sh transition --run RUN-001 --from EXECUTION --to VALIDATION
# Checks preconditions, evidence exists, allowed actor, then appends event
```

## Failure Behavior

- If preconditions fail: stay in current state, emit event GATE_FAILED or TRANSITION_FAILED, log reason
- If evidence missing: return NOT TESTED equivalent, do not transition
- If cycles exceed max: transition to ESCALATED, not infinite loop
- If unrecoverable: -> FAILED with error_log
- If blocked: -> BLOCKED with blocker_description

## Event Emission

Every transition attempt emits:

- GATE_STARTED / GATE_PASSED / GATE_FAILED (for validation)
- Or generic TRANSITION_ATTEMPTED / TRANSITION_COMPLETED / TRANSITION_REJECTED

Events go to `.eng/runs/RUN-xxx/events.jsonl` append-only.
