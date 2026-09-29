# Final Delivery Report Template

> User-facing language must match user's language. If user wrote Persian, write report in Persian but keep technical terms English. This template is in English as base; translate sections when needed.

---

# PROJECT DELIVERY REPORT

**Project:** {{project.name}}
**Tier:** {{tier}} | **Version:** {{state.version}}
**Date:** {{ISO8601}}
**Status:** PASS / PASS WITH WARNINGS / BLOCKED

## Executive Summary
- What was requested (1-2 sentences from brief.md)
- What was delivered (SOLVED tasks)
- Honest overall status

## Implemented Features
List with evidence refs:
- T1: Feature - Status SOLVED - Evidence `.eng/artifacts/T1.log`

## Architecture
- Brief architecture diagram or description
- Decisions: link to decisions.md ADR-IDs
- Trade-offs

## Technical Decisions
| ID | Decision | Reason | Alternatives Rejected |
|----|----------|--------|----------------------|
| ADR-1 | ... | ... | ... |

## Testing
- Baseline: X tests before
- After: Y tests, Z new
- Command: `npm test` exit 0 log ref
- Coverage if available, else NOT TESTED with reason
- Statuses: SOLVED / NOT TESTED / etc per evidence-rules

## Security
- secret_scan.sh result (log ref)
- dep_audit.sh result
- Findings: list with severity, status
- If NOT TESTED, state why

## Performance
- Measured / Estimated / NOT TESTED
- If measured: benchmark output ref
- If NOT TESTED: explicit statement

## Compatibility / Regression
- Baseline vs now
- Affected modules
- Regression risks

## Documentation
- Files updated: README, etc
- What remains TODO (BACKLOG)

## Known Limitations
- Honest list, not hidden

## Technical Debt
- List with severity

## Remaining Risks
- From state.json risks[]

## Release Status
- G0 Build: PASS/FAIL + evidence
- G1 Tests: ...
- G2 Lens: ...
- G3 Security: ...
- G4 Release: PASS/NOT_APPLICABLE + artifact hash

## Files Changed
- git diff --stat output or list

## Validation Evidence
- Links to .eng/artifacts/
- Verifier log: .eng/artifacts/verify.log

## Recommended Next Steps
- BACKLOG items prioritized

## Honesty Checklist (must fill)
- [ ] No PASS without evidence
- [ ] report_lint.sh exit 0 (log ref)
- [ ] All NOT TESTED explicitly listed with reason
- [ ] No hallucinated metrics

---

## Persian Example Opening (if user language Persian)
```
# گزارش تحویل پروژه

پروژه: ...
وضعیت: ...
خلاصه: ...
```
Keep code/commands English.
