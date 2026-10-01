export type SystemName = "rendering" | "ecs" | "physics" | "audio" | "network" | "assets";

export interface SystemSample {
  system: SystemName;
  frame: number;
  timeMs: number;
  itemsProcessed: number;
  memoryBytes: number;
}

export interface SystemReport {
  system: SystemName;
  samples: number;
  totalTimeMs: number;
  averageTimeMs: number;
  peakTimeMs: number;
  peakMemoryBytes: number;
  totalItems: number;
}

export class SystemSampler {
  readonly system: SystemName;
  #samples: SystemSample[] = [];
  #frame = 0;

  constructor(system: SystemName) {
    this.system = system;
  }

  sample(timeMs: number, itemsProcessed: number, memoryBytes: number): SystemSample {
    const sample: SystemSample = { system: this.system, frame: this.#frame, timeMs, itemsProcessed, memoryBytes };
    this.#samples.push(sample);
    return sample;
  }

  advanceFrame(): void {
    this.#frame += 1;
  }

  get samples(): SystemSample[] {
    return [...this.#samples];
  }

  report(): SystemReport {
    if (this.#samples.length === 0) {
      return { system: this.system, samples: 0, totalTimeMs: 0, averageTimeMs: 0, peakTimeMs: 0, peakMemoryBytes: 0, totalItems: 0 };
    }
    let total = 0;
    let peak = 0;
    let peakMemory = 0;
    let items = 0;
    for (const sample of this.#samples) {
      total += sample.timeMs;
      peak = Math.max(peak, sample.timeMs);
      peakMemory = Math.max(peakMemory, sample.memoryBytes);
      items += sample.itemsProcessed;
    }
    return {
      system: this.system,
      samples: this.#samples.length,
      totalTimeMs: Number(total.toFixed(3)),
      averageTimeMs: Number((total / this.#samples.length).toFixed(3)),
      peakTimeMs: peak,
      peakMemoryBytes: peakMemory,
      totalItems: items,
    };
  }
}

export class SystemMonitor {
  readonly samplers = new Map<SystemName, SystemSampler>();

  constructor(systems: readonly SystemName[] = ["rendering", "ecs", "physics", "audio", "network", "assets"]) {
    for (const system of systems) this.samplers.set(system, new SystemSampler(system));
  }

  sample(system: SystemName, timeMs: number, itemsProcessed: number, memoryBytes: number): SystemSample | null {
    const sampler = this.samplers.get(system);
    return sampler ? sampler.sample(timeMs, itemsProcessed, memoryBytes) : null;
  }

  advanceFrame(): void {
    for (const sampler of this.samplers.values()) sampler.advanceFrame();
  }

  reports(): SystemReport[] {
    return [...this.samplers.values()].map((sampler) => sampler.report()).sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  }

  hottestSystem(): SystemName | null {
    const reports = this.reports();
    return reports.length > 0 ? reports[0]!.system : null;
  }
}
