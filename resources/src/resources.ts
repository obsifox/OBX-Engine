import type { VirtualFileSystem } from "@obx/vfs";

export const RESOURCES_VERSION = "1.1.0";

export class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceError";
  }
}

export type ResourceState = "loading" | "ready" | "failed" | "unloaded";

export interface ResourceLoadContext {
  declareDependencies(dependencies: string[]): void;
}

export interface ResourceLoadResult<T> {
  value: T;
  dependencies?: string[];
}

export interface ResourceLoader<T = unknown> {
  readonly type: string;
  readonly extensions: string[];
  load(path: string, vfs: VirtualFileSystem, context: ResourceLoadContext): T | ResourceLoadResult<T>;
}

export class ResourceHandle<T = unknown> {
  readonly path: string;
  readonly type: string;
  state: ResourceState = "loading";
  value: T | undefined;
  error: string | undefined;
  dependencies: string[] = [];
  version = 1;
  #refCount = 0;
  #listeners = new Set<(handle: ResourceHandle<T>) => void>();

  constructor(path: string, type: string) {
    this.path = path;
    this.type = type;
  }

  get refCount(): number {
    return this.#refCount;
  }

  retain(): this {
    this.#refCount += 1;
    return this;
  }

  release(): number {
    this.#refCount = Math.max(0, this.#refCount - 1);
    return this.#refCount;
  }

