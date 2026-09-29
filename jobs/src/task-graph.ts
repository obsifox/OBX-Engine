import type { JobExecutor, JobState } from "./types.js";
import { JobSystem } from "./system.js";
import { JobError } from "./types.js";
import { JobFence } from "./handle.js";
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
