/**
 * Task System — §3 Game Loop / Thread-task abstraction + §62 Job System (foundation).
 *
 * Cooperative async task pool with bounded concurrency. Worker threads and
 * job-stealing schedulers land in §62; this covers "background processing"
 * needs of v0.1 (async loading, IO, build steps).
 */

import { InvalidArgumentError } from "@obsifox/core";

export type TaskFunction<T> = () => T | Promise<T>;

export interface TaskHandle<T> {
  readonly id: number;
  readonly promise: Promise<T>;
  /** Cancel if not yet started (running tasks are not interrupted). */
  cancel(): void;
}

interface QueuedTask {
  id: number;
  fn: TaskFunction<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  cancelled: boolean;
}

export interface TaskSystemOptions {
  /** Max concurrently running tasks (default 4). */
  concurrency?: number;
}

/** Bounded async task pool. */
export class TaskSystem {
  #concurrency: number;
  #queue: QueuedTask[] = [];
  #runningCount = 0;
  #nextId = 1;

  constructor(options: TaskSystemOptions = {}) {
    this.#concurrency = Math.max(1, options.concurrency ?? 4);
  }

  get concurrency(): number {
    return this.#concurrency;
  }

  set concurrency(value: number) {
    if (value < 1) throw new InvalidArgumentError("concurrency must be >= 1");
    this.#concurrency = value;
  }

  get pendingCount(): number {
    return this.#queue.filter((task) => !task.cancelled).length;
  }

  get runningCount(): number {
    return this.#runningCount;
  }

  /** Submit a task for background execution. */
  submit<T>(fn: TaskFunction<T>): TaskHandle<T> {
    const id = this.#nextId++;
    let task!: QueuedTask;
    const promise = new Promise<T>((resolve, reject) => {
      task = {
        id,
        fn: fn as TaskFunction<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        cancelled: false,
      };
    });
    this.#queue.push(task);
    this.#pump();
    return {
      id,
      promise,
      cancel: () => {
        const index = this.#queue.indexOf(task);
        if (index >= 0) {
          this.#queue.splice(index, 1);
          task.cancelled = true;
          task.reject(new Error(`Task ${id} cancelled`));
        }
      },
    };
  }

  /** Resolves when the queue is empty and nothing is running. */
  async drain(): Promise<void> {
    while (this.#runningCount > 0 || this.pendingCount > 0) {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  #pump(): void {
    while (this.#runningCount < this.#concurrency) {
      const task = this.#queue.shift();
      if (!task) return;
      if (task.cancelled) continue;
      this.#runningCount += 1;
      void Promise.resolve()
        .then(() => task.fn())
        .then(
          (value) => {
            task.resolve(value);
          },
          (error) => {
            task.reject(error);
          },
        )
        .finally(() => {
          this.#runningCount -= 1;
          this.#pump();
        });
    }
  }
}
