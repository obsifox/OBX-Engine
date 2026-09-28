/**
 * Platform abstraction — §64 Platform Abstraction (foundation layer).
 *
 * v0.1 provides: platform detection, a monotonic clock, and loop-driver
 * factories. Window/GPU/audio/input abstractions arrive with their subsystems.
 */

import { RuntimeError } from "@obsifox/core";
import type { LoopDriver } from "./loop-driver.js";
import { ManualLoopDriver, TimeoutLoopDriver } from "./loop-driver.js";

export type PlatformId = "manual" | "node" | "browser";

export interface PlatformLoopOptions {
  /** Cap frame rate (0 = uncapped). */
  targetFps?: number;
}

/** Host platform services used by the engine runtime. */
export interface RuntimePlatform {
  readonly id: PlatformId;
  /** Monotonic time in milliseconds. */
  now(): number;
  /** Create the default loop driver for this platform. */
  createLoopDriver(options?: PlatformLoopOptions): LoopDriver;
  /** Schedule a microtask-ish callback on the host event loop. */
  nextTick(callback: () => void): void;
}

/** Deterministic platform for tests and offline simulation. */
export class ManualPlatform implements RuntimePlatform {
  readonly id = "manual" as const;
  #nowMs = 0;

  now(): number {
    return this.#nowMs;
  }

  /** Advance the manual clock. */
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

/** Node.js platform. */
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

/** Browser platform (WebGL/WebGPU runtimes hook in later). */
export class BrowserPlatform implements RuntimePlatform {
  readonly id = "browser" as const;

  now(): number {
    return performance.now();
  }

  createLoopDriver(options: PlatformLoopOptions = {}): LoopDriver {
    // rAF-based driver lands with the Web runtime (§50); timeout driver works everywhere.
    return new TimeoutLoopDriver({ targetFps: options.targetFps ?? 0 });
  }

  nextTick(callback: () => void): void {
    queueMicrotask(callback);
  }
}

/** Detect the current host platform. */
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
