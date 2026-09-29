import type { VfsStat, VirtualFileSystemAdapter } from "./types.js";
import { VfsError } from "./types.js";
import { normalizeVirtualPath, joinVirtualPath, parentVirtualPath } from "./paths.js";
export class PackageFileSystem implements VirtualFileSystemAdapter {
  readonly kind = "package";
  #entries = new Map<string, Uint8Array>();
  #dirs = new Set<string>(["/"]);

  constructor(entries: Record<string, Uint8Array | string> = {}) {
    for (const [path, data] of Object.entries(entries)) {
      this.addEntry(path, data);
    }
  }

  addEntry(path: string, data: Uint8Array | string): void {
    const key = normalizeVirtualPath(path);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    this.#entries.set(key, bytes);
    let dir = parentVirtualPath(key);
    while (dir !== "/") {
      this.#dirs.add(dir);
      dir = parentVirtualPath(dir);
    }
    this.#dirs.add("/");
  }

  read(path: string): Uint8Array {
    const key = normalizeVirtualPath(path);
    const data = this.#entries.get(key);
    if (!data) throw new VfsError(`Package entry not found: ${key}`);
    return new Uint8Array(data);
  }

  write(): void {
    throw new VfsError("Package file system is read-only");
  }

  exists(path: string): boolean {
    const key = normalizeVirtualPath(path);
    return this.#entries.has(key) || this.#dirs.has(key);
  }

  list(path: string): string[] {
    const key = normalizeVirtualPath(path);
    const prefix = key === "/" ? "/" : `${key}/`;
    const names = new Set<string>();
    for (const entry of this.#entries.keys()) {
      if (entry.startsWith(prefix)) names.add(entry.slice(prefix.length).split("/")[0]!);
    }
    for (const dir of this.#dirs) {
      if (dir !== key && dir.startsWith(prefix)) names.add(dir.slice(prefix.length).split("/")[0]!);
    }
    return [...names].sort();
  }

  remove(): void {
    throw new VfsError("Package file system is read-only");
  }

  stat(path: string): VfsStat {
    const key = normalizeVirtualPath(path);
    const data = this.#entries.get(key);
    if (data) return { size: data.length, directory: false };
    if (this.#dirs.has(key)) return { size: 0, directory: true };
    throw new VfsError(`Package entry not found: ${key}`);
  }
}

