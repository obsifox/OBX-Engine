# Composed Execution Plan v1.1

## Base Workflow: feature
name: feature
description: "Implement new feature"
type: workflow
version: 1.2.1

states_required:
  - INTAKE
  - BASELINE
  - CLASSIFICATION
  - PLANNING
  - EXECUTION
  - VALIDATION
  - REVIEW
  - VERIFICATION
  - RELEASE_REVIEW

gates:
  - G0_Build
  - G1_Tests
  - G2_Lens
  - G3_Security

agents_required:
  - architect
  - worker
  - reviewer
  - verifier

agents_optional:
  - security-reviewer
  - release-manager

permissions_default:
  worker: {filesystem: write, shell: execute}

max_rework_cycles: 2

human_approval:
  required_when:
    - adds_dependency
    - arch_change
    - db_schema_change

artifacts_expected:
  - plan.md
  - changed_files
  - current_build.log
  - current_test.log
  - review_files
  - verification_log
  - receipt.json

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

## Risk Overlay: none

## Tier: T3
Model routing for tier T3:
  T3:
    description: large/prod/legacy >1000 LOC
    token_budget: 350000
    max_subagents: 6
    model_routing:
      architect: high
      investigator: medium
      worker: medium
      reviewer: high
      security-reviewer: high
      verifier: high

## Final Composition
Execution plan = base workflow (feature) + domain overlay (game-development) + risk overlay () + tier (T3) + project constraints

## Required Agents (from composition)
agents_required:
  - architect
  - worker
  - reviewer
  - verifier

agents_optional:
  - security-reviewer
  - release-manager

permissions_default:
  worker: {filesystem: write, shell: execute}

max_rework_cycles: 2

human_approval:
  required_when:
    - adds_dependency
    - arch_change
    - db_schema_change


## Required Gates
gates:
  - G0_Build
  - G1_Tests
  - G2_Lens
  - G3_Security

agents_required:
  - architect
  - worker
  - reviewer
  - verifier

## Generated At: 2026-10-01T08:41:56Z
