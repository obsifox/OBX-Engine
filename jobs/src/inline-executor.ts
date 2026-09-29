import type { ExecutorStats, JobExecutor, RunnableTask } from "./types.js";
import { JobError } from "./types.js";
import { JobHandle } from "./handle.js";
export interface InlineExecutorOptions {
  defer?: boolean;
}

export class InlineExecutor implements JobExecutor {
  readonly kind = "inline" as const;
  #queue: RunnableTask[] = [];
  #stats: ExecutorStats = { submitted: 0, completed: 0, failed: 0, cancelled: 0, queued: 0 };
  #defer: boolean;

  constructor(options: InlineExecutorOptions = {}) {
    this.#defer = options.defer ?? false;
  }

  submit(task: RunnableTask): void {
    this.#stats.submitted += 1;
    if (task.handle.cancelled || task.handle.state === "cancelled") {
      this.#stats.cancelled += 1;
      return;
    }
    this.#queue.push(task);
    if (!this.#defer) this.pump();
    else this.#stats.queued = this.#queue.length;
  }

  pump(): number {
    let executed = 0;
    while (this.#queue.length > 0) {
      const task = this.#queue.shift()!;
      this.#stats.queued = this.#queue.length;
      if (task.handle.cancelled || task.handle.state === "cancelled") {
        this.#stats.cancelled += 1;
        executed += 1;
        continue;
      }
      task.handle.markRunning();
      try {
        const result = task.run(task.payload as never);
        task.handle.markDone(result);
        this.#stats.completed += 1;
      } catch (error) {
        task.handle.markFailed(String(error));
        this.#stats.failed += 1;
      }
      executed += 1;
    }
    return executed;
  }

  stats(): ExecutorStats {
    return { ...this.#stats, queued: this.#queue.length };
  }

  async shutdown(): Promise<void> {
    this.#queue = [];
  }
}

