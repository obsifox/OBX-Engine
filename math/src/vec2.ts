export class Vec2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  static zero(): Vec2 {
    return new Vec2(0, 0);
  }

  static one(): Vec2 {
    return new Vec2(1, 1);
  }

  static fromAngle(radians: number, length = 1): Vec2 {
    return new Vec2(Math.cos(radians) * length, Math.sin(radians) * length);
  }

  static fromArray(array: readonly number[], offset = 0): Vec2 {
    return new Vec2(array[offset] ?? 0, array[offset + 1] ?? 0);
  }

  static distance(a: Vec2, b: Vec2): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  static distanceSq(a: Vec2, b: Vec2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return dx * dx + dy * dy;
  }

  static lerp(a: Vec2, b: Vec2, t: number, out = new Vec2()): Vec2 {
    return out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  copy(v: Vec2): this {
    return this.set(v.x, v.y);
  }

  add(v: Vec2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v: Vec2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  mul(v: Vec2): this {
    this.x *= v.x;
    this.y *= v.y;
    return this;
  }

  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y;
  }

  cross(v: Vec2): number {
    return this.x * v.y - this.y * v.x;
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): this {
    const len = this.length();
    if (len > 1e-12) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  distanceTo(v: Vec2): number {
    return Math.hypot(v.x - this.x, v.y - this.y);
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  rotate(radians: number): this {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    const { x, y } = this;
    this.x = x * c - y * s;
    this.y = x * s + y * c;
    return this;
  }

  lerp(v: Vec2, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }

  negate(): this {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }

  equals(v: Vec2, epsilon = 1e-9): boolean {
    return Math.abs(v.x - this.x) <= epsilon && Math.abs(v.y - this.y) <= epsilon;
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }

  toString(): string {
    return `Vec2(${this.x}, ${this.y})`;
  }
}
