# OBX Engine — Architecture Notes

Living document for the implemented stack (v0.1–v0.3). Subsystem docs are
added as their roadmap phases land.

## Layering

```
                 @obx/engine          Engine / Application facades (§2, §51)
                        │
   ┌──────────┬─────────┼──────────┬─────────────┐
   │          │         │          │             │
@obx/core  @obx/runtime @obx/ecs  @obx/math   @obx/input
   │          │         │          │             │
 services  game loop   ECS      vectors/     keyboard/mouse/
 (§2)      (§3, §64)  (§4,§5)   matrices     touch/gamepad (§20)
                        │          │
                  @obx/scene   @obx/rendering
                        │          │
                  transforms   2D renderer (§7, §9)
```

Dependency rules:

- `core` and `math` depend on nothing.
- `runtime`, `ecs`, `input`, `rendering` depend only on `core`/`math`.
- `scene` depends on `ecs` + `math`.
- `engine` composes everything and re-exports the public APIs.

## Core (§2)

| System | Class | Notes |
|---|---|---|
| Errors | `EngineError` + subclasses, `assert`/`ensure` | stable `code` + structured `context` |
| Logging | `Logger`, memory/console sinks | scoped children, pluggable sinks |
| Events | `EventBus<M>`, `Signal<T>` | priorities, `once`, error isolation |
| Time | `Clock` | scaled/unscaled time, pause, clamp, fixed-step accumulator |
| Scheduler | `Scheduler` | deterministic engine-time timers |
| Config | `ConfigStore<T>` | dot paths, deep merge, path watchers |
| Memory | `MemoryTracker` | tag-based tracking + budgets |
| Lifecycle | `Lifecycle` | strict state machine + `failed` escape hatch |

## Runtime (§3)

- `GameLoop` — fixed timestep accumulator: `fixedUpdate × N -> update -> render(alpha)`.
- `LoopDriver` — `ManualLoopDriver` (tests, network ticks) / `TimeoutLoopDriver`.
- `FrameLimiter`, `FpsCounter`, `TaskSystem`, `RuntimePlatform` adapters.

## ECS (§4)

Archetype storage (dense SoA columns), generation-packed entity handles,
cached all/any/none queries, stable topological system scheduling
(order/before/after, phases), resources, built-in hierarchy components
(`core.Parent`/`core.Children`/`core.Name`), JSON serialization with stable
entity ids and custom (de)serialize hooks.

## Math (§6)

`Vec2`, `Vec3`, `Mat4` (column-major Float64), `Quat`, `AABB`, `Sphere`,
`Color`, `Transform2D`/`Transform3D` (TRS with combine/apply/inverse,
shortest-path rotation interpolation).

## Input (§20)

`InputManager` with per-device states (keyboard/mouse/touch/gamepads),
action bindings (keys/mouse buttons/gamepad buttons) and axis bindings
(keys/gamepad axis with deadzone + scale + invert). `DomInputAdapter` wires
browser events; all state is injectable for headless use.

## Rendering (§7, §9)

- `Renderer2D` — sprite/rect submission with CPU camera transforms
  (world -> screen), pivot/rotation/tint/uv/layer support.
- `SpriteBatcher` — sorts by (layer, texture) and merges runs into
  `drawQuads` commands (vertex layout: x,y,u,v,r,g,b,a per vertex).
- Backends: `RecordingBackend` (tests), `SoftwareBackend`
  (barycentric rasterizer, nearest sampling, straight-alpha blending,
  top-left shared-edge rule), `Canvas2DBackend` (browser).
- `Texture`, `SpriteSheet` (grid uv math), `SpriteAnimator` (fps clips,
  loop/once), `Camera2D` (pan/zoom/rotate; `viewMatrix` consistent with
  `worldToScreen`), `encodePng` (dependency-free PNG writer).

## Scene (§5, §6)

`Transform2D`/`Transform3D` components (class values with serialization
hooks), `WorldTransform` components holding previous+current state,
`createTransformSystem2D/3D` propagating parent chains each frame and
`getInterpolatedTransform2D` for render smoothing.

## Engine (§2)

`Engine` composes all services + a default ECS world (auto-ticked when
`autoTickWorld` is true). `Application` is the developer host
(`run()` / `quit()`). Lifecycle:
`created -> initializing -> initialized -> starting -> running <-> paused -> stopping -> stopped -> destroying -> destroyed`.

## Testing strategy

- Unit tests per package (`*/tests`), 153 tests total.
- Renderer verified at the pixel level (exact colors, alpha blending, layer
  order, uv regions, rotation, camera movement) and PNG output validated
  against a real zlib decoder.
- Determinism: `ManualLoopDriver` + `ManualPlatform` make frame timing exact.
