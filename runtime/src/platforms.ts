import { RuntimeError } from "@obx/core";
import type { LoopDriver } from "./loop-driver.js";
import { ManualLoopDriver, TimeoutLoopDriver } from "./loop-driver.js";

export type PlatformId = "manual" | "node" | "browser";

export interface PlatformLoopOptions {

  targetFps?: number;
}

export interface RuntimePlatform {
  readonly id: PlatformId;

  now(): number;

  createLoopDriver(options?: PlatformLoopOptions): LoopDriver;

  nextTick(callback: () => void): void;
}

export class ManualPlatform implements RuntimePlatform {
  readonly id = "manual" as const;
  #nowMs = 0;

  now(): number {
    return this.#nowMs;
  }

  advance(ms: number): void {
    this.#nowMs += ms;
  }

  createLoopDriver(): LoopDriver {
    return new ManualLoopDriver();
  }

  nextTick(callback: () => void): void {
    queueMicrotask(callback);
  }
}

export class NodePlatform implements RuntimePlatform {
  readonly id = "node" as const;

  now(): number {
    return performance.now();
  }

  createLoopDriver(options: PlatformLoopOptions = {}): LoopDriver {
    return new TimeoutLoopDriver({ targetFps: options.targetFps ?? 0 });
  }

  nextTick(callback: () => void): void {
    queueMicrotask(callback);
  }
}

export class BrowserPlatform implements RuntimePlatform {
  readonly id = "browser" as const;

  now(): number {
    return performance.now();
  }

  createLoopDriver(options: PlatformLoopOptions = {}): LoopDriver {

    return new TimeoutLoopDriver({ targetFps: options.targetFps ?? 0 });
  }

  nextTick(callback: () => void): void {
    queueMicrotask(callback);
  }
}

export function detectPlatform(): RuntimePlatform {
  const runtime = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;
  if (runtime) {
    return new NodePlatform();
  }
  if (typeof (globalThis as { document?: unknown }).document !== "undefined") {
    return new BrowserPlatform();
  }
  throw new RuntimeError("Unable to detect a supported platform");
}
