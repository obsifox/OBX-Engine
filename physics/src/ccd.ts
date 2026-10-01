import { Vec3 } from "@obx/math";
import type { Body } from "./body.js";

export interface SweepHit {
  toi: number;
  point: Vec3;
  normal: Vec3;
  body: Body | null;
}

export function sweepSphereSphere(from: Vec3, to: Vec3, radius: number, center: Vec3, otherRadius: number): SweepHit | null {
  const delta = to.clone().sub(from);
  const offset = from.clone().sub(center);
  const combined = radius + otherRadius;
  const a = delta.lengthSq();
  const b = 2 * offset.dot(delta);
  const c = offset.lengthSq() - combined * combined;
  if (c <= 0) return { toi: 0, point: from.clone(), normal: offset.normalize(), body: null };
  if (a < 1e-12) return null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const toi = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (toi < 0 || toi > 1) return null;
  const point = from.clone().add(delta.clone().scale(toi));
  return { toi, point, normal: point.clone().sub(center).normalize(), body: null };
}

export function sweepSphereBox(from: Vec3, to: Vec3, radius: number, center: Vec3, halfExtents: Vec3): SweepHit | null {
  const delta = to.clone().sub(from);
  let entry = 0;
  let exit = 1;
  const normal = new Vec3(0, 0, 0);
  for (const axis of ["x", "y", "z"] as const) {
    const expandedMin = center[axis] - halfExtents[axis] - radius;
    const expandedMax = center[axis] + halfExtents[axis] + radius;
    const start = from[axis];
    const direction = delta[axis];
    if (Math.abs(direction) < 1e-12) {
      if (start < expandedMin || start > expandedMax) return null;
      continue;
    }
    let tNear = (expandedMin - start) / direction;
    let tFar = (expandedMax - start) / direction;
    let sign = -1;
    if (tNear > tFar) {
      const swap = tNear;
      tNear = tFar;
      tFar = swap;
      sign = 1;
    }
    if (tNear > entry) {
      entry = tNear;
      normal.set(0, 0, 0);
      normal[axis] = sign;
    }
    exit = Math.min(exit, tFar);
    if (entry > exit) return null;
  }
  if (entry < 0 || entry > 1) return null;
  return { toi: entry, point: from.clone().add(delta.clone().scale(entry)), normal: normal.clone().normalize(), body: null };
}

export interface CcdWorldSample {
  position: Vec3;
  radius: number;
  halfExtents?: Vec3;
  body: Body | null;
}

export function sweepWorld(from: Vec3, to: Vec3, radius: number, samples: readonly CcdWorldSample[]): SweepHit | null {
  let earliest: SweepHit | null = null;
  for (const sample of samples) {
    const hit = sample.halfExtents
      ? sweepSphereBox(from, to, radius, sample.position, sample.halfExtents)
      : sweepSphereSphere(from, to, radius, sample.position, sample.radius);
    if (hit && (!earliest || hit.toi < earliest.toi)) {
      earliest = { ...hit, body: sample.body };
    }
  }
  return earliest;
}

export function conservativeAdvance(
  from: Vec3,
  to: Vec3,
  radius: number,
  distanceToObstacle: (point: Vec3) => number,
  maxSteps = 32,
  safety = 0.9,
): { position: Vec3; hit: boolean } {
  const direction = to.clone().sub(from);
  const total = direction.length();
  if (total < 1e-9) return { position: from.clone(), hit: distanceToObstacle(from) < radius };
  direction.scale(1 / total);
  let travelled = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    const point = from.clone().add(direction.clone().scale(travelled));
    const gap = distanceToObstacle(point) - radius;
    if (gap <= 1e-4) return { position: point, hit: true };
    const advance = gap * safety;
    if (travelled + advance >= total) return { position: to.clone(), hit: distanceToObstacle(to) - radius <= 1e-4 };
    travelled += Math.max(advance, 1e-5);
  }
  return { position: from.clone().add(direction.clone().scale(travelled)), hit: true };
}

export function integrateWithCcd(body: Body, dt: number, samples: readonly CcdWorldSample[]): boolean {
  const from = body.position.clone();
  const to = body.position.clone().add(body.velocity.clone().scale(dt));
  const radius = body.shape.kind === "sphere" ? body.shape.radius : 0.25;
  const hit = sweepWorld(from, to, radius, samples);
  if (!hit) {
    body.position = to;
    return false;
  }
  body.position = from.clone().add(to.clone().sub(from).scale(Math.max(hit.toi - 1e-3, 0)));
  const velocity = body.velocity;
  const normalComponent = hit.normal.clone().scale(velocity.dot(hit.normal));
  velocity.sub(normalComponent.scale(1.5));
  return true;
}
