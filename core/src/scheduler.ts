/**
 * ObsiFox Scheduler — §2 Core / Scheduler, Timer + §3 tick support.
 *
 * A deterministic, engine-time scheduler driven by {@link Scheduler.update}.
 * Timers advance with engine time (so `timeScale` and `pause` are respected
 * automatically when the scheduler is fed from a {@link Clock}).
 */

import { InvalidArgumentError } from "./errors.js";

export type ScheduleCallback = (time: number) => void;

export interface ScheduleHandle {
  readonly id: number;
}

interface ScheduledTask {
  id: number;
  callback: ScheduleCallback;
  /** Engine time when the task is next due. */
  nextTime: number;
  /** Repeat interval in seconds; 0 = one-shot. */
  interval: number;
  /** Times run (for repeating tasks). */
  runCount: number;
  cancelled: boolean;
}

export interface SchedulerOptions {
  /** Initial engine time in seconds (default 0). */
  time?: number;
}

/** Deterministic timer scheduler operating on engine time (seconds). */
export class Scheduler {
  #time: number;
  #nextId = 1;
  #tasks = new Map<number, ScheduledTask>();
  #running = false;

  constructor(options: SchedulerOptions = {}) {
    this.#time = options.time ?? 0;
  }

  /** Current scheduler time in seconds. */
  get time(): number {
    return this.#time;
  }

  /** Number of active (non-cancelled) tasks. */
  get pendingCount(): number {
    let count = 0;
    for (const task of this.#tasks.values()) {
      if (!task.cancelled) count += 1;
    }
    return count;
  }

  /** Run `callback` once after `delaySeconds` of engine time. */
  schedule(callback: ScheduleCallback, delaySeconds = 0): ScheduleHandle {
    return this.#create(callback, Math.max(delaySeconds, 0), 0);
  }

  /** Run `callback` every `intervalSeconds` of engine time (first after one interval). */
  scheduleRepeating(callback: ScheduleCallback, intervalSeconds: number): ScheduleHandle {
    if (!(intervalSeconds > 0)) {
      throw new InvalidArgumentError("scheduleRepeating requires intervalSeconds > 0", {
        context: { intervalSeconds },
      });
    }
    return this.#create(callback, intervalSeconds, intervalSeconds);
  }

  /** Run `callback` at the start of the next {@link Scheduler.update} call. */
  scheduleNextTick(callback: ScheduleCallback): ScheduleHandle {
    return this.#create(callback, 0, 0);
  }

  cancel(handle: ScheduleHandle): void {
    const task = this.#tasks.get(handle.id);
    if (!task) return;
    task.cancelled = true;
    this.#tasks.delete(handle.id);
  }

  /** Cancel all tasks. */
  clear(): void {
    this.#tasks.clear();
  }

  /**
   * Advance scheduler time to `time` (seconds, absolute) and run every task
   * that became due. Returns the number of task executions.
   */
  update(time: number): number {
    if (time < this.#time) {
      throw new InvalidArgumentError("Scheduler time cannot move backwards", {
        context: { time, current: this.#time },
      });
    }
    this.#time = time;
    let executions = 0;

    // Repeat until no task is due — tasks may schedule new immediate tasks.
    // Guard against infinite mutual scheduling with an iteration cap.
    let guard = 0;
    for (;;) {
      if (guard++ > 10_000) {
        throw new InvalidArgumentError("Scheduler update exceeded iteration cap (runaway next-tick tasks?)");
      }
      let due: ScheduledTask | undefined;
      for (const task of this.#tasks.values()) {
        if (!task.cancelled && task.nextTime <= this.#time) {
          if (!due || task.nextTime < due.nextTime || (task.nextTime === due.nextTime && task.id < due.id)) {
            due = task;
          }
        }
      }
      if (!due) break;

      executions += 1;
      due.runCount += 1;
      if (due.interval > 0) {
        due.nextTime += due.interval;
      } else {
        this.#tasks.delete(due.id);
      }
      due.callback(this.#time);
    }

    return executions;
  }

  /**
   * Convenience: advance by a delta relative to current time.
   * Equivalent to `update(this.time + deltaSeconds)`.
   */
  advance(deltaSeconds: number): number {
    return this.update(this.#time + Math.max(deltaSeconds, 0));
  }

  #create(callback: ScheduleCallback, delaySeconds: number, interval: number): ScheduleHandle {
    const id = this.#nextId++;
    const task: ScheduledTask = {
      id,
      callback,
      nextTime: this.#time + delaySeconds,
      interval,
      runCount: 0,
      cancelled: false,
    };
    this.#tasks.set(id, task);
    return { id };
  }
}