  onChange(listener: (handle: ResourceHandle<T>) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  notify(): void {
    for (const listener of [...this.#listeners]) listener(this);
  }
}

export interface ResourceCacheStats {
  hits: number;
  misses: number;
  size: number;
  invalidations: number;
}

export class ResourceCache {
  #entries = new Map<string, ResourceHandle>();
  #hits = 0;
  #misses = 0;
  #invalidations = 0;

  get(path: string): ResourceHandle | undefined {
    const handle = this.#entries.get(path);
    if (handle) this.#hits += 1;
    else this.#misses += 1;
    return handle;
  }

  peek(path: string): ResourceHandle | undefined {
    return this.#entries.get(path);
  }

  set(path: string, handle: ResourceHandle): void {
    this.#entries.set(path, handle);
  }

  delete(path: string): boolean {
    this.#invalidations += 1;
    return this.#entries.delete(path);
  }

  has(path: string): boolean {
    return this.#entries.has(path);
  }

  paths(): string[] {
    return [...this.#entries.keys()].sort();
  }

  clear(): void {
    this.#entries.clear();
  }

  stats(): ResourceCacheStats {
    return { hits: this.#hits, misses: this.#misses, size: this.#entries.size, invalidations: this.#invalidations };
  }
}

export interface ResourceManagerOptions {
  strictExtensions?: boolean;
}

export class ResourceManager {
  readonly vfs: VirtualFileSystem;
  readonly cache = new ResourceCache();
  #loaders: ResourceLoader[] = [];
  #dependents = new Map<string, Set<string>>();
  #dependencies = new Map<string, Set<string>>();
  #versions = new Map<string, number>();
  #options: ResourceManagerOptions;

  constructor(vfs: VirtualFileSystem, options: ResourceManagerOptions = {}) {
    this.vfs = vfs;
    this.#options = options;
  }

  registerLoader<T>(loader: ResourceLoader<T>): void {
    const existing = this.#loaders.findIndex((candidate) => candidate.type === loader.type);
    if (existing >= 0) throw new ResourceError(`Loader type already registered: ${loader.type}`);
    this.#loaders.push(loader as ResourceLoader);
  }

  loaders(): ResourceLoader[] {
    return [...this.#loaders];
  }

  loaderFor(path: string): ResourceLoader | undefined {
    const dot = path.lastIndexOf(".");
    const extension = dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
    return this.#loaders.find((loader) => loader.extensions.includes(extension));
  }

  load<T = unknown>(path: string): ResourceHandle<T> {
    const cached = this.cache.get(path);
    if (cached && cached.state === "ready") {
      return cached.retain() as ResourceHandle<T>;
    }
    const loader = this.#requireLoader(path);
    const handle = cached ? (cached as unknown as ResourceHandle<T>) : new ResourceHandle<T>(path, loader.type);
    handle.version = this.#versions.get(path) ?? 1;
    this.cache.set(path, handle as unknown as ResourceHandle);
    const context = this.#createContext(handle.path);
    try {
      const outcome = loader.load(path, this.vfs, context) as T | ResourceLoadResult<T>;
      this.#applyOutcome(handle, outcome);
    } catch (error) {
      handle.state = "failed";
      handle.error = String(error);
      handle.notify();
      throw error;
    }
    return handle.retain();
  }

  async loadAsync<T = unknown>(path: string): Promise<ResourceHandle<T>> {
    return Promise.resolve().then(() => this.load<T>(path));
  }

  get<T = unknown>(path: string): ResourceHandle<T> | undefined {
    return this.cache.peek(path) as ResourceHandle<T> | undefined;
  }

  unload(path: string, options: { force?: boolean } = {}): boolean {
    const handle = this.cache.peek(path);
    if (!handle) return false;
    if (!options.force && handle.refCount > 0) return false;
    handle.state = "unloaded";
    handle.value = undefined;
    handle.notify();
    this.cache.delete(path);
    for (const dep of this.#dependencies.get(path) ?? []) {
      this.#dependents.get(dep)?.delete(path);
    }
    this.#dependencies.delete(path);
    return true;
  }

  invalidate(path: string): string[] {
    const affected = [path, ...this.dependentsOf(path)];
    for (const target of affected) {
      this.#versions.set(target, (this.#versions.get(target) ?? 1) + 1);
      const handle = this.cache.peek(target);
      if (handle) {
        handle.version += 1;
        handle.state = "loading";
        handle.notify();
      }
      this.cache.delete(target);
    }
    return affected;
  }

  dependentsOf(path: string): string[] {
    const found: string[] = [];
    const visited = new Set<string>([path]);
    const queue = [path];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dependent of this.#dependents.get(current) ?? []) {
        if (visited.has(dependent)) continue;
        visited.add(dependent);
        found.push(dependent);
        queue.push(dependent);
      }
    }
    return found.sort();
  }

  dependenciesOf(path: string): string[] {
    return [...(this.#dependencies.get(path) ?? [])].sort();
  }

  stats(): {
    cache: ResourceCacheStats;
    loaders: number;
    trackedDependencies: number;
    trackedDependents: number;
  } {
    return {
      cache: this.cache.stats(),
      loaders: this.#loaders.length,
      trackedDependencies: this.#dependencies.size,
      trackedDependents: this.#dependents.size,
    };
  }

  #requireLoader(path: string): ResourceLoader {
    const loader = this.loaderFor(path);
    if (!loader) {
      if (this.#options.strictExtensions === false) {
        throw new ResourceError(`No loader registered for: ${path}`);
      }
      throw new ResourceError(`No loader registered for: ${path}`);
    }
    return loader;
  }

  #createContext(path: string): ResourceLoadContext {
    return {
      declareDependencies: (dependencies: string[]) => {
        this.#trackDependencies(path, dependencies);
      },
    };
  }

  #applyOutcome<T>(handle: ResourceHandle<T>, outcome: T | ResourceLoadResult<T>): void {
    const isResult = typeof outcome === "object" && outcome !== null && "value" in (outcome as object);
    if (isResult) {
      const result = outcome as ResourceLoadResult<T>;
      handle.value = result.value;
      if (result.dependencies) this.#trackDependencies(handle.path, result.dependencies);
    } else {
      handle.value = outcome as T;
    }
    handle.state = "ready";
    handle.notify();
  }

  #trackDependencies(path: string, dependencies: string[]): void {
    const set = this.#dependencies.get(path) ?? new Set<string>();
    const handle = this.cache.peek(path);
    for (const dependency of dependencies) {
      set.add(dependency);
      if (handle && !handle.dependencies.includes(dependency)) handle.dependencies.push(dependency);
      let dependents = this.#dependents.get(dependency);
      if (!dependents) {
        dependents = new Set<string>();
        this.#dependents.set(dependency, dependents);
      }
      dependents.add(path);
    }
    this.#dependencies.set(path, set);
  }
}
