import { RuntimeError } from "@obx/core";

export type StepFunction = (timestampMs: number) => void;

export interface LoopDriver {

  start(step: StepFunction): void;

  stop(): void;
}

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

  step(timestampMs: number): void {
    if (!this.#step) {
      throw new RuntimeError("ManualLoopDriver.step called before start()");
    }
    this.#timestampMs = timestampMs;
    this.#step(timestampMs);
  }

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

  targetFps?: number;

  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

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
