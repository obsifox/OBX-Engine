# Evidence Rules - Evidence Over Claims

## Principle
No gate or task may be marked PASS without reproducible artifact. If not run, status = NOT TESTED, never PASS.

## Allowed Statuses
- SOLVED: fixed with evidence
- UNSOLVED: attempted, still failing, evidence shows failure
- BLOCKED: cannot proceed, evidence of blocker
- NOT TESTED: capability missing or not executed, must state why
- NOT APPLICABLE: gate does not apply to this tier/project, justify
- ASSUMED: proceeding on explicit assumption, logged with risk

## Evidence Types (must be one)
1. Command output: full log saved to `.eng/artifacts/<task>-<timestamp>.log`, with exit code
2. File: path + hash (sha256) logged
3. Diff: git diff or file diff snippet + files changed

## Evidence Ledger Format (.eng/evidence.md)
```
## T1 - Implement auth
- Status: SOLVED
- Evidence: command `npm test` exit 0, log .eng/artifacts/T1-2025.log, 12 tests pass
- Artifact: src/auth.ts sha256:abc...
```

## Verification Requirements
- Build: exit code 0 log
- Tests: test runner output showing count, baseline comparison
- Lens review: review file with concrete findings list or explicit "Checked X,Y,Z - clean"
- Security: secret_scan.sh log + dep_audit.sh log
- Performance: benchmark output or statement "NOT TESTED - no bench harness"

## Anti-Patterns (FORBIDDEN)
- "Tests pass" without log
- "Highly performant" without measurement
- "Secure" without scan output
- Marking PASS when command not executed

## Report Lint
`scripts/report_lint.sh` must parse final report and evidence.md and reject if any PASS claim lacks evidence ref. Exit codes:
- 0 = clean
- 1 = claim without evidence
- 2 = evidence file missing

## Independent Verification
Verifier must only see: brief.md, plan.md, diff, evidence.md logs. Verifier re-runs gate_check. Its output is separate file `.eng/artifacts/verify.log`.

## Baseline
Record baseline before change:
- build exit code
- test counts
- existing lint/security findings
Save to evidence.md as BASELINE. Compare after change for regression detection.
