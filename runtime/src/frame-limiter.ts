export interface FrameLimiterOptions {

  targetFps?: number;

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

  get frameBudgetMs(): number {
    return this.#budgetMs;
  }

  shouldRun(): boolean {
    if (this.#budgetMs === 0) return true;
    const nowMs = this.#now();
    if (nowMs < this.#nextFrameMs) return false;
    this.#nextFrameMs += this.#budgetMs;

    if (nowMs - this.#nextFrameMs > this.#budgetMs * 2) {
      this.#nextFrameMs = nowMs + this.#budgetMs;
    }
    return true;
  }

  timeUntilNextMs(): number {
    if (this.#budgetMs === 0) return 0;
    return Math.max(0, this.#nextFrameMs - this.#now());
  }

  reset(): void {
    this.#nextFrameMs = this.#now();
  }
}
