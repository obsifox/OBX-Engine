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

### ⬜ v0.5 — Gameplay
- [ ] Physics, Audio, Animation (3D), Character, UI, Save

### ⬜ v0.6 — World
- [ ] Terrain, Navigation, AI, Streaming, World System

### ⬜ v0.7 — Scripting
- [ ] JavaScript, TypeScript, Native bindings, WASM, ObsiScript foundation

### ⬜ v0.8 — Editor (ObsiFox Studio)
- [ ] Project Manager, Scene Editor, Inspector, Asset Browser, Script Editor, Debugger

### ⬜ v0.9 — Build
- [ ] CLI, Windows / Linux / Web / Android export

### ⬜ v0.95 — Advanced
- [ ] Networking, Multiplayer, Open World, Advanced AI, Advanced Rendering, Profiler

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
| 13 | Animation | 🟡 2D sprite animator |
| 14–16 | Physics / Vehicles / Characters | ⬜ |
| 17–18 | Particles / VFX | ⬜ |
| 19 | Audio | ⬜ |
| 20 | Input | ✅ complete for v0.3 scope (virtual controls ⬜) |
| 21 | UI | ⬜ |
| 22–25 | World / Open World / Navigation / AI | ⬜ |
| 26–28 | Inventory / Dialogue / Quest | ⬜ |
| 29–30 | Networking / Server runtime | ⬜ |
| 31–33 | Scripting / ObsiScript / Native | ⬜ |
| 34–35 | Asset pipeline / Resources | 🟡 procedural textures + sprite sheets |
| 36 | Serialization | 🟡 JSON + entity/component (de)serialization |
| 37 | Save system | 🟡 snapshot format exists; slots/encryption/cloud ⬜ |
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
