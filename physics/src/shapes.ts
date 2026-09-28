import { Vec3 } from "@obx/math";

export interface SphereShape {
  readonly kind: "sphere";
  readonly radius: number;
}

export interface BoxShape {
  readonly kind: "box";
  readonly halfExtents: Vec3;
}

export interface PlaneShape {
  readonly kind: "plane";
  readonly normal: Vec3;
  readonly offset: number;
}

export type Shape = SphereShape | BoxShape | PlaneShape;

export function sphereShape(radius: number): SphereShape {
  return { kind: "sphere", radius };
}

export function boxShape(halfExtents: Vec3): BoxShape {
  return { kind: "box", halfExtents: halfExtents.clone() };
}

export function planeShape(normal: Vec3, offset = 0): PlaneShape {
  return { kind: "plane", normal: normal.clone().normalize(), offset };
}

export interface RayHit {
  distance: number;
  point: Vec3;
  normal: Vec3;
}

export function raySphere(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  center: Vec3,
  radius: number,
): RayHit | null {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  let t = -b - sqrt;
  if (t < 0) t = -b + sqrt;
  if (t < 0 || t > maxDistance) return null;
  const point = new Vec3(
    origin.x + direction.x * t,
    origin.y + direction.y * t,
    origin.z + direction.z * t,
  );
  const normal = point.clone().sub(center).normalize();
  return { distance: t, point, normal };
}

export function rayBox(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  min: Vec3,
  max: Vec3,
): RayHit | null {
  let tMin = 0;
  let tMax = maxDistance;
  let axis = 0;
  let sign = 1;
  const o = [origin.x, origin.y, origin.z];
  const d = [direction.x, direction.y, direction.z];
  const lo = [min.x, min.y, min.z];
  const hi = [max.x, max.y, max.z];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]!) < 1e-12) {
      if (o[i]! < lo[i]! || o[i]! > hi[i]!) return null;
      continue;
    }
    const inv = 1 / d[i]!;
    let t1 = (lo[i]! - o[i]!) * inv;
    let t2 = (hi[i]! - o[i]!) * inv;
    let s = -1;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
      s = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = i;
      sign = s;
    }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  const point = new Vec3(
    origin.x + direction.x * tMin,
    origin.y + direction.y * tMin,
    origin.z + direction.z * tMin,
  );
  const normal = new Vec3(0, 0, 0);
  if (axis === 0) normal.x = sign;
  else if (axis === 1) normal.y = sign;
  else normal.z = sign;
  return { distance: tMin, point, normal };
}

export function rayPlane(
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  normal: Vec3,
  offset: number,
): RayHit | null {
  const denom = normal.x * direction.x + normal.y * direction.y + normal.z * direction.z;
  if (Math.abs(denom) < 1e-12) return null;
  const t = (offset - (normal.x * origin.x + normal.y * origin.y + normal.z * origin.z)) / denom;
  if (t < 0 || t > maxDistance) return null;
  return {
    distance: t,
    point: new Vec3(
      origin.x + direction.x * t,
      origin.y + direction.y * t,
      origin.z + direction.z * t,
    ),
    normal: normal.clone(),
  };
}

export interface ShapeOverlap {
  normal: Vec3;
  penetration: number;
}

export function overlapSphereSphere(
  pa: Vec3,
  ra: number,
  pb: Vec3,
  rb: number,
): ShapeOverlap | null {
  const delta = pb.clone().sub(pa);
  const distance = delta.length();
  const total = ra + rb;
  if (distance > total + 1e-9) return null;
  if (distance < 1e-9) {
    return { normal: new Vec3(0, 1, 0), penetration: total };
  }
  return { normal: delta.scale(1 / distance), penetration: total - distance };
}

