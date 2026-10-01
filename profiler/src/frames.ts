import { CpuProfiler, MemoryProfiler, type SpanReport } from "./profiler.js";
import { GpuProfiler, type GpuFrameCounters } from "./counters.js";
import { SystemMonitor, type SystemReport } from "./systems.js";

export interface UnifiedFrameReport {
  frame: number;
  cpuMs: number;
  gpuMs: number;
  totalMemoryBytes: number;
  peakMemoryBytes: number;
  spans: SpanReport[];
  gpu: GpuFrameCounters | null;
  systems: SystemReport[];
}

export interface BudgetThresholds {
  frameMs: number;
  memoryBytes: number;
  drawCalls: number;
}

export interface BudgetViolation {
  frame: number;
  budget: keyof BudgetThresholds;
  actual: number;
  limit: number;
}

export class FrameProfiler {
  readonly cpu = new CpuProfiler();
  readonly memory = new MemoryProfiler();
  readonly gpu: GpuProfiler;
  readonly systems = new SystemMonitor();
  #reports: UnifiedFrameReport[] = [];
  #frame = 0;
  #frameStartClock = 0;

  constructor(gpu = new GpuProfiler()) {
    this.gpu = gpu;
  }

  beginFrame(): void {
    this.#frameStartClock = 0;
  }

  endFrame(): UnifiedFrameReport {
    const spans = this.cpu.report();
    const cpuMs = spans.reduce((total, span) => total + span.total, 0);
    const gpu = this.gpu.endFrame();
    const memoryRecords = this.memory.snapshot();
    const totalMemory = memoryRecords.reduce((total, record) => total + record.current, 0);
    const peakMemory = memoryRecords.reduce((peak, record) => Math.max(peak, record.peak), 0);
    const report: UnifiedFrameReport = {
      frame: this.#frame,
      cpuMs: Number(cpuMs.toFixed(3)),
      gpuMs: gpu.gpuTimeMs,
      totalMemoryBytes: totalMemory,
      peakMemoryBytes: peakMemory,
      spans,
      gpu,
      systems: this.systems.reports(),
    };
    this.#reports.push(report);
    this.#frame += 1;
    this.systems.advanceFrame();
    return report;
  }

  get reports(): UnifiedFrameReport[] {
    return [...this.#reports];
  }

  latest(): UnifiedFrameReport | null {
    return this.#reports.length > 0 ? this.#reports[this.#reports.length - 1]! : null;
  }

  checkBudgets(thresholds: BudgetThresholds): BudgetViolation[] {
    const violations: BudgetViolation[] = [];
    for (const report of this.#reports) {
      const frameTotal = report.cpuMs + report.gpuMs;
      if (frameTotal > thresholds.frameMs) {
        violations.push({ frame: report.frame, budget: "frameMs", actual: frameTotal, limit: thresholds.frameMs });
      }
      if (report.peakMemoryBytes > thresholds.memoryBytes) {
        violations.push({ frame: report.frame, budget: "memoryBytes", actual: report.peakMemoryBytes, limit: thresholds.memoryBytes });
      }
      if (report.gpu && report.gpu.drawCalls > thresholds.drawCalls) {
        violations.push({ frame: report.frame, budget: "drawCalls", actual: report.gpu.drawCalls, limit: thresholds.drawCalls });
      }
    }
    return violations;
  }

  summary(): { frames: number; averageFrameMs: number; peakFrameMs: number; averageMemoryBytes: number } {
    if (this.#reports.length === 0) return { frames: 0, averageFrameMs: 0, peakFrameMs: 0, averageMemoryBytes: 0 };
    let total = 0;
    let peak = 0;
    let memoryTotal = 0;
    for (const report of this.#reports) {
      const frameTotal = report.cpuMs + report.gpuMs;
      total += frameTotal;
      peak = Math.max(peak, frameTotal);
      memoryTotal += report.peakMemoryBytes;
    }
    return {
      frames: this.#reports.length,
      averageFrameMs: Number((total / this.#reports.length).toFixed(3)),
      peakFrameMs: Number(peak.toFixed(3)),
      averageMemoryBytes: Math.round(memoryTotal / this.#reports.length),
    };
  }
}
