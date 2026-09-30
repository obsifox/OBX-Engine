export interface RenderResource {
  name: string;
  size?: number;
  transient?: boolean;
}

export interface RenderPassContext {
  resources: Map<string, unknown>;
  passIndex: number;
}

export interface RenderPass {
  name: string;
  reads?: string[];
  writes?: string[];
  execute(context: RenderPassContext): void;
}

export interface PassTiming {
  name: string;
  durationMs: number;
}

export interface RenderGraphStats {
  passTimings: PassTiming[];
  totalMs: number;
  passes: number;
  resources: number;
}

export class RenderGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderGraphError";
  }
}

export class RenderGraph {
  #passes: RenderPass[] = [];
  #resources = new Map<string, RenderResource>();
  #compiled: RenderPass[] = [];
  #stats: RenderGraphStats = { passTimings: [], totalMs: 0, passes: 0, resources: 0 };

  addResource(resource: RenderResource): this {
    this.#resources.set(resource.name, resource);
    return this;
  }

  addPass(pass: RenderPass): this {
    this.#passes.push(pass);
    return this;
  }

  get passCount(): number {
    return this.#passes.length;
  }

  get resourceCount(): number {
    return this.#resources.size;
  }

  compile(): RenderPass[] {
    const remaining = [...this.#passes];
    const ordered: RenderPass[] = [];
    const written = new Set<string>();
    while (remaining.length > 0) {
      let progressed = false;
      for (let i = 0; i < remaining.length; i += 1) {
        const pass = remaining[i]!;
        const ready = (pass.reads ?? []).every((name) => written.has(name) || !this.#passes.some((other) => (other.writes ?? []).includes(name)));
        if (!ready) continue;
        ordered.push(pass);
        for (const name of pass.writes ?? []) written.add(name);
        remaining.splice(i, 1);
        progressed = true;
        break;
      }
      if (!progressed) {
        throw new RenderGraphError(`render graph cycle or unsatisfiable reads: ${remaining.map((pass) => pass.name).join(", ")}`);
      }
    }
    this.#compiled = ordered;
    return ordered;
  }

  execute(now: () => number = () => performance.now()): RenderGraphStats {
    const order = this.#compiled.length > 0 ? this.#compiled : this.compile();
    const resources = new Map<string, unknown>();
    for (const [name, resource] of this.#resources) {
      if (resource.size !== undefined) {
        resources.set(name, new Float32Array(resource.size));
      }
    }
    const passTimings: PassTiming[] = [];
    const start = now();
    order.forEach((pass, passIndex) => {
      const passStart = now();
      pass.execute({ resources, passIndex });
      passTimings.push({ name: pass.name, durationMs: now() - passStart });
    });
    const totalMs = now() - start;
    this.#stats = { passTimings, totalMs, passes: order.length, resources: this.#resources.size };
    return this.#stats;
  }

  get stats(): RenderGraphStats {
    return this.#stats;
  }

  reset(): void {
    this.#passes = [];
    this.#resources.clear();
    this.#compiled = [];
    this.#stats = { passTimings: [], totalMs: 0, passes: 0, resources: 0 };
  }
}

export function measureBottlenecks(stats: RenderGraphStats, thresholdMs = 1): PassTiming[] {
  return stats.passTimings.filter((timing) => timing.durationMs >= thresholdMs).sort((a, b) => b.durationMs - a.durationMs);
}
