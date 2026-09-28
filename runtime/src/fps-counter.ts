/**
 * FPS counter — §3 Game Loop / FPS counter.
 *
 * Sliding-window average of frame times, cheap and allocation-free per frame.
 */

export interface FpsCounterOptions {
  /** Averaging window in seconds (default 0.5). */
  windowSeconds?: number;
}

export class FpsCounter {
  #windowSeconds: number;
  #accumulatedSeconds = 0;
  #framesInWindow = 0;
  #windowFps = 0;
  #lastFrameSeconds = 0;
  #totalFrames = 0;

  constructor(options: FpsCounterOptions = {}) {
    this.#windowSeconds = Math.max(options.windowSeconds ?? 0.5, 0.001);
  }

  /** Record a frame with its delta time in seconds. */
  sample(deltaSeconds: number): void {
    this.#lastFrameSeconds = deltaSeconds;
    this.#totalFrames += 1;
    if (deltaSeconds <= 0) return;
    this.#accumulatedSeconds += deltaSeconds;
    this.#framesInWindow += 1;
    if (this.#accumulatedSeconds >= this.#windowSeconds) {
      this.#windowFps = this.#framesInWindow / this.#accumulatedSeconds;
      this.#accumulatedSeconds = 0;
      this.#framesInWindow = 0;
    }
  }

  /** Smoothed FPS over the current window. */
  get fps(): number {
    return this.#windowFps;
  }

  /** Last frame time in milliseconds. */
  get frameTimeMs(): number {
    return this.#lastFrameSeconds * 1000;
  }

  /** Total sampled frames. */
  get totalFrames(): number {
    return this.#totalFrames;
  }

  reset(): void {
    this.#accumulatedSeconds = 0;
    this.#framesInWindow = 0;
    this.#windowFps = 0;
    this.#lastFrameSeconds = 0;
    this.#totalFrames = 0;
  }
}
