#!/usr/bin/env bash
# lib_run.sh - Shared helpers for baseline and gate checks
# Usage: source "$(dirname "$0")/lib_run.sh"
# Provides: run_step, get_exit, detect_cmds, BUILD_CMD, TEST_CMD

# run_step <phase> <name> <cmd...>
# Executes command, saves combined output to .eng/artifacts/<phase>_<name>.log
# Appends EXIT_CODE=<n> as last line. Always returns 0 so caller can inspect log.
run_step() {
  local phase="$1" name="$2"; shift 2
  mkdir -p .eng/artifacts
  local log=".eng/artifacts/${phase}_${name}.log"
  # shellcheck disable=SC2068
  "$@" >"$log" 2>&1
  local ec=$?
  echo "EXIT_CODE=$ec" >> "$log"
  return 0
}

get_exit() {
  local file="$1"
  if [ ! -f "$file" ]; then echo ""; return 0; fi
  grep -h '^EXIT_CODE=' "$file" 2>/dev/null | tail -1 | cut -d= -f2
}

# Detect build, test and lint commands.
# Order (v1.2): the project profile wins, then real manifests, then heuristics.
# Sets globals BUILD_CMD, TEST_CMD, LINT_CMD (any may be empty).
detect_cmds() {
  BUILD_CMD=""
  TEST_CMD=""
  LINT_CMD=""
  PROFILE_FILE=".eng/project.yaml"

  # 1. An explicit profile beats every guess: `.eng/project.yaml` -> commands.build/test/lint.
  if [ -f "$PROFILE_FILE" ] && command -v python3 >/dev/null 2>&1; then
    local profile_out
    profile_out=$(python3 "$(dirname "${BASH_SOURCE[0]}")/project_profile.py" --file "$PROFILE_FILE" --shell 2>/dev/null) || profile_out=""
    if [ -n "$profile_out" ]; then
      # eval of our own parser's output: every value is single-quote escaped.
      eval "$profile_out"
    fi
  fi

  # 2. Manifests that mean what they say.
  if [ -f package.json ]; then
    if grep -q '"build"' package.json; then BUILD_CMD="${BUILD_CMD:-npm run build}"; fi
    if grep -q '"test"' package.json; then TEST_CMD="${TEST_CMD:-npm test}"; fi
  fi
  if [ -z "$TEST_CMD" ] && [ -f composer.json ]; then
    # PHP without a profile: composer scripts, then the common test entry points.
    if grep -q '"test"' composer.json && command -v composer >/dev/null 2>&1; then
      TEST_CMD="composer test"
    elif [ -f tests/run.php ]; then
      TEST_CMD="php tests/run.php"
    fi
    if [ -z "$BUILD_CMD" ] && grep -q '"build"' composer.json && command -v composer >/dev/null 2>&1; then
      BUILD_CMD="composer build"
    fi
  fi
  if [ -z "$TEST_CMD" ] && [ -f tests/run.php ]; then
    TEST_CMD="php tests/run.php"
  fi
  if [ -z "$TEST_CMD" ]; then
    if [ -f go.mod ]; then
      TEST_CMD="go test ./..."
    elif [ -f pytest.ini ] || [ -f pyproject.toml ] || [ -d tests ] || ls test_*.py *_test.py >/dev/null 2>&1; then
      if command -v pytest >/dev/null 2>&1; then
        TEST_CMD="pytest -q"
      else
        TEST_CMD="python3 -m pytest -q"
      fi
    elif [ -f Makefile ]; then
      if grep -q "^test:" Makefile; then TEST_CMD="make test"; fi
    elif [ -f ./gradlew ]; then
      TEST_CMD="./gradlew test"
    elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then
      TEST_CMD="gradle test"
    fi
  fi
  if [ -z "$BUILD_CMD" ]; then
    if [ -f Makefile ]; then
      if grep -q "^build:" Makefile; then BUILD_CMD="make build"; fi
    fi
  fi

  # 3. Last resort for a PHP tree with no manifest: a phpunit config is a test runner.
  if [ -z "$TEST_CMD" ] && { [ -f phpunit.xml ] || [ -f phpunit.xml.dist ]; }; then
    if [ -x vendor/bin/phpunit ]; then TEST_CMD="vendor/bin/phpunit"; else TEST_CMD="phpunit"; fi
  fi
}

# Calculate sha256 of a file, portable
file_sha256() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$f" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$f" | awk '{print $1}'
  else echo "no-sha-tool"; return 1
  fi
}
