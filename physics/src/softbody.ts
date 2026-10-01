import { Vec3 } from "@obx/math";

export interface SoftPoint {
  position: Vec3;
  previous: Vec3;
  inverseMass: number;
}

export interface SoftConstraint {
  a: number;
  b: number;
  restLength: number;
  stiffness: number;
}

export class SoftBody {
  points: SoftPoint[] = [];
  constraints: SoftConstraint[] = [];
  damping = 0.99;

  constructor(points: readonly SoftPoint[], constraints: readonly SoftConstraint[]) {
    this.points = points.map((point) => ({ position: point.position.clone(), previous: point.previous.clone(), inverseMass: point.inverseMass }));
    this.constraints = [...constraints];
  }

  static box(center: Vec3, halfExtents: Vec3, subdivisions = 1, inverseMass = 1): SoftBody {
    const points: SoftPoint[] = [];
    const index = (x: number, y: number, z: number): number => x * (subdivisions + 1) * (subdivisions + 1) + y * (subdivisions + 1) + z;
    for (let x = 0; x <= subdivisions; x += 1) {
      for (let y = 0; y <= subdivisions; y += 1) {
        for (let z = 0; z <= subdivisions; z += 1) {
          const position = new Vec3(
            center.x + halfExtents.x * (-1 + (2 * x) / subdivisions),
            center.y + halfExtents.y * (-1 + (2 * y) / subdivisions),
            center.z + halfExtents.z * (-1 + (2 * z) / subdivisions),
          );
          points.push({ position, previous: position.clone(), inverseMass });
        }
      }
    }
    const constraints: SoftConstraint[] = [];
    for (let x = 0; x <= subdivisions; x += 1) {
      for (let y = 0; y <= subdivisions; y += 1) {
        for (let z = 0; z <= subdivisions; z += 1) {
          for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            if (nx > subdivisions || ny > subdivisions || nz > subdivisions) continue;
            const a = index(x, y, z);
            const b = index(nx, ny, nz);
            constraints.push({ a, b, restLength: points[a]!.position.distanceTo(points[b]!.position), stiffness: 1 });
          }
        }
      }
    }
    for (let x = 0; x <= subdivisions; x += 1) {
      for (let y = 0; y <= subdivisions; y += 1) {
        for (let z = 0; z <= subdivisions; z += 1) {
          if (x < subdivisions && y < subdivisions && z < subdivisions) {
            const a = index(x, y, z);
            const b = index(x + 1, y + 1, z + 1);
            constraints.push({ a, b, restLength: points[a]!.position.distanceTo(points[b]!.position), stiffness: 0.4 });
          }
        }
      }
    }
    return new SoftBody(points, constraints);
  }

  step(dt: number, gravity = new Vec3(0, -9.81, 0), iterations = 4): void {
    for (const point of this.points) {
      if (point.inverseMass === 0) continue;
      const velocity = point.position.clone().sub(point.previous).scale(this.damping);
      point.previous = point.position.clone();
      point.position = point.position.clone().add(velocity).add(gravity.clone().scale(dt * dt));
    }
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const constraint of this.constraints) {
        const a = this.points[constraint.a]!;
        const b = this.points[constraint.b]!;
        const delta = b.position.clone().sub(a.position);
        const length = delta.length();
        if (length < 1e-9) continue;
        const difference = ((length - constraint.restLength) / length) * constraint.stiffness;
        const correction = delta.scale(difference);
        const totalInverseMass = a.inverseMass + b.inverseMass;
        if (totalInverseMass === 0) continue;
        a.position.add(correction.clone().scale(a.inverseMass / totalInverseMass));
        b.position.sub(correction.clone().scale(b.inverseMass / totalInverseMass));
      }
    }
  }

  pin(index: number): void {
    const point = this.points[index];
    if (point) point.inverseMass = 0;
  }

  center(): Vec3 {
    const sum = new Vec3(0, 0, 0);
    for (const point of this.points) sum.add(point.position);
    return sum.scale(1 / Math.max(this.points.length, 1));
  }

  volume(): number {
    let volume = 0;
    for (const constraint of this.constraints) {
      volume += this.points[constraint.a]!.position.distanceTo(this.points[constraint.b]!.position);
    }
    return volume;
  }
}
