# State Machine Implementation v1.1

## Config
- `config/state_machine.yaml`: 17 states, valid transitions, invalid transitions, terminal states

## Script
- `scripts/state_machine.sh`
  - `list-states`: list all states
  - `validate --from X --to Y`: check if transition valid, reject invalid deterministically
  - `transition --run RUN-xxx --from X --to Y --actor NAME`: validates, updates state.json, appends event
  - `current --run RUN-xxx`: shows current state
  - `history --run RUN-xxx`: shows events

## Validation Logic
- Checks if from/to are known states
- Checks explicit invalid_transitions with reason
- Checks valid map
- Checks terminal -> non-terminal without RECOVERY forbidden
- Emits TRANSITION_REJECTED event on failure

## Example

```bash
./scripts/state_machine.sh validate --from EXECUTION --to COMPLETED
# -> INVALID: Must go through VALIDATION, REVIEW, VERIFICATION

./scripts/state_machine.sh validate --from EXECUTION --to VALIDATION
# -> VALID

./scripts/run_manager.sh create --type feature --domain web --tier T2 --task "Add API"
# -> RUN-2026-000001

./scripts/state_machine.sh transition --run RUN-2026-000001 --from INTAKE --to BASELINE --actor orchestrator
# -> Updates .eng/runs/RUN-2026-000001/state.json, appends event
```

## Tests
- `tests/state_machine.test.sh`: 37 transition tests (valid + invalid)
- Must include failure cases, not only success

## Determinism
Same input + same state should produce same validation result.
