import { Mat4 } from "./mat4.js";
import { Vec2 } from "./vec2.js";

export class Transform2D {
  constructor(
    public position = new Vec2(0, 0),
    public rotation = 0,
    public scale = new Vec2(1, 1),
  ) {}

  static lerp(a: Transform2D, b: Transform2D, t: number, out = new Transform2D()): Transform2D {
    Vec2.lerp(a.position, b.position, t, out.position);
    Vec2.lerp(a.scale, b.scale, t, out.scale);
    let delta = b.rotation - a.rotation;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    out.rotation = a.rotation + delta * t;
    return out;
  }

  set(position: Vec2, rotation: number, scale: Vec2): this {
    this.position.copy(position);
    this.rotation = rotation;
    this.scale.copy(scale);
    return this;
  }

  clone(): Transform2D {
    return new Transform2D(this.position.clone(), this.rotation, this.scale.clone());
  }

  copy(t: Transform2D): this {
    return this.set(t.position, t.rotation, t.scale);
  }

  applyPoint(p: Vec2, out = new Vec2()): Vec2 {
    out.set(p.x * this.scale.x, p.y * this.scale.y).rotate(this.rotation).add(this.position);
    return out;
  }

  applyDirection(d: Vec2, out = new Vec2()): Vec2 {
    out.set(d.x * this.scale.x, d.y * this.scale.y).rotate(this.rotation);
    return out;
  }

  combineWith(parent: Transform2D, out = new Transform2D()): Transform2D {
    out.scale.set(parent.scale.x * this.scale.x, parent.scale.y * this.scale.y);
    out.rotation = parent.rotation + this.rotation;
    out.position
      .set(this.position.x * parent.scale.x, this.position.y * parent.scale.y)
      .rotate(parent.rotation)
      .add(parent.position);
    return out;
  }

  inverseApplyPoint(p: Vec2, out = new Vec2()): Vec2 {
    out.copy(p).sub(this.position).rotate(-this.rotation);
    if (Math.abs(this.scale.x) > 1e-12) out.x /= this.scale.x;
    if (Math.abs(this.scale.y) > 1e-12) out.y /= this.scale.y;
    return out;
  }

  toMat4(out = new Mat4()): Mat4 {
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    const e = out.elements;
    e.fill(0);
    e[0] = c * this.scale.x;
    e[1] = s * this.scale.x;
    e[4] = -s * this.scale.y;
    e[5] = c * this.scale.y;
    e[10] = 1;
    e[12] = this.position.x;
    e[13] = this.position.y;
    e[15] = 1;
    return out;
  }

  equals(t: Transform2D, epsilon = 1e-9): boolean {
    return (
      this.position.equals(t.position, epsilon) &&
      Math.abs(this.rotation - t.rotation) <= epsilon &&
      this.scale.equals(t.scale, epsilon)
    );
  }
}
