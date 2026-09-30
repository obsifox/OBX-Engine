import { Mat4, Vec3, type AABB } from "@obx/math";

export interface Plane {
  normal: Vec3;
  distance: number;
}

export interface CullableItem<T = unknown> {
  id: string;
  bounds: AABB;
  lod?: number;
  queue?: number;
  transparent?: boolean;
  payload?: T;
}

export interface CullingStats {
  submitted: number;
  visible: number;
  culled: number;
  lodDowngrades: number;
}

export class Frustum {
  readonly planes: Plane[];

  constructor(planes: Plane[]) {
    this.planes = planes;
  }

  static fromViewProjection(viewProjection: Mat4): Frustum {
    const m = viewProjection.elements;
    const row = (i: number): [number, number, number, number] => [m[i]!, m[4 + i]!, m[8 + i]!, m[12 + i]!];
    const rows = [row(0), row(1), row(2), row(3)];
    const combine = (a: [number, number, number, number], b: [number, number, number, number], sign: number): Plane => {
      const normal = new Vec3(a[0] + sign * b[0], a[1] + sign * b[1], a[2] + sign * b[2]);
      const distance = a[3] + sign * b[3];
      const length = normal.length() || 1;
      return { normal: normal.scale(1 / length), distance: distance / length };
    };
    return new Frustum([
      combine(rows[3]!, rows[0]!, 1),
      combine(rows[3]!, rows[0]!, -1),
      combine(rows[3]!, rows[1]!, 1),
      combine(rows[3]!, rows[1]!, -1),
      combine(rows[3]!, rows[2]!, 1),
      combine(rows[3]!, rows[2]!, -1),
    ]);
  }

  testAabb(bounds: AABB): boolean {
    for (const plane of this.planes) {
      const x = plane.normal.x >= 0 ? bounds.max.x : bounds.min.x;
      const y = plane.normal.y >= 0 ? bounds.max.y : bounds.min.y;
      const z = plane.normal.z >= 0 ? bounds.max.z : bounds.min.z;
      if (plane.normal.x * x + plane.normal.y * y + plane.normal.z * z + plane.distance < 0) {
        return false;
      }
    }
    return true;
  }
}

export function aabbCenter(bounds: AABB): Vec3 {
  return new Vec3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  );
}

export function aabbRadius(bounds: AABB): number {
  return bounds.max.clone().sub(bounds.min).length() / 2;
}

export function frustumCull<T>(items: readonly CullableItem<T>[], frustum: Frustum): { visible: CullableItem<T>[]; stats: CullingStats } {
  const visible: CullableItem<T>[] = [];
  let culled = 0;
  for (const item of items) {
    if (frustum.testAabb(item.bounds)) {
      visible.push(item);
    } else {
      culled += 1;
    }
  }
  return {
    visible,
    stats: { submitted: items.length, visible: visible.length, culled, lodDowngrades: 0 },
  };
}

export function selectLodIndex(distance: number, thresholds: readonly number[], lodBias = 1): number {
  const scaled = distance / Math.max(lodBias, 1e-4);
  for (let i = 0; i < thresholds.length; i += 1) {
    if (scaled <= thresholds[i]!) return i;
  }
  return thresholds.length;
}

export function selectLod<T extends { distance: number }>(entries: readonly T[], thresholds: readonly number[], lodBias = 1): { index: number; downgraded: number }[] {
  return entries.map((entry) => {
    const index = selectLodIndex(entry.distance, thresholds, lodBias);
    return { index, downgraded: index > 0 ? 1 : 0 };
  });
}

export function sortOpaque<T extends CullableItem>(items: readonly T[], cameraPosition: Vec3): T[] {
  return [...items].sort((a, b) => {
    const da = aabbCenter(a.bounds).distanceTo(cameraPosition);
    const db = aabbCenter(b.bounds).distanceTo(cameraPosition);
    return da - db;
  });
}

export function sortTransparent<T extends CullableItem>(items: readonly T[], cameraPosition: Vec3): T[] {
  return [...items].sort((a, b) => {
    const da = aabbCenter(a.bounds).distanceTo(cameraPosition);
    const db = aabbCenter(b.bounds).distanceTo(cameraPosition);
    return db - da;
  });
}

export function sortRenderQueue<T extends CullableItem>(items: readonly T[], cameraPosition: Vec3): T[] {
  const opaque = items.filter((item) => !item.transparent);
  const transparent = items.filter((item) => item.transparent);
  return [...sortOpaque(opaque, cameraPosition), ...sortTransparent(transparent, cameraPosition)];
}

export class OcclusionBuffer {
  readonly width: number;
  readonly height: number;
  readonly depth: Float32Array;

  constructor(width: number, height: number, depth?: Float32Array) {
    this.width = width;
    this.height = height;
    this.depth = depth ?? new Float32Array(width * height);
    if (!depth) this.depth.fill(Number.POSITIVE_INFINITY);
  }

  static fromDepth(source: Float32Array, width: number, height: number, factor = 2): OcclusionBuffer {
    const w = Math.max(1, Math.floor(width / factor));
    const h = Math.max(1, Math.floor(height / factor));
    const buffer = new OcclusionBuffer(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let nearest = Number.POSITIVE_INFINITY;
        for (let dy = 0; dy < factor; dy += 1) {
          for (let dx = 0; dx < factor; dx += 1) {
            const sx = Math.min(width - 1, x * factor + dx);
            const sy = Math.min(height - 1, y * factor + dy);
            const value = source[sy * width + sx]!;
            if (value < nearest) nearest = value;
          }
        }
        buffer.depth[y * w + x] = nearest;
      }
    }
    return buffer;
  }

  isOccluded(bounds: AABB, receiverDepth: number): boolean {
    const radius = aabbRadius(bounds);
    const depth = receiverDepth - radius;
    const samples = 4;
    for (let i = 0; i < samples; i += 1) {
      const x = ((i % 2) + 0.5) / 2 * this.width;
      const y = (Math.floor(i / 2) + 0.5) / 2 * this.height;
      const index = Math.floor(y) * this.width + Math.floor(x);
      if (this.depth[index]! < depth) return true;
    }
    return false;
  }
}

export function occlusionCull<T>(items: readonly CullableItem<T>[], occlusion: OcclusionBuffer, receiverDepth: number): { visible: CullableItem<T>[]; stats: CullingStats } {
  const visible: CullableItem<T>[] = [];
  let culled = 0;
  for (const item of items) {
    if (occlusion.isOccluded(item.bounds, receiverDepth)) {
      culled += 1;
    } else {
      visible.push(item);
    }
  }
  return { visible, stats: { submitted: items.length, visible: visible.length, culled, lodDowngrades: 0 } };
}

export class RenderQueue<T = unknown> {
  #items: CullableItem<T>[] = [];

  push(item: CullableItem<T>): void {
    this.#items.push(item);
  }

  clear(): void {
    this.#items = [];
  }

  get size(): number {
    return this.#items.length;
  }

  cull(frustum: Frustum): { visible: CullableItem<T>[]; stats: CullingStats } {
    return frustumCull(this.#items, frustum);
  }

  sorted(cameraPosition: Vec3): CullableItem<T>[] {
    return sortRenderQueue(this.#items, cameraPosition);
  }
}
