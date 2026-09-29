#!/usr/bin/env bash
# eng.sh - Engineering Control Plane CLI v1.2
# Main entry point for eng-orchestrator
# Usage: ./scripts/eng.sh <command> [options]
# Commands: preview, run, list, show, recover, receipt, registry, state, event, worktree
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  preview)
    shift
    "$SCRIPT_DIR/preview.sh" "$@"
    ;;
  run)
    shift
    # Create run and start orchestration
    # For now, just create run
    "$SCRIPT_DIR/run_manager.sh" create "$@"
    ;;
  list)
    "$SCRIPT_DIR/run_manager.sh" list
    ;;
  show)
    shift
    "$SCRIPT_DIR/run_manager.sh" show "$@"
    ;;
  state)
    shift
    "$SCRIPT_DIR/state_machine.sh" "$@"
    ;;
  event)
    shift
    "$SCRIPT_DIR/event_log.sh" "$@"
    ;;
  recover)
    shift
    "$SCRIPT_DIR/recovery.sh" "$@"
    ;;
  worktree)
    shift
    "$SCRIPT_DIR/worktree.sh" "$@"
    ;;
  receipt)
    shift
    "$SCRIPT_DIR/receipt.sh" "$@"
    ;;
  registry)
    shift
    "$SCRIPT_DIR/skill_registry.sh" "$@"
    ;;
  playbook)
    shift
    "$SCRIPT_DIR/playbook_engine.sh" "$@"
    ;;
  gate)
    shift
    "$SCRIPT_DIR/gate_check.sh" "$@"
    ;;
  -h|--help|help|*)
    echo "eng-orchestrator Control Plane v1.2.1"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  preview [--type TYPE] [--domain DOMAIN] [--task DESC]  - Preview without mutation"
    echo "  run create [--type TYPE] [--domain DOMAIN] [--tier TIER] [--task DESC] - Create new run"
    echo "  list - List all runs"
    echo "  show --run RUN-xxx - Show run details"
    echo "  state {list-states|validate|transition|current|history} - State machine"
    echo "  event {append|list|tail} - Event log"
    echo "  recover {detect|inspect|reconcile|recover|resume} --run RUN - Recovery"
    echo "  worktree {create|remove|list|detect} --run RUN - Worktree isolation"
    echo "  receipt generate --run RUN - Generate receipt.json"
    echo "  registry {discover|inspect|validate|load|disable} - Skill registry"
    echo "  playbook {compose|list} - Playbook engine"
    echo "  gate <gate> [--no-run] - Gate engine (G0_Build, G1_Tests, etc.)"
    echo ""
    echo "Examples:"
    echo "  $0 preview --type feature --task 'Add auth'"
    echo "  $0 run create --type feature --domain wordpress --tier T3 --task 'WooCommerce bulk discount'"
    echo "  $0 state validate --from EXECUTION --to COMPLETED"
    echo "  $0 receipt generate --run RUN-2026-000001"
    ;;
esac
