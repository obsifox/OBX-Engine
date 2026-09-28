import { Vec3 } from "./vec3.js";

export class AABB {
  constructor(
    public min = new Vec3(Infinity, Infinity, Infinity),
    public max = new Vec3(-Infinity, -Infinity, -Infinity),
  ) {}

  static fromCenterSize(center: Vec3, size: Vec3): AABB {
    const half = size.clone().scale(0.5);
    return new AABB(center.clone().sub(half), center.clone().add(half));
  }

  static fromPoints(points: readonly Vec3[]): AABB {
    const box = new AABB();
    for (const p of points) box.expandByPoint(p);
    return box;
  }

  clone(): AABB {
    return new AABB(this.min.clone(), this.max.clone());
  }

  center(out = new Vec3()): Vec3 {
    return Vec3.lerp(this.min, this.max, 0.5, out);
  }

  size(out = new Vec3()): Vec3 {
    return out.set(this.max.x - this.min.x, this.max.y - this.min.y, this.max.z - this.min.z);
  }

  expandByPoint(p: Vec3): this {
    this.min.set(Math.min(this.min.x, p.x), Math.min(this.min.y, p.y), Math.min(this.min.z, p.z));
    this.max.set(Math.max(this.max.x, p.x), Math.max(this.max.y, p.y), Math.max(this.max.z, p.z));
    return this;
  }

  union(other: AABB): this {
    this.expandByPoint(other.min);
    this.expandByPoint(other.max);
    return this;
  }

  containsPoint(p: Vec3): boolean {
    return (
      p.x >= this.min.x && p.x <= this.max.x &&
      p.y >= this.min.y && p.y <= this.max.y &&
      p.z >= this.min.z && p.z <= this.max.z
    );
  }

  containsBox(other: AABB): boolean {
    return (
      other.min.x >= this.min.x && other.max.x <= this.max.x &&
      other.min.y >= this.min.y && other.max.y <= this.max.y &&
      other.min.z >= this.min.z && other.max.z <= this.max.z
    );
  }

  intersects(other: AABB): boolean {
    return (
      this.min.x <= other.max.x && this.max.x >= other.min.x &&
      this.min.y <= other.max.y && this.max.y >= other.min.y &&
      this.min.z <= other.max.z && this.max.z >= other.min.z
    );
  }

  intersectsSphere(sphere: Sphere): boolean {
    const x = Math.max(this.min.x, Math.min(sphere.center.x, this.max.x));
    const y = Math.max(this.min.y, Math.min(sphere.center.y, this.max.y));
    const z = Math.max(this.min.z, Math.min(sphere.center.z, this.max.z));
    const dx = x - sphere.center.x;
    const dy = y - sphere.center.y;
    const dz = z - sphere.center.z;
    return dx * dx + dy * dy + dz * dz <= sphere.radius * sphere.radius;
  }
}

export class Sphere {
  constructor(
    public center = new Vec3(0, 0, 0),
    public radius = 0,
  ) {}

  clone(): Sphere {
    return new Sphere(this.center.clone(), this.radius);
  }

  containsPoint(p: Vec3): boolean {
    return this.center.distanceTo(p) <= this.radius;
  }

  intersects(other: Sphere): boolean {
    const r = this.radius + other.radius;
    return Vec3.distanceSq(this.center, other.center) <= r * r;
  }

  intersectsBox(box: AABB): boolean {
    return box.intersectsSphere(this);
  }

  expandByPoint(p: Vec3): this {
    const d = this.center.distanceTo(p);
    if (d > this.radius) {
      const newRadius = (this.radius + d) / 2;
      const move = newRadius - this.radius;
      if (d > 1e-12) {
        this.center.lerp(p, move / d);
      }
      this.radius = newRadius;
    }
    return this;
  }
}
