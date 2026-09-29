# Structured Knowledge v1.1

## Structure

```
.eng/
└── knowledge/
    ├── lessons/
    ├── failures/
    ├── decisions/
    ├── patterns/
    └── regressions/
```

## Lesson Schema

```yaml
id: L-001
category: security | testing | architecture | ...

trigger: "When X happens"

failure: "What failed"

root_cause: "Why"

correction: "How to fix"

evidence: "Link to evidence"

applicable_when: "When to apply"

confidence: low | medium | high

created: ISO8601
last_verified: ISO8601
```

## Promotion Control

- Agents must NOT freely modify trusted knowledge
- Promotion requires: frequency >=3 or 1 CRITICAL, evidence links, controlled process
- See `lessons.md` for legacy mechanism, now extended to structured knowledge

## Example

```yaml
id: L-002
category: architecture
trigger: "When task graph has circular dependency"
failure: "Deadlock in execution"
root_cause: "Missing acyclic check"
correction: "Add cycle detection in state_machine.sh validate"
evidence: ".eng/runs/RUN-2026-000005/events.jsonl"
applicable_when: "Tier 2+ with task graph"
confidence: high
created: 2026-09-29
last_verified: 2026-09-29
```
