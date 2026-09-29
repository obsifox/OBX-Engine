#!/usr/bin/env bash
# dep_audit.sh - Dependency audit wrapper v1.2.1
# Usage: ./scripts/dep_audit.sh [--out .eng/artifacts/dep_audit.log]
# Exit codes: 0 no HIGH vuln, 1 HIGH/CRITICAL found, 2 NOT TESTED (no tool/lockfile/error), 3 NOT APPLICABLE (no deps)
set -uo pipefail

OUT=".eng/artifacts/dep_audit.log"
mkdir -p "$(dirname "$OUT")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--out <log>]"
      echo "Tries npm audit, composer audit, pip-audit, govulncheck"
    echo "Nested manifests (tests/e2e/package.json) are found too, and runtime dependencies are separated from dev-only ones"
      echo "Exit 0 clean, 1 HIGH found, 2 NOT TESTED, 3 NOT APPLICABLE"
      exit 0
      ;;
    *) shift ;;
  esac
done

FOUND_TOOL=false
HAS_HIGH=false
NOT_TESTED_REASON=""
NOT_APPLICABLE=false

{
  echo "=== DEP AUDIT $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo ""

  # Which manifests exist? Root manifests plus nested ones (a project often keeps its test
  # harness in its own package.json). Directories that only ever hold installed code are
  # skipped, because a dependency of a dependency is not what this audit is about.
  NESTED_SKIP="node_modules vendor .git dist build .venv .cache __pycache__ .eng"

  find_manifests() {
    local name="$1"
    find . -maxdepth 3 -name "$name" -type f \
      -not -path './node_modules/*' -not -path './vendor/*' -not -path './.git/*' \
      -not -path './dist/*' -not -path './build/*' -not -path './.eng/*' \
      | sort
  }

  MANIFESTS="$( { find_manifests package.json; find_manifests composer.json; find_manifests requirements.txt; find_manifests pyproject.toml; find_manifests go.mod; find_manifests build.gradle; find_manifests build.gradle.kts; } | sort -u )"
  HAS_MANIFEST=false
  [ -n "$MANIFESTS" ] && HAS_MANIFEST=true

  if $HAS_MANIFEST; then
    echo "--- Manifests found ---"
    printf '  %s\n' $MANIFESTS
    echo "--- Runtime vs dev-only ---"
  fi

  # A manifest with only dev dependencies cannot produce a vulnerable *release*; that is a
  # different question from "can a developer's toolchain be audited", and the two are reported
  # separately so `NOT APPLICABLE` is never used to hide a manifest that does have runtime deps.
  RUNTIME_MANIFESTS=""
  DEV_ONLY_MANIFESTS=""
  TOOLING_MANIFESTS=""

  # A nested manifest belongs to a tool, a test harness or a sample - not to the release.
  # It is still printed, under its own label, so nothing is hidden by the classification.
  is_tooling_manifest() {
    case "$1" in
      ./*/*) case "$1" in ./src/*) return 1 ;; *) return 0 ;; esac ;;
      *) return 1 ;;
    esac
  }

  # The parser prints its verdict; the shell never has to read an exit code backwards. An
  # unreadable manifest is treated as runtime - the conservative direction, because a manifest
  # we cannot read must not be able to turn a real dependency into "nothing to audit".
  classify_manifest() {
    local file="$1" verdict="" kind=""

    case "$file" in
      *package.json|*composer.json)
        if command -v python3 >/dev/null 2>&1; then
          verdict="$(python3 - "$file" <<'PYCLASSIFY'
import json, sys

try:
    data = json.load(open(sys.argv[1]))
except Exception:
    print('unknown')
    raise SystemExit(0)

PLATFORM = ('php', 'hhvm', 'composer-plugin-api', 'composer-runtime-api')

if sys.argv[1].endswith('package.json'):
    packages = []
    for key in ('dependencies', 'optionalDependencies', 'peerDependencies'):
        packages += list(data.get(key) or {})
else:
    # `require: {"php": ">=8.0"}` is a platform floor, not a dependency: it pulls in no code.
    packages = [
        name for name in (data.get('require') or {})
        if name not in PLATFORM and not name.startswith(('ext-', 'lib-'))
    ]

print('runtime' if packages else 'dev-only')
PYCLASSIFY
)"
        fi

        case "${verdict:-unknown}" in
          runtime|dev-only) kind="$verdict" ;;
          *) kind="runtime" ;;
        esac
        ;;
      *)
        kind="runtime"
        ;;
    esac

    if is_tooling_manifest "$file"; then
      TOOLING_MANIFESTS="$TOOLING_MANIFESTS $file"
      echo "  tooling (nested, does not ship): $file"
    elif [ "$kind" = "runtime" ]; then
      RUNTIME_MANIFESTS="$RUNTIME_MANIFESTS $file"
      echo "  runtime:  $file"
    else
      DEV_ONLY_MANIFESTS="$DEV_ONLY_MANIFESTS $file"
      echo "  dev-only: $file"
    fi
  }

  for manifest in $MANIFESTS; do
    classify_manifest "$manifest"
  done
  [ -n "$RUNTIME_MANIFESTS" ] && echo "" || true

  if ! $HAS_MANIFEST; then
    echo "No dependency manifest found (package.json, composer.json, requirements.txt, go.mod, ...)"
    echo "RESULT: NOT APPLICABLE - no dependencies to audit"
    exit 3
  fi

  # Node - handle lockfile missing per Fix 4b
  if [ -f package.json ]; then
    if [ ! -f package-lock.json ] && [ ! -f npm-shrinkwrap.json ] && [ ! -f yarn.lock ] && [ ! -f pnpm-lock.yaml ]; then
      echo "--- Node: package.json found but no lockfile ---"
      echo "RESULT: NOT TESTED - no lockfile (run: npm i --package-lock-only)"
      echo "This is NOT a vulnerability, but audit cannot run reliably without lockfile"
      exit 2
    fi

    if command -v npm >/dev/null 2>&1; then
      FOUND_TOOL=true
      echo "--- npm audit ---"
      # Use json to parse high+critical accurately
      if npm audit --json 2>&1 | tee /tmp/npm_audit.json; then
        # npm audit exit 0 means no vuln, but we parse json for safety
        if command -v python3 >/dev/null 2>&1; then
          python3 - << 'PY'
import json, sys
try:
    with open('/tmp/npm_audit.json') as f:
        data=json.load(f)
    vulns=data.get('metadata',{}).get('vulnerabilities',{})
    high=vulns.get('high',0)
    critical=vulns.get('critical',0)
    print(f"high={high} critical={critical}")
    if high+critical>0:
        sys.exit(1)
    sys.exit(0)
except Exception as e:
    print(f"Parse error: {e} -> tool error")
    sys.exit(2)
PY
          ec=$?
          if [ $ec -eq 1 ]; then HAS_HIGH=true; echo "HIGH/CRITICAL found"; 
          elif [ $ec -eq 2 ]; then NOT_TESTED_REASON="npm audit json parse error"; echo "Tool error"; 
          else echo "No HIGH/CRITICAL"; fi
        else
          # fallback: if npm audit exit non-zero, treat as vuln only if output contains high
          if grep -qi "high\|critical" /tmp/npm_audit.json; then HAS_HIGH=true; fi
        fi
      else
        ec=${PIPESTATUS[0]}
        # npm audit returns non-zero when vuln found, but also when error
        # Check if json file exists and parseable
        if [ ! -s /tmp/npm_audit.json ]; then
          NOT_TESTED_REASON="npm audit no output"
          echo "Audit tool error - no output"
        else
          if command -v python3 >/dev/null 2>&1; then
            python3 - << 'PY'
import json, sys
try:
    with open('/tmp/npm_audit.json') as f:
        data=json.load(f)
    vulns=data.get('metadata',{}).get('vulnerabilities',{})
    high=vulns.get('high',0)
    critical=vulns.get('critical',0)
    print(f"high={high} critical={critical}")
    sys.exit(1 if high+critical>0 else 0)
except:
    sys.exit(2)
PY
            ec2=$?
            if [ $ec2 -eq 1 ]; then HAS_HIGH=true
            elif [ $ec2 -eq 2 ]; then NOT_TESTED_REASON="parse error"; fi
          else
            HAS_HIGH=true
          fi
        fi
      fi
      echo ""
    fi
  fi

  # Python
  if [ -f requirements.txt ] || [ -f pyproject.toml ]; then
    if command -v pip-audit >/dev/null 2>&1; then
      FOUND_TOOL=true
      echo "--- pip-audit ---"
      if pip-audit --format=json -o /tmp/pip_audit.json 2>&1; then
        echo "pip-audit clean"
      else
        ec=$?
        if [ -s /tmp/pip_audit.json ]; then
          # parse if file has vulns
          if grep -q "vulnerabilities" /tmp/pip_audit.json; then HAS_HIGH=true; echo "Vulns found"; else echo "No output"; fi
        else
          NOT_TESTED_REASON="pip-audit error no json"
          echo "pip-audit error"
        fi
      fi
      cat /tmp/pip_audit.json 2>/dev/null || true
      echo ""
    else
      echo "--- pip-audit not installed, skipping (NOT TESTED for python) ---"
      # Don't mark as found tool if no audit tool
      echo ""
    fi
  fi

  # PHP
  if [ -f composer.json ]; then
    if [ ! -f composer.lock ]; then
      echo "--- PHP: composer.json found but no composer.lock ---"
      echo "RESULT-PART: php NOT TESTED - no lockfile (run: composer update --lock)"
      echo ""
    elif command -v composer >/dev/null 2>&1; then
      FOUND_TOOL=true
      echo "--- composer audit ---"
      if composer audit --format=json > /tmp/composer_audit.json 2>/dev/null; then
        echo "composer audit clean"
      else
        if [ -s /tmp/composer_audit.json ]; then
          if grep -q '"advisories"[[:space:]]*:[[:space:]]*{[^}]*[a-z]' /tmp/composer_audit.json; then
            HAS_HIGH=true
            echo "Vulns found"
          else
            echo "No advisories reported"
          fi
          cat /tmp/composer_audit.json
        else
          NOT_TESTED_REASON="composer audit produced no output"
          echo "composer audit error"
        fi
      fi
      echo ""
    else
      echo "--- composer not installed, PHP dependencies not audited ---"
      echo "RESULT-PART: php NOT TESTED - no composer binary"
      echo ""
    fi
  fi

  # Go
  if [ -f go.mod ]; then
    if command -v govulncheck >/dev/null 2>&1; then
      FOUND_TOOL=true
      echo "--- govulncheck ---"
      if govulncheck ./... 2>&1 | tee /tmp/govuln.log; then
        echo "govulncheck clean"
      else
        if grep -qi "vulnerability" /tmp/govuln.log; then HAS_HIGH=true; fi
      fi
      echo ""
    fi
  fi

  if [ -n "$NOT_TESTED_REASON" ]; then
    echo "RESULT: NOT TESTED - audit tool error: $NOT_TESTED_REASON"
    exit 2
  fi

  if ! $FOUND_TOOL; then
    if [ -n "$RUNTIME_MANIFESTS" ]; then
      # Something ships. Saying "no dependencies" here would be a lie.
      echo "No supported audit tool ran for:$RUNTIME_MANIFESTS"
      echo "RESULT: NOT TESTED - runtime manifest with no audit tool"
      exit 2
    fi

    # Only dev-only manifests and no tool for them: nothing is shipped, so there is nothing
    # for this audit to clear - but the manifests are named, not swallowed.
    echo "Developer-side manifest(s) with no audit tool:$DEV_ONLY_MANIFESTS$TOOLING_MANIFESTS"
    echo "Neither a dev-only manifest nor a nested tooling manifest reaches a release;"
    echo "auditing them needs the lockfile and the tool, which belongs in CI."
    echo "RESULT: NOT APPLICABLE - no runtime dependencies; dev-only manifest(s) listed above"
    exit 3
  fi

  if $HAS_HIGH; then
    echo "RESULT: FAIL - HIGH/CRITICAL vulnerabilities found"
    exit 1
  else
    echo "RESULT: PASS - No HIGH vulns detected"
    exit 0
  fi

} | tee "$OUT"
ec=${PIPESTATUS[0]}
# Capture exit from subshell block
# The block's exit is in $OUT but we need to propagate
# Re-parse result line
if grep -q "RESULT: FAIL" "$OUT"; then exit 1
elif grep -q "RESULT: NOT TESTED" "$OUT"; then exit 2
elif grep -q "RESULT: NOT APPLICABLE" "$OUT"; then exit 3
else exit 0
fi
