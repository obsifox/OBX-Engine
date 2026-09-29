import type { Platform, ThreadContext, ThreadHandle } from "@obx/platform";

export const JOBS_VERSION = "1.1.0";

export type JobState = "pending" | "queued" | "running" | "done" | "failed" | "cancelled";

export class JobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobError";
  }
}

export interface JobRecord<T = unknown> {
  id: number;
  name: string;
  state: JobState;
  result?: T;
  error?: string;
}

export class JobHandle<T = unknown> {
  readonly record: JobRecord<T>;
  #cancelled = false;
  #listeners = new Set<(record: JobRecord<T>) => void>();

  constructor(record: JobRecord<T>) {
    this.record = record;
  }

  get id(): number {
    return this.record.id;
  }

  get state(): JobState {
    return this.record.state;
  }

  get result(): T | undefined {
    return this.record.result;
  }

  get error(): string | undefined {
    return this.record.error;
  }

  get cancelled(): boolean {
    return this.#cancelled;
  }

  isFinished(): boolean {
    return this.record.state === "done" || this.record.state === "failed" || this.record.state === "cancelled";
  }

  cancel(): void {
    if (this.isFinished()) return;
    this.#cancelled = true;
    this.record.state = "cancelled";
    this.#notify();
  }

  onChange(listener: (record: JobRecord<T>) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  wait(): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const settle = (record: JobRecord<T>): void => {
        if (record.state === "done") resolve(record.result as T);
        else if (record.state === "failed") reject(new JobError(record.error ?? "Job failed"));
        else if (record.state === "cancelled") reject(new JobError(`Job ${record.id} cancelled`));
      };
      if (this.isFinished()) settle(this.record);
      else this.onChange(settle);
    });
  }

  markRunning(): void {
    this.record.state = "running";
    this.#notify();
  }

  markDone(result: T): void {
    if (this.#cancelled) {
      this.record.state = "cancelled";
    } else {
      this.record.state = "done";
      this.record.result = result;
    }
    this.#notify();
  }

  markFailed(error: string): void {
    if (this.#cancelled) {
      this.record.state = "cancelled";
    } else {
      this.record.state = "failed";
      this.record.error = error;
    }
    this.#notify();
  }

  #notify(): void {
    for (const listener of [...this.#listeners]) listener(this.record);
  }
}

export class JobFence {
  readonly handles: JobHandle[];

  constructor(handles: JobHandle[]) {
    this.handles = [...handles];
  }

  get completed(): boolean {
    return this.handles.every((handle) => handle.isFinished());
  }

  async wait(): Promise<void> {
    await Promise.all(this.handles.map((handle) => handle.wait().catch(() => undefined)));
  }

  results(): unknown[] {
    return this.handles.map((handle) => handle.result);
  }
}

export interface RunnableTask {
  name: string;
  run: (payload: never) => unknown;
  payload: unknown;
  source?: string;
  handle: JobHandle;
}

export interface JobExecutor {
  readonly kind: "inline" | "pool";
  submit(task: RunnableTask): void;
  stats(): ExecutorStats;
  shutdown(): Promise<void>;
}

export interface ExecutorStats {
  submitted: number;
  completed: number;
  failed: number;
  cancelled: number;
  queued: number;
}

export class WorkStealingQueue<T> {
  #items: T[] = [];

  push(item: T): void {
    this.#items.push(item);
  }

  take(): T | undefined {
    return this.#items.shift();
  }

  steal(): T | undefined {
    return this.#items.pop();
  }

  get size(): number {
    return this.#items.length;
  }

  drain(): T[] {
    const items = this.#items;
    this.#items = [];
    return items;
  }
}

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

export interface TaskPayload {
  deps: Record<string, unknown>;
}

export class TaskGraph {
  #tasks = new Map<string, { deps: string[]; run: (payload: TaskPayload) => unknown; source?: string }>();

  addTask(id: string, deps: string[], run: (payload: TaskPayload) => unknown, source?: string): this {
    if (this.#tasks.has(id)) throw new JobError(`Duplicate task id: ${id}`);
    this.#tasks.set(id, { deps: [...deps], run, source });
    return this;
  }

  topologicalOrder(): string[] {
    const order: string[] = [];
    const state = new Map<string, "visiting" | "done">();
    const visit = (id: string): void => {
      const current = state.get(id);
      if (current === "done") return;
      if (current === "visiting") throw new JobError(`Dependency cycle involving task: ${id}`);
      const task = this.#tasks.get(id);
      if (!task) throw new JobError(`Unknown task dependency: ${id}`);
      state.set(id, "visiting");
      for (const dep of task.deps) visit(dep);
      state.set(id, "done");
      order.push(id);
    };
    for (const id of this.#tasks.keys()) visit(id);
    return order;
  }

  async run(system: JobSystem): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>();
    const finished = new Map<string, JobState>();
    for (const id of this.topologicalOrder()) {
      const task = this.#tasks.get(id)!;
      const blocked = task.deps.find((dep) => finished.get(dep) !== "done");
      if (blocked !== undefined) {
        throw new JobError(`Task ${id} blocked by incomplete dependency: ${blocked}`);
      }
      const deps: Record<string, unknown> = {};
      for (const dep of task.deps) deps[dep] = results.get(dep);
      const handle = system.schedule(id, task.run, { deps }, task.source);
      const value = await handle.wait();
      finished.set(id, handle.state);
      results.set(id, value);
    }
    return results;
  }
}
