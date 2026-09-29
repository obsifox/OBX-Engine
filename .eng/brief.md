# Project Brief — eng-orchestrator rewrite of OBX Engine to v1.2

## Product
- What is being built: orchestrated rewrite of the OBX Engine milestone work the assistant authored, milestone by milestone, through the eng-orchestrator control plane, stopping at engine version 1.2.
- Who is it for: the OBX Engine maintainer (obsifox).
- Problem it solves: the v1.1 and v1.2 milestone code was produced without runs, gates, evidence or receipts; the rewrite re-derives the same milestone scope as governed engineering output.
- Core workflows: per milestone — INTAKE, BASELINE, CLASSIFICATION, PLANNING, EXECUTION, VALIDATION, REVIEW, VERIFICATION, RELEASE_REVIEW, COMPLETED.
- Success criteria: full suite stays >= baseline (701 tests green), gates G0-G5 PASS, receipt.json per milestone, deliverable docs + screenshot per milestone, rewrite stops after v1.2.

## Technical
- Existing architecture: 43-package TypeScript monorepo (obx-engine), vitest, tsc project references, Node 20.
- Languages / Frameworks: TypeScript, JavaScript demos, bash + python3 for the control plane.
- Dependencies: workspace-internal @obx/* packages only.
- Database / APIs: none; headless deterministic engine.
- Build / Deploy: npx tsc -b (project references), npx vitest run, GitHub releases.

## Operational
- Dev / Prod env: Linux sandbox, Node 20, git, GitHub remote obsifox/OBX-Engine.
- CI/CD: GitHub Actions workflows exist per package; releases via gh API with PAT.
- Monitoring / Logging: orchestrator run logs in .eng/runs/*/artifacts, engine EditorConsole.

## Security
- Auth / Authz: GitHub PAT held outside the repo (uploads path, never committed).
- Secrets handling: secret_scan gate over the tree; allow file with pattern | path | reason rows.
- Data sensitivity: none in code; no secrets in event log (skill rule).
- Attack surface: none (library code, no network listeners).

## Quality
- Existing tests: 701 green / 67 files (vitest), tsc clean across 18 packages.
- Known bugs / tech debt: shortcut Ctrl+P normalization quirk; gizmo rotate ring fallback; AssetBrowser search folder-name matching; this rewrite targets milestone scopes v1.1 (platform, runtime, jobs, vfs, resources) and v1.2 (graphics).

## Scope of rewrite
- v1.1.0 Runtime & Platform Foundation: @obx/platform, @obx/runtime (RuntimeHost), @obx/jobs, @obx/vfs, @obx/resources.
- v1.2.0 GPU Rendering Foundation: @obx/graphics (device, shaders, software, webgpu, webgl2).
- v1.3 and v1.4 scopes are explicitly out of scope for this stretch.
