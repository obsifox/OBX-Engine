#!/usr/bin/env bash
# worktree.sh - Worktree isolation v1.1
# Supports isolated execution per run: main -> run/RUN-001, run/RUN-002
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

create_worktree() {
  local run_id="" branch=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      --branch) branch="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$run_id" ]; then echo "Usage: $0 create --run RUN-xxx [--branch name]"; return 4; fi
  if [ -z "$branch" ]; then branch="run/$run_id"; fi

  if ! command -v git >/dev/null 2>&1; then
    echo "Git not available, cannot create worktree"
    return 2
  fi

  # Check for uncommitted changes
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "WARNING: Uncommitted user changes detected in main worktree"
    echo "Will not destroy user changes automatically"
    git status --porcelain
    echo "Please commit or stash changes before creating isolated worktree"
    return 1
  fi

  local worktree_path="$REPO_ROOT/.eng/runs/$run_id/worktree"
  mkdir -p "$(dirname "$worktree_path")"

  echo "Creating worktree at $worktree_path for branch $branch"
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "Branch $branch already exists"
  else
    git branch "$branch" 2>/dev/null || echo "Branch creation may have failed, continuing"
  fi

  if git worktree add "$worktree_path" "$branch" 2>&1; then
    echo "Worktree created: $worktree_path"
    echo "$worktree_path" > "$REPO_ROOT/.eng/runs/$run_id/worktree_path.txt"
    return 0
  else
    echo "Worktree creation failed, falling back to directory isolation"
    mkdir -p "$worktree_path"
    echo "Fallback isolation at $worktree_path (not git worktree)"
    return 0
  fi
}

remove_worktree() {
  local run_id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --run) run_id="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [ -z "$run_id" ]; then echo "Usage: $0 remove --run RUN-xxx"; return 4; fi
  local worktree_path_file="$REPO_ROOT/.eng/runs/$run_id/worktree_path.txt"
  local worktree_path=""
  if [ -f "$worktree_path_file" ]; then
    worktree_path=$(cat "$worktree_path_file")
  else
    worktree_path="$REPO_ROOT/.eng/runs/$run_id/worktree"
  fi

  echo "Removing worktree $worktree_path"
  if command -v git >/dev/null 2>&1; then
    git worktree remove "$worktree_path" --force 2>/dev/null || echo "git worktree remove failed or not a git worktree"
  fi
  rm -rf "$worktree_path"
  rm -f "$worktree_path_file"
  echo "Worktree removed"
}

list_worktrees() {
  if command -v git >/dev/null 2>&1; then
    git worktree list
  else
    echo "Git not available"
  fi
  echo ""
  echo "Run worktrees:"
  ls -d "$REPO_ROOT/.eng/runs/"*/worktree 2>/dev/null || echo "No run worktrees"
}

detect_conflicts() {
  echo "Detecting conflicting worktrees and uncommitted changes..."
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "CONFLICT: Uncommitted changes in main worktree"
    git status --porcelain
  else
    echo "No uncommitted changes in main"
  fi

  if command -v git >/dev/null 2>&1; then
    echo "Worktrees:"
    git worktree list
    # Check for unexpected modifications
    for wt in "$REPO_ROOT/.eng/runs/"*/worktree; do
      if [ -d "$wt" ]; then
        echo "Checking worktree $wt"
        if [ -d "$wt/.git" ] || [ -f "$wt/.git" ]; then
          # It's a git worktree, check status inside
          (cd "$wt" && git status --porcelain 2>/dev/null | head -n 20) || echo "  Could not check status"
        fi
      fi
    done
  fi
}

cleanup() {
  local older_than="7d" dry_run=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --older-than) older_than="$2"; shift 2 ;;
      --dry-run) dry_run=1; shift ;;
      *) shift ;;
    esac
  done

  echo "Cleaning up old worktrees older than $older_than (dry_run=$dry_run)..."
  local runs_dir="$REPO_ROOT/.eng/runs"
  if [ ! -d "$runs_dir" ]; then echo "No runs dir"; return 0; fi

  # Find runs in terminal states and older than threshold
  for run_dir in "$runs_dir"/RUN-*; do
    if [ ! -d "$run_dir" ]; then continue; fi
    local run_id
    run_id=$(basename "$run_dir")
    local state_file="$run_dir/state.json"
    if [ ! -f "$state_file" ]; then continue; fi
    local current_state
    current_state=$("$SCRIPT_DIR/state_machine.sh" current --run "$run_id" 2>/dev/null || echo "UNKNOWN")

    case "$current_state" in
      COMPLETED|FAILED|CANCELLED|BLOCKED)
        # Check age via find -mtime
        # Parse older_than: e.g. 7d -> 7 days
        local days
        days=$(echo "$older_than" | sed 's/d//')
        if [ -z "$days" ]; then days=7; fi
        if find "$run_dir" -maxdepth 0 -mtime +"$days" | grep -q .; then
          echo "  Found old terminal run: $run_id - state $current_state - older than $older_than"
          if [ $dry_run -eq 1 ]; then
            echo "    [dry-run] Would cleanup worktree for $run_id"
          else
            echo "    Cleaning up worktree for $run_id"
            remove_worktree --run "$run_id" || true
            # Optionally keep receipt.json and manifest.json, remove artifacts/checkpoints
            # For retention policy, we keep receipt and manifest, remove worktree and checkpoints older than threshold
            if [ -d "$run_dir/checkpoints" ]; then
              echo "    Removing old checkpoints for $run_id"
              rm -rf "$run_dir/checkpoints"
            fi
          fi
        else
          echo "  Skipping recent run: $run_id - state $current_state"
        fi
        ;;
      *)
        echo "  Skipping non-terminal run: $run_id - state $current_state"
        ;;
    esac
  done
  echo "Cleanup completed"
}

case "${1:-}" in
  create) shift; create_worktree "$@" ;;
  remove) shift; remove_worktree "$@" ;;
  list) list_worktrees ;;
  detect) detect_conflicts ;;
  cleanup) shift; cleanup "$@" ;;
  -h|--help|help|*) echo "Usage: $0 {create --run RUN [--branch NAME]|remove --run RUN|list|detect|cleanup --older-than 7d [--dry-run]}" ;;
esac
