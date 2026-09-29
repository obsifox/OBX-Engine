# Recovery System v1.1

## Concepts

- **resume**: continue run from last valid state
- **recover**: inspect and restore checkpoint
- **reconcile**: compare current fs/git/worktree with last checkpoint, detect conflicts

## Flow

```
Crash
  ↓
Detect stale RUN (non-terminal, old timestamp)
  ↓
Inspect state
  - last valid state
  - last valid event
  - last verified artifact
  - last checkpoint
  - current Git state
  - current filesystem state
  - current worktree state
  - unfinished transitions
  ↓
Reconcile
  - Check uncommitted user changes -> WARN, do not destroy
  - Check branch divergence
  - Check checkpoint age vs current files
  ↓
Restore checkpoint (if safe)
  ↓
Resume OR Escalate
```

## Never

- Never blindly resume unsafe operation
- Never destroy user changes automatically
- Never overwrite user changes silently

## Scripts

- `scripts/recovery.sh`
  - `detect`: find stale runs
  - `inspect --run RUN`: show last state/event/artifact/checkpoint/git/fs/worktree
  - `reconcile --run RUN`: check conflicts
  - `recover --run RUN`: full recovery flow
  - `resume --run RUN`: alias for recover

## Worktree Isolation

- `scripts/worktree.sh`
  - `create --run RUN [--branch NAME]`: creates isolated worktree at `.eng/runs/RUN/worktree`
  - `remove --run RUN`
  - `list`
  - `detect`: detect uncommitted changes, conflicting worktrees, unexpected modifications

Where Git available, support:
```
main
 ├── run/RUN-001
 ├── run/RUN-002
 └── run/RUN-003
```

Agents on separate tasks should not mutate same working tree.

## Checkpoints

- Stored in `.eng/runs/RUN-xxx/checkpoints/`
- Created via `event_log.sh` CHECKPOINT_CREATED
- Restored during recovery

## Tests

- `tests/recovery.test.sh`: 8 recovery scenarios
- Must test: agent crash, tool crash, interruption, stale checkpoint, changed worktree, user modification
