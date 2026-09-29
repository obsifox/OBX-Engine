export const VFS_VERSION = "1.1.0";

export class VfsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VfsError";
  }
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

