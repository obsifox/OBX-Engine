export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  static zero(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  static one(): Vec3 {
    return new Vec3(1, 1, 1);
  }

  static fromArray(array: readonly number[], offset = 0): Vec3 {
    return new Vec3(array[offset] ?? 0, array[offset + 1] ?? 0, array[offset + 2] ?? 0);
  }

  static distance(a: Vec3, b: Vec3): number {
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }

  static distanceSq(a: Vec3, b: Vec3): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    return dx * dx + dy * dy + dz * dz;
  }

  static lerp(a: Vec3, b: Vec3, t: number, out = new Vec3()): Vec3 {
    return out.set(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t,
    );
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  copy(v: Vec3): this {
    return this.set(v.x, v.y, v.z);
  }

  add(v: Vec3): this {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v: Vec3): this {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }

  mul(v: Vec3): this {
    this.x *= v.x;
    this.y *= v.y;
    this.z *= v.z;
    return this;
  }

  dot(v: Vec3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Vec3): Vec3 {
    const { x, y, z } = this;
    this.x = y * v.z - z * v.y;
    this.y = z * v.x - x * v.z;
    this.z = x * v.y - y * v.x;
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  distanceTo(v: Vec3): number {
    return Math.hypot(v.x - this.x, v.y - this.y, v.z - this.z);
  }

  normalize(): this {
    const len = this.length();
    if (len > 1e-12) {
      this.x /= len;
      this.y /= len;
      this.z /= len;
    }
    return this;
  }

  lerp(v: Vec3, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }

  negate(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  equals(v: Vec3, epsilon = 1e-9): boolean {
    return (
      Math.abs(v.x - this.x) <= epsilon &&
      Math.abs(v.y - this.y) <= epsilon &&
      Math.abs(v.z - this.z) <= epsilon
    );
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  toString(): string {
    return `Vec3(${this.x}, ${this.y}, ${this.z})`;
  }
}
