import type { PlatformTiming, TimerHandle } from "./types.js";
import { PlatformError } from "./errors.js";
export class ManualTiming implements PlatformTiming {
  #nowMs = 0;
  #timers = new Map<number, { callback: () => void; intervalMs: number; repeat: boolean; due: number; active: boolean }>();
  #nextTimerId = 1;

  now(): number {
    return this.#nowMs;
  }

  sleep(ms: number): void {
    this.advance(ms);
  }

  createTimer(callback: () => void, intervalMs: number, options: { repeat?: boolean } = {}): TimerHandle {
    const id = this.#nextTimerId++;
    const entry = {
      callback,
      intervalMs,
      repeat: options.repeat ?? false,
      due: this.#nowMs + intervalMs,
      active: true,
    };
    this.#timers.set(id, entry);
    return {
      get active() {
        return entry.active;
      },
      cancel: () => {
        entry.active = false;
        this.#timers.delete(id);
      },
    };
  }

  advance(ms: number): void {
    const target = this.#nowMs + ms;
    for (;;) {
      let nextId: number | null = null;
      let nextDue = Infinity;
      for (const [id, entry] of this.#timers) {
        if (entry.active && entry.due <= target && entry.due < nextDue) {
          nextDue = entry.due;
          nextId = id;
        }
      }
      if (nextId === null) break;
      const entry = this.#timers.get(nextId)!;
      this.#nowMs = entry.due;
      if (entry.repeat) {
        entry.due += entry.intervalMs;
      } else {
        entry.active = false;
        this.#timers.delete(nextId);
      }
      entry.callback();
    }
    this.#nowMs = target;
  }
}

