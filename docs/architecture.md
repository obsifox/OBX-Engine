# OBX Engine — Architecture Notes

Living document for the implemented stack (v0.1–v0.4). Subsystem docs are
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
                              3D renderer (§8, §10–12)
```

Dependency rules:

- `core` and `math` depend on nothing.
- `runtime`, `ecs`, `input`, `rendering` depend only on `core`/`math`.
- `scene` depends on `ecs` + `math` + `rendering` (mesh renderer components).
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

## Rendering 3D (§8, §10–12)

| Piece | Module | Notes |
|---|---|---|
| Geometry | `Mesh`, `createCube`/`createPlane`/`createUvSphere`, `computeNormals` | AABB + bounding sphere, validated indices |
| Materials | `Material` | `unlit` / `standard` (metallic-roughness PBR-lite), albedo texture, emissive |
| Lighting | `createLighting`, `Fog` | ambient + directional + point lights, exponential distance fog |
| Camera | `Camera3D` | look-at quaternion, perspective projection, Gribb-Hartmann frustum, `worldToScreen` |
| Rasterizer | `Software3DBackend` | pixel-center fill, 64-bit depth (`<` test), perspective-correct attributes, alpha blending |
| Pipeline | `Renderer3D` | frustum cull → normal matrix → near clip → project → winding cull → raster, draw stats |
| Models | `parseGltf`, `flattenGltf` | glTF JSON + GLB + data-URI buffers, node hierarchy flattening |
| Scene | `MeshRenderer3D`, `collectRenderables3D` (scene) | mesh + material per entity, world matrices from `Transform3D` |

Shading contract (verified numerically): unlit `= base × texel`; standard =
emissive + ambient + Σ directional/point (Lambert × (1−metallic) + Blinn-Phong
specular scaled by (1−roughness)); fog mix `1 − exp(−density · distance)`.

---

## v0.5 — Systems Layer packages

```
physics/     shapes · bodies · world solver · raycasts · joints · character controller
character/   health · stamina · equipment · interaction · character facade
animation/   tracks · clips · player · state machine · blend trees · skeleton · IK
audio/       clips · envelopes · voices · mixer · effects · listener
ui/          nodes · measure/layout · paint · hit testing · widgets · tweens · theme
save/        codecs · checksums · save system · autosave · cloud client
```

### Physics pipeline

`PhysicsWorld.step(dt)` integrates velocities, broadphase pair generation, sequential
impulse resolution (8 iterations), penetration correction (Baumgarte 0.8, slop 0.005),
then contact events (enter/stay/exit) and trigger events. Ray and sphere casts query
the same shape set. `CharacterController` uses `sphereCastAll` with backface filtering
so rest-contact casts do not self-block.

### Animation evaluation

`AnimationPlayer.update(dt)` produces a `Pose` (Map of animatable values). The
`AnimationStateMachine` layers crossfades between clip poses; `BlendTree1D` interpolates
clips along a parameter; `applyLayer` blends weighted, masked poses over a base pose.
`Skeleton.worldPose` composes rest + pose through the parent chain; `twoBoneIK` solves
two-link chains analytically.

### Audio mixing

`AudioMixer.render(out, frames, sampleRate, channels)` walks active voices: clip sample
at pitch cursor, envelope gain, optional 3D attenuation + equal-power pan, then bus
chains (gain, echo, reverb), finally master gain into interleaved output.

### UI frame

`measure` sizes nodes from style or children; `layout` places flow children by flexbox
rules and absolute children by anchors/pivots; `paint` emits draw commands (rect, text,
border) which host renderers rasterize. Interaction: `hitTest`, `click`, `typeText`,
`setSliderValue`, `scroll`; animation via `UiTweenManager`.

### Save pipeline

Providers serialize per-id state → JSON body → `fnv1a` checksum → optional `packBits`
compression → optional `xorCrypt` encryption → `toBase64` into a versioned envelope.
Loading reverses the chain, verifies the checksum and migrates per-provider versions
through `migrate(data, fromVersion)`.

---

## v0.6 — Motion & Effects packages

```
vehicle/    wheels · suspension · steering · transmission · engine · damage · AI
particles/  curves · emitters · collision · trails · GPU buffers · presets
vfx/        effect graphs · screen effects · weather · explosion/impact library
```

### Vehicle pipeline

`Vehicle.update(dt, input, world)`: per wheel — steer toward input, raycast the
suspension stroke, apply spring+damper force (capped) at the attach point with torque,
drive force from `engine.torque(rpm) × gear × finalDrive`, braking/rolling resistance,
lateral grip at the contact, then arcade yaw targeting (`steerRate × speedFactor`)
with pitch/roll damping. `Transmission` shifts on rpm bands; `VehicleAI` runs
pure-pursuit toward waypoints with yaw-rate damping.

### Particle pipeline

`ParticleEmitter.update(dt, world?)`: emission (rate/burst with carry), per-particle
integration (gravity, drag, rotation), optional world ray collision (bounce/friction/
kill), size/color curves over life, trail ring buffers. `GpuParticleBuffer` mirrors the
sim in structure-of-arrays typed batches for renderer upload. All randomness flows
through seeded `@obx/core` `Random` — identical seeds reproduce frames exactly.

### VFX composition

`VfxGraph` fires timed events that register emitters and drive `ScreenEffects`; events
compose library effects (explosion = sparks burst + smoke plume + flash + shake).
`WeatherSystem` wraps rain/snow emitters with wind-steered volume spawns.

## v0.7 — World, Navigation & AI

### World streaming pipeline

`WorldPartition.update(cx, cz, time)`: cells whose centers fall inside `viewDistance`
are candidates (nearest-first, budgeted per tick), each tagged with `LodSystem.pick`
against `lodDistances`; cells beyond `unloadDistance` flip to `unloaded` (the gap between
the two radii is load/unload hysteresis). `Heightfield` builds terrain from seeded fBm
value noise with bilinear sampling and central-difference normals. `DayNightCycle` keeps
a normalized 0..1 day clock (elevation = −cos(2πt)); `WeatherScheduler` walks a seeded
markov chain (clear/cloudy/rain/storm) and eases intensity toward the per-type target.
`SimulationTiers` slows far entities down (interval × tier) and culls beyond a radius.

### Navigation pipeline

`AStar.findPath(start, goal)` on a `NavGrid` of walkable cells with per-cell costs:
8-way expansion, diagonal moves rejected when either orthogonal neighbor is blocked (no
corner cutting), g-scores scaled by cell cost, deterministic tie-break (f, then deeper g,
then insertion order). `smoothPath` string-pulls the polyline using `lineOfSight` rays.
`PathAgent.update(dt, neighbors)` advances along the path with arrival snapping and
separation steering from neighbors inside `avoidanceRadius`; `Crowd` feeds the shared
neighbor set so agents push each other apart while crossing.

### AI pipeline

`NpcAgent.update(dt)` writes its position to the `Blackboard`, then delegates to an
`AgentBrain` (`TreeBrain` ticks a `BehaviorTree`, `FsmBrain` advances a `StateMachine`).
`perceive()` tests the target against the `Perception` vision cone (range + half-angle +
occlusion callback) and hearing radius, storing `target.visible/heard`. Preset brains:
`patrolBrain` (chase when the target is seen or heard, else patrol), `animalBrain`
(flee on hearing, else idle/wander). `UtilityAI` scores options each tick; `GoalSystem`
arbitrates priority goals until `isDone`; `Schedule` fires time-of-day entries across
midnight wraps.
