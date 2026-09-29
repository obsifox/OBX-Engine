# Workflows & Domains v1.1

## Separation

- **WORK TYPE** = what kind of engineering work (feature, bug-fix, refactor, etc.)
- **DOMAIN** = what technology area (wordpress, android, web, backend, etc.)

Never collapse Domain into Workflow.

## Workflow Types (11)

- `feature.yaml`: new feature, gates G0,G1,G2,G3, agents architect+worker+reviewer+verifier
- `bug-fix.yaml`: bug fix with regression protection, G0,G1
- `refactor.yaml`: refactor without behavior change, G0,G1,G2
- `migration.yaml`: data/code migration, human approval required, rollback plan
- `performance.yaml`: perf optimization, benchmark before/after
- `security.yaml`: security fix, risk high, agents include security-reviewer, G3
- `investigation.yaml`: investigate issue, no code change yet
- `testing.yaml`: add/improve tests, G0,G1
- `release.yaml`: release prep, G0-G4, human approval required
- `documentation.yaml`: docs improvement, G2
- `incident.yaml`: incident response, risk high, human approval

## Domain Overlays (extensible)

- `wordpress.yaml`: detects wp-config.php, adds security lens, nonce checks
- `android.yaml`: AndroidManifest.xml, checks permission, main thread IO
- `web.yaml`: package.json, checks XSS, CORS, bundle size
- `backend.yaml`: api/, server.js, checks authz, input validation, N+1

Domains must be extensible, not hard-coded into core.

## Composition

Final execution plan = base workflow + domain overlay + risk overlay + tier + project constraints

Example:
```yaml
task:
  type: bug-fix
domain:
  primary: wordpress
  secondary: [woocommerce]
risk:
  security: high
playbook:
  base: bug-fix
overlays:
  - wordpress
  - woocommerce
  - security
```

Script: `scripts/playbook_engine.sh compose --type feature --domain wordpress --risk security:high --tier T3`

## Preview Mode

`scripts/preview.sh` (eng preview) shows:
- project classification
- tier
- risk
- workflow
- domain
- required agents
- model policy
- permissions
- tools
- gates
- expected artifacts
- human approval points
- estimated complexity

Must NOT mutate repository.
