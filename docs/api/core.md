# Core API

`@obx/core` — services and primitives shared by every package.

## Clock

`Clock` tracks elapsed/unscaled time with `advance(delta)` and a `timeScale` factor.

## EventBus

`EventBus` with `on(name, handler)`, `off`, `emit(name, payload)`, `once`. Handlers
receive typed payloads; `emit` returns listener count.

## Logger

`Logger` with levels `debug | info | warn | error`: `log(level, message, meta?)`,
`setLevel`, sink attachment. `assert` helpers throw `EngineError` with code fields.

## Random

Seeded `Random(seed)` with `next()` in [0,1) — deterministic across platforms.

```ts
import { Random, EventBus, Clock, Logger } from "@obx/core";
```
