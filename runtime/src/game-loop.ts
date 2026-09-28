import {
  Clock,
  InvalidStateError,
  Scheduler,
  Signal,
  type ClockOptions,
  type Unsubscribe,
} from "@obx/core";
import type { LoopDriver } from "./loop-driver.js";
import { ManualLoopDriver } from "./loop-driver.js";
import { FpsCounter } from "./fps-counter.js";

export type FixedUpdateCallback = (fixedDeltaSeconds: number) => void;
export type UpdateCallback = (deltaSeconds: number) => void;
export type RenderCallback = (interpolationAlpha: number) => void;
export type FrameCallback = (frame: number) => void;

export interface GameLoopOptions extends ClockOptions {

  driver?: LoopDriver;

  trackFps?: boolean;
}

export class GameLoop {
  readonly clock: Clock;

  readonly onFrameEnd: Signal<[frame: number]> = new Signal();

  #driver: LoopDriver;
  #fps: FpsCounter | null;
  #running = false;
  #lastTimestampMs: number | null = null;
  #fixedCallbacks: FixedUpdateCallback[] = [];
  #updateCallbacks: UpdateCallback[] = [];
  #renderCallbacks: RenderCallback[] = [];
  #stepHook: ((fn: () => void) => void) | null = null;

  constructor(options: GameLoopOptions = {}) {
    this.clock = new Clock(options);
    this.#driver = options.driver ?? new ManualLoopDriver();
    this.#fps = (options.trackFps ?? true) ? new FpsCounter() : null;
  }

  get isRunning(): boolean {
    return this.#running;
  }

  get fps(): number {
    return this.#fps?.fps ?? 0;
  }

  get driver(): LoopDriver {
    return this.#driver;
  }

  set driver(value: LoopDriver) {
    if (this.#running) {
      throw new InvalidStateError("Cannot swap the loop driver while running");
    }
    this.#driver = value;
  }

  setStepHook(hook: ((fn: () => void) => void) | null): void {
    this.#stepHook = hook;
  }

  onFixedUpdate(callback: FixedUpdateCallback): Unsubscribe {
    this.#fixedCallbacks.push(callback);
    return () => {
      const index = this.#fixedCallbacks.indexOf(callback);
      if (index >= 0) this.#fixedCallbacks.splice(index, 1);
    };
  }

  onUpdate(callback: UpdateCallback): Unsubscribe {
    this.#updateCallbacks.push(callback);
    return () => {
      const index = this.#updateCallbacks.indexOf(callback);
      if (index >= 0) this.#updateCallbacks.splice(index, 1);
    };
  }

  onRender(callback: RenderCallback): Unsubscribe {
    this.#renderCallbacks.push(callback);
    return () => {
      const index = this.#renderCallbacks.indexOf(callback);
      if (index >= 0) this.#renderCallbacks.splice(index, 1);
    };
  }

  start(): void {
    if (this.#running) {
      throw new InvalidStateError("GameLoop is already running");
    }
    this.#running = true;
    this.#lastTimestampMs = null;
    this.#driver.start((timestampMs) => this.step(timestampMs));
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#driver.stop();
    this.#lastTimestampMs = null;
  }

  step(timestampMs: number): void {
    const run = (): void => this.#stepBody(timestampMs);
    if (this.#stepHook) {
      this.#stepHook(run);
    } else {
      run();
    }
  }

  #stepBody(timestampMs: number): void {
    const last = this.#lastTimestampMs;
    this.#lastTimestampMs = timestampMs;
    const deltaSeconds = last === null ? 0 : Math.max(0, (timestampMs - last) / 1000);

    this.clock.advance(deltaSeconds);
    this.#fps?.sample(this.clock.deltaUnscaled);

    const { steps, alpha } = this.clock.consumeFixedSteps();
    for (let i = 0; i < steps; i += 1) {
      for (const callback of this.#fixedCallbacks) {
        callback(this.clock.fixedDelta);
      }
    }

    for (const callback of this.#updateCallbacks) {
      callback(this.clock.delta);
    }

    for (const callback of this.#renderCallbacks) {
      callback(alpha);
    }

    this.onFrameEnd.emit(this.clock.frame);
  }
}
