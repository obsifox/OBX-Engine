# Lens: Testing

## When to Load
Tier 1+ mandatory. Tier 0 optional but recommended if test runner exists.

## Checklist
- [ ] Baseline tests run and recorded (baseline_test.log with EXIT_CODE)
- [ ] New code has tests proportional to Tier (Tier1: happy path, Tier2: edge, Tier3: regression+integration)
- [ ] Tests are independent, not flaky
- [ ] No test that only asserts true
- [ ] Tests actually run (current_test.log exists)
- [ ] Coverage not claimed without measurement
- [ ] Regression tests for bugfixes

## Expected Output
- `.eng/artifacts/testing-review.md`:
  - Baseline: X pass / Y fail (from baseline_test.log EXIT_CODE)
  - After: X' pass / Y' fail (from current_test.log)
  - New tests list
  - Structured findings if issues: `- [F-001] severity=MED status=OPEN | Missing edge case test for ...`
  - Verdict
- Log files: baseline_test.log, current_test.log in artifacts/

## Tools
- `scripts/baseline.sh` -> produces baseline_test.log
- `scripts/gate_check.sh G1_Tests` -> runs current_test.log and compares

## Gate Condition
G1: current test exit 0 OR (if baseline also failing, must prove no new failures via count - future). If no runner, NOT TESTED with reason.

## Anti-Sycophancy
Must show command output. Cannot say "tests pass" without log path.
