# OBX Engine — Living Roadmap

Execution status of the master development roadmap. ✅ = implemented & tested,
🟡 = foundation/partial, ⬜ = planned.

---

## Version roadmap

### ✅ v0.1 — Foundation
- [x] Core (errors, logging, events, signals, memory, lifecycle)
- [x] Runtime abstraction (platform adapters, loop drivers)
- [x] Game Loop (main/update/fixed/render, frame limiter, FPS, tick, tasks)
- [x] Events
- [x] Time (delta, fixed timestep, time scale, pause, frame timing)
- [x] Configuration
- [x] Logging

### ✅ v0.2 — ECS
- [x] Entity (ids + generations, create/destroy, stale-handle detection)
- [x] Component (registration, defaults, custom (de)serialize hooks)
- [x] System (defineSystem, phases, order/before/after, cycle detection)
- [x] World (archetype storage, migration, stats, inspect)
- [x] Queries (all/any/none, caching, typed tuple iteration)
- [x] Resources
- [x] Entity hierarchy (parent/children, cycle-safe)
- [x] Entity serialization (save/load round-trip with stable ids)

### ✅ v0.3 — 2D
- [x] Renderer (abstraction + recording/software/Canvas2D backends)
- [x] Sprite (sprite draw, tint, pivot, rotation, layers)
- [x] Texture (pixel buffers, solid/checker, nearest sampling, wrap modes)
- [x] Camera (Camera2D — pan/zoom/rotation, world<->screen, view matrix)
- [x] Animation (SpriteSheet grids, named clips, SpriteAnimator)
- [x] Basic Input (keyboard/mouse/touch/gamepad, actions, axes, DOM adapter)
- [x] Transform system (§6): vectors, matrices, quaternions, bounds, TRS
        transforms with hierarchy propagation and interpolation
- [x] 2D batching (layer/texture sorted, merged draw calls)
- [x] PNG export + `examples/twod-demo` engine-rendered frame

### ✅ v0.4 — 3D
- [x] Mesh, Model (glTF/GLB), Material, Camera, Light, 3D Scene — software3D
      rasterizer (perspective-correct, 64-bit depth), Lambert + metallic/roughness
      shading, directional/point lights, exponential fog, near-plane clipping,
      frustum + back-face culling, `MeshRenderer3D` scene integration

### ✅ v0.5 — Gameplay (2026-09-28)
- [x] Physics, Audio, Animation (3D), Character, UI, Save

### ✅ v0.6 — Motion & Effects (2026-09-28)
- [x] Vehicle, Particles, VFX, seeded Random

### ✅ v0.7 — World & AI (2026-09-28)
- [x] Terrain, World partition, Streaming, LOD, Day/night, Weather, World persistence
- [x] Navigation (navgrid mesh, A*, dynamic obstacles, crowds), AI (perception, FSM,
      behavior trees, utility AI, goals, schedules, NPC/animal brains)

### ✅ v0.8 — Gameplay Systems II (2026-09-28)
- [x] Inventory (items, stacks, weight, durability, equipment, containers)
- [x] Dialogue (nodes, branching, conditions, variables, localization, voice hooks)
- [x] Quests (objectives, dependencies, rewards, branching, serialization)

### ✅ v0.9 — Scripting (2026-09-28)
- [x] ObsiScript language (lexer, parser, AST, type checker, interpreter, modules, classes, closures, scheduler)
- [x] Scripting hosts (sandboxed JS + ObsiScript, lifecycle, hot reload, type definitions)
- [x] Native extensions (FFI/ABI, capability gating, WASM modules, C/Rust binding generation)

### ⬜ v0.10 — Editor (ObsiFox Studio)
- [ ] Project Manager, Scene Editor, Inspector, Asset Browser, Script Editor, Debugger

### ⬜ v0.95 — Build & Advanced
- [ ] CLI, Windows / Linux / Web / Android export
- [ ] Networking, Multiplayer, Advanced AI, Advanced Rendering, Profiler

### ⬜ v1.0 — Stable
- [ ] Stable API / Runtime / Editor / Build System, Documentation, Templates, Plugin System, Marketplace Foundation

