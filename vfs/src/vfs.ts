export const VFS_VERSION = "1.1.0";

export class VfsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VfsError";
  }
}

export function normalizeVirtualPath(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw new VfsError("Path must be a non-empty string");
  }
  const absolute = path.startsWith("/") ? path : `/${path}`;
  const parts = absolute.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) throw new VfsError(`Path escapes virtual root: ${path}`);
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return `/${stack.join("/")}`.replace(/\/$/, "") || "/";
}

export function joinVirtualPath(...parts: string[]): string {
  return normalizeVirtualPath(parts.filter((part) => part.length > 0).join("/"));
}

export function parentVirtualPath(path: string): string {
  const normalized = normalizeVirtualPath(path);
  if (normalized === "/") return "/";
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

export interface VfsStat {
  size: number;
  directory: boolean;
}

export interface VirtualFileSystemAdapter {
  readonly kind: string;
  read(path: string): Uint8Array;
  write(path: string, data: Uint8Array): void;
  exists(path: string): boolean;
  list(path: string): string[];
  remove(path: string): void;
  stat(path: string): VfsStat;
}

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

export interface PhysicalFileSystemOptions {
  root: string;
  files: {
    read(path: string): Uint8Array;
    write(path: string, data: Uint8Array): void;
    exists(path: string): boolean;
    list(path: string): string[];
    remove(path: string): void;
    stat(path: string): { size: number; directory: boolean };
  };
}

export class PhysicalFileSystem implements VirtualFileSystemAdapter {
  readonly kind = "physical";
  #root: string;
  #files: PhysicalFileSystemOptions["files"];

  constructor(options: PhysicalFileSystemOptions) {
    this.#root = options.root.replace(/\/$/, "") || "/";
    this.#files = options.files;
  }

  #resolve(path: string): string {
    const key = normalizeVirtualPath(path);
    return key === "/" ? this.#root : `${this.#root}${key}`;
  }

  read(path: string): Uint8Array {
    return this.#files.read(this.#resolve(path));
  }

  write(path: string, data: Uint8Array): void {
    this.#files.write(this.#resolve(path), data);
  }

  exists(path: string): boolean {
    return this.#files.exists(this.#resolve(path));
  }

  list(path: string): string[] {
    return this.#files.list(this.#resolve(path));
  }

  remove(path: string): void {
    this.#files.remove(this.#resolve(path));
  }

  stat(path: string): VfsStat {
    return this.#files.stat(this.#resolve(path));
  }
}

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
