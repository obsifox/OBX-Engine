import type { VfsStat, VirtualFileSystemAdapter } from "./types.js";
import { VfsError } from "./types.js";
import { normalizeVirtualPath, joinVirtualPath, parentVirtualPath } from "./paths.js";
export class MemoryFileSystem implements VirtualFileSystemAdapter {
  readonly kind = "memory";
  #files = new Map<string, Uint8Array>();
  #dirs = new Set<string>(["/"]);

  read(path: string): Uint8Array {
    const key = normalizeVirtualPath(path);
    const data = this.#files.get(key);
    if (!data) throw new VfsError(`File not found: ${key}`);
    return new Uint8Array(data);
  }

  write(path: string, data: Uint8Array): void {
    const key = normalizeVirtualPath(path);
    this.#ensureParents(key);
    this.#files.set(key, new Uint8Array(data));
  }

  exists(path: string): boolean {
    const key = normalizeVirtualPath(path);
    return this.#files.has(key) || this.#dirs.has(key);
  }

  list(path: string): string[] {
    const key = normalizeVirtualPath(path);
    const prefix = key === "/" ? "/" : `${key}/`;
    const names = new Set<string>();
    for (const file of this.#files.keys()) {
      if (file.startsWith(prefix)) names.add(file.slice(prefix.length).split("/")[0]!);
    }
    for (const dir of this.#dirs) {
      if (dir !== key && dir.startsWith(prefix)) names.add(dir.slice(prefix.length).split("/")[0]!);
    }
    return [...names].sort();
  }

  remove(path: string): void {
    const key = normalizeVirtualPath(path);
    if (!this.#files.delete(key) && !this.#dirs.delete(key)) {
      throw new VfsError(`Path not found: ${key}`);
    }
  }

  stat(path: string): VfsStat {
    const key = normalizeVirtualPath(path);
    const data = this.#files.get(key);
    if (data) return { size: data.length, directory: false };
    if (this.#dirs.has(key)) return { size: 0, directory: true };
    throw new VfsError(`Path not found: ${key}`);
  }

  #ensureParents(path: string): void {
    const parts = path.split("/").filter((part) => part.length > 0);
    parts.pop();
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      this.#dirs.add(current);
    }
    this.#dirs.add("/");
  }
}

