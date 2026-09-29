# Lens: Release

## When to Load
Tier 2+ if artifact to deliver, Tier 3 always.

## Checklist
- [ ] Build artifact exists and matches reviewed source (checksum calculated via sha256sum)
- [ ] Version bumped per CHANGELOG.md
- [ ] No secrets in artifact
- [ ] Artifact size reasonable
- [ ] Release notes drafted
- [ ] Installation / deployment tested or marked NOT TESTED
- [ ] Rollback plan

## Expected Output
- `.eng/artifacts/release-review.md`:
  ```
  artifact: dist/app.zip
  sha256: abc...64hex...
  built_from: commit dc0c1cf
  verified: true (calculated via sha256sum)
  ```
  Must contain real sha256 hash calculated from file, not just string "sha256".
  - Build command log: .eng/artifacts/current_build.log
  - Verdict
- Release notes file

## Tools
- Build commands via lib_run.sh
- `sha256sum` or `shasum -a 256`
- `scripts/gate_check.sh release --no-run`

## Gate Condition
G4: artifact exists AND hash logged AND hash matches file content AND matches reviewed source. If no artifact needed, NOT_APPLICABLE with justification.
