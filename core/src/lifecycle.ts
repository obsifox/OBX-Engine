import { LifecycleError } from "./errors.js";
import type { Unsubscribe } from "./events.js";

export const LifecycleState = {
  CREATED: "created",
  INITIALIZING: "initializing",
  INITIALIZED: "initialized",
  STARTING: "starting",
  RUNNING: "running",
  PAUSED: "paused",
  STOPPING: "stopping",
  STOPPED: "stopped",
  DESTROYING: "destroying",
  DESTROYED: "destroyed",
  FAILED: "failed",
} as const;

export type LifecycleState = (typeof LifecycleState)[keyof typeof LifecycleState];

const TRANSITIONS: Record<LifecycleState, readonly LifecycleState[]> = {
  created: ["initializing", "destroying", "failed"],
  initializing: ["initialized", "failed", "destroying"],
  initialized: ["starting", "destroying", "failed"],
  starting: ["running", "failed", "destroying"],
  running: ["paused", "stopping", "failed", "destroying"],
  paused: ["running", "stopping", "failed", "destroying"],
  stopping: ["stopped", "failed"],
  stopped: ["starting", "destroying", "failed"],
  destroying: ["destroyed", "failed"],
  destroyed: [],
  failed: ["destroying", "destroyed"],
};

export type LifecycleListener = (next: LifecycleState, previous: LifecycleState) => void;

export class Lifecycle {
  #state: LifecycleState = LifecycleState.CREATED;
  #listeners = new Set<LifecycleListener>();

  get state(): LifecycleState {
    return this.#state;
  }

  get isDestroyed(): boolean {
    return this.#state === LifecycleState.DESTROYED;
  }

  get isActive(): boolean {
    return this.#state === LifecycleState.RUNNING || this.#state === LifecycleState.PAUSED;
  }

  onChange(listener: LifecycleListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  canTransition(next: LifecycleState): boolean {
    return TRANSITIONS[this.#state].includes(next);
  }

  transition(next: LifecycleState): void {
    if (next === this.#state) return;
    if (!this.canTransition(next)) {
      throw new LifecycleError(`Illegal lifecycle transition: ${this.#state} -> ${next}`, {
        context: { from: this.#state, to: next },
      });
    }
    const previous = this.#state;
    this.#state = next;
    for (const listener of [...this.#listeners]) {
      listener(next, previous);
    }
  }

  async guard<T>(fn: () => Promise<T> | T): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (this.#state !== LifecycleState.FAILED && this.canTransition(LifecycleState.FAILED)) {
        this.transition(LifecycleState.FAILED);
      }
      throw error;
    }
  }
}
