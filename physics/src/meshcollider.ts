import { Vec3 } from "@obx/math";
import type { RayHitHull } from "./hull.js";
import { rayTriangle } from "./hull.js";

export interface MeshTriangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

interface BvhNode {
  min: Vec3;
  max: Vec3;
  left: BvhNode | null;
  right: BvhNode | null;
  triangles: number[];
}

export class TriangleMesh {
  readonly triangles: MeshTriangle[];
  #root: BvhNode;

  constructor(triangles: readonly MeshTriangle[]) {
    this.triangles = triangles.map((triangle) => ({ a: triangle.a.clone(), b: triangle.b.clone(), c: triangle.c.clone() }));
    this.#root = this.#build(this.triangles.map((_, index) => index));
  }

  static grid(width: number, depth: number, cellSize: number, height: (x: number, z: number) => number = () => 0): TriangleMesh {
    const triangles: MeshTriangle[] = [];
    for (let x = 0; x < width; x += 1) {
      for (let z = 0; z < depth; z += 1) {
        const p00 = new Vec3(x * cellSize, height(x * cellSize, z * cellSize), z * cellSize);
        const p10 = new Vec3((x + 1) * cellSize, height((x + 1) * cellSize, z * cellSize), z * cellSize);
        const p01 = new Vec3(x * cellSize, height(x * cellSize, (z + 1) * cellSize), (z + 1) * cellSize);
        const p11 = new Vec3((x + 1) * cellSize, height((x + 1) * cellSize, (z + 1) * cellSize), (z + 1) * cellSize);
        triangles.push({ a: p00, b: p11, c: p10 });
        triangles.push({ a: p00, b: p01, c: p11 });
      }
    }
    return new TriangleMesh(triangles);
  }

  #build(indices: number[]): BvhNode {
    const min = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    for (const index of indices) {
      for (const vertex of [this.triangles[index]!.a, this.triangles[index]!.b, this.triangles[index]!.c]) {
        min.x = Math.min(min.x, vertex.x);
        min.y = Math.min(min.y, vertex.y);
        min.z = Math.min(min.z, vertex.z);
        max.x = Math.max(max.x, vertex.x);
        max.y = Math.max(max.y, vertex.y);
        max.z = Math.max(max.z, vertex.z);
      }
    }
    if (indices.length <= 2) return { min, max, left: null, right: null, triangles: [...indices] };
    const extent = max.clone().sub(min);
    const axis: "x" | "y" | "z" = extent.x >= extent.y && extent.x >= extent.z ? "x" : extent.y >= extent.z ? "y" : "z";
    const sorted = [...indices].sort((i, j) => this.#triangleCenter(i, axis) - this.#triangleCenter(j, axis));
    const middle = Math.floor(sorted.length / 2);
    return {
      min,
      max,
      left: this.#build(sorted.slice(0, middle)),
      right: this.#build(sorted.slice(middle)),
      triangles: [],
    };
  }

  #triangleCenter(index: number, axis: "x" | "y" | "z"): number {
    const triangle = this.triangles[index]!;
    return (triangle.a[axis] + triangle.b[axis] + triangle.c[axis]) / 3;
  }

  raycast(origin: Vec3, direction: Vec3, maxDistance = Number.POSITIVE_INFINITY): RayHitHull | null {
    let best: RayHitHull | null = null;
    const visit = (node: BvhNode): void => {
      if (!rayBounds(origin, direction, node.min, node.max, maxDistance)) return;
      if (node.left && node.right) {
        visit(node.left);
        visit(node.right);
        return;
      }
      for (const index of node.triangles) {
        const triangle = this.triangles[index]!;
        const hit = rayTriangle(origin, direction, triangle.a, triangle.b, triangle.c);
        if (hit && hit.distance <= maxDistance && (!best || hit.distance < best.distance)) best = hit;
      }
    };
    visit(this.#root);
    return best;
  }

  closestPoint(point: Vec3): Vec3 {
    let best = this.triangles[0]!.a.clone();
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const triangle of this.triangles) {
      const candidate = closestPointTriangle(point, triangle);
      const distance = candidate.distanceTo(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }
}

function rayBounds(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3, maxDistance: number): boolean {
  let entry = 0;
  let exit = maxDistance;
  for (const axis of ["x", "y", "z"] as const) {
    const start = origin[axis];
    const dir = direction[axis];
    if (Math.abs(dir) < 1e-12) {
      if (start < min[axis] || start > max[axis]) return false;
      continue;
    }
    let tNear = (min[axis] - start) / dir;
    let tFar = (max[axis] - start) / dir;
    if (tNear > tFar) {
      const swap = tNear;
      tNear = tFar;
      tFar = swap;
    }
    entry = Math.max(entry, tNear);
    exit = Math.min(exit, tFar);
    if (entry > exit) return false;
  }
  return exit >= 0;
}

function closestPointTriangle(point: Vec3, triangle: MeshTriangle): Vec3 {
  const ab = triangle.b.clone().sub(triangle.a);
  const ac = triangle.c.clone().sub(triangle.a);
  const ap = point.clone().sub(triangle.a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return triangle.a.clone();
  const bp = point.clone().sub(triangle.b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return triangle.b.clone();
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return triangle.a.clone().add(ab.scale(d1 / (d1 - d3)));
  const cp = point.clone().sub(triangle.c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return triangle.c.clone();
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return triangle.a.clone().add(ac.scale(d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return triangle.b.clone().add(triangle.c.clone().sub(triangle.b).scale((d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denominator = 1 / (va + vb + vc);
  return triangle.a.clone().add(ab.scale(vb * denominator)).add(ac.scale(vc * denominator));
}
