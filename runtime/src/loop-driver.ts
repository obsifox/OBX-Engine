/**
 * Loop drivers — the host-side heartbeat that feeds {@link GameLoop.step}.
 *
 * Drivers are intentionally tiny so the same loop runs under Node, browsers
 * and tests (manual stepping).
 */

import { RuntimeError } from "@obsifox/core";

export type StepFunction = (timestampMs: number) => void;

/** Host heartbeat abstraction. */
export interface LoopDriver {
  /** Begin calling `step` with monotonically increasing timestamps (ms). */
  start(step: StepFunction): void;
  /** Stop the heartbeat. */
  stop(): void;
}

/**
 * Caller-driven driver — perfect for tests, dedicated servers stepping on
 * network ticks, and deterministic simulations.
 */
export class ManualLoopDriver implements LoopDriver {
  #step: StepFunction | null = null;
  #timestampMs = 0;

  get isRunning(): boolean {
    return this.#step !== null;
  }

  start(step: StepFunction): void {
    if (this.#step) {
      throw new RuntimeError("ManualLoopDriver already started");
    }
    this.#step = step;
  }

  stop(): void {
    this.#step = null;
  }

  /** Manually pump one frame at the given timestamp (ms). */
  step(timestampMs: number): void {
    if (!this.#step) {
      throw new RuntimeError("ManualLoopDriver.step called before start()");
    }
    this.#timestampMs = timestampMs;
    this.#step(timestampMs);
  }

  /** Pump `count` frames spaced `intervalMs` apart. Returns final timestamp. */
  runFrames(count: number, options: { startMs?: number; intervalMs?: number } = {}): number {
    const intervalMs = options.intervalMs ?? 16;
    let timestampMs = options.startMs ?? this.#timestampMs;
    for (let i = 0; i < count; i += 1) {
      timestampMs += intervalMs;
      this.step(timestampMs);
    }
    this.#timestampMs = timestampMs;
    return timestampMs;
  }
}

export interface TimeoutLoopDriverOptions {
  /** Target frame rate. 0 or undefined = as fast as setTimeout allows. */
  targetFps?: number;
  /** Custom timer functions (defaults to global setTimeout/clearTimeout). */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

/** `setTimeout`-based driver — works on Node and in browsers. */
export class TimeoutLoopDriver implements LoopDriver {
  #step: StepFunction | null = null;
  #timerHandle: unknown = null;
  #targetFps: number;
  readonly #setTimeout: (fn: () => void, ms: number) => unknown;
  readonly #clearTimeout: (handle: unknown) => void;

  constructor(options: TimeoutLoopDriverOptions = {}) {
    this.#targetFps = options.targetFps ?? 0;
    this.#setTimeout = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.#clearTimeout = options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get isRunning(): boolean {
    return this.#step !== null;
  }

  get targetFps(): number {
    return this.#targetFps;
  }

  set targetFps(value: number) {
    if (value < 0) throw new RangeError("targetFps must be >= 0");
    this.#targetFps = value;
  }

  start(step: StepFunction): void {
    if (this.#step) {
      throw new RuntimeError("TimeoutLoopDriver already started");
    }
    this.#step = step;
    const frameIntervalMs = this.#targetFps > 0 ? 1000 / this.#targetFps : 0;
    let expectedMs = Date.now() + frameIntervalMs;

    const tick = (): void => {
      if (!this.#step) return;
      const nowMs = Date.now();
      this.#step(nowMs);
      // Drift-corrected scheduling keeps the average rate near targetFps.
      expectedMs += frameIntervalMs;
      const delay = Math.max(0, expectedMs - Date.now());
      this.#timerHandle = this.#setTimeout(tick, delay);
    };

    this.#timerHandle = this.#setTimeout(tick, frameIntervalMs);
  }

  stop(): void {
    this.#step = null;
    if (this.#timerHandle !== null) {
      this.#clearTimeout(this.#timerHandle);
      this.#timerHandle = null;
    }
  }
}
