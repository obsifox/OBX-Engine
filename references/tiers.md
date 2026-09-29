# Tiers - Engineering Maturity Levels

## Tier 0: Trivial Change
**Entry Criteria:**
- <20 LOC change, single file, no architecture impact
- No DB schema, no new dependency, no security surface
- Examples: typo fix, config value, small bugfix, doc fix

**Process:** Intake -> Baseline -> Change -> Build/Test -> Report
**Gates:** G0 Build (exit 0)
**Lenses:** None required, optional docs
**Subagents:** 0
**Remediation cycles per gate:** 1
**Token budget guidance:** ~20k tokens, stop and report if exceeded
**Output:** diff + evidence.md + brief report

## Tier 1: Small Feature
**Entry Criteria:**
- 20-200 LOC, 1-3 files, clear spec
- No cross-cutting arch change, low risk
- Examples: small CLI command, single endpoint, UI component

**Process:** Intake -> Brief -> Baseline -> Plan (light) -> Build -> Independent Verify -> Report
**Gates:** G0 Build, G1 Tests (>= baseline)
**Lenses:** testing (mandatory), docs (if public API)
**Subagents:** max 1 (verifier only)
**Remediation cycles:** 2 per gate, then escalate
**Token budget:** ~60k
**Verification:** verifier sees only brief.md + diff + baseline + test output

## Tier 2: Structured App / Feature
**Entry Criteria:**
- 200-1000 LOC, multi-module, needs task graph
- Moderate risk, user-facing, or 2+ domains (e.g. backend+frontend)
- Examples: WooCommerce plugin feature, Android screen, API module

**Process:** Intake -> Brief -> Baseline -> Architecture note -> Plan with Task Graph -> Build (file-disjoint parallel allowed) -> Lens Reviews (2-3) -> Remediation -> Independent Verify -> Report
**Gates:** G0 Build, G1 Tests, G2 Lens Reviews (no HIGH open), G3 Security (secret_scan)
**Lenses:** Pick minimum 2-3 from {security, testing, performance, ux, docs, architecture}. Load on demand.
**Subagents:** max 3 (1 verifier + up to 2 parallel builders if file-disjoint)
**Remediation cycles:** 2 per gate
**Token budget:** ~150k
**Stop:** If budget hit, mark remaining NOT TESTED and report.

## Tier 3: Large / Production / Legacy
**Entry Criteria:**
- >1000 LOC OR production system OR legacy codebase OR high security sensitivity OR mission-critical
- Multiple domains, complex dependencies, release required

**Process:** Intake -> Deep Discovery (codebase scan) -> Brief -> Architecture Decision Records -> Task Graph with dependencies -> Parallel Module Work (file-disjoint) -> Integration -> Automated Validation -> Full Lens Audit (security, perf, architecture, testing, release) -> Remediation loop -> Final Audit -> Release Validation -> Delivery Report
**Gates:** All gates G0-G4. G4 Release requires artifact checksum matches reviewed source.
**Lenses:** All relevant, but still minimal effective set. At least security, testing, architecture, performance, release. Others on demand.
**Subagents:** max 6 (1 verifier + up to 5 parallel file-disjoint workers). Must prove file-disjoint via `git diff --name-only`.
**Remediation cycles:** 2 per gate, then escalate to user with options
**Token budget:** ~350k estimated, hard stop at 500k
**Additional Requirements:**
- Baseline includes perf and security scan if possible
- Change management doc for arch changes
- Rollback plan documented in decisions.md
- Compatibility / regression audit

## Tier Selection Rules
1. If any Tier 3 criteria matches -> Tier 3
2. Else if any Tier 2 criteria matches -> Tier 2
3. Else if Tier 1 criteria -> Tier 1
4. Else Tier 0
5. User can override up one tier with justification logged in decisions.md. Downward override requires evidence (e.g. "actually single file").

## Gate Definitions (Executable)
- G0 Build: `scripts/baseline.sh` or project build command exit 0
- G1 Tests: tests pass count >= baseline AND no new failures. If no test runner, NOT TESTED.
- G2 Lens: `scripts/gate_check.sh lens` - parses review files for HIGH/CRITICAL open
- G3 Security: `scripts/secret_scan.sh` exit 0 AND `scripts/dep_audit.sh` no HIGH
- G4 Release: artifact exists AND checksum logged in evidence.md

## Escalation
After 2 failed cycles: pause, update evidence.md with BLOCKED, ask user: [Continue with reduced scope / Override / Abort]. Do not loop infinitely.
