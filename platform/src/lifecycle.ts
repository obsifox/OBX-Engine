import type { ApplicationLifecycle, LifecyclePhase } from "./types.js";
import { PlatformError } from "./errors.js";
const LIFECYCLE_TRANSITIONS: Record<LifecyclePhase, LifecyclePhase[]> = {
  created: ["starting"],
  starting: ["running", "stopping"],
  running: ["suspending", "stopping"],
  suspending: ["suspended", "stopping"],
  suspended: ["resuming", "stopping"],
  resuming: ["running", "stopping"],
  stopping: ["stopped"],
  stopped: [],
};

export class LifecycleManager implements ApplicationLifecycle {
  phase: LifecyclePhase = "created";
  #handlers = new Set<(from: LifecyclePhase, to: LifecyclePhase) => void>();

  #transition(to: LifecyclePhase): void {
    const allowed = LIFECYCLE_TRANSITIONS[this.phase];
    if (!allowed.includes(to)) {
      throw new PlatformError(`Invalid lifecycle transition ${this.phase} -> ${to}`);
    }
    const from = this.phase;
    this.phase = to;
    for (const handler of this.#handlers) handler(from, to);
  }

  start(): void {
    this.#transition("starting");
    this.#transition("running");
  }

  suspend(): void {
    this.#transition("suspending");
    this.#transition("suspended");
  }

  resume(): void {
    this.#transition("resuming");
    this.#transition("running");
  }

  stop(): void {
    if (this.phase === "stopped") return;
    if (this.phase === "created") {
      this.#transition("starting");
    }
    this.#transition("stopping");
    this.#transition("stopped");
  }

  onTransition(handler: (from: LifecyclePhase, to: LifecyclePhase) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }
}

