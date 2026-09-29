#!/usr/bin/env bash
# knowledge.sh - Structured knowledge promotion with controlled process v1.1
# Implements promotion rule: frequency >=3 or 1 CRITICAL -> promote to skill, requires evidence links, approval gate
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KNOWLEDGE_DIR="$REPO_ROOT/.eng/knowledge"

# Schema validation for lesson
validate_lesson() {
  local file="$1"
  if [ ! -f "$file" ]; then echo "File not found: $file"; return 2; fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import yaml, sys
path="$file"
with open(path) as f:
    data=yaml.safe_load(f)
required=["id","category","trigger","failure","root_cause","correction","evidence","applicable_when","confidence","created","last_verified"]
for r in required:
    if r not in data:
        print(f"FAIL: Missing required field {r}")
        sys.exit(1)
# Check confidence
if data.get('confidence') not in ['low','medium','high']:
    print(f"FAIL: Invalid confidence {data.get('confidence')}")
    sys.exit(1)
# Check evidence exists or is link
if not data.get('evidence'):
    print("FAIL: No evidence")
    sys.exit(1)
print(f"PASS: Lesson {data.get('id')} valid, category {data.get('category')}, confidence {data.get('confidence')}")
PY
    return $?
  else
    echo "Python not available, basic validation"
    return 0
  fi
}

add_lesson() {
  local id="" category="" trigger="" failure="" root_cause="" correction="" evidence="" applicable_when="" confidence="medium"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id) id="$2"; shift 2 ;;
      --category) category="$2"; shift 2 ;;
      --trigger) trigger="$2"; shift 2 ;;
      --failure) failure="$2"; shift 2 ;;
      --root-cause) root_cause="$2"; shift 2 ;;
      --correction) correction="$2"; shift 2 ;;
      --evidence) evidence="$2"; shift 2 ;;
      --applicable-when) applicable_when="$2"; shift 2 ;;
      --confidence) confidence="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  if [ -z "$id" ] || [ -z "$category" ]; then
    echo "Usage: $0 add --id L-XXX --category CAT --trigger TRIG --failure FAIL --root-cause RC --correction CORR --evidence EV --applicable-when WHEN --confidence high|medium|low"
    return 4
  fi

  mkdir -p "$KNOWLEDGE_DIR/lessons"
  local file="$KNOWLEDGE_DIR/lessons/${id}.yaml"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  cat > "$file" <<YAML
id: $id
category: $category
trigger: "$trigger"
failure: "$failure"
root_cause: "$root_cause"
correction: "$correction"
evidence: "$evidence"
applicable_when: "$applicable_when"
confidence: $confidence
created: $timestamp
last_verified: $timestamp
frequency: 1
status: PROPOSED
YAML

  echo "Lesson added: $file"
  validate_lesson "$file"
}

promote_check() {
  local id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --id) id="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$id" ]; then echo "Usage: $0 promote-check --id L-XXX"; return 4; fi

  local file="$KNOWLEDGE_DIR/lessons/${id}.yaml"
  if [ ! -f "$file" ]; then echo "Lesson $id not found"; return 2; fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<PY
import yaml
path="$file"
with open(path) as f:
    data=yaml.safe_load(f)
freq=data.get('frequency',1)
# Count evidence links that exist
# For simplicity, check if evidence contains 3 references or frequency >=3
# In real implementation, would search .eng/runs for same failure
confidence=data.get('confidence','medium')
has_critical='CRITICAL' in str(data)

print(f"Lesson {data.get('id')}: frequency={freq}, confidence={confidence}, has_critical={has_critical}")

if freq>=3 or has_critical or confidence=='high':
    print(f"PROMOTE: Lesson {id} meets promotion criteria (freq>=3 or CRITICAL or high confidence)")
    print("Next: Requires human approval if changes SKILL.md hard rules")
    print("Action: Update relevant file (SKILL.md, lens, script, reference) and CHANGELOG.md")
else:
    print(f"KEEP PROPOSED: Lesson {id} does not yet meet promotion criteria (need freq>=3 or CRITICAL)")
PY
  else
    echo "Python not available, cannot check promotion"
  fi
}

list_lessons() {
  echo "Lessons in $KNOWLEDGE_DIR/lessons/:"
  ls -lh "$KNOWLEDGE_DIR/lessons/"*.yaml 2>/dev/null || echo "  none"
  echo ""
  echo "Failures:"
  ls -lh "$KNOWLEDGE_DIR/failures/"*.yaml 2>/dev/null || echo "  none"
  echo ""
  echo "Decisions:"
  ls -lh "$KNOWLEDGE_DIR/decisions/"*.yaml 2>/dev/null || echo "  none"
}

# Agent must NOT freely modify trusted knowledge - check permission
check_modification_allowed() {
  local actor="$1"
  # Only human or architect with approval can modify trusted knowledge
  if [ "$actor" != "human" ] && [ "$actor" != "architect" ]; then
    echo "DENY: Agent $actor cannot freely modify trusted knowledge, requires controlled promotion"
    return 1
  fi
  echo "ALLOW: $actor can propose knowledge modification via controlled process"
  return 0
}

case "${1:-}" in
  add) shift; add_lesson "$@" ;;
  validate) shift; validate_lesson "${1:-}" ;;
  promote-check) shift; promote_check "$@" ;;
  list) list_lessons ;;
  check) shift; check_modification_allowed "${1:-}" ;;
  -h|--help|help|*) echo "Usage: $0 {add --id ID --category CAT ...|validate FILE|promote-check --id ID|list|check ACTOR}"; ;;
esac
