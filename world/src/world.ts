import { Color } from "@obx/math";
import { Random } from "@obx/core";

export interface ChunkCoord {
  cx: number;
  cz: number;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function hash2(ix: number, iz: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export interface HeightfieldOptions {
  seed: number;
  amplitude: number;
  frequency: number;
  octaves: number;
}

export class Heightfield {
  constructor(
    readonly width: number,
    readonly depth: number,
    readonly heights: Float32Array,
  ) {
    if (heights.length !== width * depth) throw new RangeError("heightfield size mismatch");
  }

  static generate(width: number, depth: number, options: Partial<HeightfieldOptions> = {}): Heightfield {
    const seed = options.seed ?? 1;
    const amplitude = options.amplitude ?? 4;
    const frequency = options.frequency ?? 0.08;
    const octaves = options.octaves ?? 4;
    const heights = new Float32Array(width * depth);
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        let value = 0;
        let scale = 1;
        let total = 0;
        for (let octave = 0; octave < octaves; octave += 1) {
          value += valueNoise(x * frequency * scale, z * frequency * scale, seed + octave * 101) * scale;
          total += scale;
          scale *= 2;
        }
        heights[z * width + x] = (value / total) * amplitude;
      }
    }
    return new Heightfield(width, depth, heights);
  }

  at(x: number, z: number): number {
    const ix = Math.min(Math.max(x, 0), this.width - 1);
    const iz = Math.min(Math.max(z, 0), this.depth - 1);
    return this.heights[Math.floor(iz) * this.width + Math.floor(ix)] ?? 0;
  }

  sample(x: number, z: number): number {
    const x0 = Math.min(Math.max(Math.floor(x), 0), this.width - 2);
    const z0 = Math.min(Math.max(Math.floor(z), 0), this.depth - 2);
    const fx = Math.min(Math.max(x - x0, 0), 1);
    const fz = Math.min(Math.max(z - z0, 0), 1);
    const h00 = this.at(x0, z0);
    const h10 = this.at(x0 + 1, z0);
    const h01 = this.at(x0, z0 + 1);
    const h11 = this.at(x0 + 1, z0 + 1);
    return h00 + (h10 - h00) * fx + (h01 - h00) * fz + (h00 - h10 - h01 + h11) * fx * fz;
  }

  normal(x: number, z: number): { x: number; y: number; z: number } {
    const left = this.sample(x - 1, z);
    const right = this.sample(x + 1, z);
    const down = this.sample(x, z - 1);
    const up = this.sample(x, z + 1);
    const nx = left - right;
    const nz = down - up;
    const len = Math.hypot(nx, 2, nz);
    return { x: nx / len, y: 2 / len, z: nz / len };
  }
}

export type ChunkStateName = "unloaded" | "loading" | "loaded" | "unloading";

export interface ChunkRecord {
  coord: ChunkCoord;
  state: ChunkStateName;
  lod: number;
  lastActive: number;
}

export interface PartitionOptions {
  chunkSize: number;
  viewDistance: number;
  unloadDistance: number;
  budgetPerTick: number;
  lodDistances: readonly number[];
}

export interface PartitionUpdate {
  loaded: ChunkCoord[];
  unloaded: ChunkCoord[];
}

export class WorldPartition {
  readonly chunks = new Map<string, ChunkRecord>();

  constructor(readonly options: PartitionOptions) {
    if (options.unloadDistance < options.viewDistance) {
      throw new RangeError("unloadDistance must cover viewDistance");
    }
  }

