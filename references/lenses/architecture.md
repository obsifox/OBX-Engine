# Lens: Architecture

## When to Load
Tier 2+ OR any task with cross-module dependencies, new patterns, or >3 files.

## Checklist
- [ ] Architecture proportional to Tier (no microservices for Tier 0)
- [ ] Follows existing project conventions (check README, existing code)
- [ ] Task Graph dependencies acyclic and justified
- [ ] No hidden coupling, no circular deps
- [ ] Decision Records in decisions.md for major choices
- [ ] Rollback plan documented
- [ ] File-disjoint partitioning for parallel work

## Expected Output
- `decisions.md` entry ADR-N with Context/Problem/Options/Chosen/Trade-offs
- Review file `.eng/artifacts/arch-review.md` with structured findings:
  ```
  - [F-001] severity=HIGH status=OPEN | Circular dependency between A and B
  - [F-002] severity=LOW status=CLOSED | Renamed module per ADR-2
  ```
  Format: `- [F-XXX] severity=... status=OPEN|CLOSED | description`
  If clean, explicitly list checked: "Checked: file1, file2, task graph - clean"
  - Verdict: PASS / FAIL

## Tools
- Read existing code, docs
- `scripts/gate_check.sh architecture --no-run` (after review files created)

## Anti-Sycophancy
Must list concrete files checked. Cannot say "architecture looks good" without file refs.

## Gate Condition
No open CRITICAL/HIGH findings in structured format AND decisions.md exists for Tier2+.
