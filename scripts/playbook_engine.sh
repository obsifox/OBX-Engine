#!/usr/bin/env bash
# playbook_engine.sh - Composes base workflow + domain overlay + risk overlay + tier
# v1.1
# Usage: ./scripts/playbook_engine.sh compose --type feature --domain wordpress --risk security:high --tier T3 --out .eng/plan.md
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

compose() {
  local type="" domain="" risk="" tier="" out=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --type) type="$2"; shift 2 ;;
      --domain) domain="$2"; shift 2 ;;
      --risk) risk="$2"; shift 2 ;;
      --tier) tier="$2"; shift 2 ;;
      --out) out="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  if [ -z "$type" ]; then echo "Missing --type"; return 4; fi
  if [ -z "$out" ]; then out="$REPO_ROOT/.eng/plan.md"; fi

  local workflow_file="$REPO_ROOT/workflows/${type}.yaml"
  if [ ! -f "$workflow_file" ]; then
    echo "Workflow $type not found at $workflow_file"
    return 2
  fi

  echo "Composing playbook: base=$type domain=$domain risk=$risk tier=$tier"

  mkdir -p "$(dirname "$out")"

  {
    echo "# Composed Execution Plan v1.1"
    echo ""
    echo "## Base Workflow: $type"
    cat "$workflow_file"
    echo ""
    echo "## Domain Overlay: ${domain:-none}"
    if [ -n "$domain" ]; then
      local domain_file="$REPO_ROOT/domains/${domain}.yaml"
      if [ -f "$domain_file" ]; then
        cat "$domain_file"
      else
        echo "Domain $domain not found, using generic"
        if [ -f "$REPO_ROOT/references/playbooks/${domain}.md" ]; then
          echo "Found legacy playbook: references/playbooks/${domain}.md"
        fi
      fi
    fi
    echo ""
    echo "## Risk Overlay: ${risk:-none}"
    if [ -n "$risk" ]; then
      echo "Risk: $risk"
      # Risk overlay logic: if security high, require security-reviewer
      if echo "$risk" | grep -qi "security.*high"; then
        echo "Requires: security-reviewer agent, G3 Security gate"
      fi
    fi
    echo ""
    echo "## Tier: ${tier:-T1}"
    if [ -f "$REPO_ROOT/config/model_policy.yaml" ]; then
      echo "Model routing for tier $tier:"
      grep -A 10 "  $tier:" "$REPO_ROOT/config/model_policy.yaml" || echo "Tier $tier not in model_policy"
    fi
    echo ""
    echo "## Final Composition"
    echo "Execution plan = base workflow ($type) + domain overlay ($domain) + risk overlay ($risk) + tier ($tier) + project constraints"
    echo ""
    echo "## Required Agents (from composition)"
    # Simple logic to extract agents_required from workflow file
    if [ -f "$workflow_file" ]; then
      grep -A 20 "agents_required" "$workflow_file" || true
    fi
    echo ""
    echo "## Required Gates"
    if [ -f "$workflow_file" ]; then
      grep -A 10 "gates:" "$workflow_file" || true
    fi
    echo ""
    echo "## Generated At: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$out"

  echo "Plan composed at $out"
}

list_workflows() {
  echo "Available workflows:"
  ls "$REPO_ROOT/workflows/"*.yaml 2>/dev/null | xargs -I {} basename {} .yaml | sed 's/^/  - /'
  echo ""
  echo "Available domains:"
  ls "$REPO_ROOT/domains/"*.yaml 2>/dev/null | xargs -I {} basename {} .yaml | sed 's/^/  - /'
  echo ""
  echo "Legacy playbooks:"
  ls "$REPO_ROOT/references/playbooks/"*.md 2>/dev/null | xargs -I {} basename {} .md | sed 's/^/  - /'
}

case "${1:-}" in
  compose) shift; compose "$@" ;;
  list) list_workflows ;;
  -h|--help|help|*) echo "Usage: $0 {compose --type TYPE [--domain DOMAIN] [--risk RISK] [--tier TIER] [--out FILE]|list}" ;;
esac