### ⬜ v2.0 — Long-term
- [ ] Advanced Vulkan/DirectX/WebGPU backends, full WASM runtime, visual
      scripting, shader/material/VFX graphs, multiplayer framework,
      cloud services, marketplace, remote collaboration

---

## Section-by-section status

| § | Section | Status |
|---|---|---|
| 0 | Project definition | 🟡 vision + MIT + semver; full API specs pending |
| 1 | Repository architecture | ✅ monorepo, workspaces, TS config, test suite (CI/CD ⬜) |
| 2 | Core foundation | ✅ complete |
| 3 | Game loop | ✅ complete |
| 4 | ECS architecture | ✅ complete |
| 5 | Scene system | 🟡 entity hierarchy + transform propagation; scenes/prefabs/streaming ⬜ |
| 6 | Transform system | ✅ complete (2D + 3D math, transforms, interpolation) |
| 7 | 2D engine | 🟡 sprites, sheets, animation, camera, batching (tilemaps/parallax/particles/lighting ⬜) |
| 8 | 3D engine | ✅ meshes, software3D rasterizer, culling, clipping, stats |
| 9 | Rendering architecture | 🟡 renderer API + 3 backends (WebGL/WebGPU/Vulkan/DX ⬜) |
| 10–12 | Materials / Lighting / Camera | ✅ Material (unlit/standard PBR-lite), ambient/directional/point lights, fog, Camera3D (frustum, look-at) |
| 13 | Animation | ✅ clips, tracks, state machine + crossfade, blend trees, IK, root motion, 2D sprite animator |
| 14–16 | Physics / Vehicles / Characters | ✅ solver/casts/joints/controller · suspension/drivetrain/AI · movement/health/equipment |
| 17–18 | Particles / VFX | ✅ emitters/curves/collision/GPU batches/presets · graphs/screen effects/weather |
| 19 | Audio | ✅ clips, envelopes, voices, mixer/buses, 2D + 3D spatial, echo, reverb |
| 20 | Input | ✅ complete for v0.3 scope (virtual controls ⬜) |
| 21 | UI | ✅ tree/layout/flex/anchors, themes, text, widgets, windows, UI animation |
| 22–25 | World / Open World / Navigation / AI | 🟡 terrain/partition/streaming/LOD/day-night/weather · persistence/distance tiers · navgrid/A*/crowds · perception/FSM/BT/utility/goals/schedules (async load, HLOD, occlusion, vehicle nav, enemy AI ⬜) |
| 26–28 | Inventory / Dialogue / Quest | ✅ items/stacks/weight/durability/equipment/containers · nodes/choices/conditions/variables/i18n/voice · objectives/conditions/rewards/dependencies/branching/serialization (dialogue editor ⬜ with Studio) |
| 29–30 | Networking / Server runtime | ⬜ |
| 31–33 | Scripting / ObsiScript / Native | 🟡 JS/ObsiScript hosts, sandbox, lifecycle, hot reload, .d.ts gen · language + types/modules/functions/classes/async/debug · FFI/ABI, native modules, WASM, binding gen (TS compile pipeline, language server, Rust/C++ crates ⬜) |
| 34–35 | Asset pipeline / Resources | 🟡 procedural textures + sprite sheets |
| 36 | Serialization | 🟡 JSON + entity/component (de)serialization |
| 37 | Save system | ✅ slots, checksum, compression, encryption, migration, autosave, cloud API |
| 38 | Localization | ⬜ |
| 39 | Plugin system | ⬜ |
| 40–42 | Editor (ObsiFox Studio) / Extensions / Project system | ⬜ |
| 43 | CLI | ⬜ |
| 44–46 | Hot reload / Debugging / Profiling | 🟡 ECS inspect/stats |
| 47–52 | Platform runtimes | 🟡 platform adapter + loop drivers |
| 53–54 | Build system / Export targets | ⬜ |
| 55 | Security | 🟡 error codes + plugin permission design pending |
| 56–57 | Package manager / Marketplace | ⬜ |
| 58–60 | Documentation / Templates / Testing | 🟡 docs + 191 unit/integration tests ✅ |
| 61–63 | Performance / Jobs / Memory | 🟡 TaskSystem + MemoryTracker foundations |
| 64–65 | Platform / renderer abstraction | 🟡 platform interface + backend interface |
| 66–70 | Advanced 3D / World / MP / Editor UX / Workflow | ⬜ |

