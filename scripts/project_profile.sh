#!/usr/bin/env bash
# project_profile.sh - read .eng/project.yaml for the control plane (v1.2)
# Usage: ./scripts/project_profile.sh {--check|--json|--shell|--gates|--get KEY} [--file F]
# Exit codes: 0 ok, 3 no profile, 4 empty profile, 5 malformed
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required to read the project profile" >&2
  exit 5
fi

exec python3 "$SCRIPT_DIR/project_profile.py" "$@"
