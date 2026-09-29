# Evidence — RUN-2026-000001 (rewrite v1.1 Runtime & Platform Foundation)

## Baseline (before change)
- build: EXIT_CODE=0 (.eng/artifacts/baseline_build.log)
- tests: EXIT_CODE=0, 701 passed / 67 files (.eng/artifacts/baseline_test.log)

## Change
Structural rewrite of the v1.1 milestone packages, behavior preserved:
- platform/src/platform.ts (708 LOC monolith) -> types, errors, window, surface, events, clipboard, lifecycle, input, filesystem, timing, threads, platform, node (12 modules)
- jobs/src/jobs.ts (496 LOC monolith) -> types, handle, queue, inline-executor, worker-pool, system, task-graph (7 modules)
- vfs/src/vfs.ts (332 LOC monolith) -> types, paths, memory, physical, package, vfs (6 modules)
- resources/src/resources.ts (296 LOC monolith) -> types, handle, cache, manager (4 modules)
- runtime package already modular; unchanged in this run.
- Public API surfaces unchanged (index.ts re-exports; component classes internal to their packages).

## After change
- build: EXIT_CODE=0
- tests: 701 passed / 67 files (identical to baseline; per-package platform/jobs/vfs/resources/runtime = 76 green)

## Lens review (game-development overlay: performance, testing, architecture)

- [F-001] severity=MEDIUM status=CLOSED area=architecture finding=platform monolith split into 12 focused modules proof=platform/src/*.ts
- [F-002] severity=MEDIUM status=CLOSED area=architecture finding=jobs monolith split into 7 modules proof=jobs/src/*.ts
- [F-003] severity=LOW status=CLOSED area=architecture finding=vfs and resources monoliths split into focused modules proof=vfs/src/*.ts resources/src/*.ts
- [F-004] severity=INFO status=CLOSED area=testing finding=full suite identical to baseline after rewrite proof=.eng/artifacts/baseline_test.log vs current run
- [F-005] severity=INFO status=CLOSED area=performance finding=fixed timestep callbacks and delta clamp preserved; work-stealing queue operations remain allocation-light; rewrite introduced no per-frame allocations proof=runtime/src/game-loop.ts jobs/src/queue.ts
- [F-006] severity=LOW status=OPEN area=architecture finding=star exports in package index files keep the surface broad; acceptable for engine packages, tracked as debt
- [F-007] severity=LOW status=OPEN area=performance finding=ResourceCache has manual unload/clear but no size-based automatic eviction policy; tracked as debt

## Checks (domain overlay)
- no_gc_in_loop: PASS (no allocation added in hot paths by this rewrite)
- asset_leak: PASS (ResourceManager.unload transitions to "unloaded", cache clear available)
- fixed_timestep: PASS (GameLoop fixed callback channel + delta clamp preserved)
- object_pooling: NOT APPLICABLE (no pooling layer in v1.1 scope)

## Secrets
- secret_scan run as G3; allow file .eng/secret_scan.allow (pattern | path | reason rows only).