---

## Next up (v0.5 — Gameplay systems)

1. `physics/` — collision, rigid bodies, queries
2. Materials (§10) — standard/PBR material data + shading parameters
3. Lighting (§11) — directional/point lights, simple shadow mapping
4. glTF model import (§8, §34)
5. `examples/threed-demo` — 3D scene rendered by the engine

## v0.5 — Systems Layer (2026-09-28)

**264/264 tests green across 17 packages.** Six engine systems shipped: physics, character,
animation, audio, ui, save — each with its own package, full test suite, and a combined demo.

### Delivered

**@obx/physics (21 tests)** — `sphereShape/boxShape/planeShape`; `Body` (dynamic/kinematic/
static, restitution, friction, damping, layers, triggers); `PhysicsWorld.step` with
sequential-impulse solver (8 velocity iterations, Baumgarte 0.8, slop 5 mm); collision
enter/stay/exit + trigger events; `raycast`, `sphereCast`, `sphereCastAll`; distance and
spring joints; `CharacterController` with move/jump/run/crouch/fly, grounded snapping and
slope-safe casts.

**@obx/character (5 tests)** — `Health` with damage/death events, `Stamina` with drain,
regen and exhaustion, `Equipment` slot modifiers (speed/damage/armor), `InteractionSystem`
nearest-first queries, `Character` composing the physics controller with RPG state.

**@obx/animation (12 tests)** — `AnimationTrack` (step/linear), `AnimationClip.sample`
(looping), `AnimationPlayer`, `AnimationStateMachine` with crossfade, `BlendTree1D`,
`Skeleton` topological world poses, `applyLayer` weighted masks, root-motion deltas,
`twoBoneIK` law-of-cosines solver, quaternion `slerp` blending.

**@obx/audio (14 tests)** — `createClip/createToneClip/createNoiseClip`, `Envelope`
piecewise curves, `AudioVoice` + `AudioMixer` buses (volume, pitch, loop, envelope,
equal-power pan, 3D distance attenuation with listener), `GainEffect`, `EchoEffect`
feedback delay line, `ReverbEffect` Schroeder combs + allpass.

**@obx/ui (11 tests)** — node tree with style inheritance, `measure`/`layout` flexbox
(row/column, justify, align, gap, padding, absolute anchors + pivots), `paint` to
draw commands, hit testing and click routing, text input editing, sliders from pointer
positions, scrolling lists, windows, `UiTweenManager` easings, brand default theme.

**@obx/save (10 tests)** — `SaveSystem` provider registry with versioned migration,
`packBitsEncode/Decode` RLE, `fnv1a` checksums, `toBase64/fromBase64`, `xorCrypt`
encryption, `MemoryStorage`, `Autosave`, `MemoryCloudClient`, corruption detection.

### Demo — examples/v05-demo

One deterministic run combining all six systems: physics scene with bouncing spheres,
falling crates and a walking/running/jumping character; animation bob sampled per frame;
audio bus with echo rendered to an RMS value; HUD built with the ui package (panel,
health/stamina bars, slider) painted over the frame; save roundtrip with checksum.
Output: `examples/v05-demo/output/frame.png` (640×360).

### Fixes found by tests

- `EchoEffect` delayed read used the write index (delay = buffer size); replaced with a
  proper ring-buffer read head.
- Loop wrap in `AudioMixer.render` consumed a frame on wrap; now retries the same frame.
- `ui.layout` gave the root node the viewport rect, ignoring its style width/height/x/y.
- `SaveSystem` slot metadata dropped provider ids on reload.
- `updateGrounded` zeroing velocity each frame (physics, v0.5 prep) caused creeping
  descent; collision response owns velocity zeroing.

