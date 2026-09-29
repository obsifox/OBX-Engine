# `@obx/assets` — API Reference (v1.3.0)

Production asset pipeline: GUID asset database, importer registry (15 built-in
formats), dependency graph with cycle detection, content-hash cache, change watcher,
scene/prefab file formats with migrations, and hot reload.

```ts
import {
  AssetDatabase, AssetCache, AssetWatcher, AssetDatabaseError,
  createAssetGuid, isAssetGuid, contentHash,
  ImporterRegistry, createDefaultRegistry, ImportError, extensionOf,
  serializeScene, parseScene, stringifyScene, loadScene, validateScene,
  registerSceneMigration, clearSceneMigrations, SceneError,
  createPrefab, prefabFromWorld, instantiatePrefab, applyOverride,
  HotReloadHub, kindForExtension,
} from "@obx/assets";
```

## GUIDs (`guid.ts`)

- `AssetGUID` — opaque string (`8-4-4-4-12` hex, version-4 shaped)
- `createAssetGuid(seed?: string | number)` — deterministic FNV-based GUID from a seed;
  random when omitted
- `isAssetGuid(value)` — type guard
- `contentHash(data: Uint8Array | string)` — stable 16-hex content hash

## Importers (`importers.ts`)

```ts
interface ImportContext { path: string; guid: AssetGUID; source: Uint8Array; sourceHash: string }
interface ImportedAsset { type: string; data: unknown; dependencies: string[]; metadata: Record<string, unknown> }
interface AssetImporter { readonly name: string; readonly extensions: string[]; readonly version: number; import(context: ImportContext): ImportedAsset }
```

- `ImporterRegistry` — `register`, `unregister`, `get(name)`, `forPath(path)`, `names()`
- `createDefaultRegistry()` — registers: `json`, `text`, `png`, `bmp`, `jpg`, `webp`,
  `svg`, `wav`, `ogg`, `mp3`, `gltf`, `glb`, `obj`, `ttf` (+`otf`), `fbx`
- `extensionOf(path)`, `ImportError` (carries `path`)

Support levels: `json`/`text`/`png`/`bmp`/`webp`/`jpg`/`svg`/`wav`/`gltf`/`glb`/`obj`/
`ttf`/`otf` are FULL header/parsing; `ogg`/`mp3` are PARTIAL metadata sniffing; `fbx`
is a STUB (header + version only).

## AssetDatabase (`database.ts`)

```ts
class AssetDatabase {
  constructor(options?: {
    registry?: ImporterRegistry; cache?: AssetCache; watcher?: AssetWatcher;
    now?: () => number; guidSeed?: string | number;
  });
  register(path: string, options?: { type?: string; importer?: string; guid?: AssetGUID }): DatabaseAsset;
  unregister(path: string): boolean;
  byGuid(guid): DatabaseAsset | null;
  byPath(path): DatabaseAsset | null;
  guidOf(path): AssetGUID | null;
  all(): DatabaseAsset[];
  query(filter: { type?: string; importer?: string }): DatabaseAsset[];
  import(path: string, source?: Uint8Array | string): ImportResult;
  importAll(sources?: Map<string, Uint8Array | string>): ImportResult[];
  dependenciesOf(guid): AssetGUID[];
  dependentsOf(guid): AssetGUID[];
  detectCycle(from: AssetGUID, to: AssetGUID): boolean;
  addDependency(from: AssetGUID, to: AssetGUID): void;
  invalidate(guid): AssetGUID[];
  notifyChange(path: string, source: Uint8Array | string): AssetWatcherEvent;
  scan(entries: { path: string; source: Uint8Array | string }[]): AssetWatcherEvent[];
  serialize(): string;
  restore(serialized: string): void;
  resolveImporter(path: string, name?: string): AssetImporter;
}
```

- `DatabaseAsset` — `{ guid, path, type, sourceHash, metadata: AssetMetadata, dependencies: AssetGUID[], data, version }`
- `AssetMetadata` — `{ importer, importerVersion, sourceHash, importedAt, custom }`
- `ImportResult` — `{ asset, cached, changed, dependentsInvalidated }`
- Signals: `onImported`, `onInvalidated` (`Signal<[...]>` from `@obx/core`)
- `register` resolves the importer lazily; unknown extensions register fine and fail
  only at `import()` time with `ImportError`
- Importer-reported dependency paths are auto-registered; self/circular dependencies
  throw `AssetDatabaseError`
- `detectCycle(from, to)` — `true` when the edge `from → to` would create a cycle

### AssetCache

`get(guid, sourceHash)`, `put(guid, sourceHash, version, result)`, `invalidate(guid)`,
`clear()`, `size()`, `stats(): AssetCacheStats` = `{ hits, misses, size, invalidations }`.

### AssetWatcher

`watch(path, hash)`, `unwatch(path)`, `notifyChange(path, hash, guid)`,
`scan(entries)`, `onChange: Signal<[AssetWatcherEvent]>`, `detected`, `watched`.

## Scene Files (`scenes.ts`)

- `SceneFile` — `{ format: "scene" | "prefab", version, name, metadata, guidReferences, entities: SceneEntityRecord[], resources, overrides?, prefabRoot? }`
- `SceneEntityRecord` — `{ id, name?, parent?, components }`
- `SCENE_FORMAT_VERSION` (currently 2)
- `serializeScene(world, options)`, `stringifyScene(file)`, `parseScene(text | object)`,
  `loadScene(world, text | file, options?: { clearWorld?, ...LoadOptions })`
- `validateScene(file): string[]` — duplicate ids, missing parents/prefab roots,
  override targets, GUID reference shapes
- `registerSceneMigration({ from, to, migrate })`, `clearSceneMigrations()` — versioned
  upgrades; version 1 auto-upgrades to 2; future versions are tolerated
- `SceneError`

## Prefabs

- `createPrefab({ name, entities, resources?, metadata?, guidReferences?, overrides? })`
- `prefabFromWorld(world, name): SceneFile`
- `instantiatePrefab(world, prefab, overrides?): InstantiateResult`
  — `{ root, entities, idMap }`; remaps entity ids to free indices and deep-remaps
  `{entity}` / `{entities}` references in component data; merges prefab `overrides`
  with call-site overrides (`{ entityId, component, values }`)
- `applyOverride(world, entity, component, values)` — replace-merge on live entities

## Hot Reload (`hotreload.ts`)

- `ReloadKind` — `"texture" | "material" | "shader" | "scene" | "script" | "audio" | "asset"`
- `HotReloadHub` — `register(kind | "*", handler) → unsubscribe`, `notify(kind, guid, path, data?)`,
  `reloadCount(guid)`, `history()`, `setEnabled`, `enabled`, `clear()`,
  `onReload: Signal<[ReloadEvent]>`
- `ReloadEvent` — `{ kind, guid, path, data, reloadCount }`
- `kindForExtension(path): ReloadKind`
