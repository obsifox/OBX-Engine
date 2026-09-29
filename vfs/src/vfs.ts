import type { VfsStat, VirtualFileSystemAdapter } from "./types.js";
import { VfsError } from "./types.js";
import { normalizeVirtualPath, joinVirtualPath, parentVirtualPath } from "./paths.js";
export interface MountRecord {
  prefix: string;
  adapter: VirtualFileSystemAdapter;
}

export class VirtualFileSystem {
  #mounts: MountRecord[] = [];

  mount(prefix: string, adapter: VirtualFileSystemAdapter): MountRecord {
    const normalized = normalizeVirtualPath(prefix);
    if (this.#mounts.some((record) => record.prefix === normalized)) {
      throw new VfsError(`Mount point already in use: ${normalized}`);
    }
    const record: MountRecord = { prefix: normalized, adapter };
    this.#mounts.push(record);
    this.#mounts.sort((a, b) => b.prefix.length - a.prefix.length);
    return record;
  }

  unmount(prefix: string): boolean {
    const normalized = normalizeVirtualPath(prefix);
    const index = this.#mounts.findIndex((record) => record.prefix === normalized);
    if (index < 0) return false;
    this.#mounts.splice(index, 1);
    return true;
  }

  mounts(): MountRecord[] {
    return [...this.#mounts];
  }

  resolve(path: string): { record: MountRecord; localPath: string } | null {
    const key = normalizeVirtualPath(path);
    for (const record of this.#mounts) {
      const prefix = record.prefix === "/" ? "/" : record.prefix;
      if (key === prefix) return { record, localPath: "/" };
      if (prefix === "/" || key.startsWith(`${prefix}/`)) {
        return { record, localPath: key.slice(prefix.length) || "/" };
      }
    }
    return null;
  }

  read(path: string): Uint8Array {
    const match = this.resolve(path);
    if (!match) throw new VfsError(`No mount covers path: ${path}`);
    return match.record.adapter.read(match.localPath);
  }

  readText(path: string): string {
    return new TextDecoder().decode(this.read(path));
  }

  write(path: string, data: Uint8Array): void {
    const match = this.resolve(path);
    if (!match) throw new VfsError(`No mount covers path: ${path}`);
    match.record.adapter.write(match.localPath, data);
  }

  writeText(path: string, text: string): void {
    this.write(path, new TextEncoder().encode(text));
  }

  exists(path: string): boolean {
    const match = this.resolve(path);
    return match ? match.record.adapter.exists(match.localPath) : false;
  }

  list(path: string): string[] {
    const key = normalizeVirtualPath(path);
    const names = new Set<string>();
    for (const record of this.#mounts) {
      const prefix = record.prefix === "/" ? "/" : record.prefix;
      if (key === prefix) {
        for (const name of record.adapter.list("/")) names.add(name);
      } else if (prefix.startsWith(key === "/" ? "/" : `${key}/`) || key === "/") {
        const relative = key === "/" ? prefix.slice(1) : prefix.slice(key.length + 1);
        const head = relative.split("/")[0];
        if (head) names.add(head);
      } else if (key.startsWith(prefix === "/" ? "/" : `${prefix}/`)) {
        for (const name of record.adapter.list(key.slice(prefix.length))) names.add(name);
      }
    }
    return [...names].sort();
  }

  remove(path: string): void {
    const match = this.resolve(path);
    if (!match) throw new VfsError(`No mount covers path: ${path}`);
    match.record.adapter.remove(match.localPath);
  }

  stat(path: string): VfsStat {
    const match = this.resolve(path);
    if (!match) throw new VfsError(`No mount covers path: ${path}`);
    return match.record.adapter.stat(match.localPath);
  }
}
