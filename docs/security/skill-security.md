# Skill Security v1.1

## Registry Interface

```
Skill Registry
  ├── built-in skills (lenses, playbooks, workflows, domains, agents)
  ├── project skills (.eng/skills/)
  └── external skills (.eng/skill_registry/)
```

Skill manifest:
```yaml
name:
version:
publisher:
license:
description:
platforms:
requires:
permissions:
network:
scripts:
integrity:
  sha256:
```

Registry supports: discover, inspect, validate, load, disable
Script: `scripts/skill_registry.sh`

## Security Checks for External Skills

- manifest validity
- unexpected executable files
- network permissions
- shell permissions
- secret access
- dependency behavior
- publisher metadata
- integrity hash

Skill should declare required permissions before activation.

## Security Rules

Never:
- execute arbitrary downloaded code automatically
- expose secrets to agents unnecessarily
- allow unrestricted shell by default
- allow unrestricted network by default
- delete user work automatically
- overwrite user changes silently
- deploy without explicit policy
- trust agent claims without evidence

Security-sensitive ops require:
- explicit permission +
- appropriate gate +
- evidence +
- human approval when configured

## Permission Matrix

See `docs/security/permissions.md` and `config/permissions.yaml`

## Secret Scanning

- `scripts/secret_scan.sh` scans for secrets, excludes tests/
- Even security-reviewer cannot read secrets (secret.read=deny)
- Only human can read secrets
- .env must be gitignored
