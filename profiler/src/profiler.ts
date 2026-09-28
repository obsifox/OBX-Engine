export interface SpanRecord {
  name: string;
  start: number;
  duration: number;
}

export interface SpanReport {
  name: string;
  count: number;
  total: number;
  average: number;
  max: number;
}

export class CpuProfiler {
  private readonly spans: SpanRecord[] = [];
  private readonly open = new Map<string, number>();
  private clock = 0;
  readonly stats = { begun: 0, closed: 0 };

  advance(ms: number): void {
    this.clock += ms;
  }

  begin(name: string): void {
    if (this.open.has(name)) throw new RangeError(`span ${name} already open`);
    this.open.set(name, this.clock);
    this.stats.begun += 1;
  }

  end(name: string): SpanRecord {
    const start = this.open.get(name);
    if (start === undefined) throw new RangeError(`span ${name} not open`);
    this.open.delete(name);
    this.stats.closed += 1;
    const record: SpanRecord = { name, start, duration: this.clock - start };
    this.spans.push(record);
    return record;
  }

  get samples(): SpanRecord[] {
    return [...this.spans];
  }

  report(): SpanReport[] {
    const totals = new Map<string, { count: number; total: number; max: number }>();
    for (const span of this.spans) {
      const entry = totals.get(span.name) ?? { count: 0, total: 0, max: 0 };
      entry.count += 1;
      entry.total += span.duration;
      entry.max = Math.max(entry.max, span.duration);
      totals.set(span.name, entry);
    }
    return [...totals.entries()]
      .map(([name, entry]) => ({
        name,
        count: entry.count,
        total: Number(entry.total.toFixed(3)),
        average: Number((entry.total / entry.count).toFixed(3)),
        max: entry.max,
      }))
      .sort((a, b) => b.total - a.total);
  }

  get openSpans(): string[] {
    return [...this.open.keys()];
  }
}

export interface MemoryRecord {
  name: string;
  current: number;
  peak: number;
  allocations: number;
}

export class MemoryProfiler {
  private readonly records = new Map<string, { current: number; peak: number; allocations: number }>();

  alloc(name: string, bytes: number): void {
    const entry = this.records.get(name) ?? { current: 0, peak: 0, allocations: 0 };
    entry.current += bytes;
    entry.allocations += 1;
    entry.peak = Math.max(entry.peak, entry.current);
    this.records.set(name, entry);
  }

  free(name: string, bytes: number): void {
    const entry = this.records.get(name);
    if (!entry) throw new RangeError(`unknown allocation ${name}`);
    entry.current = Math.max(0, entry.current - bytes);
  }

  snapshot(): MemoryRecord[] {
    return [...this.records.entries()]
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  get totalCurrent(): number {
    let total = 0;
    for (const entry of this.records.values()) total += entry.current;
    return total;
  }

  get totalPeak(): number {
    let total = 0;
    for (const entry of this.records.values()) total += entry.peak;
    return total;
  }
}

export interface MetricReport {
  count: number;
  total: number;
  average: number;
  max: number;
}

export class ChannelTracker {
  private readonly metrics = new Map<string, { count: number; total: number; max: number }>();

  constructor(readonly channel: string) {}

  record(metric: string, value: number): void {
    const entry = this.metrics.get(metric) ?? { count: 0, total: 0, max: 0 };
    entry.count += 1;
    entry.total += value;
    entry.max = Math.max(entry.max, value);
    this.metrics.set(metric, entry);
  }

  report(): Record<string, MetricReport> {
    const out: Record<string, MetricReport> = {};
    for (const [metric, entry] of this.metrics) {
      out[metric] = {
        count: entry.count,
        total: Number(entry.total.toFixed(3)),
        average: Number((entry.total / entry.count).toFixed(3)),
        max: entry.max,
      };
    }
    return out;
  }
}

export interface DrawCall {
  count: number;
  triangles: number;
}

export interface FrameRecord {
  tick: number;
  events: string[];
  draws: DrawCall;
  duration: number;
}

export class FrameDebugger {
  private readonly frames: FrameRecord[] = [];
  private current: { tick: number; events: string[]; draws: DrawCall; start: number } | null = null;
  private clock = 0;

  advance(ms: number): void {
    this.clock += ms;
  }

  beginFrame(tick: number): void {
    if (this.current) throw new RangeError("frame already open");
    this.current = { tick, events: [], draws: { count: 0, triangles: 0 }, start: this.clock };
  }

  event(name: string): void {
    if (!this.current) throw new RangeError("no open frame");
    this.current.events.push(name);
  }

  drawCall(count = 1, triangles = 0): void {
    if (!this.current) throw new RangeError("no open frame");
    this.current.draws.count += count;
    this.current.draws.triangles += triangles;
  }

  endFrame(): FrameRecord {
    if (!this.current) throw new RangeError("no open frame");
    const record: FrameRecord = {
      tick: this.current.tick,
      events: [...this.current.events],
      draws: { ...this.current.draws },
      duration: this.clock - this.current.start,
    };
    this.current = null;
    this.frames.push(record);
    return record;
  }

  drawStats(): { frames: number; calls: number; triangles: number; averageCalls: number } {
    const calls = this.frames.reduce((total, frame) => total + frame.draws.count, 0);
    const triangles = this.frames.reduce((total, frame) => total + frame.draws.triangles, 0);
    return {
      frames: this.frames.length,
      calls,
      triangles,
      averageCalls: this.frames.length === 0 ? 0 : Number((calls / this.frames.length).toFixed(2)),
    };
  }

  get captured(): FrameRecord[] {
    return [...this.frames];
  }

  get openFrame(): boolean {
    return this.current !== null;
  }
}

export interface ProfileBundle {
  cpu: SpanReport[];
  memory: MemoryRecord[];
  channels: Record<string, Record<string, MetricReport>>;
  frames: FrameRecord[];
}

export class ProfileReport {
  static combine(
    cpu: CpuProfiler,
    memory: MemoryProfiler,
    channels: ChannelTracker[],
    frames: FrameDebugger,
  ): ProfileBundle {
    const channelReport: Record<string, Record<string, MetricReport>> = {};
    for (const tracker of channels) channelReport[tracker.channel] = tracker.report();
    return {
      cpu: cpu.report(),
      memory: memory.snapshot(),
      channels: channelReport,
      frames: frames.captured,
    };
  }

  static toJson(bundle: ProfileBundle): string {
    return JSON.stringify(bundle, null, 2);
  }
}

export const PROFILER_VERSION = "0.96.0";
