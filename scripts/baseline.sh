#!/usr/bin/env bash
# baseline.sh - Run existing build/tests before changes (v1.0.1)
# Usage: ./scripts/baseline.sh [--out .eng/artifacts/baseline.log]
# Exit codes: 0 success (even if tests fail, logs captured), 1 error in script itself
# Now uses lib_run.sh to produce .eng/artifacts/baseline_build.log and baseline_test.log with EXIT_CODE
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib_run.sh
source "$SCRIPT_DIR/lib_run.sh"

OUT=".eng/artifacts/baseline.log"
mkdir -p "$(dirname "$OUT")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--out <log>]"
      echo "Runs detected build/test commands, records results for regression detection"
      echo "Produces: .eng/artifacts/baseline_build.log, baseline_test.log with EXIT_CODE"
      echo "Exit 0 if script succeeded (test failures still 0), logs contain exit codes"
      exit 0
      ;;
    *) shift ;;
  esac
done

detect_cmds

{
  echo "=== BASELINE RUN $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "Detected BUILD_CMD=${BUILD_CMD:-none}"
  echo "Detected TEST_CMD=${TEST_CMD:-none}"
  echo ""

  if command -v git >/dev/null 2>&1; then
    echo "--- git status ---"
    git status --porcelain || true
    echo ""
  fi
} | tee "$OUT"

# Run build and test via run_step so gate_check can parse EXIT_CODE
if [ -n "${BUILD_CMD:-}" ]; then
  echo "Running baseline build: $BUILD_CMD"
  run_step baseline build bash -c "$BUILD_CMD"
  cat ".eng/artifacts/baseline_build.log" | tee -a "$OUT"
else
  echo "No build command detected" | tee -a "$OUT"
  # Create empty log with NOT APPLICABLE marker
  mkdir -p .eng/artifacts
  echo "No build command" > .eng/artifacts/baseline_build.log
  echo "EXIT_CODE=3" >> .eng/artifacts/baseline_build.log
fi

echo "" | tee -a "$OUT"

if [ -n "${TEST_CMD:-}" ]; then
  echo "Running baseline test: $TEST_CMD"
  run_step baseline test bash -c "$TEST_CMD"
  cat ".eng/artifacts/baseline_test.log" | tee -a "$OUT"
else
  echo "No test command detected" | tee -a "$OUT"
  mkdir -p .eng/artifacts
  echo "No test command" > .eng/artifacts/baseline_test.log
  echo "EXIT_CODE=3" >> .eng/artifacts/baseline_test.log
fi

echo "" | tee -a "$OUT"
echo "=== END BASELINE ===" | tee -a "$OUT"
echo "" | tee -a "$OUT"
echo "Baseline logs saved to $OUT and .eng/artifacts/baseline_*.log" | tee -a "$OUT"

exit 0
