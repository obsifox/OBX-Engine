import type { FileStat, PlatformFileSystem } from "./types.js";
import { PlatformError } from "./errors.js";
export class ManualFileSystem implements PlatformFileSystem {
  #files = new Map<string, Uint8Array>();
  #dirs = new Set<string>(["/"]);
  #clock: () => number;

  constructor(clock: () => number) {
    this.#clock = clock;
  }

  read(path: string): Uint8Array {
    const data = this.#files.get(path);
    if (!data) throw new PlatformError(`File not found: ${path}`);
    return new Uint8Array(data);
  }

  readText(path: string): string {
    return new TextDecoder().decode(this.read(path));
  }

  write(path: string, data: Uint8Array): void {
    this.#ensureParent(path);
    this.#files.set(path, new Uint8Array(data));
  }

  writeText(path: string, text: string): void {
    this.write(path, new TextEncoder().encode(text));
  }

  exists(path: string): boolean {
    return this.#files.has(path) || this.#dirs.has(path);
  }

  list(path: string): string[] {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const names = new Set<string>();
    for (const key of this.#files.keys()) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split("/")[0]!);
    }
    for (const dir of this.#dirs) {
      if (dir.startsWith(prefix) && dir !== path) names.add(dir.slice(prefix.length).split("/")[0]!);
    }
    return [...names].sort();
  }

  mkdir(path: string): void {
    this.#dirs.add(path);
  }

  remove(path: string): void {
    if (!this.#files.delete(path) && !this.#dirs.delete(path)) {
      throw new PlatformError(`Path not found: ${path}`);
    }
  }

  stat(path: string): FileStat {
    if (this.#files.has(path)) {
      return { size: this.#files.get(path)!.length, directory: false, modifiedMs: this.#clock() };
    }
    if (this.#dirs.has(path)) {
      return { size: 0, directory: true, modifiedMs: this.#clock() };
    }
    throw new PlatformError(`Path not found: ${path}`);
  }

  #ensureParent(path: string): void {
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

