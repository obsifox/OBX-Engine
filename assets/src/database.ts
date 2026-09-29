import { Signal } from "@obx/core";
import {
  ImportError,
  ImporterRegistry,
  createDefaultRegistry,
  extensionOf,
  type AssetImporter,
  type ImportContext,
  type ImportedAsset,
} from "./importers.js";
import { contentHash, createAssetGuid, isAssetGuid, type AssetGUID } from "./guid.js";

export interface AssetMetadata {
  importer: string;
  importerVersion: number;
  sourceHash: string;
  importedAt: number;
  custom: Record<string, unknown>;
}

export interface DatabaseAsset {
  guid: AssetGUID;
  path: string;
  type: string;
  sourceHash: string;
  metadata: AssetMetadata;
  dependencies: AssetGUID[];
  data: unknown;
  version: number;
}

export interface RegisterOptions {
  type?: string;
  importer?: string;
  guid?: AssetGUID;
}

export interface ImportResult {
  asset: DatabaseAsset;
  cached: boolean;
  changed: boolean;
  dependentsInvalidated: AssetGUID[];
}

export interface AssetCacheStats {
  hits: number;
  misses: number;
  size: number;
  invalidations: number;
}

export interface AssetWatcherEvent {
  path: string;
  guid: AssetGUID | null;
  sourceHash: string;
}

export class AssetDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetDatabaseError";
  }
}

interface CacheEntry {
  sourceHash: string;
  version: number;
  result: ImportedAsset;
}

export class AssetCache {
  readonly #entries = new Map<AssetGUID, CacheEntry>();
  #hits = 0;
  #misses = 0;
  #invalidations = 0;

  get(guid: AssetGUID, sourceHash: string): ImportedAsset | null {
    const entry = this.#entries.get(guid);
    if (!entry || entry.sourceHash !== sourceHash) {
      this.#misses += 1;
      return null;
    }
    this.#hits += 1;
    return entry.result;
  }

  put(guid: AssetGUID, sourceHash: string, version: number, result: ImportedAsset): void {
    this.#entries.set(guid, { sourceHash, version, result });
  }

  invalidate(guid: AssetGUID): boolean {
    const removed = this.#entries.delete(guid);
    if (removed) this.#invalidations += 1;
    return removed;
  }

  clear(): void {
    this.#entries.clear();
  }

  size(): number {
    return this.#entries.size;
  }

  stats(): AssetCacheStats {
    return { hits: this.#hits, misses: this.#misses, size: this.#entries.size, invalidations: this.#invalidations };
  }
}

export class AssetWatcher {
  readonly onChange = new Signal<[AssetWatcherEvent]>();
  readonly #hashes = new Map<string, string>();
  #detected = 0;

  watch(path: string, sourceHash: string): void {
    this.#hashes.set(path, sourceHash);
  }

  unwatch(path: string): void {
    this.#hashes.delete(path);
  }

  notifyChange(path: string, sourceHash: string, guid: AssetGUID | null): AssetWatcherEvent {
    this.#hashes.set(path, sourceHash);
    this.#detected += 1;
    const event: AssetWatcherEvent = { path, guid, sourceHash };
    this.onChange.emit(event);
    return event;
  }

  scan(entries: Iterable<{ path: string; sourceHash: string; guid: AssetGUID | null }>): AssetWatcherEvent[] {
    const events: AssetWatcherEvent[] = [];
    for (const entry of entries) {
      const known = this.#hashes.get(entry.path);
      if (known !== undefined && known !== entry.sourceHash) {
        events.push(this.notifyChange(entry.path, entry.sourceHash, entry.guid));
      } else {
        this.#hashes.set(entry.path, entry.sourceHash);
      }
    }
    return events;
  }

  get detected(): number {
    return this.#detected;
  }

  get watched(): number {
    return this.#hashes.size;
  }
}

export interface AssetDatabaseOptions {
  registry?: ImporterRegistry;
  cache?: AssetCache;
  watcher?: AssetWatcher;
  now?: () => number;
  guidSeed?: string | number;
}

export class AssetDatabase {
  readonly registry: ImporterRegistry;
  readonly cache: AssetCache;
  readonly watcher: AssetWatcher;
  readonly onImported = new Signal<[{ guid: AssetGUID; path: string; changed: boolean }]>();
  readonly onInvalidated = new Signal<[{ guid: AssetGUID; dependents: AssetGUID[] }]>();
  readonly #assets = new Map<AssetGUID, DatabaseAsset>();
  readonly #byPath = new Map<string, AssetGUID>();
  readonly #dependents = new Map<AssetGUID, Set<AssetGUID>>();
  readonly #now: () => number;
  readonly #guidSeed: string | number | undefined;
  #counter = 0;

