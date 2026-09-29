# Jobs API

`@obx/jobs` — production-oriented asynchronous execution (v1.1).

## JobSystem

`new JobSystem()` (inline executor), `new JobSystem({ platform, workers })` (real
`WorkerPool`), or `new JobSystem({ executor })`. `schedule(name, run, payload?, source?)`
returns a `JobHandle` (states pending/queued/running/done/failed/cancelled; `cancel()`,
`wait()`, `onChange`). `scheduleMany`, `fence(handles)` (`JobFence.wait/results`),
`runOnMainThread`/`drainMainThread`, `stats()`, `shutdown()`.

Worker-pool contract: job functions run serialized on threads — pass a self-contained
function plus a JSON-serializable `payload` (and optional pre-composed `source`).

## Executors

`InlineExecutor({ defer })` — deterministic single-threaded execution with `pump()`.
`WorkerPool(platform, { workers })` — real threads via `platform.threads`, per-worker
`WorkStealingQueue` (`push/take/steal/drain`), queued-job cancellation, error propagation.

## TaskGraph

`addTask(id, deps, run)` then `run(system)`: topological execution, cycle detection,
dependency results passed as `payload.deps`.
