# Agent Contracts v1.1

## Contract Schema

```yaml
name: agent-name
role: role-name
purpose: description

inputs:
  - input1
outputs:
  - output1

capabilities:
  - capability1

permissions:
  filesystem: read/write
  shell: deny/restricted/limited/execute
  network: deny/limited/read/write
  git: deny/read/write
  dependency.install: deny/limited/install
  database.read: deny/read
  database.write: deny/write
  deployment.execute: deny/approval_required/execute
  secret.read: deny/read

tools:
  - tool1

model_policy:
  reasoning: low/medium/high
  preferred_class: ...

delegation:
  allowed: true/false
  max_children: N
  allowed_roles: [...]

termination:
  required: condition

failure_policy:
  on_failure: escalate/retry_then_escalate/block_release
  max_retries: N

evidence_required:
  - evidence1
```

## Agents Implemented

- `agents/architect.yaml`: architecture design, tier selection, task graph, high reasoning, filesystem read, shell restricted
- `agents/worker.yaml`: implementation, filesystem write, shell execute, delegation false
- `agents/reviewer.yaml`: review with structured findings, filesystem read
- `agents/security-reviewer.yaml`: security vulnerabilities, secret scan, filesystem read, no secret read
- `agents/verifier.yaml`: independent verification, fresh context, high reasoning
- `agents/release-manager.yaml`: release validation, hash verification, deployment approval_required

## Anti-Persona Rule

Do NOT create:
- CEO Agent, CTO Agent, Senior Wizard, Master Architect, Lead Genius

Use concrete executable responsibilities:
- architect, investigator, worker, reviewer, security-reviewer, verifier, integrator, release-manager

Each has measurable authority and outputs.

## Permission Enforcement

- `scripts/permission_check.sh check --agent NAME --tool TOOL` validates per `config/permissions.yaml`
- Violation logged as PERMISSION_VIOLATION and blocked
- No agent may have secret.read except human
