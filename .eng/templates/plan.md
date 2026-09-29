# Project Plan

## Tier: {{tier}}
## Budget: tokens {{used}}/{{budget}}, subagents {{used}}/{{max}}

## Task Graph
| ID | Description | Owner Lens | Dependencies | Acceptance | Status | Evidence Ref |
|----|-------------|------------|--------------|------------|--------|--------------|
| T1 | | | none | | TODO | |

## Dependency Diagram
```
T1 -> T2 -> T3
```

## File Partition (for parallel work)
- Worker A: file1, file2 (disjoint proof)
- Worker B: file3, file4

## Risks
| ID | Risk | Prob | Impact | Mitigation | Owner | Status |
|----|------|------|--------|------------|-------|--------|
| R1 | | | | | | |

## Scope Control
- REQUIRED-FOR-ACCEPTANCE:
- BACKLOG:

## Gates
- G0 Build: command + expected exit 0
- G1 Tests: baseline vs expected
- G2 Lens: which lenses, no HIGH open
- G3 Security: scans
- G4 Release: artifact + hash

## Rollback Plan
- Branch: eng/...
- Checkpoint: .eng/checkpoint/