export function overlapSphereBox(
  center: Vec3,
  radius: number,
  min: Vec3,
  max: Vec3,
): ShapeOverlap | null {
  const cx = Math.max(min.x, Math.min(max.x, center.x));
  const cy = Math.max(min.y, Math.min(max.y, center.y));
  const cz = Math.max(min.z, Math.min(max.z, center.z));
  let dx = center.x - cx;
  let dy = center.y - cy;
  let dz = center.z - cz;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq > (radius + 1e-9) * (radius + 1e-9)) return null;
  if (distSq > 1e-18) {
    const distance = Math.sqrt(distSq);
    return {
      normal: new Vec3(dx / distance, dy / distance, dz / distance),
      penetration: radius - distance,
    };
  }
  const toMin = [center.x - min.x, center.y - min.y, center.z - min.z];
  const toMax = [max.x - center.x, max.y - center.y, max.z - center.z];
  const pushes = [
    toMin[0]!,
    toMax[0]!,
    toMin[1]!,
    toMax[1]!,
    toMin[2]!,
    toMax[2]!,
  ];
  let best = 0;
  for (let i = 1; i < 6; i += 1) {
    if (pushes[i]! < pushes[best]!) best = i;
  }
  const normal = new Vec3(0, 0, 0);
  const axis = Math.floor(best / 2);
  const sign = best % 2 === 0 ? -1 : 1;
  if (axis === 0) normal.x = sign;
  else if (axis === 1) normal.y = sign;
  else normal.z = sign;
  return { normal, penetration: radius + pushes[best]! };
}

export function overlapBoxBox(
  minA: Vec3,
  maxA: Vec3,
  minB: Vec3,
  maxB: Vec3,
): ShapeOverlap | null {
  const overlapX = Math.min(maxA.x, maxB.x) - Math.max(minA.x, minB.x);
  if (overlapX < -1e-9) return null;
  const overlapY = Math.min(maxA.y, maxB.y) - Math.max(minA.y, minB.y);
  if (overlapY < -1e-9) return null;
  const overlapZ = Math.min(maxA.z, maxB.z) - Math.max(minA.z, minB.z);
  if (overlapZ < -1e-9) return null;
  const centerAx = (minA.x + maxA.x) / 2;
  const centerAy = (minA.y + maxA.y) / 2;
  const centerAz = (minA.z + maxA.z) / 2;
  const centerBx = (minB.x + maxB.x) / 2;
  const centerBy = (minB.y + maxB.y) / 2;
  const centerBz = (minB.z + maxB.z) / 2;
  const normal = new Vec3(0, 0, 0);
  let penetration = overlapX;
  normal.x = centerBx >= centerAx ? 1 : -1;
  if (overlapY < penetration) {
    penetration = overlapY;
    normal.set(0, centerBy >= centerAy ? 1 : -1, 0);
  }
  if (overlapZ < penetration) {
    penetration = overlapZ;
    normal.set(0, 0, centerBz >= centerAz ? 1 : -1);
  }
  return { normal, penetration };
}

export function overlapSpherePlane(
  center: Vec3,
  radius: number,
  normal: Vec3,
  offset: number,
): ShapeOverlap | null {
  const distance = normal.x * center.x + normal.y * center.y + normal.z * center.z - offset;
  if (distance > radius + 1e-9) return null;
  return { normal: normal.clone(), penetration: radius - distance };
}

export function overlapBoxPlane(
  min: Vec3,
  max: Vec3,
  normal: Vec3,
  offset: number,
): ShapeOverlap | null {
  const px = normal.x >= 0 ? min.x : max.x;
  const py = normal.y >= 0 ? min.y : max.y;
  const pz = normal.z >= 0 ? min.z : max.z;
  const near = normal.x * px + normal.y * py + normal.z * pz - offset;
  if (near >= 0) return null;
  return { normal: normal.clone(), penetration: -near };
}

export function boundsForShape(
  shape: Shape,
  position: Vec3,
): { min: Vec3; max: Vec3 } {
  if (shape.kind === "sphere") {
    const r = shape.radius;
    return {
      min: new Vec3(position.x - r, position.y - r, position.z - r),
      max: new Vec3(position.x + r, position.y + r, position.z + r),
    };
  }
  if (shape.kind === "box") {
    const h = shape.halfExtents;
    return {
      min: new Vec3(position.x - h.x, position.y - h.y, position.z - h.z),
      max: new Vec3(position.x + h.x, position.y + h.y, position.z + h.z),
    };
  }
  return {
    min: new Vec3(-Infinity, -Infinity, -Infinity),
    max: new Vec3(Infinity, Infinity, Infinity),
  };
}
