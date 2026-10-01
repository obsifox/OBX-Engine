import { Vec3 } from "@obx/math";
import type { Body } from "./body.js";
import { Body as BodyClass } from "./body.js";
import type { ConvexHull } from "./hull.js";
import { boxHull } from "./hull.js";
import { boxShape, sphereShape } from "./shapes.js";

export interface DebrisCell {
  center: Vec3;
  halfExtents: Vec3;
  mass: number;
}

export interface FracturePattern {
  cells: DebrisCell[];
  totalMass: number;
}

export function voronoiFracture(halfExtents: Vec3, sites: readonly Vec3[], center = new Vec3(0, 0, 0)): FracturePattern {
  if (sites.length === 0) throw new RangeError("Fracture needs at least one site");
  const assignment = new Map<number, Vec3[]>();
  for (let i = 0; i < sites.length; i += 1) assignment.set(i, []);
  const steps = 2;
  for (let x = -steps; x <= steps; x += 1) {
    for (let y = -steps; y <= steps; y += 1) {
      for (let z = -steps; z <= steps; z += 1) {
        const sample = new Vec3(
          center.x + (x / steps) * halfExtents.x,
          center.y + (y / steps) * halfExtents.y,
          center.z + (z / steps) * halfExtents.z,
        );
        let bestIndex = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let i = 0; i < sites.length; i += 1) {
          const distance = sample.distanceTo(sites[i]!);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
          }
        }
        assignment.get(bestIndex)!.push(sample);
      }
    }
  }
  const cells: DebrisCell[] = [];
  const totalVolume = halfExtents.x * halfExtents.y * halfExtents.z * 8;
  for (const [index, samples] of assignment) {
    if (samples.length === 0) continue;
    const min = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    for (const sample of samples) {
      min.x = Math.min(min.x, sample.x);
      min.y = Math.min(min.y, sample.y);
      min.z = Math.min(min.z, sample.z);
      max.x = Math.max(max.x, sample.x);
      max.y = Math.max(max.y, sample.y);
      max.z = Math.max(max.z, sample.z);
    }
    const cellHalf = max.clone().sub(min).scale(0.5);
    const cellCenter = max.clone().add(min).scale(0.5);
    const cellVolume = Math.max(cellHalf.x * cellHalf.y * cellHalf.z * 8, totalVolume * 1e-3);
    cells.push({ center: cellCenter, halfExtents: cellHalf, mass: cellVolume / totalVolume });
    void index;
  }
  const totalMass = cells.reduce((sum, cell) => sum + cell.mass, 0);
  return { cells, totalMass };
}

export function destroyBoxBody(body: Body, sites: readonly Vec3[], debrisMass: number): Body[] {
  const shape = body.shape;
  const halfExtents = shape.kind === "box" ? shape.halfExtents.clone() : new Vec3(0.5, 0.5, 0.5);
  const pattern = voronoiFracture(halfExtents, sites.map((site) => site.clone().add(body.position)), body.position);
  const debris: Body[] = [];
  for (const cell of pattern.cells) {
    debris.push(
      new BodyClass({
        shape: boxShape(cell.halfExtents.clone().scale(0.9)),
        position: cell.center.clone(),
        velocity: body.velocity.clone().add(cell.center.clone().sub(body.position).scale(2)),
        mass: Math.max(debrisMass * cell.mass, 0.05),
      }),
    );
  }
  return debris;
}

export function shardHull(hull: ConvexHull, shardCount: number): { hulls: ConvexHull[]; masses: number[] } {
  const centroid = hull.centroid();
  const hulls: ConvexHull[] = [];
  const masses: number[] = [];
  const totalVolume = Math.max(hull.volume(), 1e-6);
  for (let i = 0; i < shardCount; i += 1) {
    const direction = new Vec3(Math.sin((i / shardCount) * Math.PI * 2), Math.cos((i / shardCount) * Math.PI * 2), 0.5).normalize();
    const offset = centroid.clone().add(direction.clone().scale(0.05));
    const shard = boxHull(new Vec3(0.08, 0.08, 0.08), offset);
    hulls.push(shard);
    masses.push((shard.volume() / totalVolume) * Math.max(hull.points.length, 1) * 0.1);
  }
  return { hulls, masses };
}

export function scatterDebris(bodies: readonly Body[], impulse: Vec3, falloff = 0.5): void {
  for (const body of bodies) {
    const direction = body.position.clone().normalize();
    body.velocity.add(impulse.clone().scale(1 / (1 + direction.length() * falloff)));
  }
}

export function makeDebrisBody(position: Vec3, velocity: Vec3, mass = 0.2, radius = 0.08): Body {
  return new BodyClass({ shape: sphereShape(radius), position, velocity, mass });
}
