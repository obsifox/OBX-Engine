import type { ExecutorStats, JobExecutor, RunnableTask } from "./types.js";
import type { Platform, ThreadHandle } from "@obx/platform";
import { WorkStealingQueue } from "./queue.js";
import { JobError } from "./types.js";
import { JobHandle } from "./handle.js";
import type { ThreadContext } from "@obx/platform";
interface PoolMessage {
  type: "result" | "error";
  jobId: number;
  value?: unknown;
  error?: string;
}

const POOL_WORKER_RUN = (context: ThreadContext): void => {
  context.onMessage((message: unknown) => {
    const task = message as { type: string; jobId: number; source: string; payload: unknown };
    if (task.type !== "exec") return;
    try {
      const factory = new Function(`"use strict"; return (${task.source});`)() as (
        payload: unknown,
      ) => unknown;
      const value = factory(task.payload);
      context.postMessage({ type: "result", jobId: task.jobId, value });
    } catch (error) {
      context.postMessage({ type: "error", jobId: task.jobId, error: String(error) });
    }
  });
};

export interface WorkerPoolOptions {
  workers?: number;
}

export class WorkerPool implements JobExecutor {
  readonly kind = "pool" as const;
  #threads: ThreadHandle[] = [];
  #queues: WorkStealingQueue<RunnableTask>[] = [];
  #busy: boolean[] = [];
  #pending = new Map<number, RunnableTask>();
  #stats: ExecutorStats = { submitted: 0, completed: 0, failed: 0, cancelled: 0, queued: 0 };
  #nextWorker = 0;

  constructor(platform: Platform, options: WorkerPoolOptions = {}) {
    if (!platform.threads.supported) {
      throw new JobError("Platform does not support threads");
    }
    const count = Math.max(1, options.workers ?? 2);
    for (let index = 0; index < count; index += 1) {
      this.#queues.push(new WorkStealingQueue());
      this.#busy.push(false);
      const thread = platform.threads.create({ run: POOL_WORKER_RUN });
      thread.onMessage((message: unknown) => this.#onWorkerMessage(index, message as PoolMessage));
      this.#threads.push(thread);
    }
  }

  get workerCount(): number {
    return this.#threads.length;
  }

  submit(task: RunnableTask): void {
    this.#stats.submitted += 1;
    if (task.handle.cancelled || task.handle.state === "cancelled") {
      this.#stats.cancelled += 1;
      return;
    }
    const worker = this.#nextWorker;
    this.#nextWorker = (this.#nextWorker + 1) % this.#threads.length;
    this.#queues[worker]!.push(task);
    this.#pending.set(task.handle.id, task);
    this.#dispatch();
  }

  #dispatch(): void {
    for (let index = 0; index < this.#threads.length; index += 1) {
      if (this.#busy[index]) {
        const victim = this.#takeOverflow(index);
        if (victim) this.#queues[index]!.push(victim);
        continue;
      }
      const task = this.#queues[index]!.take() ?? this.#stealFor(index);
      if (!task) continue;
      if (task.handle.cancelled || task.handle.state === "cancelled") {
        this.#stats.cancelled += 1;
        this.#pending.delete(task.handle.id);
        continue;
      }
      this.#busy[index] = true;
      task.handle.markRunning();
      const source = task.source ?? (task.run as () => unknown).toString();
      try {
        this.#threads[index]!.post({ type: "exec", jobId: task.handle.id, source, payload: task.payload });
      } catch (error) {
        this.#busy[index] = false;
        task.handle.markFailed(String(error));
        this.#stats.failed += 1;
        this.#pending.delete(task.handle.id);
      }
    }
  }

  #takeOverflow(worker: number): RunnableTask | null {
    for (let offset = 1; offset < this.#threads.length; offset += 1) {
      const victim = (worker + offset) % this.#threads.length;
      if (this.#queues[victim]!.size > 1) {
        return this.#queues[victim]!.steal() ?? null;
      }
    }
    return null;
  }

  #stealFor(worker: number): RunnableTask | null {
    for (let offset = 1; offset < this.#threads.length; offset += 1) {
      const victim = (worker + offset) % this.#threads.length;
      const stolen = this.#queues[victim]!.steal();
      if (stolen) return stolen;
    }
    return null;
  }

  #onWorkerMessage(worker: number, message: PoolMessage): void {
    this.#busy[worker] = false;
    const task = this.#pending.get(message.jobId);
    if (!task) return;
    this.#pending.delete(message.jobId);
    if (message.type === "result") {
      task.handle.markDone(message.value);
      this.#stats.completed += 1;
    } else {
      task.handle.markFailed(message.error ?? "Worker error");
      this.#stats.failed += 1;
    }
    this.#dispatch();
  }

  stats(): ExecutorStats {
    return { ...this.#stats, queued: this.#pending.size };
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.#threads.map((thread) => thread.terminate()));
    this.#threads = [];
  }
}

