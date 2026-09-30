export interface FrameSample {
  label: string;
  milliseconds: number;
}

export class Profiler {
  readonly samples: FrameSample[] = [];
  private readonly totals = new Map<string, { count: number; sum: number; max: number }>();

  record(label: string, milliseconds: number): void {
    this.samples.push({ label, milliseconds });
    const entry = this.totals.get(label) ?? { count: 0, sum: 0, max: 0 };
    entry.count += 1;
    entry.sum += milliseconds;
    entry.max = Math.max(entry.max, milliseconds);
    this.totals.set(label, entry);
  }

  report(): Array<{ label: string; average: number; max: number; count: number }> {
    return [...this.totals.entries()]
      .map(([label, entry]) => ({
        label,
        average: Number((entry.sum / entry.count).toFixed(3)),
        max: entry.max,
        count: entry.count,
      }))
      .sort((a, b) => b.average - a.average);
  }

  get frameTotal(): number {
    return this.samples.reduce((total, sample) => total + sample.milliseconds, 0);
  }
}

