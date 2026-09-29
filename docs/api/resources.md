# Resources API

`@obx/resources` — resource management (v1.1).

## Loaders

`ResourceLoader { type, extensions, load(path, vfs, context) }` — return a value or
`{ value, dependencies }`; declare dependencies via `context.declareDependencies([...])`.
`registerLoader` (unique types), `loaderFor(path)` (extension match).

## Handles and cache

`ResourceHandle<T>` — `state` (loading/ready/failed/unloaded), `value`, `error`,
`dependencies`, `version`, refcounting (`retain`/`release`), `onChange`.
`ResourceCache` — hits/misses/invalidations statistics.

## ResourceManager

`load` / `loadAsync` (cached, refcounted), `get`, `unload(path, { force })` (reference
guards), `invalidate(path)` (cascade to dependents with version bumps),
`dependenciesOf` / `dependentsOf`, `stats()`.