### Checklist (roadmap §13, §14, §16, §19, §21, §37)

- [x] §13 Animation — clips, tracks, player, state machine + crossfade, blend trees, skeleton + world pose, layering/masks, root motion, two-bone IK
- [x] §14 Physics — shapes, bodies, world solver, ray/sphere casts, events, joints, character controller
- [x] §16 Character — controller, jump, crouch, fly, stamina, health, equipment, interaction
- [x] §19 Audio — clips, envelopes, voices, mixer, buses, 2D pan, 3D spatial, echo, reverb
- [x] §21 UI — tree, layout, flex, anchors, themes, text, buttons, inputs, sliders, lists, scroll, windows, UI animation
- [x] §37 Save — slots, serialization, checksum, compression, encryption, migration, autosave, cloud API, storage abstraction

Screenshot: [v0.5-update](screenshots/v0.5-update.svg).

## v0.6 — Motion & Effects (2026-09-28)

**299/299 tests green across 20 packages.** Vehicles, particles and VFX ship together with
per-version GitHub releases (v0.1.0–v0.6.0) carrying release notes and rendered outputs.

### Delivered

**@obx/vehicle (9 tests)** — wheel raycasts with spring+damper suspension (force-capped),
steering geometry, braking/rolling resistance, engine torque curve, multi-gear
transmission with up/downshift bands and reverse, impact damage with integrity,
`createCar` preset, `VehicleAI` pure-pursuit waypoint follower with yaw damping.

**@obx/particles (11 tests)** — `Curve` keyframe sampling, `ParticleEmitter` (rate/burst,
cone directions, gravity, drag, size/color over life, world collision with bounce/kill,
trails), `ParticleSystem`, `GpuParticleBuffer` structure-of-arrays simulation,
presets: smoke, fire, sparks, dust, rain, snow (volume spawns via `spawnBox`).

**@obx/vfx (9 tests)** — `VfxGraph` timed event sequences with emitter registration,
`ScreenEffects` (fade, flash, shake, vignette), `WeatherSystem` (rain/snow/clear with
wind), `explosionEffect`/`impactEffect` compositions, smoke/fire screens.

**@obx/core +4** — seeded `Random` (mulberry32: next/range/int/bool/pick/shuffle).

### Engine bugs found and fixed by v0.6 tests

- `overlapBoxPlane` was inverted: boxes above a plane reported fake contacts with huge
  penetration (position correction exploded bodies to 1e30). Physics suite +2 regression
  tests.
- Vehicle damper sign error (force = k·c − d·ċ) zeroed suspension force exactly when
  needed; correct form is k·c + d·ċ with a force cap.

### Demo — examples/v06-demo

A car with working suspension drives through rain, climbs a ramp, smashes crates with
sparks and an explosion graph (screen shake + flash), tire smoke trailing the wheels.
Output: `examples/v06-demo/output/frame.png`.

### Checklist (roadmap §15, §17, §18)

- [x] §15 Vehicle — wheel system, suspension, steering, braking, transmission, engine simulation, vehicle damage, vehicle controller, vehicle AI
- [x] §17 Particle — emitter, lifetime, velocity, gravity, collision, materials, GPU particles, trails, effects library
- [x] §18 VFX — smoke, fire, explosion, sparks, dust, weather effects, screen effects, custom effects, VFX graph

Screenshot: [v0.6-update](screenshots/v0.6-update.svg).

## v0.7 — World & AI (2026-09-28)

**345/345 tests green across 20 packages (24 files).** Terrain, streaming and time/weather
systems land together with grid navigation, crowds and the AI stack — released as
per-version GitHub release v0.7.0 with notes and a rendered output.

### Delivered

**@obx/world (15 tests)** — `Heightfield` seeded fBm value-noise terrain (generate,
bilinear sampling, normals), `WorldPartition` chunk streaming (view/unload radii with
hysteresis, per-tick budget, LOD refresh, load/unload events via result records),
`LodSystem.pick`, `Region`/`RegionSystem` (bounds + tags), `DayNightCycle` (normalized
day clock, sun elevation/color, ambient), `WeatherScheduler` (seeded markov weather with
intensity easing), `SimulationTiers` (distance-tiered update intervals with catch-up),
`WorldPersistence` (cell store + serialize/restore), `chunkKey`.

