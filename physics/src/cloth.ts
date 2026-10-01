import { Vec3 } from "@obx/math";

export interface ClothConstraint {
  a: number;
  b: number;
  restLength: number;
}

export class Cloth {
  width: number;
  height: number;
  positions: Vec3[];
  previous: Vec3[];
  pinned: Set<number> = new Set();
  constraints: ClothConstraint[] = [];
  damping = 0.98;

  constructor(width: number, height: number, spacing: number, origin = new Vec3(0, 0, 0)) {
    this.width = width;
    this.height = height;
    this.positions = [];
    this.previous = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const position = new Vec3(origin.x + x * spacing, origin.y, origin.z + y * spacing);
        this.positions.push(position);
        this.previous.push(position.clone());
      }
    }
    const at = (x: number, y: number): number => y * width + x;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x + 1 < width) this.constraints.push({ a: at(x, y), b: at(x + 1, y), restLength: spacing });
        if (y + 1 < height) this.constraints.push({ a: at(x, y), b: at(x, y + 1), restLength: spacing });
        if (x + 1 < width && y + 1 < height) {
          this.constraints.push({ a: at(x, y), b: at(x + 1, y + 1), restLength: spacing * Math.SQRT2 });
          this.constraints.push({ a: at(x + 1, y), b: at(x, y + 1), restLength: spacing * Math.SQRT2 });
        }
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x + 2 < width) this.constraints.push({ a: at(x, y), b: at(x + 2, y), restLength: spacing * 2 });
        if (y + 2 < height) this.constraints.push({ a: at(x, y), b: at(x, y + 2), restLength: spacing * 2 });
      }
    }
  }

  pin(index: number): void {
    this.pinned.add(index);
  }

  pinRow(y: number): void {
    for (let x = 0; x < this.width; x += 1) this.pin(y * this.width + x);
  }

  step(dt: number, wind = new Vec3(0, 0, 0), gravity = new Vec3(0, -9.81, 0), iterations = 3): void {
    for (let i = 0; i < this.positions.length; i += 1) {
      if (this.pinned.has(i)) continue;
      const position = this.positions[i]!;
      const previous = this.previous[i]!;
      const velocity = position.clone().sub(previous).scale(this.damping);
      this.previous[i] = position.clone();
      this.positions[i] = position.clone().add(velocity).add(gravity.clone().add(wind).scale(dt * dt));
    }
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const constraint of this.constraints) {
        const a = this.positions[constraint.a]!;
        const b = this.positions[constraint.b]!;
        const delta = b.clone().sub(a);
        const length = delta.length();
        if (length < 1e-9) continue;
        const difference = delta.scale((length - constraint.restLength) / length * 0.5);
        const aPinned = this.pinned.has(constraint.a);
        const bPinned = this.pinned.has(constraint.b);
        if (!aPinned && !bPinned) {
          this.positions[constraint.a] = a.clone().add(difference);
          this.positions[constraint.b] = b.clone().sub(difference);
        } else if (!aPinned) {
          this.positions[constraint.a] = a.clone().add(difference.scale(2));
        } else if (!bPinned) {
          this.positions[constraint.b] = b.clone().sub(difference.scale(2));
        }
      }
    }
  }

  settle(steps: number, wind = new Vec3(0, 0, 0), dt = 1 / 60): void {
    for (let i = 0; i < steps; i += 1) this.step(dt, wind);
  }

  lowestPoint(): Vec3 {
    let lowest = this.positions[0]!;
    for (const position of this.positions) {
      if (position.y < lowest.y) lowest = position;
    }
    return lowest.clone();
  }

  totalEnergy(): number {
    let energy = 0;
    for (let i = 0; i < this.positions.length; i += 1) {
      energy += this.positions[i]!.clone().sub(this.previous[i]!).lengthSq();
    }
    return energy;
  }
}
