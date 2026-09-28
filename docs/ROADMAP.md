# ObsiFox Engine — Living Roadmap

Checklist tracked from the master development roadmap. ✅ = implemented &
tested in this repo, 🟡 = foundation/partial, ⬜ = planned.

Source of truth for scope: the full roadmap document (see `docs/` history);
this file tracks **execution status**.

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

### ⬜ v0.3 — 2D
- [ ] Renderer, Sprite, Texture, Camera, Animation, Basic Input

### ⬜ v0.4 — 3D
- [ ] Mesh, Model, Material, Camera, Light, 3D Scene

### ⬜ v0.5 — Gameplay
- [ ] Physics, Audio, Animation, Character, UI, Save

### ⬜ v0.6 — World
- [ ] Terrain, Navigation, AI, Streaming, World System

### ⬜ v0.7 — Scripting
- [ ] JavaScript, TypeScript, Native bindings, WASM, ObsiScript foundation

### ⬜ v0.8 — Editor
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
| 0 | Project definition | 🟡 vision + MIT license + semver; full API specs pending |
| 1 | Repository architecture | ✅ monorepo, workspaces, TS config, test suite (CI/CD ⬜) |
| 2 | Core foundation | ✅ complete |
| 3 | Game loop | ✅ complete |
| 4 | ECS architecture | ✅ complete |
| 5 | Scene system | 🟡 entity hierarchy only; scenes/prefabs/streaming ⬜ |
| 6 | Transform system | ⬜ |
| 7 | 2D engine | ⬜ |
| 8 | 3D engine | ⬜ |
| 9 | Rendering architecture | ⬜ |
| 10–12 | Materials / Lighting / Camera | ⬜ |
| 13 | Animation | ⬜ |
| 14–16 | Physics / Vehicles / Characters | ⬜ |
| 17–18 | Particles / VFX | ⬜ |
| 19–21 | Audio / Input / UI | ⬜ |
| 22–25 | World / Open World / Navigation / AI | ⬜ |
| 26–28 | Inventory / Dialogue / Quest | ⬜ |
| 29–30 | Networking / Server runtime | ⬜ |
| 31–33 | Scripting / ObsiScript / Native | ⬜ |
| 34–35 | Asset pipeline / Resources | ⬜ |
| 36 | Serialization | 🟡 JSON + entity/component (de)serialization |
| 37 | Save system | 🟡 snapshot format exists; slots/encryption/cloud ⬜ |
| 38 | Localization | ⬜ |
| 39 | Plugin system | ⬜ |
| 40–42 | Editor / Extensions / Project system | ⬜ |
| 43 | CLI | ⬜ |
| 44–46 | Hot reload / Debugging / Profiling | ⬜ (ECS inspect/stats groundwork ✅) |
| 47–52 | Platform runtimes (Win/Linux/Android/Web/App/Website) | 🟡 platform adapter + loop drivers |
| 53–54 | Build system / Export targets | ⬜ |
| 55 | Security | 🟡 error codes + plugin permission design pending |
| 56–57 | Package manager / Marketplace | ⬜ |
| 58–60 | Documentation / Templates / Testing | 🟡 docs + unit/integration tests ✅ |
| 61–63 | Performance / Jobs / Memory | 🟡 TaskSystem + MemoryTracker foundations |
| 64–65 | Platform / renderer abstraction | 🟡 platform interface + driver abstraction |
| 66–70 | Advanced 3D / World / MP / Editor UX / Workflow | ⬜ |

---

## Next up (v0.3 — 2D)

1. `rendering/` — renderer abstraction (§9) with a WebGL2 backend first
2. `input/` — keyboard/mouse/touch/gamepad (§20)
3. `scene/` — scenes, transforms (§5, §6)
4. 2D renderer: sprites, textures, cameras, batching (§7)
5. `assets/` — texture importer + resource cache (§34, §35)
