import { Mat4, Vec3, type AABB } from "@obx/math";
import type { QualityLevelName } from "./quality.js";

export interface ShadowTriangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

export interface ShadowMap {
  width: number;
  height: number;
  depth: Float32Array;
  viewProjection: Mat4;
}

export interface ShadowSettings {
  mapSize: number;
  bias: number;
  pcfTaps: number;
  pcfRadius: number;
  cascades: number;
  splitLambda: number;
  enabled: boolean;
}

export function defaultShadowSettings(): ShadowSettings {
  return { mapSize: 1024, bias: 0.002, pcfTaps: 4, pcfRadius: 1, cascades: 3, splitLambda: 0.75, enabled: true };
}

export function shadowSettingsForQuality(level: QualityLevelName): ShadowSettings {
  const table: Record<QualityLevelName, ShadowSettings> = {
    low: { mapSize: 512, bias: 0.003, pcfTaps: 1, pcfRadius: 0, cascades: 1, splitLambda: 0.5, enabled: true },
    medium: { mapSize: 1024, bias: 0.002, pcfTaps: 4, pcfRadius: 1, cascades: 2, splitLambda: 0.75, enabled: true },
    high: { mapSize: 2048, bias: 0.0015, pcfTaps: 9, pcfRadius: 1.5, cascades: 3, splitLambda: 0.85, enabled: true },
    ultra: { mapSize: 4096, bias: 0.001, pcfTaps: 16, pcfRadius: 2, cascades: 4, splitLambda: 0.95, enabled: true },
  };
  return { ...table[level] };
}

export function orthographicLightViewProjection(position: Vec3, direction: Vec3, extent: number, near = 0.1, far = 100): Mat4 {
  const forward = direction.clone().normalize();
  const target = position.clone().add(forward);
  const view = Mat4.lookAt(position, target, Math.abs(forward.y) > 0.99 ? new Vec3(0, 0, 1) : new Vec3(0, 1, 0));
  const projection = Mat4.orthographic(-extent, extent, -extent, extent, near, far);
  return projection.multiply(view);
}

export function createShadowMap(width: number, height: number, viewProjection: Mat4): ShadowMap {
  const depth = new Float32Array(width * height);
  depth.fill(Number.POSITIVE_INFINITY);
  return { width, height, depth, viewProjection };
}

function projectVertex(matrix: Mat4, vertex: Vec3): { x: number; y: number; z: number; w: number } {
  const m = matrix.elements;
  const x = m[0]! * vertex.x + m[4]! * vertex.y + m[8]! * vertex.z + m[12]!;
  const y = m[1]! * vertex.x + m[5]! * vertex.y + m[9]! * vertex.z + m[13]!;
  const z = m[2]! * vertex.x + m[6]! * vertex.y + m[10]! * vertex.z + m[14]!;
  const w = m[3]! * vertex.x + m[7]! * vertex.y + m[11]! * vertex.z + m[15]!;
  return { x, y, z, w };
}

export function renderShadowMap(triangles: readonly ShadowTriangle[], viewProjection: Mat4, width: number, height: number): ShadowMap {
  const map = createShadowMap(width, height, viewProjection);
  for (const triangle of triangles) {
    const va = projectVertex(viewProjection, triangle.a);
    const vb = projectVertex(viewProjection, triangle.b);
    const vc = projectVertex(viewProjection, triangle.c);
    if (va.w <= 0 || vb.w <= 0 || vc.w <= 0) continue;
    const ax = ((va.x / va.w + 1) / 2) * width;
    const ay = ((1 - va.y / va.w) / 2) * height;
    const bx = ((vb.x / vb.w + 1) / 2) * width;
    const by = ((1 - vb.y / vb.w) / 2) * height;
    const cx = ((vc.x / vc.w + 1) / 2) * width;
    const cy = ((1 - vc.y / vc.w) / 2) * height;
    const az = va.z / va.w;
    const bz = vb.z / vb.w;
    const cz = vc.z / vc.w;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = w0 * az + w1 * bz + w2 * cz;
        const index = y * width + x;
        if (depth < map.depth[index]!) map.depth[index] = depth;
      }
    }
  }
  return map;
}

