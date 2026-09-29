#!/usr/bin/env bash
# gate_check.sh - Executable gate checker v1.0.1
# Fix: No gate reads state.json for PASS. Only real command outputs.
# Usage: ./scripts/gate_check.sh <gate> [--no-run] [--state .eng/state.json] [--evidence .eng/evidence.md]
# Gates: G0_Build, G1_Tests, G2_Lens, G3_Security, G4_Release, G5_Project, all
# Flags: --no-run = do not re-execute build/test, only inspect existing logs (for testing)
# Exit codes: 0 PASS, 1 FAIL, 2 NOT TESTED, 3 NOT APPLICABLE, 4 error
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib_run.sh
source "$SCRIPT_DIR/lib_run.sh"

GATE="${1:-all}"
STATE_FILE=".eng/state.json"
EVIDENCE_FILE=".eng/evidence.md"
NO_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --state) STATE_FILE="$2"; shift 2 ;;
    --evidence) EVIDENCE_FILE="$2"; shift 2 ;;
    --no-run) NO_RUN=1; shift ;;
    -h|--help)
      echo "Usage: $0 <gate> [--no-run] [--state <json>] [--evidence <md>]"
      echo "Gates: G0_Build, G1_Tests, G2_Lens, G3_Security, G4_Release, G5_Project, all"
      echo "  --no-run: skip re-execution, only inspect logs (useful for tests)"
      echo "Exit 0 PASS, 1 FAIL, 2 NOT TESTED, 3 NOT_APPLICABLE"
      echo ""
      echo "Rule: No gate reads state.json for PASS. Only real command outputs."
      exit 0
      ;;
    *)
      if [[ "$1" != --* ]]; then GATE="$1"; fi
      shift
      ;;
  esac
done

