import type { ResourceLoadResult, ResourceState } from "./types.js";
import { ResourceError } from "./types.js";
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

