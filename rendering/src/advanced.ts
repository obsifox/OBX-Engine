export interface FogOptions {
  density: number;
  heightFalloff: number;
  baseHeight: number;
  color: [number, number, number];
}

export class HeightFog {
  constructor(readonly options: FogOptions = { density: 0.08, heightFalloff: 0.35, baseHeight: 0, color: [138, 148, 166] }) {}

  factorAt(height: number, distance: number): number {
    const altitude = Math.max(0, height - this.options.baseHeight);
    const heightTerm = Math.exp(-altitude * this.options.heightFalloff);
    return 1 - Math.exp(-this.options.density * distance * heightTerm);
  }

  shade(color: [number, number, number], height: number, distance: number): [number, number, number] {
    const factor = Math.min(1, Math.max(0, this.factorAt(height, distance)));
    return [
      Math.round(color[0] * (1 - factor) + this.options.color[0] * factor),
      Math.round(color[1] * (1 - factor) + this.options.color[1] * factor),
      Math.round(color[2] * (1 - factor) + this.options.color[2] * factor),
    ];
  }
}

export interface FoliageInstance {
  x: number;
  y: number;
  scale: number;
  variant: number;
}

export class FoliageInstancer {
  private readonly cells = new Map<string, FoliageInstance[]>();

  constructor(readonly options: { cellSize?: number } = {}) {}

  scatter(
    bounds: { x0: number; y0: number; x1: number; y1: number },
    count: number,
    random: () => number,
  ): FoliageInstance[] {
    const placed: FoliageInstance[] = [];
    for (let index = 0; index < count; index += 1) {
      const instance: FoliageInstance = {
        x: bounds.x0 + random() * (bounds.x1 - bounds.x0),
        y: bounds.y0 + random() * (bounds.y1 - bounds.y0),
        scale: 0.6 + random() * 0.8,
        variant: Math.floor(random() * 3),
      };
      const key = this.key(instance.x, instance.y);
      const list = this.cells.get(key) ?? [];
      list.push(instance);
      this.cells.set(key, list);
      placed.push(instance);
    }
    return placed;
  }

  private key(x: number, y: number): string {
    const size = this.options.cellSize ?? 16;
    return `${Math.floor(x / size)}:${Math.floor(y / size)}`;
  }

  batches(): FoliageInstance[][] {
    return [...this.cells.values()];
  }

  visible(bounds: { x0: number; y0: number; x1: number; y1: number }): FoliageInstance[] {
    const out: FoliageInstance[] = [];
    for (const list of this.cells.values()) {
      for (const instance of list) {
        if (instance.x >= bounds.x0 && instance.x <= bounds.x1 && instance.y >= bounds.y0 && instance.y <= bounds.y1) {
          out.push(instance);
        }
      }
    }
    return out;
  }

  get count(): number {
    let total = 0;
    for (const list of this.cells.values()) total += list.length;
    return total;
  }
}

export interface Decal {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  source: string;
}

export class DecalProjector {
  private readonly decals: Decal[] = [];
  private counter = 0;

  project(decal: Omit<Decal, "id">): Decal {
    this.counter += 1;
    const record: Decal = { ...decal, id: `decal_${this.counter}` };
    this.decals.push(record);
    return record;
  }

  overlapping(bounds: { x0: number; y0: number; x1: number; y1: number }): Decal[] {
    return this.decals.filter((decal) => {
      const halfW = decal.width / 2;
      const halfH = decal.height / 2;
      return (
        decal.x + halfW >= bounds.x0 &&
        decal.x - halfW <= bounds.x1 &&
        decal.y + halfH >= bounds.y0 &&
        decal.y - halfH <= bounds.y1
      );
    });
  }

  remove(id: string): boolean {
    const index = this.decals.findIndex((decal) => decal.id === id);
    if (index < 0) return false;
    this.decals.splice(index, 1);
    return true;
  }

  get count(): number {
    return this.decals.length;
  }
}

export interface Wave {
  amplitude: number;
  wavelength: number;
  speed: number;
  direction: number;
}

export class WaterSurface {
  constructor(readonly waves: Wave[] = [
    { amplitude: 0.35, wavelength: 7, speed: 1.1, direction: 0 },
    { amplitude: 0.18, wavelength: 3.5, speed: 1.7, direction: Math.PI / 3 },
    { amplitude: 0.08, wavelength: 1.8, speed: 2.3, direction: Math.PI / 1.7 },
  ]) {}

  height(x: number, z: number, time: number): number {
    let sum = 0;
    for (const wave of this.waves) {
      const phase = (x * Math.cos(wave.direction) + z * Math.sin(wave.direction)) / wave.wavelength;
      sum += wave.amplitude * Math.sin((phase + time * wave.speed) * Math.PI * 2);
    }
    return sum;
  }

  normal(x: number, z: number, time: number): { x: number; y: number; z: number } {
    const epsilon = 0.05;
    const hx = this.height(x + epsilon, z, time) - this.height(x - epsilon, z, time);
    const hz = this.height(x, z + epsilon, time) - this.height(x, z - epsilon, time);
    const length = Math.sqrt(hx * hx + 4 * epsilon * epsilon + hz * hz);
    return { x: -hx / length, y: (2 * epsilon) / length, z: -hz / length };
  }

  foam(x: number, z: number, time: number, threshold = 0.45): boolean {
    return this.height(x, z, time) > threshold;
  }
}

export const RENDERING_ADVANCED_VERSION = "0.96.0";
