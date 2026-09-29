import type { ResourceState } from "./types.js";
import { ResourceError } from "./types.js";
import { ResourceHandle } from "./handle.js";
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