**@obx/navigation (15 tests)** — `NavGrid` (walkability, costs, rect blocks, world↔cell),
`AStar` (8-way, no corner cutting, cost-aware, deterministic tie-break), `lineOfSight`,
`smoothPath` string-pulling, `PathAgent` (path following, arrival, neighbor separation),
`Crowd` (shared avoidance), `DynamicObstacle` (block/restore), `NavigationRegion`
(cost overlays).

**@obx/ai (16 tests)** — `Blackboard`, `StateMachine` (full hook lifecycle), behavior
trees (`Sequence`/`Selector`/`Inverter`/`Repeater`/`Condition`/`Action`/`BehaviorTree`),
`UtilityAI`, `Perception` (vision cone + range + occlusion callback, hearing), `Schedule`
(day-of-time entries with midnight wrap), `GoalSystem` (priority arbitration), `NpcAgent`,
`FsmBrain`/`TreeBrain`, presets `patrolBrain` (chase on sight or sound) and `animalBrain`
(flee on hearing).

### Demo — examples/v07-demo

Top-down world: procedural 64×36 terrain shaded by the live sun position, ten agents
crossing the map on smoothed A* paths with crowd avoidance (routing around water, cliffs
and a dynamic landslide), a player marker and a hearing/sighting NPC that switches from
patrol scan to chase — captured mid-chase at golden hour with seeded rain. Output:
`examples/v07-demo/output/frame.png` + `stats.json`.

### Checklist (roadmap §22, §23, §24, §25)

- [x] §22 World — terrain, large worlds, world coordinates, world partition, region system, streaming, unloading, LOD, procedural worlds, day/night cycle, weather (async loading, HLOD, occlusion ⬜)
- [x] §23 Open World — world partition, streaming cells, population management, distance-based simulation, world persistence (background loading/unloading, NPC/vehicle/audio/asset streaming ⬜)
- [x] §24 Navigation — navigation mesh (grid), pathfinding, A*, navigation regions, dynamic obstacles, agent avoidance, character navigation, crowd simulation (vehicle navigation ⬜)
- [x] §25 AI — AI agents, perception, vision, hearing, navigation, state machines, behavior trees, utility AI, goals, schedules, crowd AI, NPC simulation, animal AI (tasks, enemy AI ⬜)

Screenshot: [v0.7-update](screenshots/v0.7-update.svg).

## v0.8 — Gameplay Systems II (2026-09-28)

**368/368 tests green across 23 packages (27 files).** Inventory, dialogue and quests
ship as one gameplay layer — released as per-version GitHub release v0.8.0 with notes
and a rendered output.

### Delivered

**@obx/inventory (10 tests)** — `ItemRegistry` definitions with metadata merge, `Item`
stacks/split/weight/durability (damage, repair, destroyed), `Inventory` stacking adds
with leftovers, slot + weight limits, find/count/removeById, swap and cross-inventory
transfer, `onAdd`/`onRemove` veto hooks for custom logic, `Container` (open/close),
`Equipment` typed slots with equip-swaps and weight/tags/durability aggregates.

**@obx/dialogue (5 tests)** — `DialogueGraph` with reference validation,
`DialogueRunner` (start/advance/choose, condition-filtered choices, effects, history,
`onSpeak`), `DialogueVariables`, `LocalizedText` locale tables with fallback, per-node
voice hook ids, injectable `TextResolver` for custom pipelines.

**@obx/quest (8 tests)** — `QuestSystem` with definition guards, prerequisite-gated
starts, event-driven objective progress (`notify`), optional objectives, fail/abandon,
one-shot `claimRewards` with flags, `followUps` branching, `available`/`activeQuests`/
`completedQuests`, versioned `serialize`/`restore` snapshots.

### Demo — examples/v08-demo

