# Platform API

`@obx/platform` — unified platform layer (v1.1).

## Contract

`Platform` exposes: `createWindow(options)` / `windows()`, `createSurface(width, height)`,
`files`, `timing`, `threads`, `events`, `clipboard`, `lifecycle`, `input`, and
`capabilities`. Implementations: `NodePlatform` (real OS services) and `ManualPlatform`
(deterministic: `advance(ms)`, `pumpThreads()`). `createPlatform(kind)` factory.

## Subsystems

- **Window** — `HeadlessWindow`: title, size, show/hide/close, resize validation.
- **Surface** — `PixelSurface` RGBA `Uint8ClampedArray` with `resize`.
- **FileSystem** — `read/readText/write/writeText/exists/list/mkdir/remove/stat`.
- **Timing** — `now()`, `sleep(ms)`, `createTimer(cb, intervalMs, { repeat })`.
- **Threads** — `create({ run })` spawns a message-passing worker (real
  `node:worker_threads` on Node; pump-delivered on Manual). `ThreadHandle.post/onMessage/
  onError/terminate`.
- **NativeEvents** — typed bus (`resize`, `focus`, `blur`, `close`, `drop`, `clipboard`)
  with wildcard `*` handlers and `history()`.
- **Clipboard** — text `read/write/hasText/clear`.
- **ApplicationLifecycle** — enforced transitions; `start/suspend/resume/stop`,
  `onTransition`.
- **InputBridge** — `emit(event)` (key/pointer/wheel/text), `on`, `recent`.

## Deterministic testing

```ts
const platform = new ManualPlatform();
platform.advance(16);
platform.pumpThreads();
```
