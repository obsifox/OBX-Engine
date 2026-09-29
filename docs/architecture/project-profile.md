# Project profile — `.eng/project.yaml`

> Status: shipped in v1.2.0 · Owner: Lead Architect · Source: `scripts/project_profile.py`

## Why it exists

The control plane has to run in repositories that are not Node, Go or Python. Before
v1.2, `detect_cmds()` guessed from file names, and it guessed wrong for PHP: a `tests/`
directory looked like a pytest project, so a WordPress plugin's build and test commands
were never found and every gate came back `NOT TESTED`.

A repository now declares its own commands once, in `.eng/project.yaml`. The file is the
project's answer to "how do I build, test and lint myself" — and gates stop guessing.

## The format

```yaml
name: DashWoo
kind: wordpress-plugin

commands:
  build: php bin/build.php --out=/home/user/releases
  test: php tests/run.php
  lint: php bin/lint.php

gates:
  extras:
    - name: docs_in_sync
      command: python3 tools/docs/generate.py --check
      required: true
    - name: upload_verify
      command: python3 tools/verify-upload.py 1.6.0
      required: false          # optional: a failure is a warning, not a gate failure

secret_scan:
  allow: .eng/secret_scan.allow
```

Supported subset: nested maps, lists (`- item`), lists of maps, scalars, quoted strings,
booleans and numbers, and `#` comments. Anything else — tabs for indentation, flow style
(`[a, b]`, `{a: b}`) — is **rejected with a line number** (exit 5). A profile that is
half-read is worse than no profile.

## Command resolution order

1. `.eng/project.yaml` → `commands.build`, `commands.test`, `commands.lint`.
2. `package.json` → `npm run build`, `npm test`.
3. `composer.json` → `composer test` / `composer build` (only when a `composer` binary
   exists), else `php tests/run.php` when that file is present.
4. `tests/run.php` → `php tests/run.php` (any PHP tree).
5. `go.mod` → `go test ./...`; `pytest.ini` / `pyproject.toml` / `tests/` → pytest;
   `Makefile` → `make test` / `make build`; `gradlew` → `./gradlew test`.
6. `phpunit.xml` / `phpunit.xml.dist` → `vendor/bin/phpunit` when executable, else `phpunit`.

Rule of thumb: **the more specific the file, the earlier it is consulted.** PHP is checked
before the generic pytest heuristic, which is what makes a `tests/` directory safe again.

## Gate extras (G5_Project)

```bash
./scripts/eng.sh gate G5_Project          # runs every declared extra
./scripts/eng.sh gate G5_Project --no-run # inspects the existing logs instead
```

Each extra runs through `run_step`, so the result is `.eng/artifacts/profile_<name>.log`
with `EXIT_CODE=` on the last line. Nothing is read from `state.json`.

| Situation | Result |
| --- | --- |
| every required extra exits 0 | `PASS` (0) |
| a required extra exits non-zero | `FAIL` (1) |
| only an optional extra exits non-zero | `PASS with WARNINGS` (0) |
| no profile, or no `gates.extras` | `NOT APPLICABLE` (3) |
| `--no-run` and an extra has no log | `NOT TESTED` (2) |

`G5_Project` is part of `gate all`, so the project's own checks sit beside build, tests,
review and security rather than in a side script.

## Secret-scan allow list

`.eng/secret_scan.allow`, one entry per line:

```
pattern | path-substring | reason
```

* `pattern` — the scan pattern (`github_pat_`) or a regex that matches it.
* `path-substring` — the file the allowance covers. **Required**: an allowance without a
  path would silently whitewash a whole pattern.
* `reason` — **required**. An entry without a reason is ignored and reported as
  `ALLOWANCE IGNORED (no reason)` in the log.

Every allowance is printed in the scan log with its reason, and the closing summary counts
how many were applied. A hit that is not covered by an entry stays a finding, and the scan
exits 1. The point is not to hide the pattern `github_pat_` in a repository that documents
a token scanner; the point is that nothing is ignored silently.

## Validation

```bash
python3 scripts/project_profile.py --check            # 0 ok, 3 none, 4 empty, 5 malformed
python3 scripts/project_profile.py --shell            # eval-able variables for lib_run.sh
python3 scripts/project_profile.py --gates            # name|command|required
python3 scripts/project_profile.py --get network.allowed_hosts
```

`tests/project_profile.test.sh` covers all of the above with 17 executable asserts,
including the two failure modes that matter: an undocumented occurrence still fails the
scan, and a reasonless allowance does not apply.
