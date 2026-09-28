export interface ClockOptions {

  timeScale?: number;

  maxDelta?: number;

  fixedDelta?: number;

  maxFixedSteps?: number;
}

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

  get time(): number {
    return this.#time;
  }

  get unscaledTime(): number {
    return this.#unscaledTime;
  }

  get delta(): number {
    return this.#delta;
  }

  get deltaUnscaled(): number {
    return this.#unscaledDelta;
  }

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

  consumeFixedSteps(): { steps: number; alpha: number } {
    let steps = 0;
    while (this.#fixedAlpha >= this.#fixedDelta && steps < this.#maxFixedSteps) {
      this.#fixedAlpha -= this.#fixedDelta;
      steps += 1;
    }

    if (steps === this.#maxFixedSteps && this.#fixedAlpha >= this.#fixedDelta) {
      this.#fixedAlpha = this.#fixedAlpha % this.#fixedDelta;
    }
    const alpha = Math.min(Math.max(this.#fixedAlpha / this.#fixedDelta, 0), 1);
    return { steps, alpha };
  }

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

export function msToSeconds(ms: number): number {
  return ms / 1000;
}

export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}