  update(centerX: number, centerZ: number, time: number): PartitionUpdate {
    const { chunkSize, viewDistance, unloadDistance, budgetPerTick, lodDistances } = this.options;
    const ccx = Math.floor(centerX / chunkSize);
    const ccz = Math.floor(centerZ / chunkSize);
    const loaded: ChunkCoord[] = [];
    const unloaded: ChunkCoord[] = [];
    const wanted: Array<{ coord: ChunkCoord; distance: number }> = [];
    const radius = Math.ceil(viewDistance / chunkSize);
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const coord = { cx: ccx + dx, cz: ccz + dz };
        const worldX = (coord.cx + 0.5) * chunkSize;
        const worldZ = (coord.cz + 0.5) * chunkSize;
        const distance = Math.hypot(worldX - centerX, worldZ - centerZ);
        if (distance > viewDistance) continue;
        wanted.push({ coord, distance });
      }
    }
    wanted.sort((a, b) => a.distance - b.distance || a.coord.cx - b.coord.cx || a.coord.cz - b.coord.cz);
    let budget = budgetPerTick;
    for (const entry of wanted) {
      const key = chunkKey(entry.coord.cx, entry.coord.cz);
      const existing = this.chunks.get(key);
      const lod = LodSystem.pick(entry.distance, lodDistances);
      if (!existing) {
        if (budget <= 0) continue;
        this.chunks.set(key, { coord: entry.coord, state: "loaded", lod, lastActive: time });
        loaded.push(entry.coord);
        budget -= 1;
      } else {
        existing.lod = lod;
        existing.lastActive = time;
        if (existing.state === "unloaded") {
          if (budget <= 0) continue;
          existing.state = "loaded";
          loaded.push(entry.coord);
          budget -= 1;
        }
      }
    }
    for (const [key, record] of this.chunks) {
      const worldX = (record.coord.cx + 0.5) * chunkSize;
      const worldZ = (record.coord.cz + 0.5) * chunkSize;
      const distance = Math.hypot(worldX - centerX, worldZ - centerZ);
      if (distance > unloadDistance && record.state === "loaded") {
        record.state = "unloaded";
        unloaded.push(record.coord);
      }
    }
    return { loaded, unloaded };
  }

  loadedCount(): number {
    let count = 0;
    for (const record of this.chunks.values()) if (record.state === "loaded") count += 1;
    return count;
  }

  isLoaded(cx: number, cz: number): boolean {
    return this.chunks.get(chunkKey(cx, cz))?.state === "loaded";
  }

  get loadedKeys(): string[] {
    const keys: string[] = [];
    for (const [key, record] of this.chunks) if (record.state === "loaded") keys.push(key);
    return keys;
  }
}

export class LodSystem {
  static pick(distance: number, thresholds: readonly number[]): number {
    for (let level = 0; level < thresholds.length; level += 1) {
      if (distance <= thresholds[level]!) return level;
    }
    return thresholds.length;
  }
}

export interface RegionBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export class Region {
  readonly tags = new Set<string>();

  constructor(
    readonly id: string,
    readonly bounds: RegionBounds,
  ) {}

  contains(x: number, z: number): boolean {
    return x >= this.bounds.minX && x <= this.bounds.maxX && z >= this.bounds.minZ && z <= this.bounds.maxZ;
  }
}

export class RegionSystem {
  readonly regions: Region[] = [];

  add(region: Region): Region {
    this.regions.push(region);
    return region;
  }

  at(x: number, z: number): Region[] {
    return this.regions.filter((region) => region.contains(x, z));
  }

  tagged(tag: string): Region[] {
    return this.regions.filter((region) => region.tags.has(tag));
  }
}

export class DayNightCycle {
  time: number;

  constructor(options: { dayLength: number; start?: number }) {
    this.dayLength = options.dayLength;
    this.time = options.start ?? 0.3;
  }

  readonly dayLength: number;

  update(dt: number): void {
    this.time = ((this.time + dt / this.dayLength) % 1 + 1) % 1;
  }

  get sunElevation(): number {
    return -Math.cos(this.time * Math.PI * 2);
  }

  get sunColor(): Color {
    const elevation = Math.max(0, this.sunElevation);
    const warm = new Color(1, 0.55, 0.25, 1);
    const noon = new Color(1, 0.97, 0.9, 1);
    return Color.lerp(warm, noon, Math.min(1, elevation * 1.6));
  }

