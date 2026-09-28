/**
 * ObsiFox Game Loop — §3 Game Loop.
 *
 * ```text
 * Input → Simulation → Physics → AI → Animation → Audio → Networking → UI → Rendering
 * ```
 *
 * The loop is driver-agnostic: a {@link LoopDriver} supplies timestamps, the
 * loop advances a {@link Clock}, runs `fixedUpdate` at a fixed timestep
 * (accumulator pattern) and then variable `update` + `render` callbacks.
 */

import {
  Clock,
  InvalidStateError,
  Scheduler,
  Signal,
  type ClockOptions,
  type Unsubscribe,
} from "@obsifox/core";
import type { LoopDriver } from "./loop-driver.js";
import { ManualLoopDriver } from "./loop-driver.js";
import { FpsCounter } from "./fps-counter.js";

export type FixedUpdateCallback = (fixedDeltaSeconds: number) => void;
export type UpdateCallback = (deltaSeconds: number) => void;
export type RenderCallback = (interpolationAlpha: number) => void;
export type FrameCallback = (frame: number) => void;

export interface GameLoopOptions extends ClockOptions {
  /** Heartbeat source (default: {@link ManualLoopDriver}). */
  driver?: LoopDriver;
  /** Track FPS statistics (default true). */
  trackFps?: boolean;
}

/**
 * Fixed-timestep game loop with variable-rate update/render phases.
 *
 * ```ts
 * const loop = new GameLoop();
 * loop.onFixedUpdate((dt) => world.update(dt));
 * loop.onUpdate((dt) => ui.update(dt));
 * loop.onRender((alpha) => renderer.render(alpha));
 * loop.start();
 * ```
 */
export class GameLoop {
  readonly clock: Clock;
  /** Fired at the end of each processed frame with the frame index. */
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

  /** Current FPS estimate (0 when tracking disabled). */
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

  /**
   * Wrap every frame body in a custom hook (used by schedulers, profilers,
   * or a parent engine wanting to run its Scheduler.update alongside frames).
   */
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

  /** Start the loop with the configured driver. */
  start(): void {
    if (this.#running) {
      throw new InvalidStateError("GameLoop is already running");
    }
    this.#running = true;
    this.#lastTimestampMs = null;
    this.#driver.start((timestampMs) => this.step(timestampMs));
  }

  /** Stop the loop (driver heartbeat halts; state is preserved). */
  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    this.#driver.stop();
    this.#lastTimestampMs = null;
  }

  /**
   * Process exactly one frame at `timestampMs` (milliseconds, monotonic).
   * Called by the driver; public for deterministic tests.
   */
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

    // Fixed timestep: run simulation N times at fixedDelta.
    const { steps, alpha } = this.clock.consumeFixedSteps();
    for (let i = 0; i < steps; i += 1) {
      for (const callback of this.#fixedCallbacks) {
        callback(this.clock.fixedDelta);
      }
    }

    // Variable update (delta is 0 while paused).
    for (const callback of this.#updateCallbacks) {
      callback(this.clock.delta);
    }

    // Render with interpolation alpha (still runs while paused — pause menus etc.).
    for (const callback of this.#renderCallbacks) {
      callback(alpha);
    }

    this.onFrameEnd.emit(this.clock.frame);
  }
}
