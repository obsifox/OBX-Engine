import type { JobRecord, JobState } from "./types.js";
import { JobError } from "./types.js";
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

