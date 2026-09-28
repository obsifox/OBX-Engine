export interface FpsCounterOptions {

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

  get fps(): number {
    return this.#windowFps;
  }

  get frameTimeMs(): number {
    return this.#lastFrameSeconds * 1000;
  }

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
