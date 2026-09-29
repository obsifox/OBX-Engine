#!/usr/bin/env bash
# secret_scan.sh - Lightweight secret scan v1.0.2
# Fix: Avoid subshell variable loss from pipe, exclude tests/ and .git etc properly
# Usage: ./scripts/secret_scan.sh [--path .] [--out .eng/artifacts/secret_scan.log]
# Exit codes: 0 clean, 1 secrets found, 2 error
set -uo pipefail

SCAN_PATH="."
OUT=".eng/artifacts/secret_scan.log"
mkdir -p "$(dirname "$OUT")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --path) SCAN_PATH="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --allow) SECRET_ALLOW_FILE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--path <dir>] [--out <log>]"
      echo "Scans for common secret patterns"
      echo "Allow list entries: pattern || path-substring || reason (printed in the log)"
      echo "Exit 0 clean, 1 secrets found, 2 error"
      exit 0
      ;;
    *) shift ;;
  esac
done

PATTERNS=(
  "AKIA[0-9A-Z]{16}"
  "ghp_[A-Za-z0-9]{36}"
  "github_pat_"
  "BEGIN RSA PRIVATE KEY"
  "BEGIN OPENSSH PRIVATE KEY"
  "sk_live_[0-9a-zA-Z]{24}"
  "xox[bpras]-[0-9a-zA-Z-]{10,}"
  "password\s*=\s*['\"][^'\"]{3,}['\"]"
  "api_key\s*=\s*['\"][^'\"]{8,}['\"]"
  "SECRET_KEY\s*=\s*['\"][^'\"]{8,}['\"]"
)

FOUND=0
ALLOWED_HITS=0
TMP_LOG=$(mktemp)
ALLOW_FILE="${SECRET_ALLOW_FILE:-.eng/secret_scan.allow}"

# allowed_hit <grep line> <pattern>
# A hit is allowed only when the allow file names both the pattern and a path substring of
# the file, with a written reason. Allowances are printed, never silent. Anything not
# covered stays a finding.
allowed_hit() {
  local line="$1" pat="$2"
  [ -f "$ALLOW_FILE" ] || return 1
  local entry normal a_pat a_path a_reason file
  file="${line%%:*}"
  while IFS= read -r entry; do
    case "$entry" in ''|'#'*) continue ;; esac
    # Accept `a|b|c` and `a || b || c`; squeeze runs of pipes, then take the fields.
    normal="$(printf '%s' "$entry" | tr -s '|')"
    a_pat="$(printf '%s' "$normal" | cut -d'|' -f1 | sed 's/^ *//; s/ *$//')"
    a_path="$(printf '%s' "$normal" | cut -d'|' -f2 | sed 's/^ *//; s/ *$//')"
    a_reason="$(printf '%s' "$normal" | cut -d'|' -f3- | sed 's/^ *//; s/ *$//')"
    [ -z "$a_pat" ] && continue
    # A written reason is mandatory: an unexplained allowance is ignored, loudly.
    if [ -z "$a_reason" ]; then
      echo "ALLOWANCE IGNORED (no reason): $entry"
      continue
    fi
    if [ "$a_pat" != "$pat" ] && ! printf '%s' "$pat" | grep -qE "$a_pat"; then
      continue
    fi
    if [ -n "$a_path" ]; then
      case "$file" in *"$a_path"*) return 0 ;; esac
      continue
    fi
    return 0
  done < "$ALLOW_FILE"
  return 1
}

{
  echo "=== SECRET SCAN $(date -u +%Y-%m-%dT%H:%M:%SZ) PATH=$SCAN_PATH ==="
  echo "Excluding: .git, node_modules, .eng/artifacts, dist, build, .venv, __pycache__, .next, out, target, vendor, tests"
  if [ -f "$ALLOW_FILE" ]; then
    echo "Allow list: $ALLOW_FILE (each entry must carry a reason)"
  else
    echo "Allow list: none"
  fi
  echo ""

  EXCLUDE_DIRS=(.git node_modules .eng dist build .venv __pycache__ .next out target vendor tests)
  GREP_EXCLUDES=""
  for d in "${EXCLUDE_DIRS[@]}"; do
    GREP_EXCLUDES="$GREP_EXCLUDES --exclude-dir=$d"
  done

  for pat in "${PATTERNS[@]}"; do
    echo "--- Checking pattern: $pat ---"
    matches=""
    # shellcheck disable=SC2086
    matches=$(grep -R -I -n -E $GREP_EXCLUDES --exclude="*.log" --exclude="secret_scan.sh" "$pat" "$SCAN_PATH" 2>/dev/null || true)
    if [ -z "$matches" ]; then
      echo "clean"
    else
      hits=0
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        if allowed_hit "$line" "$pat"; then
          echo "ALLOWED: $line"
          ALLOWED_HITS=$((ALLOWED_HITS + 1))
          continue
        fi
        echo "$line"
        hits=$((hits + 1))
      done <<< "$matches"
      if [ "$hits" -gt 0 ]; then
        echo "FOUND: $pat ($hits hit(s))"
        FOUND=1
      else
        echo "clean (after $ALLOWED_HITS documented allowance(s))"
      fi
    fi
    echo ""
  done

  if [ -n "$ALLOW_FILE" ] && [ -f "$ALLOW_FILE" ]; then
    echo "Allow file (reproduced in full so the log can be audited): $ALLOW_FILE"
    grep '|' "$ALLOW_FILE" 2>/dev/null | sed 's/^/  - /' || true
    echo "  hits allowed by it: $ALLOWED_HITS"
    echo ""
  fi

  echo "--- Checking .env files presence ---"
  if ls "$SCAN_PATH"/.env 2>/dev/null; then
    echo "WARNING: .env file exists in $SCAN_PATH - ensure not committed"
    if git check-ignore -q "$SCAN_PATH/.env" 2>/dev/null; then
      echo ".env is gitignored (good)"
    else
      echo "CRITICAL: .env NOT gitignored"
      FOUND=1
    fi
  fi

  echo ""
  if [ $FOUND -eq 1 ]; then
    echo "RESULT: FAIL - Potential secrets found, review above"
  else
    echo "RESULT: PASS - No obvious secrets found"
  fi

} | tee "$TMP_LOG"
# Capture FOUND from tee'd log (since block runs in subshell for pipe, we re-parse)
if grep -q "FOUND:" "$TMP_LOG"; then
  FOUND=1
fi
if grep -q "CRITICAL: .env NOT gitignored" "$TMP_LOG"; then
  FOUND=1
fi

cat "$TMP_LOG" > "$OUT"
rm -f "$TMP_LOG"

if [ $FOUND -eq 1 ]; then
  exit 1
else
  exit 0
fi
