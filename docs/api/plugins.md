# Plugin API

`@obx/plugins` — engine plugin system with manifests, lifecycle and sandboxing.

## Manifests

`parsePluginManifest(raw)` validates id/name/version/engine range/permissions/
dependencies/license into a `PluginManifest`.

## Loader

`PluginLoader.register(manifest, factory)`, `resolveOrder()` (dependency order with
cycle/missing detection), `load`/`loadAll`, `start`/`stop`/`startAll`/`stopAll`,
`tick(n)`, `errorsFor`, `stats()`.

## Permissions and sandboxing

`PluginSandbox` grants `PluginPermission` values (file.read, file.write, network,
native, scripting, rendering, physics, audio). Plugin code calls `api.guard(permission,
action)`; denials throw `PluginError` and are logged per plugin without breaking the
host.

Engine compatibility uses semver ranges (`engine: "^1.0.0"`).
