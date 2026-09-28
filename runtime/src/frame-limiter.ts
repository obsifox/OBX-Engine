/**
 * Frame limiter — §3 Game Loop / Frame limiter.
 *
 * Decides whether enough wall time has elapsed to run the next frame,
 * using a drift-corrected accumulator so long-run rate stays accurate.
 */

export interface FrameLimiterOptions {
  /** Target frames per second. 0 = uncapped (always allow). */
  targetFps?: number;
  /** Time source in milliseconds (default `Date.now`). */
  now?: () => number;
}

export class FrameLimiter {
  #targetFps: number;
  #budgetMs: number;
  #nextFrameMs: number;
  readonly #now: () => number;

  constructor(options: FrameLimiterOptions = {}) {
    this.#targetFps = options.targetFps ?? 0;
    this.#now = options.now ?? Date.now;
    this.#budgetMs = this.#targetFps > 0 ? 1000 / this.#targetFps : 0;
    this.#nextFrameMs = this.#now();
  }

  get targetFps(): number {
    return this.#targetFps;
  }

  set targetFps(value: number) {
    if (value < 0) throw new RangeError("targetFps must be >= 0");
    this.#targetFps = value;
    this.#budgetMs = value > 0 ? 1000 / value : 0;
    this.reset();
  }

  /** Minimum frame budget in ms (0 when uncapped). */
  get frameBudgetMs(): number {
    return this.#budgetMs;
  }

  /**
   * Whether a frame may run now. When it returns true, the frame budget is
   * consumed and the internal schedule advances.
   */
  shouldRun(): boolean {
    if (this.#budgetMs === 0) return true;
    const nowMs = this.#now();
    if (nowMs < this.#nextFrameMs) return false;
    this.#nextFrameMs += this.#budgetMs;
    // If we fell badly behind, resync instead of bursting frames.
    if (nowMs - this.#nextFrameMs > this.#budgetMs * 2) {
      this.#nextFrameMs = nowMs + this.#budgetMs;
    }
    return true;
  }

  /** Milliseconds until the next allowed frame (0 when ready/uncapped). */
  timeUntilNextMs(): number {
    if (this.#budgetMs === 0) return 0;
    return Math.max(0, this.#nextFrameMs - this.#now());
  }

  reset(): void {
    this.#nextFrameMs = this.#now();
  }
}
