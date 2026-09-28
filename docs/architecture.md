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

## v0.8 — Inventory, Dialogue & Quests

### Inventory pipeline

`Inventory.add(item)`: stackable items first merge into matching stacks (`sameKind` —
same definition + durability) up to `maxStack` under the weight cap, then open slots
take fresh stacks; anything that does not fit is returned as leftover and kept on the
input item. `onAdd`/`onRemove` hooks can veto operations (custom rules). `Equipment`
binds items to typed slots (`definition.equipmentSlot`) and aggregates weight, tags and
durability. `Container` is an openable inventory for chests/NPCs.

### Dialogue pipeline

`DialogueRunner.start(id)` enters a node (effects + history + `onSpeak`), then either
`advance()` (linear `next`) or `choose(id)` (branch `next` with optional `condition`
gate on `DialogueVariables` and `effects`). Text resolves through a `TextResolver`
(`LocalizedText` provides locale tables with fallback); `voice()` exposes the clip id
for the audio layer. `DialogueGraph.validate()` reports dangling `next` references.

### Quest pipeline

`QuestSystem.notify({type, target, count})` increments matching objectives on every
active quest (clamped at target counts) and flips a quest to `completed` once all
non-optional objectives are full. Starts are gated by completed-quest prerequisites;
`claimRewards` grants items/flags exactly once; `followUps` lists branching next
quests; `serialize`/`restore` round-trips versioned snapshots of all quest states.

## v0.9 — Scripting, ObsiScript & Native

### ObsiScript pipeline

`tokenize(source)` → `Parser.parse` → `Program` AST → `typeCheck` (annotation issues) →
`Interpreter.run`. The interpreter walks the AST with `Environment` chains: functions
capture their defining scope (closures), methods receive `this` via a bound call frame,
classes construct `ObsiInstance` records with `init`, and `import` delegates to a
`ModuleLoader` that caches exports and rejects circular loads. `spawn(delay, fn)` queues
`ObsiFunction`s on a `Scheduler` drained by `tick(dt)`. Debugger hooks fire
`onLine`/`BreakpointHit` from identifier lookups with source lines.

### Script host pipeline

`ScriptHost.register(id, source, {deps})` → `load` (dependency order, engine execute) →
`init` → `update(dt)` per running module → `reload(id, source)` (dispose, version+1,
re-execute, re-init — the `state` bag survives) → `dispose`. `JavaScriptEngine` builds a
`Function` with every binding injected as an identifier parameter (live `exports` bag);
`Sandbox.assert` runs first and rejects blocked identifiers. `ObsiScriptEngine` wires
the same lifecycle to `@obx/obsiscript` exports (`init`/`update`/`dispose` functions).
`generateDts`/`validateApi` keep the API surface typed and bound.

### Native extension pipeline

`ExtensionRegistry.load(module)` checks the platform allowlist and capability grants,
then runs `init(context)`; `update(dt)`/`dispose()` drive lifecycles. `NativeAbi`
marshals calls per declared signature ("i32(i32,i32)") with coercion and arity checks;
`generateCHeader`/`generateRustBindings` emit foreign declarations from the same ABI.
`WasmModule.fromBytes` validates magic/version, then `compile` + `instantiate` expose
typed export calls and memory views.

## v0.10 — ObsiFox Studio: Editor, Project & Extensions

### Editor model pipeline

`SceneDocument` keeps a typed node tree (`id/name/type/transform/properties/children/
parent`) with cycle-checked reparenting and snapshot/restore for commands. Every edit
is a `Command` executed through `CommandStack` (undo/redo stacks with depth limit;
`beginTransaction`/`commitTransaction` folds batches into one `CompositeCommand` that
undoes in reverse). `Selection` holds id sets; `Inspector` resolves `InspectorSchema`
descriptors per node type and validates values by kind (number min/max, string, bool,
enum, vec2/vec3); `TransformTool` applies drag deltas in 4 modes with optional snap;
`EditorConsole`/`Profiler` collect logs and frame timings; `Viewport` maps world↔screen
through a 2D camera (pan, anchored zoom, frame-bounds). `EditorSession` composes all
parts into one workbench object.

### Project system pipeline

`ProjectManifest` (format 2) records name/version/engine/dependencies/settings/plugins;
`migrateManifest` upgrades format-1 manifests (settings `width`/`height` → `render.*`)
and rejects future formats. `Project` provides a traversal-safe in-memory file store
plus settings/plugins/dependency checks; `standardFolders` defines the 11-folder
layout; `satisfies` evaluates `^`/`~`/`>=`/exact semver ranges; `AssetIndex` tracks
path/type/meta records and detects missing files against a `Project`.

### Extension pipeline

`ExtensionRegistry.register` installs an `EditorExtension` (id/name/version +
contributions). `activate`/`deactivate` drive lifecycle with an `ExtensionContext`
(state map, log, chained `executeCommand`). Contribution lookups resolve inspectors by
node type (priority), gizmos by node type, importers/asset types by file extension, and
create custom nodes. Failures inside any extension are captured per extension id
(`errorsFor`, `stats`) — the registry itself never throws on extension faults.

## v0.95 — Networking, Server, CLI & Build

### Networking pipeline

`MemoryNetwork` schedules packets between `MemoryTransport` endpoints through seeded
wires (latency + jitter + drop rate), stepped deterministically. `ReliableChannel`
frames payloads with `encodePacket` headers (magic/kind/channel/sequence/length),
piggybacks acks, retransmits aged unacked packets up to a retry budget, and reassembles
ordered delivery through a hold-back buffer. `RpcSystem` layers JSON request/response
frames with correlation ids and timeout accounting. `ReplicationSystem` tracks entity
states and emits tick-stamped snapshots that `ReplicationClient` applies with stale
rejection; `GameServer` binds sessions to entity ids, applies inputs authoritatively
through a reducer, records `LagCompensation` history and broadcasts `InterestManagement`
filtered snapshots; `GameClient` feeds per-entity `InterpolationSystem` buffers and
reconciles `PredictionSystem` state against server corrections.

### Server runtime pipeline

`DedicatedServer` composes `createServerConfig` (validated), `ServerLogger` (leveled,
capacity-bounded, sink fan-out), `ServerMetrics` (counters/gauges), `ServerPluginHost`
and `ServerScriptHost` (per-id error isolation) with a `HeadlessRuntime` tick loop
that drives scripts → plugins → network each tick.

### CLI + build pipeline

`runCli` parses argv into command/positionals/flags and executes fourteen commands
against an injectable `CliHost` file store, bridging `@obx/project` manifests with the
`@obx/build` pipeline. `BuildPipeline` runs the release chain — analyze (module
imports), compile, `bundleModules` (dependency-first registry bundle), `processAssets`
(packBits + base64), optimize, runtime injection per `exportTarget`, manifest
packaging, checksum signing and build-info release — with `BuildCache` keyed by content
hashes and `BuildGraph` providing topological, cycle-checked, dirty-tracked
incremental rebuilds.
