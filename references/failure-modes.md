# Failure Modes - Detection & Mitigation

Each failure must have measurable detection, not just name.

## 1. False Completion
**Detection:** report_lint.sh finds SOLVED without evidence ref OR gate marked PASS but artifacts/ missing.
**Mitigation:** Enforce evidence-rules.md. Gate_check fails if no artifact. Block delivery.

## 2. Hallucinated Validation
**Detection:** Evidence claims command run but .eng/artifacts/ log missing or timestamp future. Verifier re-run fails.
**Mitigation:** Require logs saved immediately after run. Verifier independent. Status NOT TESTED if log absent.

## 3. Over-Delegation
**Detection:** subagent_calls > tier limit OR lenses loaded > minimal set (e.g. Tier 0 loads 5 lenses). Token budget burn >50% before build.
**Mitigation:** Tier caps in tiers.md. Load lenses on demand only. Orchestrator must justify each lens in decisions.md.

## 4. Under-Delegation
**Detection:** Tier 2+ project skips security lens but handles auth/secrets. Or no independent verifier for Tier1+.
**Mitigation:** Mandatory lenses per tier. Gate G2 fails if required lens missing. Checklist in plan.md.

## 5. Context Drift
**Detection:** Two tasks define conflicting arch decisions (decisions.md has contradicting ADRs without supersede note). File content differs from state.json description.
**Mitigation:** Versioned .eng/state.json as source of truth. All specialists read brief+decisions before writing. State version incremented on decision change.

## 6. Architecture Drift
**Detection:** Implementation diff introduces pattern not in plan.md/architecture note. New dependency not approved.
**Mitigation:** Architecture lens reviews diff vs plan. Require approval for arch changes. Baseline architecture snapshot in .eng/.

## 7. Infinite Review Loop
**Detection:** Same gate fails >2 cycles with same error. remediation count in state.json >2.
**Mitigation:** Hard cap 2 cycles per gate, then escalate to user. Log BLOCKED.

## 8. Over-Engineering
**Detection:** Tier 0 task produces microservices, >5 files for <20 LOC requirement, or adds framework without need.
**Mitigation:** Tier defines proportional output. Plan must justify complexity. Reviewer checks LOC/file count vs requirement.

## 9. Under-Engineering
**Detection:** Tier 3 task has no task graph, no security scan, single file for multi-domain. Gates missing.
**Mitigation:** Tier entry criteria forces process. Gate_check fails if required gates NOT APPLICABLE without justification.

## 10. Scope Explosion
**Detection:** Tasks in plan.md grow beyond brief.md requirements without REQUIRED-FOR-ACCEPTANCE label. New features not in brief.
**Mitigation:** Classify findings: REQUIRED-FOR-ACCEPTANCE vs BACKLOG. BACKLOG does not block release. User approval needed for scope addition.

## 11. Role Explosion / Persona Theater
**Detection:** Lenses described as personas with names, or >7 lenses loaded, or lens files contain role-play instructions.
**Mitigation:** Lenses are checklists + expected output + tool. No names. Max 5 lenses for Tier 3. See lenses/*.md format.

## 12. Stale Context
**Detection:** Agent uses file content from earlier in chat that has been changed on disk. Hash mismatch.
**Mitigation:** Always re-read files before edit. Use file hashes in evidence. Checkpoint before mutation.

## 13. Parallel File Conflicts
**Detection:** Two parallel workers edit same file (git diff --name-only overlap).
**Mitigation:** Before parallel work, partition files explicitly in plan.md. Prove disjoint via script. If overlap detected, serialize.

## General Mitigation Process
1. Detect via script or checklist
2. Log in evidence.md as risk with severity
3. Mitigate per above
4. Re-verify via gate_check
5. If not mitigated in 2 cycles -> escalate.
