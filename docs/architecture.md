# ObsiFox Engine — Architecture Notes

> Living document for the implemented stack (v0.1–v0.2). Subsystem docs are
> added as their roadmap phases land.

## Layering

```
        @obsifox/engine          Engine / Application facades (§2, §51)
              │
   ┌──────────┼───────────┐
   │          │           │
@obsifox/core  @obsifox/runtime  @obsifox/ecs
   │          │           │
 services   game loop    entities/components/systems
 (§2)       (§3, §64)    (§4, §5, §36)
```

Dependency rules:

- `core` depends on nothing (pure foundation).
- `runtime` and `ecs` depend only on `core` (and never on each other).
- `engine` composes all three and re-exports their public APIs.

## Core (§2)

| System | Class | Notes |
|---|---|---|
| Errors | `EngineError` + subclasses, `assert`/`ensure` | Stable `code` + structured `context` |
| Logging | `Logger`, `MemoryLogSink`, `ConsoleLogSink` | Scoped children, pluggable sinks, never throws |
| Events | `EventBus<M>`, `Signal<T>` | Priorities, `once`, error isolation + `AggregateError` |
| Time | `Clock` | Scaled/unscaled time, pause, delta clamp, fixed-step accumulator |
| Scheduler | `Scheduler` | Deterministic **engine-time** timers (respect timeScale/pause) |
| Config | `ConfigStore<T>` | Dot paths, deep merge/clone, path watchers |
| Memory | `MemoryTracker` | Tag-based tracking + budgets (foundation for §63) |
| Lifecycle | `Lifecycle` | Strict state machine: created→…→destroyed, `failed` escape hatch |

## Runtime (§3)

- `GameLoop` — fixed timestep accumulator ("Fix Your Timestep" pattern):
  `fixedUpdate(fixedDelta) × N → update(delta) → render(alpha)`.
  Alpha is the leftover fraction for render interpolation.
- `LoopDriver` — heartbeat abstraction. `ManualLoopDriver` (tests, network
  ticks), `TimeoutLoopDriver` (Node/browser with drift correction).
- `FrameLimiter` / `FpsCounter` — frame budgeting and windowed FPS stats.
- `TaskSystem` — bounded async pool (foundation for the §62 job system).
- `RuntimePlatform` — `Manual` / `Node` / `Browser` adapters, monotonic clock.

## ECS (§4)

### Storage model

Archetype-based: entities with the **same component set** share one `Archetype`
holding one dense column per component type.

- Entity handle = `generation * 2^20 + index` (20-bit index, 12-bit generation).
  Stale handles are detected after destroy/recreate cycles.
- Adding/removing a component migrates the entity between archetypes
  (values copied; swap-remove keeps rows dense).
- Queries cache matching archetypes; invalidated by an archetype version bump.

### Systems

`defineSystem({ name, phase, order, before, after, execute })` — execution
order per phase is a stable topological sort (Kahn) seeded by `order`.
Unknown constraint names are ignored (optional plugins); cycles throw.

### Hierarchy (§5 foundation)

Built-in `core.Parent` / `core.Children` / `core.Name` components maintained by
`setParent` / `setName`. Cycle-safe; destroying a parent orphans children
unless `destroyEntity(e, { recursive: true })`.

### Serialization (§36 foundation)

`world.serialize()` → JSON-safe snapshot preserving packed entity handles
(parent links stay valid across `World.fromSerialized`). Components may supply
custom `serialize`/`deserialize` hooks (e.g. `Set`, `Map`).

## Engine (§2)

`Engine` composes everything: config, logger, events, signals, scheduler,
lifecycle, memory, tasks, platform, loop and a default ECS `world`
(auto-ticked each frame when `autoTickWorld` is true).

Lifecycle: `created → initializing → initialized → starting → running ⇄ paused → stopping → stopped → destroying → destroyed` (+ `failed`).

`Application` is the thin developer-facing host (`run()` / `quit()`).

## Testing strategy

- Unit tests per package (`core/tests`, `runtime/tests`, `ecs/tests`, `engine/tests`).
- Cross-stack integration (`tests/integration/mini-game.test.ts`): fixed
  timestep + systems + resources + save/load driven through `Application`.
- Determinism: `ManualLoopDriver` + `ManualPlatform` make frame timing exact.
