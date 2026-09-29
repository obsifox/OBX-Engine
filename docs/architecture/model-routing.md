# Model Routing v1.1

## Separation

- **Tier** = engineering complexity/risk (T0-T3)
- **Model** = execution capability (low/medium/high)

Never collapse Tier into Model.

## Routing Example

```yaml
tier: T3

agents:
  architect:
    reasoning: high
  investigator:
    reasoning: medium
  worker:
    reasoning: medium
  reviewer:
    reasoning: high
  formatter:
    reasoning: low
```

## Adapter Layer

```
adapters/
  claude/
  codex/
  copilot/
  generic/
```

Core logic remains provider-independent. Adapter translates:
- agent contract
- tool contract
- model policy
- permission policy
- workflow state

into provider-specific execution.

## Cost Awareness

Optional telemetry:
- agent count
- model usage
- execution duration
- tool calls
- review cycles
- rework cycles
- tokens
- estimated cost

Never require telemetry to be enabled.

## Determinism

Same input + same repo state + same config + same policy should produce approximately same:
- routing
- tier
- workflow
- required gates

Agent implementation may remain nondeterministic, orchestration policy should not.
