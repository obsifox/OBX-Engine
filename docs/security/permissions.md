# Permission System v1.1 - Least Privilege

## Principle
Permissions must be explicit and enforceable. No agent gets unlimited access by default.

## Permission Types
- `filesystem.read` / `filesystem.write`
- `shell.read` / `shell.execute` (plus restricted/limited variants)
- `network.read` / `network.write` / `network.deny` / `limited`
- `git.read` / `git.write`
- `dependency.install` / `limited` / `deny`
- `database.read` / `database.write`
- `deployment.execute` / `approval_required` / `deny`
- `secret.read` / `deny`

## Matrix

| Role | FS Read | FS Write | Shell | Network | Git | Dep Install | DB | Deploy | Secret |
|------|---------|----------|-------|---------|-----|-------------|----|--------|--------|
| Architect | ✓ | - | restricted | deny | R | deny | deny | deny | deny |
| Investigator | ✓ | - | restricted | R | R | deny | - | deny | deny |
| Worker | ✓ | ✓ | execute | limited | W | limited | deny | deny | deny |
| Reviewer | ✓ | - | restricted | deny | R | deny | deny | deny | deny |
| Security | ✓ | - | restricted | deny | R | deny | deny | deny | deny |
| Verifier | ✓ | - | restricted | deny | R | deny | deny | deny | deny |
| Release | ✓ | ✓ | execute | limited | W | deny | - | approval | deny |
| Human | ✓ | ✓ | execute | W | W | install | RW | execute | R |

## Enforcement

- Agent contracts in `agents/*.yaml` declare permissions
- `scripts/permission_check.sh` validates agent can use tool
- Violation logged as event `PERMISSION_VIOLATION` and blocked
- No agent may have `secret.read=read` except human
- `filesystem.write` only worker, release-manager, human
- `deployment.execute` requires human approval for release-manager

## Example

```yaml
# agents/security-reviewer.yaml
permissions:
  filesystem: read
  shell: restricted
  network: deny
  git: read
  secret.read: deny
```

Even security reviewer cannot read secrets, only scan for them via `secret_scan.sh`.

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
