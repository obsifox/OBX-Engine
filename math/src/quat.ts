import { Vec3 } from "./vec3.js";

export class Quat {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}

  static identity(): Quat {
    return new Quat(0, 0, 0, 1);
  }

  static fromAxisAngle(axis: Vec3, radians: number): Quat {
    const half = radians / 2;
    const s = Math.sin(half);
    const n = axis.clone().normalize();
    return new Quat(n.x * s, n.y * s, n.z * s, Math.cos(half));
  }

  static fromEuler(x: number, y: number, z: number): Quat {
    const cx = Math.cos(x / 2);
    const sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2);
    const sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2);
    const sz = Math.sin(z / 2);
    return new Quat(
      sx * cy * cz + cx * sy * sz,
      cx * sy * cz - sx * cy * sz,
      cx * cy * sz + sx * sy * cz,
      cx * cy * cz - sx * sy * sz,
    );
  }

  static multiply(a: Quat, b: Quat, out = new Quat()): Quat {
    return out.set(
      a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    );
  }

  static slerp(a: Quat, b: Quat, t: number, out = new Quat()): Quat {
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    let bw = b.w;
    let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;
    if (dot < 0) {
      dot = -dot;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    if (dot > 0.9995) {
      return out
        .set(
          a.x + (bx - a.x) * t,
          a.y + (by - a.y) * t,
          a.z + (bz - a.z) * t,
          a.w + (bw - a.w) * t,
        )
        .normalize();
    }
    const theta = Math.acos(Math.min(1, Math.max(-1, dot)));
    const sin = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sin;
    const wb = Math.sin(t * theta) / sin;
    return out.set(
      a.x * wa + bx * wb,
      a.y * wa + by * wb,
      a.z * wa + bz * wb,
      a.w * wa + bw * wb,
    );
  }

  set(x: number, y: number, z: number, w: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  clone(): Quat {
    return new Quat(this.x, this.y, this.z, this.w);
  }

  copy(q: Quat): this {
    return this.set(q.x, q.y, q.z, q.w);
  }

  multiply(q: Quat): this {
    Quat.multiply(this, q, this);
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z, this.w);
  }

  normalize(): this {
    const len = this.length();
    if (len > 1e-12) {
      this.x /= len;
      this.y /= len;
      this.z /= len;
      this.w /= len;
    }
    return this;
  }

  conjugate(): this {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
    return this;
  }

  invert(): this {
    return this.conjugate().normalize();
  }

  rotateVec3(v: Vec3, out = new Vec3()): Vec3 {
    const { x, y, z, w } = this;
    const tx = 2 * (y * v.z - z * v.y);
    const ty = 2 * (z * v.x - x * v.z);
    const tz = 2 * (x * v.y - y * v.x);
    return out.set(
      v.x + w * tx + (y * tz - z * ty),
      v.y + w * ty + (z * tx - x * tz),
      v.z + w * tz + (x * ty - y * tx),
    );
  }

  dot(q: Quat): number {
    return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w;
  }

  slerp(to: Quat, t: number): this {
    Quat.slerp(this, to, t, this);
    return this;
  }

  equals(q: Quat, epsilon = 1e-9): boolean {
    const close = (a: number, b: number): boolean => Math.abs(a - b) <= epsilon;
    const same =
      close(q.x, this.x) && close(q.y, this.y) && close(q.z, this.z) && close(q.w, this.w);
    const negated =
      close(q.x, -this.x) && close(q.y, -this.y) && close(q.z, -this.z) && close(q.w, -this.w);
    return same || negated;
  }

  toString(): string {
    return `Quat(${this.x}, ${this.y}, ${this.z}, ${this.w})`;
  }
}
