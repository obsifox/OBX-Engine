# Adapter Layer v1.1 - Cross-Platform

## Goal

Core orchestration engine must not be tightly coupled to one AI vendor.

## Structure

```
adapters/
  claude/adapter.yaml
  codex/adapter.yaml
  copilot/adapter.yaml
  generic/adapter.yaml
```

## Abstraction

Adapter translates:
- agent contract
- tool contract
- model policy
- permission policy
- workflow state

into provider-specific execution.

## Model Mapping Example

```yaml
# adapters/claude/adapter.yaml
model_mapping:
  low: claude-3-haiku
  medium: claude-3-sonnet
  high: claude-3-opus
```

## Generic Adapter

Always available, no vendor lock-in. Uses local bash+python.

## Provider Independence

- Core logic in `config/` + `scripts/` remains provider-independent
- Only adapters contain vendor-specific mapping
- Routing uses reasoning level (low/medium/high), not vendor model names directly
