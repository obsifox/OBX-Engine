/**
 * ObsiFox Time System — §2 Core / Time, Delta time, Fixed timestep,
 * Frame timing, Time scale, Pause.
 *
 * {@link Clock} is driven externally (by the game loop or a test harness) via
 * {@link Clock.advance | advance(realDeltaSeconds)}. Engine time is affected by
 * `timeScale` and `paused`; unscaled values are always available too.
 */

export interface ClockOptions {
  /** Multiplier applied to engine time (default 1). */
  timeScale?: number;
  /** Clamp for a single real frame delta in seconds (default 0.25). */
  maxDelta?: number;
  /** Fixed simulation step in seconds (default 1/60). */
  fixedDelta?: number;
  /** Max fixed steps per frame — prevents spiral of death (default 5). */
  maxFixedSteps?: number;
}

/** Frame timing + engine time with time scaling, pause and fixed-step support. */
export class Clock {
  #timeScale: number;
  #maxDelta: number;
  #fixedDelta: number;
  #maxFixedSteps: number;

  #paused = false;
  #frame = 0;
  #time = 0;
  #unscaledTime = 0;
  #delta = 0;
  #unscaledDelta = 0;
  #fixedAlpha = 0;

  constructor(options: ClockOptions = {}) {
    this.#timeScale = options.timeScale ?? 1;
    this.#maxDelta = options.maxDelta ?? 0.25;
    this.#fixedDelta = options.fixedDelta ?? 1 / 60;
    this.#maxFixedSteps = options.maxFixedSteps ?? 5;
  }

  /** Scaled elapsed engine time in seconds. */
  get time(): number {
    return this.#time;
  }

  /** Unscaled elapsed engine time in seconds (runs while paused). */
  get unscaledTime(): number {
    return this.#unscaledTime;
  }

  /** Scaled delta of the last frame in seconds (0 while paused). */
  get delta(): number {
    return this.#delta;
  }

  /** Unscaled (real) delta of the last frame in seconds. */
  get deltaUnscaled(): number {
    return this.#unscaledDelta;
  }

  /** Number of frames advanced. */
  get frame(): number {
    return this.#frame;
  }

  get timeScale(): number {
    return this.#timeScale;
  }

  set timeScale(value: number) {
    if (value < 0) {
      throw new RangeError("timeScale must be >= 0");
    }
    this.#timeScale = value;
  }

  get paused(): boolean {
    return this.#paused;
  }

  set paused(value: boolean) {
    this.#paused = value;
  }

  get fixedDelta(): number {
    return this.#fixedDelta;
  }

  set fixedDelta(value: number) {
    if (value <= 0) {
      throw new RangeError("fixedDelta must be > 0");
    }
    this.#fixedDelta = value;
  }

  get maxDelta(): number {
    return this.#maxDelta;
  }

  set maxDelta(value: number) {
    if (value <= 0) {
      throw new RangeError("maxDelta must be > 0");
    }
    this.#maxDelta = value;
  }

  get maxFixedSteps(): number {
    return this.#maxFixedSteps;
  }

  set maxFixedSteps(value: number) {
    if (value < 1) {
      throw new RangeError("maxFixedSteps must be >= 1");
    }
    this.#maxFixedSteps = value;
  }

  /**
   * Advance the clock by a real-time delta given in **seconds**.
   * Called once per frame by the game loop.
   */
  advance(realDeltaSeconds: number): void {
    const clamped = Math.min(Math.max(realDeltaSeconds, 0), this.#maxDelta);
    this.#unscaledDelta = clamped;
    this.#unscaledTime += clamped;

    if (this.#paused) {
      this.#delta = 0;
    } else {
      this.#delta = clamped * this.#timeScale;
      this.#time += this.#delta;
      this.#fixedAlpha += this.#delta;
    }
    this.#frame += 1;
  }

  /**
   * How many fixed steps should run this frame, consuming fixed-time budget.
   * Returns `{ steps, alpha }` where `alpha` is the interpolation factor
   * remaining after the steps (0..1).
   */
  consumeFixedSteps(): { steps: number; alpha: number } {
    let steps = 0;
    while (this.#fixedAlpha >= this.#fixedDelta && steps < this.#maxFixedSteps) {
      this.#fixedAlpha -= this.#fixedDelta;
      steps += 1;
    }
    // If we hit the cap, drop the remainder to avoid an ever-growing backlog.
    if (steps === this.#maxFixedSteps && this.#fixedAlpha >= this.#fixedDelta) {
      this.#fixedAlpha = this.#fixedAlpha % this.#fixedDelta;
    }
    const alpha = Math.min(Math.max(this.#fixedAlpha / this.#fixedDelta, 0), 1);
    return { steps, alpha };
  }

  /** Reset all time state (keeps configuration). */
  reset(): void {
    this.#frame = 0;
    this.#time = 0;
    this.#unscaledTime = 0;
    this.#delta = 0;
    this.#unscaledDelta = 0;
    this.#fixedAlpha = 0;
    this.#paused = false;
  }
}

/** Convert milliseconds to seconds. */
export function msToSeconds(ms: number): number {
  return ms / 1000;
}

/** Convert seconds to milliseconds. */
export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}