  get ambient(): number {
    return 0.16 + 0.84 * Math.max(0, this.sunElevation);
  }
}

export type WeatherName = "clear" | "cloudy" | "rain" | "storm";

export interface WeatherState {
  type: WeatherName;
  intensity: number;
}

const weatherTransitions: Record<WeatherName, Array<{ to: WeatherName; chance: number }>> = {
  clear: [{ to: "clear", chance: 0.72 }, { to: "cloudy", chance: 0.22 }, { to: "rain", chance: 0.06 }],
  cloudy: [{ to: "clear", chance: 0.25 }, { to: "cloudy", chance: 0.45 }, { to: "rain", chance: 0.24 }, { to: "storm", chance: 0.06 }],
  rain: [{ to: "rain", chance: 0.5 }, { to: "cloudy", chance: 0.3 }, { to: "storm", chance: 0.12 }, { to: "clear", chance: 0.08 }],
  storm: [{ to: "storm", chance: 0.45 }, { to: "rain", chance: 0.4 }, { to: "cloudy", chance: 0.15 }],
};

export class WeatherScheduler {
  type: WeatherName = "clear";
  intensity = 0;
  private timer = 0;

  constructor(
    readonly random: Random = new Random(5),
    readonly interval = 20,
  ) {}

  update(dt: number): WeatherState {
    this.timer += dt;
    while (this.timer >= this.interval) {
      this.timer -= this.interval;
      const options = weatherTransitions[this.type];
      const roll = this.random.next();
      let cursor = 0;
      for (const option of options) {
        cursor += option.chance;
        if (roll < cursor) {
          this.type = option.to;
          break;
        }
      }
    }
    const target = this.type === "clear" ? 0 : this.type === "cloudy" ? 0.35 : this.type === "rain" ? 0.75 : 1;
    const rate = dt / 6;
    if (this.intensity < target) this.intensity = Math.min(target, this.intensity + rate);
    else this.intensity = Math.max(target, this.intensity - rate);
    return this.state();
  }

  state(): WeatherState {
    return { type: this.type, intensity: this.intensity };
  }
}

export interface TieredEntity {
  x: number;
  z: number;
  interval: number;
  run: (dt: number) => void;
}

export class SimulationTiers {
  readonly entities: TieredEntity[] = [];
  private readonly timers = new Map<TieredEntity, number>();

  register(entity: TieredEntity): TieredEntity {
    this.entities.push(entity);
    this.timers.set(entity, entity.interval);
    return entity;
  }

  update(dt: number, centerX: number, centerZ: number, maxDistance = Infinity): number {
    let ran = 0;
    for (const entity of this.entities) {
      const distance = Math.hypot(entity.x - centerX, entity.z - centerZ);
      if (distance > maxDistance) continue;
      const tier = distance < 32 ? 0 : distance < 96 ? 1 : 2;
      const interval = entity.interval * (tier + 1);
      const timer = (this.timers.get(entity) ?? entity.interval) - dt;
      if (timer <= 0) {
        entity.run(dt * (tier + 1));
        this.timers.set(entity, timer + interval);
        ran += 1;
      } else {
        this.timers.set(entity, timer);
      }
    }
    return ran;
  }

  get count(): number {
    return this.entities.length;
  }
}

export class WorldPersistence {
  readonly cells = new Map<string, string>();

  saveCell(key: string, data: string): void {
    this.cells.set(key, data);
  }

  loadCell(key: string): string | null {
    return this.cells.get(key) ?? null;
  }

  deleteCell(key: string): boolean {
    return this.cells.delete(key);
  }

  serialize(): string {
    return JSON.stringify([...this.cells.entries()]);
  }

  restore(serialized: string): number {
    const entries = JSON.parse(serialized) as Array<[string, string]>;
    this.cells.clear();
    for (const [key, value] of entries) this.cells.set(key, value);
    return entries.length;
  }
}
