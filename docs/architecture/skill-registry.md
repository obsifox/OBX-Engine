# Skill Registry v1.1

## Concept

Do not turn eng-orchestrator into giant collection of every possible skill.
Instead implement registry interface:

```
Skill Registry
  ├── built-in skills (lenses, playbooks, workflows, domains, agents)
  ├── project skills (.eng/skills/)
  └── external skills (.eng/skill_registry/)
```

## Manifest

```yaml
name: my-skill
version: 1.0.0
publisher: obsifox
license: MIT
description: "Does X"
platforms: [linux, mac, windows]
requires:
  permissions: [filesystem.read]
  network: deny
scripts: ["scripts/my_skill.sh"]
integrity:
  sha256: abc...
```

## Operations

- `discover`: list built-in, project, external skills
- `inspect --name NAME`: show skill details
- `validate --name NAME`: check manifest, permissions, integrity, suspicious patterns
- `load --name NAME`: validate then load (record in loaded.jsonl)
- `disable --name NAME`: disable

Script: `scripts/skill_registry.sh`

## Security

- Externally sourced skill treated as untrusted until validated
- Checks: manifest validity, unexpected executables, network perms, shell perms, secret access, dependency behavior, publisher metadata, integrity hash
- No auto remote code execution without explicit security controls
- Skill must declare required permissions before activation
