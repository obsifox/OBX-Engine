# Composed Execution Plan v1.1

## Base Workflow: refactor
name: refactor
description: "Refactor without behavior change"
type: workflow
states_required: [INTAKE, BASELINE, CLASSIFICATION, PLANNING, EXECUTION, VALIDATION, REVIEW, VERIFICATION]
gates: [G0_Build, G1_Tests, G2_Lens]
agents_required: [architect, worker, reviewer, verifier]
max_rework_cycles: 2
artifacts_expected: [plan.md, architecture_note, no_behavior_change_proof, tests_pass]

## Domain Overlay: game-development
name: game-development
type: domain_overlay
description: "Game development (engine, gameplay)"
detection:
  files: ["Assets/", "ProjectSettings/", "src/engine/", "Unity/", "Unreal/"]
overlays:
  lenses: [performance, testing, architecture]
  checks: [no_gc_in_loop, asset_leak, fixed_timestep, object_pooling]
  playbook_base: references/playbooks/game-engine-typescript.md
risk_modifiers:
  performance: high

## Risk Overlay: performance:high
Risk: performance:high

## Tier: T2
Model routing for tier T2:
  T2:
    description: structured 200-1000 LOC
    token_budget: 150000
    max_subagents: 3
    model_routing:
      architect: high
      worker: medium
      reviewer: high
      security-reviewer: high
      verifier: high
      formatter: low

## Final Composition
Execution plan = base workflow (refactor) + domain overlay (game-development) + risk overlay (performance:high) + tier (T2) + project constraints

## Required Agents (from composition)
agents_required: [architect, worker, reviewer, verifier]
max_rework_cycles: 2
artifacts_expected: [plan.md, architecture_note, no_behavior_change_proof, tests_pass]

## Required Gates
gates: [G0_Build, G1_Tests, G2_Lens]
agents_required: [architect, worker, reviewer, verifier]
max_rework_cycles: 2
artifacts_expected: [plan.md, architecture_note, no_behavior_change_proof, tests_pass]

## Generated At: 2026-09-30T06:57:16Z
