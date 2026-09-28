import { Mat4 } from "./mat4.js";
import { Quat } from "./quat.js";
import { Vec3 } from "./vec3.js";

export class Transform3D {
  constructor(
    public position = new Vec3(0, 0, 0),
    public rotation = new Quat(0, 0, 0, 1),
    public scale = new Vec3(1, 1, 1),
  ) {}

  static lerp(a: Transform3D, b: Transform3D, t: number, out = new Transform3D()): Transform3D {
    Vec3.lerp(a.position, b.position, t, out.position);
    Vec3.lerp(a.scale, b.scale, t, out.scale);
    Quat.slerp(a.rotation, b.rotation, t, out.rotation);
    return out;
  }

  set(position: Vec3, rotation: Quat, scale: Vec3): this {
    this.position.copy(position);
    this.rotation.copy(rotation);
    this.scale.copy(scale);
    return this;
  }

  clone(): Transform3D {
    return new Transform3D(this.position.clone(), this.rotation.clone(), this.scale.clone());
  }

  copy(t: Transform3D): this {
    return this.set(t.position, t.rotation, t.scale);
  }

  toMat4(out = new Mat4()): Mat4 {
    return out.compose(this.position, this.rotation, this.scale);
  }

  applyPoint(p: Vec3, out = new Vec3()): Vec3 {
    out.copy(p).mul(this.scale);
    this.rotation.rotateVec3(out, out);
    return out.add(this.position);
  }

  combineWith(parent: Transform3D, out = new Transform3D()): Transform3D {
    out.scale.set(
      parent.scale.x * this.scale.x,
      parent.scale.y * this.scale.y,
      parent.scale.z * this.scale.z,
    );
    Quat.multiply(parent.rotation, this.rotation, out.rotation);
    out.position
      .copy(this.position)
      .mul(parent.scale);
    parent.rotation.rotateVec3(out.position, out.position);
    out.position.add(parent.position);
    return out;
  }

  inverseApplyPoint(p: Vec3, out = new Vec3()): Vec3 {
    out.copy(p).sub(this.position);
    const invRotation = this.rotation.clone().invert();
    invRotation.rotateVec3(out, out);
    if (Math.abs(this.scale.x) > 1e-12) out.x /= this.scale.x;
    if (Math.abs(this.scale.y) > 1e-12) out.y /= this.scale.y;
    if (Math.abs(this.scale.z) > 1e-12) out.z /= this.scale.z;
    return out;
  }

  equals(t: Transform3D, epsilon = 1e-9): boolean {
    return (
      this.position.equals(t.position, epsilon) &&
      this.rotation.equals(t.rotation, epsilon) &&
      this.scale.equals(t.scale, epsilon)
    );
  }
}
