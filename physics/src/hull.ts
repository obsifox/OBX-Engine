import { Vec3 } from "@obx/math";

export interface HullFace {
  a: number;
  b: number;
  c: number;
}

export interface RayHitHull {
  distance: number;
  point: Vec3;
  normal: Vec3;
}

export class ConvexHull {
  readonly points: Vec3[];
  readonly faces: HullFace[];

  constructor(points: readonly Vec3[], faces: readonly HullFace[]) {
    this.points = points.map((point) => point.clone());
    this.faces = [...faces];
  }

  static build(rawPoints: readonly Vec3[]): ConvexHull {
    const points: Vec3[] = [];
    for (const point of rawPoints) {
      if (!points.some((other) => other.distanceTo(point) < 1e-6)) points.push(point.clone());
    }
    if (points.length < 4) {
      throw new RangeError("ConvexHull needs at least 4 non-coplanar points");
    }
    const base = initialTetrahedron(points);
    let faces = base.faces;
    const used = new Set<number>(base.indices);
    for (let i = 0; i < points.length; i += 1) {
      if (used.has(i)) continue;
      const point = points[i]!;
      const visible: number[] = [];
      for (let f = 0; f < faces.length; f += 1) {
        if (faceDistance(points, faces[f]!, point) > 1e-9) visible.push(f);
      }
      if (visible.length === 0) continue;
      const horizon = findHorizon(faces, visible);
      faces = faces.filter((_, index) => !visible.includes(index));
      for (const edge of horizon) {
        faces.push({ a: edge.from, b: edge.to, c: i });
      }
      used.add(i);
    }
    return new ConvexHull(points, faces.filter((face) => face.a !== face.b && face.b !== face.c && face.a !== face.c));
  }

  support(direction: Vec3): Vec3 {
    let best = this.points[0]!;
    let bestDot = best.dot(direction);
    for (const point of this.points) {
      const value = point.dot(direction);
      if (value > bestDot) {
        bestDot = value;
        best = point;
      }
    }
    return best.clone();
  }

  centroid(): Vec3 {
    const sum = new Vec3(0, 0, 0);
    for (const point of this.points) sum.add(point);
    return sum.scale(1 / this.points.length);
  }

  faceNormals(): Vec3[] {
    return this.faces.map((face) => {
      const a = this.points[face.a]!;
      const b = this.points[face.b]!;
      const c = this.points[face.c]!;
      return b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    });
  }

  contains(point: Vec3, epsilon = 1e-6): boolean {
    for (const face of this.faces) {
      const a = this.points[face.a]!;
      const normal = this.points[face.b]!.clone().sub(a).cross(this.points[face.c]!.clone().sub(a)).normalize();
      if (normal.dot(point.clone().sub(a)) > epsilon) return false;
    }
    return true;
  }

  raycast(origin: Vec3, direction: Vec3, maxDistance = Number.POSITIVE_INFINITY): RayHitHull | null {
    let best: RayHitHull | null = null;
    for (const face of this.faces) {
      const a = this.points[face.a]!;
      const b = this.points[face.b]!;
      const c = this.points[face.c]!;
      const hit = rayTriangle(origin, direction, a, b, c);
      if (hit && hit.distance <= maxDistance && (!best || hit.distance < best.distance)) best = hit;
    }
    return best;
  }

  volume(): number {
    let volume = 0;
    for (const face of this.faces) {
      const a = this.points[face.a]!;
      const b = this.points[face.b]!;
      const c = this.points[face.c]!;
      volume += a.dot(b.clone().cross(c)) / 6;
    }
    return Math.abs(volume);
  }
}

function faceDistance(points: readonly Vec3[], face: HullFace, point: Vec3): number {
  const a = points[face.a]!;
  const normal = points[face.b]!.clone().sub(a).cross(points[face.c]!.clone().sub(a));
  return normal.dot(point.clone().sub(a)) / (normal.length() || 1);
}

function findHorizon(faces: readonly HullFace[], visible: readonly number[]): { from: number; to: number }[] {
  const edges: { from: number; to: number }[] = [];
  for (const index of visible) {
    const face = faces[index]!;
    const faceEdges = [
      { from: face.a, to: face.b },
      { from: face.b, to: face.c },
      { from: face.c, to: face.a },
    ];
    for (const edge of faceEdges) {
      const twin = edges.findIndex((other) => other.from === edge.to && other.to === edge.from);
      if (twin >= 0) edges.splice(twin, 1);
      else edges.push(edge);
    }
  }
  return edges;
}

function initialTetrahedron(points: readonly Vec3[]): { indices: number[]; faces: HullFace[] } {
  const indices = [0, 1, 2, 3];
  for (let i = 4; i < points.length; i += 1) {
    const a = points[indices[0]!]!;
    const b = points[indices[1]!]!;
    const c = points[indices[2]!]!;
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() > 1e-12 && Math.abs(normal.dot(points[i]!.clone().sub(a))) > 1e-6) {
      indices[3] = i;
      break;
    }
  }
  const [i0, i1, i2, i3] = indices as [number, number, number, number];
  const faces: HullFace[] = [
    { a: i0, b: i1, c: i2 },
    { a: i0, b: i3, c: i1 },
    { a: i1, b: i3, c: i2 },
    { a: i2, b: i3, c: i0 },
  ];
  const centroid = points[i0]!.clone().add(points[i1]!).add(points[i2]!).add(points[i3]!).scale(0.25);
  for (const face of faces) {
    if (faceDistance(points, face, centroid) > 0) {
      const swap = face.b;
      face.b = face.c;
      face.c = swap;
    }
  }
  return { indices, faces };
}

export function rayTriangle(origin: Vec3, direction: Vec3, a: Vec3, b: Vec3, c: Vec3): RayHitHull | null {
  const edge1 = b.clone().sub(a);
  const edge2 = c.clone().sub(a);
  const p = direction.clone().cross(edge2);
  const det = edge1.dot(p);
  if (Math.abs(det) < 1e-9) return null;
  const inverse = 1 / det;
  const tvec = origin.clone().sub(a);
  const u = tvec.dot(p) * inverse;
  if (u < 0 || u > 1) return null;
  const q = tvec.cross(edge1);
  const v = direction.dot(q) * inverse;
  if (v < 0 || u + v > 1) return null;
  const distance = edge2.dot(q) * inverse;
  if (distance < 0) return null;
  const point = origin.clone().add(direction.clone().scale(distance));
  const normal = edge1.clone().cross(edge2).normalize();
  return { distance, point, normal };
}

export function boxHull(halfExtents: Vec3, center = new Vec3(0, 0, 0)): ConvexHull {
  const points: Vec3[] = [];
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        points.push(new Vec3(center.x + halfExtents.x * x, center.y + halfExtents.y * y, center.z + halfExtents.z * z));
      }
    }
  }
  return ConvexHull.build(points);
}