export function sampleShadowMap(map: ShadowMap, worldPosition: Vec3, bias = 0.002): number {
  const clip = projectVertex(map.viewProjection, worldPosition);
  if (clip.w <= 0) return 1;
  const u = (clip.x / clip.w + 1) / 2;
  const v = (1 - clip.y / clip.w) / 2;
  const depth = clip.z / clip.w - bias;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 1;
  const x = Math.min(map.width - 1, Math.max(0, Math.floor(u * map.width)));
  const y = Math.min(map.height - 1, Math.max(0, Math.floor(v * map.height)));
  return depth <= map.depth[y * map.width + x]! ? 1 : 0;
}

export function pcfSample(map: ShadowMap, worldPosition: Vec3, bias = 0.002, taps = 4, radius = 1): number {
  if (taps <= 1) return sampleShadowMap(map, worldPosition, bias);
  const offsets = pcfOffsets(taps);
  let sum = 0;
  for (const [dx, dy] of offsets) {
    const probe = worldPosition.clone();
    sum += sampleShadowMapOffset(map, probe, bias, dx * radius, dy * radius);
  }
  return sum / offsets.length;
}

function sampleShadowMapOffset(map: ShadowMap, worldPosition: Vec3, bias: number, dx: number, dy: number): number {
  const clip = projectVertex(map.viewProjection, worldPosition);
  if (clip.w <= 0) return 1;
  const u = (clip.x / clip.w + 1) / 2 + (dx / map.width) * 2;
  const v = (1 - clip.y / clip.w) / 2 + (dy / map.height) * 2;
  const depth = clip.z / clip.w - bias;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 1;
  const x = Math.min(map.width - 1, Math.max(0, Math.round(u * map.width - 0.5)));
  const y = Math.min(map.height - 1, Math.max(0, Math.round(v * map.height - 0.5)));
  return depth <= map.depth[y * map.width + x]! ? 1 : 0;
}

export function pcfOffsets(taps: number): Array<[number, number]> {
  if (taps <= 1) return [[0, 0]];
  if (taps <= 4) return [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
  const offsets: Array<[number, number]> = [];
  const grid = Math.ceil(Math.sqrt(taps));
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      if (offsets.length >= taps) break;
      offsets.push([x - (grid - 1) / 2, y - (grid - 1) / 2]);
    }
  }
  return offsets;
}

export function cascadeSplits(near: number, far: number, cascades: number, lambda = 0.75): number[] {
  const splits: number[] = [];
  for (let i = 1; i < cascades; i += 1) {
    const uniform = near + ((far - near) * i) / cascades;
    const logarithmic = near * Math.pow(far / near, i / cascades);
    splits.push(lambda * logarithmic + (1 - lambda) * uniform);
  }
  splits.push(far);
  return splits;
}

export class CascadedShadowMaps {
  readonly settings: ShadowSettings;
  readonly maps: ShadowMap[] = [];

  constructor(settings: ShadowSettings = defaultShadowSettings()) {
    this.settings = settings;
  }

  cascadeForDepth(depth: number, splits: number[]): number {
    for (let i = 0; i < splits.length; i += 1) {
      if (depth <= splits[i]!) return i;
    }
    return splits.length - 1;
  }

  render(triangles: readonly ShadowTriangle[], origins: Vec3[], directions: Vec3[], extent: number): void {
    this.maps.length = 0;
    for (let i = 0; i < this.settings.cascades; i += 1) {
      const viewProjection = orthographicLightViewProjection(origins[i]!, directions[i]!, extent);
      this.maps.push(renderShadowMap(triangles, viewProjection, this.settings.mapSize, this.settings.mapSize));
    }
  }

  sample(worldPosition: Vec3, depth: number, splits: number[]): number {
    const index = this.cascadeForDepth(depth, splits);
    const map = this.maps[index];
    if (!map) return 1;
    return pcfSample(map, worldPosition, this.settings.bias, this.settings.pcfTaps, this.settings.pcfRadius);
  }
}

export function shadowedBoundsCoverage(bounds: AABB, map: ShadowMap): number {
  let covered = 0;
  let total = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        total += 1;
        covered += sampleShadowMap(map, new Vec3(x, y, z));
      }
    }
  }
  return covered / Math.max(total, 1);
}
