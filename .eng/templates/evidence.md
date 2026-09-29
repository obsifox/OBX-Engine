# Evidence Ledger

> Every status must have evidence. No PASS without artifact.

## BASELINE
- Date: ISO8601
- Build: command `...` exit X log .eng/artifacts/baseline.log
- Tests: X pass Y fail log ref
- Security: secret_scan exit X log ref
- Files hash: ...

## T1 - Task description
- Status: SOLVED | UNSOLVED | BLOCKED | NOT TESTED | NOT APPLICABLE | ASSUMED
- Evidence: command `npm test` exit 0 log .eng/artifacts/T1.log, 12 tests
- Artifact: src/file.ts sha256:abc...
- Timestamp: ISO8601

## Assumptions
- A1: ASSUMED Node 20 available - Risk MED - Reason: not tested - Affects build

## Risks
- R1: ... Severity HIGH Status OPEN

## Gate Results
- G0 Build: PASS log ref / FAIL log ref / NOT TESTED reason
- G1 Tests: ...