A merchant encounter driven end-to-end by the real systems: dialogue with a
condition-locked choice, accept branch starts the herb quest, five collect events
complete it, reward coins land in the inventory, the follow-up quest unlocks at 2/3
progress, sword + helmet equip — rendered as the game HUD (inventory grid, dialogue
scene, quest tracker, equipment and progress bars). Output:
`examples/v08-demo/output/frame.png` + `stats.json`.

### Checklist (roadmap §26, §27, §28)

- [x] §26 Inventory — items, item definitions, stacks, equipment, containers, weight, durability, item metadata, custom inventory logic
- [x] §27 Dialogue — dialogue nodes, choices, branching, conditions, variables, localization, voice, custom dialogue systems (dialogue editor ⬜ ships with ObsiFox Studio)
- [x] §28 Quest — quest definitions, objectives, conditions, rewards, dependencies, branching, quest state, quest serialization

Screenshot: [v0.8-update](screenshots/v0.8-update.svg).

## v0.9 — Scripting (2026-09-28)

**404/404 tests green across 26 packages (30 files).** The scripting layer ships as
three packages — the ObsiScript language, sandboxed script hosts and the native
extension system — released as per-version GitHub release v0.9.0 with notes and a
rendered output.

### Delivered

**@obx/obsiscript (17 tests)** — full language pipeline: lexer (positions, escapes,
comment stripping, `and`/`or`/`not` keywords), recursive-descent parser with operator
precedence → AST (declarations, if/while/for, classes with `init`/methods, functions,
import/export, `spawn`), type checker over annotations, tree-walking interpreter with
environment chains (closures, recursion, `this`-bound methods, arrays/maps, builtins,
native function calls, line-tagged `RuntimeError`s, `BreakpointHit` debugging),
time-based `Scheduler` for spawned tasks, `ModuleLoader` with caching and
circular-import detection.

**@obx/scripting (11 tests)** — `Sandbox` static identifier scanning
(`SandboxViolation` for eval/process/require/globalThis-class code), `JavaScriptEngine`
(bindings injected as identifiers, live export bag, init/update/dispose),
`ObsiScriptEngine` (host API + persistent `state`), `ScriptHost` with register → load →
init → update → reload → dispose phases, dependency ordering with circular detection,
hooks and stats, hot reload that preserves state and re-runs init, `generateDts`
TypeScript declaration emission, `validateApi`, `makeHost`.

**@obx/native (8 tests)** — `parseSignature` ABI strings, `NativeAbi` FFI marshaling
across i32/i64/f32/f64/string/ptr with arity checks, `generateCHeader` and
`generateRustBindings` binding generation, `ExtensionRegistry` (platform allowlists,
capability grants, lifecycle, ABI exposure), `WasmModule`/`WasmInstance` (byte
validation, compile+instantiate, export invocation, memory views).

### Demo — examples/v09-demo

An ObsiScript program drives 8 bouncing entities through the sandboxed host (1600
`setDot` binding calls), hot-reloads mid-run to a faster version with preserved state
(two full phase cycles), a WASM `add` module computes checksum 108, a native `mathx`
ABI extension streams seeded randoms, and 4 sandbox attacks are blocked. Output:
`examples/v09-demo/output/frame.png` + `stats.json`.

### Checklist (roadmap §31, §32, §33)

- [x] §31 Scripting — JavaScript API, runtime bindings, script lifecycle, script hot reload, script debugging (breakpoints/step hooks), sandboxing, module loading, dependency management, native bindings, WASM bindings, type definitions via .d.ts generation (TS compile pipeline ⬜)
- [x] §32 ObsiScript — language specification (grammar + runtime semantics), lexer, parser, AST, type system (annotations + checker), modules, functions, classes, async support (spawn + scheduler), engine API bindings, debugger (breakpoints + line hooks) (bytecode compiler, language server ⬜)
- [x] §33 Native — native API, FFI, ABI, native modules, WASM modules, native plugin loading (capability-gated), platform-specific modules, Rust/C++ bindings (generated headers + extern decls; prebuilt crates ⬜)

Screenshot: [v0.9-update](screenshots/v0.9-update.svg).