  constructor(options: AssetDatabaseOptions = {}) {
    this.registry = options.registry ?? createDefaultRegistry();
    this.cache = options.cache ?? new AssetCache();
    this.watcher = options.watcher ?? new AssetWatcher();
    this.#now = options.now ?? (() => Date.now());
    this.#guidSeed = options.guidSeed;
  }

  register(path: string, options: RegisterOptions = {}): DatabaseAsset {
    const normalized = normalize(path);
    if (this.#byPath.has(normalized)) throw new AssetDatabaseError(`asset already registered: ${normalized}`);
    const guid = options.guid ?? createAssetGuid(this.#guidSeed === undefined ? undefined : `${this.#guidSeed}:${normalized}:${this.#counter}`);
    if (!isAssetGuid(guid)) throw new AssetDatabaseError(`invalid guid for ${normalized}`);
    if (this.#assets.has(guid)) throw new AssetDatabaseError(`guid already registered: ${guid}`);
    this.#counter += 1;
    const importer = this.registry.get(options.importer ?? "") ?? this.registry.forPath(normalized);
    const asset: DatabaseAsset = {
      guid,
      path: normalized,
      type: options.type ?? "unknown",
      sourceHash: "",
      metadata: {
        importer: importer?.name ?? "",
        importerVersion: importer?.version ?? 0,
        sourceHash: "",
        importedAt: 0,
        custom: {},
      },
      dependencies: [],
      data: null,
      version: 0,
    };
    this.#assets.set(guid, asset);
    this.#byPath.set(normalized, guid);
    return asset;
  }

  unregister(path: string): boolean {
    const guid = this.#byPath.get(normalize(path));
    if (!guid) return false;
    const asset = this.#assets.get(guid)!;
    this.#assets.delete(guid);
    this.#byPath.delete(asset.path);
    this.cache.invalidate(guid);
    this.watcher.unwatch(asset.path);
    this.#dependents.delete(guid);
    for (const set of this.#dependents.values()) set.delete(guid);
    return true;
  }

  byGuid(guid: AssetGUID): DatabaseAsset | null {
    return this.#assets.get(guid) ?? null;
  }

  byPath(path: string): DatabaseAsset | null {
    const guid = this.#byPath.get(normalize(path));
    return guid ? this.#assets.get(guid)! : null;
  }

  guidOf(path: string): AssetGUID | null {
    return this.#byPath.get(normalize(path)) ?? null;
  }

  all(): DatabaseAsset[] {
    return [...this.#assets.values()];
  }

  query(filter: { type?: string; importer?: string }): DatabaseAsset[] {
    return this.all().filter(
      (asset) =>
        (filter.type === undefined || asset.type === filter.type) &&
        (filter.importer === undefined || asset.metadata.importer === filter.importer),
    );
  }

  get size(): number {
    return this.#assets.size;
  }

  import(path: string, source?: Uint8Array | string): ImportResult {
    const guid = this.#byPath.get(normalize(path));
    if (!guid) throw new AssetDatabaseError(`asset not registered: ${normalize(path)}`);
    const asset = this.#assets.get(guid)!;
    const bytes = typeof source === "string" ? new TextEncoder().encode(source) : (source ?? new Uint8Array(0));
    const sourceHash = contentHash(bytes);
    const previousHash = asset.sourceHash;
    const previousDependencies = [...asset.dependencies];
    const cached = this.cache.get(guid, sourceHash);
    let result: ImportedAsset;
    let fromCache = false;
    if (cached) {
      result = cached;
      fromCache = true;
    } else {
      const importer = this.resolveImporter(asset.path, asset.metadata.importer);
      const context: ImportContext = { path: asset.path, guid, source: bytes, sourceHash };
      result = importer.import(context);
      this.cache.put(guid, sourceHash, importer.version, result);
    }
    asset.sourceHash = sourceHash;
    asset.type = result.type;
    asset.data = result.data;
    asset.version += 1;
    asset.metadata.sourceHash = sourceHash;
    asset.metadata.importedAt = this.#now();
    asset.metadata.importerVersion = this.resolveImporter(asset.path, asset.metadata.importer).version;
    asset.metadata.custom = { ...result.metadata };
    asset.dependencies = this.#resolveDependencies(guid, result.dependencies);
    this.watcher.watch(asset.path, sourceHash);
    const changed = previousHash !== sourceHash || !sameList(previousDependencies, asset.dependencies);
    this.onImported.emit({ guid, path: asset.path, changed });
    return { asset, cached: fromCache, changed, dependentsInvalidated: [] };
  }

  importAll(sources: Map<string, Uint8Array | string> = new Map()): ImportResult[] {
    return this.all().map((asset) => this.import(asset.path, sources.get(asset.path)));
  }

  dependenciesOf(guid: AssetGUID): AssetGUID[] {
    return [...(this.#assets.get(guid)?.dependencies ?? [])];
  }

  dependentsOf(guid: AssetGUID): AssetGUID[] {
    return [...(this.#dependents.get(guid) ?? [])];
  }

  detectCycle(from: AssetGUID, to: AssetGUID): boolean {
    if (from === to) return true;
    const visited = new Set<AssetGUID>();
    const stack: AssetGUID[] = [to];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === from) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...this.dependenciesOf(current));
    }
    return false;
  }

  addDependency(from: AssetGUID, to: AssetGUID): void {
    if (!this.#assets.has(from) || !this.#assets.has(to)) throw new AssetDatabaseError("dependency endpoints must exist");
    if (this.detectCycle(from, to)) throw new AssetDatabaseError(`circular dependency: ${from} -> ${to}`);
    const asset = this.#assets.get(from)!;
    if (!asset.dependencies.includes(to)) asset.dependencies.push(to);
    this.#track(from, to);
  }

  invalidate(guid: AssetGUID): ImportResult["dependentsInvalidated"] {
    const dependents = this.dependentsOf(guid);
    const cascade = new Set<AssetGUID>(dependents);
    const queue = [...dependents];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const next of this.dependentsOf(current)) {
        if (!cascade.has(next)) {
          cascade.add(next);
          queue.push(next);
        }
      }
    }
    this.cache.invalidate(guid);
    for (const dependent of cascade) this.cache.invalidate(dependent);
    const list = [...cascade];
    this.onInvalidated.emit({ guid, dependents: list });
    return list;
  }

  notifyChange(path: string, source: Uint8Array | string): AssetWatcherEvent {
    const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
    const guid = this.#byPath.get(normalize(path)) ?? null;
    return this.watcher.notifyChange(normalize(path), contentHash(bytes), guid);
  }

  scan(entries: { path: string; source: Uint8Array | string }[]): AssetWatcherEvent[] {
    return this.watcher.scan(
      entries.map((entry) => {
        const bytes = typeof entry.source === "string" ? new TextEncoder().encode(entry.source) : entry.source;
        return { path: normalize(entry.path), sourceHash: contentHash(bytes), guid: this.#byPath.get(normalize(entry.path)) ?? null };
      }),
    );
  }

  serialize(): string {
    return JSON.stringify(
      this.all().map((asset) => ({
        guid: asset.guid,
        path: asset.path,
        type: asset.type,
        sourceHash: asset.sourceHash,
        metadata: asset.metadata,
        dependencies: asset.dependencies,
        version: asset.version,
      })),
      null,
      2,
    );
  }

  restore(serialized: string): void {
    this.#assets.clear();
    this.#byPath.clear();
    this.#dependents.clear();
    const entries = JSON.parse(serialized) as Array<Omit<DatabaseAsset, "data">>;
    for (const entry of entries) {
      const asset: DatabaseAsset = { ...entry, data: null };
      this.#assets.set(asset.guid, asset);
      this.#byPath.set(asset.path, asset.guid);
    }
    for (const asset of this.#assets.values()) {
      for (const dependency of asset.dependencies) this.#track(asset.guid, dependency);
    }
  }

  resolveImporter(path: string, name?: string): AssetImporter {
    const importer = (name ? this.registry.get(name) : null) ?? this.registry.forPath(path);
    if (!importer) {
      throw new ImportError(`no importer for extension: ${extensionOf(path)}`, path);
    }
    return importer;
  }

  #resolveDependencies(guid: AssetGUID, paths: string[]): AssetGUID[] {
    const resolved: AssetGUID[] = [];
    for (const dependencyPath of paths) {
      const normalized = normalize(dependencyPath);
      let dependencyGuid = this.#byPath.get(normalized) ?? null;
      if (!dependencyGuid) {
        const created = this.register(normalized);
        dependencyGuid = created.guid;
      }
      if (dependencyGuid === guid) throw new AssetDatabaseError(`asset depends on itself: ${guid}`);
      if (this.detectCycle(guid, dependencyGuid)) throw new AssetDatabaseError(`circular dependency: ${guid} -> ${dependencyGuid}`);
      resolved.push(dependencyGuid);
      this.#track(guid, dependencyGuid);
    }
    return resolved;
  }

  #track(from: AssetGUID, to: AssetGUID): void {
    let set = this.#dependents.get(to);
    if (!set) {
      set = new Set();
      this.#dependents.set(to, set);
    }
    set.add(from);
  }
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+/g, "/");
}

function sameList(a: AssetGUID[], b: AssetGUID[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
