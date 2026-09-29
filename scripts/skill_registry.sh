#!/usr/bin/env bash
# skill_registry.sh - Skill Registry Interface v1.1
# Supports: discover, inspect, validate, load, disable
# Does NOT auto-execute remote code without security checks
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REGISTRY_DIR="$REPO_ROOT/.eng/skill_registry"
mkdir -p "$REGISTRY_DIR"

discover() {
  echo "Discovering skills..."
  echo "Built-in skills:"
  ls "$REPO_ROOT/references/lenses/"*.md 2>/dev/null | xargs -I {} basename {} .md | sed 's/^/  - lens: /'
  ls "$REPO_ROOT/references/playbooks/"*.md 2>/dev/null | xargs -I {} basename {} .md | sed 's/^/  - playbook: /'
  ls "$REPO_ROOT/workflows/"*.yaml 2>/dev/null | xargs -I {} basename {} .yaml | sed 's/^/  - workflow: /'
  ls "$REPO_ROOT/domains/"*.yaml 2>/dev/null | xargs -I {} basename {} .yaml | sed 's/^/  - domain: /'
  ls "$REPO_ROOT/agents/"*.yaml 2>/dev/null | xargs -I {} basename {} .yaml | sed 's/^/  - agent: /'
  echo ""
  echo "Project skills (if any):"
  ls "$REPO_ROOT/.eng/skills/"* 2>/dev/null || echo "  none"
  echo ""
  echo "External skills registry: $REGISTRY_DIR"
  ls "$REGISTRY_DIR/"* 2>/dev/null || echo "  none"
}

inspect() {
  local name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name) name="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$name" ]; then echo "Usage: $0 inspect --name NAME"; return 4; fi
  echo "Inspecting skill $name..."
  for path in "$REPO_ROOT/references/lenses/$name.md" "$REPO_ROOT/references/playbooks/$name.md" "$REPO_ROOT/workflows/$name.yaml" "$REPO_ROOT/domains/$name.yaml" "$REPO_ROOT/agents/$name.yaml" "$REGISTRY_DIR/$name.yaml" "$REGISTRY_DIR/$name/manifest.yaml"; do
    if [ -f "$path" ]; then
      echo "Found at $path"
      cat "$path" | head -n 100
      return 0
    fi
  done
  echo "Skill $name not found"
  return 2
}

validate() {
  local name="" file=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name) name="$2"; shift 2 ;;
      --file) file="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$file" ]; then
    # Find file by name
    for path in "$REPO_ROOT/references/lenses/$name.md" "$REPO_ROOT/workflows/$name.yaml" "$REPO_ROOT/agents/$name.yaml"; do
      if [ -f "$path" ]; then file="$path"; break; fi
    done
  fi
  if [ -z "$file" ] || [ ! -f "$file" ]; then echo "File not found for skill $name"; return 2; fi

  echo "Validating skill $file..."
  # Check manifest validity
  if [[ "$file" == *.yaml ]]; then
    if command -v python3 >/dev/null 2>&1; then
      python3 - <<PY
import yaml, sys, os
path="$file"
try:
    with open(path) as f:
        data=yaml.safe_load(f)
    # Check required fields
    required=["name"]
    for r in required:
        if r not in data:
            print(f"FAIL: Missing required field {r}")
            sys.exit(1)
    # Check permissions declared
    if "permissions" not in data:
        print("WARNING: No permissions declared")
    # Check for unexpected executable files
    # (In real registry, would scan directory)
    print(f"PASS: Manifest valid for {data.get('name')}")
    print(f"Permissions: {data.get('permissions')}")
    print(f"Tools: {data.get('tools')}")
except Exception as e:
    print(f"FAIL: Invalid YAML: {e}")
    sys.exit(1)
PY
      return $?
    else
      echo "Python not available, basic validation"
      return 0
    fi
  else
    echo "Non-YAML skill (md), checking for suspicious patterns..."
    if grep -qi "curl.*|.*sh\|rm -rf /\|secret.*read" "$file"; then
      echo "WARNING: Suspicious pattern found, manual review required"
      return 1
    fi
    echo "PASS: Basic check"
    return 0
  fi
}

load() {
  local name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name) name="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$name" ]; then echo "Usage: $0 load --name NAME"; return 4; fi
  echo "Loading skill $name..."
  # Validate first
  if ! validate --name "$name"; then
    echo "Validation failed, not loading"
    return 1
  fi
  echo "Skill $name loaded (simulated - in real implementation would add to active skills)"
  # Record event
  echo "{\"skill\":\"$name\",\"action\":\"load\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$REGISTRY_DIR/loaded.jsonl"
  return 0
}

disable() {
  local name=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --name) name="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$name" ]; then echo "Usage: $0 disable --name NAME"; return 4; fi
  echo "Disabling skill $name..."
  echo "{\"skill\":\"$name\",\"action\":\"disable\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" >> "$REGISTRY_DIR/loaded.jsonl"
  echo "Skill $name disabled"
}

case "${1:-}" in
  discover) discover ;;
  inspect) shift; inspect "$@" ;;
  validate) shift; validate "$@" ;;
  load) shift; load "$@" ;;
  disable) shift; disable "$@" ;;
  -h|--help|help|*) echo "Usage: $0 {discover|inspect --name NAME|validate --name NAME [--file FILE]|load --name NAME|disable --name NAME}" ;;
esac
