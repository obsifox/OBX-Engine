# Evidence Ledger

## T0 - Baseline before change (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/baseline.sh` exit 0, build EXIT_CODE=0 test EXIT_CODE=0, 701 tests / 67 files pass, logs .eng/artifacts/baseline_build.log and .eng/artifacts/baseline_test.log

## T1 - Rewrite v1.1 packages (RUN-2026-000001)
- Status: SOLVED
- Evidence: diff restructures platform/src, jobs/src, vfs/src, resources/src into focused modules (monoliths 708/496/332/296 LOC), test sources untouched
- Artifact: platform/src/index.ts (12 modules), jobs/src/index.ts (7 modules), vfs/src/index.ts (6 modules), resources/src/index.ts (4 modules)

## T2 - Gate G0_Build (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh G0_Build` exit 0, log .eng/artifacts/current_build.log with EXIT_CODE=0

## T3 - Gate G1_Tests (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh G1_Tests` exit 0, log .eng/artifacts/current_test.log, 701 tests / 67 files pass, identical counts to baseline log .eng/artifacts/baseline_test.log

## T4 - Gate G2_Lens (RUN-2026-000001)
- Status: SOLVED
- Evidence: review file .eng/artifacts/architecture-review.md structured findings F-001..F-007, no open HIGH/CRITICAL, `bash scripts/gate_check.sh G2_Lens` exit 0

## T5 - Gate G3_Security (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/secret_scan.sh` RESULT PASS no secrets (log .eng/artifacts/secret_scan.log), `npm audit` 0 vulnerabilities after vitest 4.1.11 upgrade (was critical=1 high=1), `bash scripts/dep_audit.sh` RESULT PASS (log .eng/artifacts/dep_audit.log)

## T6 - Gate G5_Project (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh G5_Project` exit 0, extra example_demos runs v110/v120/v130/v140 demos exit 0

## T7 - Gate G4_Release (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh G4_Release` exit 0, artifact docs/screenshots/v110-rewrite.svg sha256:7f99770429212f9ffbe0028a4a9f241f494d6dfc0ca219c9374e4a27a0a9fc50 verified against .eng/artifacts/release-review.md

## T8 - Rewrite v1.2 graphics (RUN-2026-000002)
- Status: SOLVED
- Evidence: diff restructures graphics/src software/webgpu/webgl2/shaders into 18 modules (749/567/539/323 LOC monoliths), device.ts contract kept, graphics suite 30/30 and full suite 701/701 pass (logs .eng/artifacts/current_test.log)
- Artifact: graphics/src/software/, graphics/src/webgpu/, graphics/src/webgl2/, graphics/src/shaders/

## T9 - Gates G0-G5 (RUN-2026-000002)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh all` G0_Build PASS G1_Tests PASS G2_Lens PASS (review .eng/artifacts/architecture-review.md F-101..F-108) G3_Security PASS G4_Release PASS artifact docs/screenshots/v120-rewrite.svg sha256:df1acaa3b882473c4757d1e0116fb735f12fd308b6a8cd08e93c2b33255eaa6f G5_Project PASS

## T10 - Receipts and state machine
- Status: SOLVED
- Evidence: files .eng/runs/RUN-2026-000001/receipt.json and .eng/runs/RUN-2026-000002/receipt.json generated, both runs COMPLETED via legal transitions (events.jsonl in each run dir)

## T11 - Known debt carried forward
- Status: UNSOLVED
- Evidence: structured findings F-006 F-007 F-107 F-108 status=OPEN severity=LOW in .eng/artifacts/architecture-review.md

## T12 - Rewrite v1.3 assets package (RUN-2026-000003)
- Status: SOLVED
- Evidence: diff restructures assets/src importers/database/scenes into 15 modules (456/429/289 LOC monoliths), test sources untouched, assets suite 36/36 and full suite 701/701 pass (logs .eng/artifacts/current_test.log)
- Artifact: assets/src/importers/, assets/src/database/, assets/src/scenes/

## T13 - Gates G0-G5 (RUN-2026-000003)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh all` G0_Build PASS G1_Tests PASS G2_Lens PASS (review .eng/artifacts/architecture-review.md F-201..F-206) G3_Security PASS G4_Release PASS artifact docs/screenshots/v130-rewrite.svg sha256:1b45c455cb5b3781c93bd56b65ac8d2ab5153dec3cc14b71b246384a523583cb G5_Project PASS
- Artifact: .eng/runs/RUN-2026-000003/receipt.json
