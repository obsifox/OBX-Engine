import type { VfsStat, VirtualFileSystemAdapter } from "./types.js";
import { VfsError } from "./types.js";
import { normalizeVirtualPath, joinVirtualPath, parentVirtualPath } from "./paths.js";
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