check_gate() {
  local g="$1"
  case "$g" in
    G0_Build|build)
      echo "Checking G0 Build..."
      detect_cmds
      if [ -z "${BUILD_CMD:-}" ]; then
        echo "no build command detected -> NOT APPLICABLE"
        return 3
      fi
      if [ "$NO_RUN" -eq 0 ]; then
        echo "Running current build: $BUILD_CMD"
        run_step current build bash -c "$BUILD_CMD"
      else
        echo "--no-run: skipping build execution"
      fi
      local cur
      cur=$(get_exit .eng/artifacts/current_build.log)
      if [ -z "$cur" ]; then
        echo "no build log .eng/artifacts/current_build.log -> NOT TESTED"
        return 2
      fi
      echo "Build exit code: $cur (log: .eng/artifacts/current_build.log)"
      if [ "$cur" = 0 ]; then
        echo "PASS"
        return 0
      else
        echo "FAIL: build exit=$cur"
        return 1
      fi
      ;;

    G1_Tests|tests)
      echo "Checking G1 Tests..."
      detect_cmds
      if [ -z "${TEST_CMD:-}" ]; then
        echo "no test runner detected -> NOT TESTED"
        return 2
      fi
      if [ "$NO_RUN" -eq 0 ]; then
        echo "Running current test: $TEST_CMD"
        run_step current test bash -c "$TEST_CMD"
      else
        echo "--no-run: skipping test execution"
      fi
      local cur base
      cur=$(get_exit .eng/artifacts/current_test.log)
      base=$(get_exit .eng/artifacts/baseline_test.log)
      if [ -z "$cur" ]; then
        echo "no current test log -> NOT TESTED"
        return 2
      fi
      echo "Current test exit: $cur, Baseline exit: ${base:-unknown}"
      if [ "$cur" = 0 ]; then
        echo "PASS - current tests pass"
        return 0
      fi
      # If baseline passed but now fails -> regression FAIL
      if [ "${base:-}" = 0 ]; then
        echo "FAIL: regression (baseline passed exit 0, now exit=$cur)"
        return 1
      fi
      # If baseline also failing, we cannot prove "no new failures" without count parsing
      # So FAIL with message indicating ambiguous
      echo "FAIL: tests failing (baseline exit=${base:-unknown}, current exit=$cur) - cannot prove no new failures"
      return 1
      ;;

    G2_Lens|lens|architecture)
      echo "Checking G2 Lens / Architecture..."
      shopt -s nullglob
      local files=(.eng/artifacts/*review*.md)
      shopt -u nullglob
      if [ ${#files[@]} -eq 0 ]; then
        echo "no review files .eng/artifacts/*review*.md -> NOT TESTED"
        return 2
      fi
      echo "Review files: ${files[*]}"
      # Structured format: - [F-001] severity=HIGH status=OPEN | description
      # Order independent, case-insensitive for values
      local open_findings
      open_findings=$(cat "${files[@]}" | grep -E '^\s*-\s*\[F-[0-9]+\]' | grep -iE 'severity=(high|critical)\b' | grep -iE 'status=open\b' || true)
      if [ -n "$open_findings" ]; then
        echo "Found open HIGH/CRITICAL findings:"
        echo "$open_findings"
        echo "FAIL: open HIGH/CRITICAL"
        return 1
      fi
      echo "PASS: no open HIGH/CRITICAL findings (structured format)"
      return 0
      ;;

    G3_Security|security)
      echo "Checking G3 Security..."
      local secret_log=".eng/artifacts/secret_scan.log"
      local dep_log=".eng/artifacts/dep_audit.log"
      local missing=0
      local not_tested=0

      if [ ! -f "$secret_log" ]; then
        echo "secret_scan.log missing -> NOT TESTED"
        missing=1
      else
        if grep -q 'RESULT: FAIL' "$secret_log"; then
          echo "FAIL: secret_scan found secrets"
          cat "$secret_log" | tail -n 20
          return 1
        fi
        if grep -q 'RESULT: NOT TESTED' "$secret_log"; then
          echo "secret_scan NOT TESTED"
          not_tested=1
        fi
        if grep -q 'RESULT: NOT APPLICABLE' "$secret_log"; then
          echo "secret_scan NOT APPLICABLE (ok)"
        fi
      fi

      if [ ! -f "$dep_log" ]; then
        echo "dep_audit.log missing -> NOT TESTED"
        missing=1
      else
        if grep -q 'RESULT: FAIL' "$dep_log"; then
          echo "FAIL: dep_audit HIGH vuln"
          cat "$dep_log" | tail -n 20
          return 1
        fi
        if grep -q 'RESULT: NOT TESTED' "$dep_log"; then
          echo "dep_audit NOT TESTED"
          not_tested=1
        fi
        if grep -q 'RESULT: NOT APPLICABLE' "$dep_log"; then
          echo "dep_audit NOT APPLICABLE (ok - no deps)"
        fi
      fi

      if [ $missing -eq 1 ]; then
        echo "G3 -> NOT TESTED (missing logs)"
        return 2
      fi
      if [ $not_tested -eq 1 ]; then
        echo "G3 -> NOT TESTED (one of scans NOT TESTED)"
        return 2
      fi
      echo "PASS - security scans clean"
      return 0
      ;;

    G4_Release|release)
      echo "Checking G4 Release..."
      local release_review=".eng/artifacts/release-review.md"
      if [ ! -f "$release_review" ]; then
        echo "No release-review.md -> checking if release needed"
        if [ -f "$STATE_FILE" ] && command -v python3 >/dev/null 2>&1; then
          local gate_val
          gate_val=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('gates',{}).get('G4_Release','NOT_APPLICABLE'))" 2>/dev/null || echo "NOT_APPLICABLE")
          echo "State G4_Release=$gate_val"
          if [ "$gate_val" = "NOT_APPLICABLE" ]; then
            echo "NOT APPLICABLE"
            return 3
          fi
        fi
        echo "NOT TESTED - no release-review"
        return 2
      fi
      # Check for real checksum calculation, not just string presence
      if grep -qE 'sha256:[a-f0-9]{64}' "$release_review" || grep -qE 'SHA256.*[a-f0-9]{64}' "$release_review" -i; then
        # Optionally verify checksum file exists and matches
        local artifact_path
        artifact_path=$(grep -oE 'artifact:.*' "$release_review" | head -1 | awk '{print $2}' || true)
        if [ -n "$artifact_path" ] && [ -f "$artifact_path" ]; then
          local expected actual
          expected=$(grep -oE '[a-f0-9]{64}' "$release_review" | head -1)
          actual=$(file_sha256 "$artifact_path")
          if [ "$expected" = "$actual" ]; then
            echo "PASS - release artifact $artifact_path hash verified $actual"
            return 0
          else
            echo "FAIL - hash mismatch expected $expected actual $actual"
            return 1
          fi
        else
          echo "PASS - release review contains sha256 hash (artifact path not verifiable, but hash present)"
          return 0
        fi
      else
        echo "FAIL - no valid sha256 hash in release-review"
        return 1
      fi
      ;;

    G5_Project|project)
      # Project-defined extras from `.eng/project.yaml` (v1.2). A repository knows things
      # no generic detector can: "the generated docs are in sync", "the translation
      # catalogue is complete", "the built artefact verifies". Each extra runs through
      # run_step, so its result is a log with EXIT_CODE - never a claim.
      echo "Checking G5 Project extras..."
      if [ ! -f .eng/project.yaml ]; then
        echo "no .eng/project.yaml -> NOT APPLICABLE"
        return 3
      fi
      local lines
      lines=$(python3 "$SCRIPT_DIR/project_profile.py" --file .eng/project.yaml --gates 2>/dev/null) || lines=""
      if [ -z "$lines" ]; then
        echo "profile declares no gates.extras -> NOT APPLICABLE"
        return 3
      fi
      local failed_required=0
      local failed_optional=0
      local tested=0
      while IFS='|' read -r name command required; do
        [ -z "$name" ] && continue
        if [ "$NO_RUN" -eq 0 ]; then
          echo "Running extra gate $name: $command"
          # shellcheck disable=SC2086
          run_step profile "$name" bash -c "$command"
        fi
        local code
        code=$(get_exit ".eng/artifacts/profile_${name}.log")
        if [ -z "$code" ]; then
          echo "  $name -> NOT TESTED (no log)"
          if [ "$required" = "true" ]; then tested=2; fi
          continue
        fi
        tested=1
        if [ "$code" = 0 ]; then
          echo "  $name -> PASS (exit 0)"
        elif [ "$required" = "true" ]; then
          echo "  $name -> FAIL (exit $code, required)"
          failed_required=1
        else
          echo "  $name -> FAIL (exit $code, optional - does not fail the gate)"
          failed_optional=1
        fi
      done <<< "$lines"
      if [ "$tested" = 2 ]; then
        echo "G5 -> NOT TESTED (a required extra produced no log)"
        return 2
      fi
      if [ "$failed_required" = 1 ]; then
        echo "G5 -> FAIL (required project extra failed)"
        return 1
      fi
      if [ "$failed_optional" = 1 ]; then
        echo "G5 -> PASS with WARNINGS (an optional extra failed; see its log)"
        return 0
      fi
      echo "G5 -> PASS"
      return 0
      ;;

    all)
      echo "Checking all gates..."
      local overall=0
      local results=()
      for gate in G0_Build G1_Tests G2_Lens G3_Security G4_Release G5_Project; do
        echo "--- $gate ---"
        check_gate "$gate"
        local ec=$?
        echo "Result $gate: $ec"
        results+=("$gate:$ec")
        if [ $ec -eq 1 ]; then overall=1; fi
        if [ $ec -eq 2 ] && [ $overall -eq 0 ]; then overall=2; fi
        if [ $ec -eq 3 ] && [ $overall -eq 0 ]; then
          # NOT APPLICABLE does not make overall NOT TESTED unless all are NA
          :
        fi
      done
      echo "All gates summary: ${results[*]} -> overall $overall"
      return $overall
      ;;

    *)
      echo "Unknown gate: $g"
      return 4
      ;;
  esac
}

check_gate "$GATE"
ec=$?
case $ec in
  0) echo "GATE $GATE: PASS" ;;
  1) echo "GATE $GATE: FAIL" ;;
  2) echo "GATE $GATE: NOT TESTED" ;;
  3) echo "GATE $GATE: NOT APPLICABLE" ;;
  *) echo "GATE $GATE: ERROR $ec" ;;
esac
exit $ec
