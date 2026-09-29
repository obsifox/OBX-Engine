import type { JobHandle } from "./handle.js";
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

