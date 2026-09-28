import { Random } from "@obx/core";

export interface StreamRequest {
  id: string;
  priority: number;
  load: () => unknown;
  unload?: (asset: unknown) => void;
}

export interface StreamReport {
  loaded: string[];
  unloaded: string[];
}

export class AsyncStreamer {
  private readonly queue: StreamRequest[] = [];
  private readonly assets = new Map<string, { asset: unknown; request: StreamRequest }>();
  private readonly pending = new Set<string>();
  readonly stats = { enqueued: 0, loaded: 0, unloaded: 0, dropped: 0 };

  constructor(readonly options: { budgetPerTick?: number; maxQueue?: number } = {}) {}

  enqueue(request: StreamRequest): boolean {
    if (this.assets.has(request.id) || this.pending.has(request.id)) return false;
    const maxQueue = this.options.maxQueue ?? 64;
    if (this.queue.length >= maxQueue) {
      this.stats.dropped += 1;
      return false;
    }
    this.queue.push({ ...request });
    this.pending.add(request.id);
    this.stats.enqueued += 1;
    return true;
  }

  tick(): StreamReport {
    const report: StreamReport = { loaded: [], unloaded: [] };
    const budget = this.options.budgetPerTick ?? 2;
    this.queue.sort((a, b) => b.priority - a.priority);
    while (report.loaded.length < budget && this.queue.length > 0) {
      const request = this.queue.shift()!;
      this.pending.delete(request.id);
      this.assets.set(request.id, { asset: request.load(), request });
      this.stats.loaded += 1;
      report.loaded.push(request.id);
    }
    return report;
  }

  unload(id: string): boolean {
    const entry = this.assets.get(id);
    if (!entry) return false;
    entry.request.unload?.(entry.asset);
    this.assets.delete(id);
    this.stats.unloaded += 1;
    return true;
  }

  get(id: string): unknown {
    return this.assets.get(id)?.asset ?? null;
  }

  loadedIds(): string[] {
    return [...this.assets.keys()];
  }

  isLoading(id: string): boolean {
    return this.pending.has(id);
  }

  get queued(): number {
    return this.queue.length;
  }
}

export interface LodLevel {
  level: number;
  maxDistance: number;
  mesh: string;
}

export class HlodSystem {
  private readonly entities = new Map<string, { x: number; y: number }>();
  private readonly levels: LodLevel[];

  constructor(levels: LodLevel[] = [
    { level: 0, maxDistance: 10, mesh: "high" },
    { level: 1, maxDistance: 30, mesh: "medium" },
    { level: 2, maxDistance: Infinity, mesh: "low" },
  ]) {
    this.levels = [...levels].sort((a, b) => a.maxDistance - b.maxDistance);
  }

  register(id: string, x: number, y: number): void {
    this.entities.set(id, { x, y });
  }

  unregister(id: string): boolean {
    return this.entities.delete(id);
  }

  levelFor(distance: number): LodLevel {
    for (const level of this.levels) {
      if (distance <= level.maxDistance) return level;
    }
    return this.levels[this.levels.length - 1]!;
  }

  resolve(viewer: { x: number; y: number }): Array<{ id: string; level: number; mesh: string }> {
    const out: Array<{ id: string; level: number; mesh: string }> = [];
    for (const [id, position] of this.entities) {
      const dx = position.x - viewer.x;
      const dy = position.y - viewer.y;
      const lod = this.levelFor(Math.sqrt(dx * dx + dy * dy));
      out.push({ id, level: lod.level, mesh: lod.mesh });
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  get count(): number {
    return this.entities.size;
  }
}

export class OcclusionGrid {
  private readonly blocked: boolean[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.blocked = new Array(width * height).fill(false);
  }

  block(x0: number, y0: number, x1: number, y1: number): void {
    for (let y = Math.max(0, y0); y <= Math.min(this.height - 1, y1); y += 1) {
      for (let x = Math.max(0, x0); x <= Math.min(this.width - 1, x1); x += 1) {
        this.blocked[y * this.width + x] = true;
      }
    }
  }

  visible(viewer: { x: number; y: number }, target: { x: number; y: number }): boolean {
    const steps = Math.max(Math.abs(target.x - viewer.x), Math.abs(target.y - viewer.y), 1);
    for (let index = 1; index < steps; index += 1) {
      const x = Math.round(viewer.x + ((target.x - viewer.x) * index) / steps);
      const y = Math.round(viewer.y + ((target.y - viewer.y) * index) / steps);
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      if (this.blocked[y * this.width + x]) return false;
    }
    return true;
  }

  query(viewer: { x: number; y: number }, targets: Array<{ id: string; x: number; y: number }>): string[] {
    return targets.filter((target) => this.visible(viewer, target)).map((target) => target.id);
  }

  get blockedCells(): number {
    return this.blocked.reduce((total, cell) => total + (cell ? 1 : 0), 0);
  }
}

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface SeasonState {
  season: Season;
  day: number;
  temperature: number;
}

export interface WorldEvent {
  id: string;
  type: string;
  day: number;
  magnitude: number;
}

const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

export class WorldSimulation {
  private day = 1;
  private readonly rng: Random;
  private readonly history: WorldEvent[] = [];
  private population: Record<string, number>;
  private eventCounter = 0;

  constructor(readonly options: { seed?: number; daysPerSeason?: number; population?: Record<string, number> } = {}) {
    this.rng = new Random(options.seed ?? 7);
    this.population = { ...(options.population ?? { village: 40, city: 200, camp: 12 }) };
  }

  advance(days: number): SeasonState {
    for (let index = 0; index < days; index += 1) {
      this.day += 1;
      for (const key of Object.keys(this.population)) {
        const drift = Math.round((this.rng.next() - 0.45) * 3);
        this.population[key] = Math.max(0, (this.population[key] ?? 0) + drift);
      }
      if (this.rng.next() < 0.12) this.spawnEvent();
    }
    return this.state;
  }

  spawnEvent(type?: string): WorldEvent {
    this.eventCounter += 1;
    const event: WorldEvent = {
      id: `event_${this.eventCounter}`,
      type: type ?? ["storm", "festival", "migration", "raid"][Math.floor(this.rng.next() * 4)]!,
      day: this.day,
      magnitude: Number((this.rng.next() * 3 + 1).toFixed(2)),
    };
    this.history.push(event);
    return event;
  }

  get state(): SeasonState {
    const perSeason = this.options.daysPerSeason ?? 30;
    const index = Math.floor((this.day - 1) / perSeason) % seasons.length;
    const season = seasons[index]!;
    const base = { spring: 12, summer: 24, autumn: 10, winter: -2 }[season];
    return { season, day: this.day, temperature: base };
  }

  get events(): WorldEvent[] {
    return [...this.history];
  }

  get demographics(): Record<string, number> {
    return { ...this.population };
  }
}

export const WORLD_ADVANCED_VERSION = "0.96.0";
