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

