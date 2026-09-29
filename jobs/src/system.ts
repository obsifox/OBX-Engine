import type { ExecutorStats, JobExecutor, JobRecord, RunnableTask } from "./types.js";
import type { Platform } from "@obx/platform";
import { JobError } from "./types.js";
import { JobHandle, JobFence } from "./handle.js";
import { InlineExecutor } from "./inline-executor.js";
import { WorkerPool } from "./worker-pool.js";
export interface JobSystemOptions {
  executor?: JobExecutor;
  platform?: Platform;
  workers?: number;
}

export class JobSystem {
  readonly executor: JobExecutor;
  #nextId = 1;
  #stats = { scheduled: 0, completed: 0, failed: 0, cancelled: 0 };
  #mainQueue: Array<() => void> = [];

  constructor(options: JobSystemOptions = {}) {
    if (options.executor) {
      this.executor = options.executor;
    } else if (options.platform) {
      this.executor = new WorkerPool(options.platform, { workers: options.workers });
    } else {
      this.executor = new InlineExecutor();
    }
  }

  schedule<T, P = undefined>(name: string, run: (payload: P) => T, payload?: P, source?: string): JobHandle<T> {
    const record: JobRecord<T> = { id: this.#nextId++, name, state: "queued" };
    const handle = new JobHandle<T>(record);
    this.#stats.scheduled += 1;
    handle.onChange((updated) => {
      if (updated.state === "done") this.#stats.completed += 1;
      else if (updated.state === "failed") this.#stats.failed += 1;
      else if (updated.state === "cancelled") this.#stats.cancelled += 1;
    });
    this.executor.submit({
      name,
      run: run as (payload: never) => unknown,
      payload,
      source,
      handle: handle as JobHandle,
    });
    return handle;
  }

  scheduleMany<T, R>(name: string, items: T[], run: (item: T, index: number) => R): JobHandle<R[]> {
    const source = `(payload) => payload.items.map((item, index) => (${(run as () => unknown).toString()})(item, index))`;
    return this.schedule<R[], { items: T[] }>(name, (payload) => payload.items.map((item, index) => run(item, index)), { items }, source);
  }

  fence(handles: JobHandle[]): JobFence {
    return new JobFence(handles);
  }

  runOnMainThread(action: () => void): void {
    this.#mainQueue.push(action);
  }

  drainMainThread(): number {
    const actions = this.#mainQueue;
    this.#mainQueue = [];
    for (const action of actions) action();
    return actions.length;
  }

  stats(): { scheduled: number; completed: number; failed: number; cancelled: number; executor: ExecutorStats } {
    return { ...this.#stats, executor: this.executor.stats() };
  }

  async shutdown(): Promise<void> {
    await this.executor.shutdown();
  }
}

