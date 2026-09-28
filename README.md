# ObsiFox Engine

**One engine for games, applications and the web — TypeScript-first, cross-platform.**

ObsiFox Engine is a modular game & application engine built as a TypeScript
monorepo. It targets 2D/3D games, desktop/mobile/web applications, websites,
tools and simulations — from one codebase, for Windows, Linux, Android, Web and
headless servers.

> `ENGINE ≠ GAME` — the engine is a **platform for creating software**.

---

## ✨ Current status (v0.2)

| Roadmap phase | Status | Packages |
|---|---|---|
| **v0.1 — Foundation** (Core, Runtime, Game Loop, Events, Time, Config, Logging) | ✅ done | `@obsifox/core`, `@obsifox/runtime` |
| **v0.2 — ECS** (Entity, Component, System, World, Queries, Resources) | ✅ done | `@obsifox/ecs`, `@obsifox/engine` |
| v0.3 — 2D | ⬜ planned | `rendering/`, … |
| v0.4 — 3D | ⬜ planned | |
| v0.5 — Gameplay (Physics, Audio, UI, Save) | ⬜ planned | |
| … up to v1.0 | ⬜ planned | see [`docs/ROADMAP.md`](docs/ROADMAP.md) |

Full checklist: [`docs/ROADMAP.md`](docs/ROADMAP.md) · Architecture: [`docs/architecture.md`](docs/architecture.md)

---

## 🚀 Getting started

```bash
npm install        # workspace deps
npm run build      # tsc -b core runtime ecs engine
npm test           # 84 tests (vitest)
npm run example:hello   # real-time 3s demo at 60 FPS
npm run example:ecs     # deterministic ECS tour
```

### Minimal code

```ts
import { Application, defineComponent, defineSystem } from "@obsifox/engine";

const Position = defineComponent<{ x: number; y: number }>("Position", {
  defaults: () => ({ x: 0, y: 0 }),
});
const Velocity = defineComponent<{ x: number; y: number }>("Velocity", {
  defaults: () => ({ x: 60, y: 0 }),
});

const app = new Application({ name: "my-game", config: { targetFps: 60 } });

const player = app.engine.world.createEntity(Position, [Velocity, { x: 60 }]);

app.engine.world.addSystem(defineSystem({
  name: "move",
  execute: ({ delta }) => {
    for (const [, pos, vel] of app.engine.world.query(Position, Velocity)) {
      pos.x += vel.x * delta;
    }
  },
}));

await app.run();
```

---

## 📦 Packages

| Package | Path | Responsibility (roadmap §) |
|---|---|---|
| `@obsifox/core` | `core/` | Logger, Errors, EventBus, Signals, Clock/Time, Scheduler, Config, Memory, Lifecycle (§2) |
| `@obsifox/runtime` | `runtime/` | GameLoop (fixed timestep), LoopDrivers, FrameLimiter, FpsCounter, TaskSystem, Platforms (§3, §62, §64) |
| `@obsifox/ecs` | `ecs/` | Entities, Components, Archetypes, Queries, Systems, Resources, Hierarchy, Serialization (§4, §5, §36) |
| `@obsifox/engine` | `engine/` | `Engine` + `Application` facades wiring everything together (§2, §51) |

### Repository layout (target)

```
obsifox-engine/
├── core/        runtime/     ecs/        engine/      ← implemented (v0.1–v0.2)
├── rendering/   physics/     audio/      input/       ← v0.3+
├── animation/   networking/  scripting/  ui/
├── assets/      scene/       world/      ai/
├── tools/       editor/      cli/        build/
├── plugins/     native/      wasm/       runtimes/
├── templates/   examples/    tests/      docs/
└── packages/
```

---

## 🧩 Design highlights

- **Fixed-timestep game loop** with interpolation alpha, time scale, pause and
  spiral-of-death protection — driver-agnostic (manual/timeout/…).
- **Archetype-based ECS**: SoA component columns, O(1) entity handles with
  generations (stale-handle detection), cached `all/any/none` queries.
- **Deterministic system scheduling** — `order` + `before`/`after` topological
  sort, phases (`update`, `fixedUpdate`, …), cycle detection.
- **Engine-time scheduler**: timers respect `timeScale` and `pause` automatically.
- **World serialization** with stable entity ids, custom (de)serialize hooks and
  resource round-tripping (save-game foundation).
- **Everything tested** — unit + integration suites run on `vitest`.

---

## 🇮🇷 خلاصه به فارسی

**ObsiFox Engine** یک موتور بازی/نرم‌افزار چندپلتفرمی مبتنی بر TypeScript است که
از یک کدپایه برای ویندوز، لینوکس، اندروید، وب و سرور هدف می‌گیرد.

این مخزن در حال حاضر **v0.1 (هسته: حلقه بازی، رویدادها، زمان، کانفیگ، لاگینگ)**
و **v0.2 (سیستم ECS: Entity/Component/System/Query/Resource)** را کامل و تست‌شده
پیاده‌سازی کرده است. مسیر کامل توسعه تا v1.0 در [`docs/ROADMAP.md`](docs/ROADMAP.md)
آمده است. برای شروع: `npm install && npm test && npm run example:hello`

---

## License

MIT
