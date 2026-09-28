import { Quat } from "./quat.js";
import { Vec3 } from "./vec3.js";

export class Mat4 {
  readonly elements: Float64Array;

  constructor(elements?: Iterable<number>) {
    this.elements = elements
      ? Float64Array.from(elements)
      : Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    if (this.elements.length !== 16) {
      throw new RangeError("Mat4 requires 16 elements");
    }
  }

  static identity(): Mat4 {
    return new Mat4();
  }

  static fromTranslation(x: number, y: number, z: number): Mat4 {
    return new Mat4().setTranslation(x, y, z);
  }

  static fromScale(x: number, y: number, z: number): Mat4 {
    return new Mat4().setScale(x, y, z);
  }

  static multiply(a: Mat4, b: Mat4, out = new Mat4()): Mat4 {
    const ae = a.elements;
    const be = b.elements;
    const oe = new Float64Array(16);
    for (let col = 0; col < 4; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        let sum = 0;
        for (let k = 0; k < 4; k += 1) {
          sum += ae[k * 4 + row]! * be[col * 4 + k]!;
        }
        oe[col * 4 + row] = sum;
      }
    }
    out.elements.set(oe);
    return out;
  }

  static orthographic(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
  ): Mat4 {
    const m = new Mat4();
    const e = m.elements;
    e.fill(0);
    e[0] = 2 / (right - left);
    e[5] = 2 / (top - bottom);
    e[10] = -2 / (far - near);
    e[12] = -(right + left) / (right - left);
    e[13] = -(top + bottom) / (top - bottom);
    e[14] = -(far + near) / (far - near);
    e[15] = 1;
    return m;
  }

  static perspective(fovYRadians: number, aspect: number, near: number, far: number): Mat4 {
    const m = new Mat4();
    const e = m.elements;
    e.fill(0);
    const f = 1 / Math.tan(fovYRadians / 2);
    e[0] = f / aspect;
    e[5] = f;
    e[10] = (far + near) / (near - far);
    e[11] = -1;
    e[14] = (2 * far * near) / (near - far);
    return m;
  }

  static lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const z = eye.clone().sub(target);
    if (z.lengthSq() < 1e-12) z.set(0, 0, 1);
    z.normalize();
    const x = up.clone().cross(z);
    if (x.lengthSq() < 1e-12) x.set(1, 0, 0);
    x.normalize();
    const y = z.clone().cross(x);
    const m = new Mat4();
    const e = m.elements;
    e[0] = x.x;
    e[1] = y.x;
    e[2] = z.x;
    e[3] = 0;
    e[4] = x.y;
    e[5] = y.y;
    e[6] = z.y;
    e[7] = 0;
    e[8] = x.z;
    e[9] = y.z;
    e[10] = z.z;
    e[11] = 0;
    e[12] = -x.dot(eye);
    e[13] = -y.dot(eye);
    e[14] = -z.dot(eye);
    e[15] = 1;
    return m;
  }

  clone(): Mat4 {
    return new Mat4(this.elements);
  }

  copy(m: Mat4): this {
    this.elements.set(m.elements);
    return this;
  }

  setIdentity(): this {
    this.elements.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return this;
  }

  setTranslation(x: number, y: number, z: number): this {
    this.setIdentity();
    this.elements[12] = x;
    this.elements[13] = y;
    this.elements[14] = z;
    return this;
  }

  setScale(x: number, y: number, z: number): this {
    this.setIdentity();
    this.elements[0] = x;
    this.elements[5] = y;
    this.elements[10] = z;
    return this;
  }

  multiply(m: Mat4): this {
    Mat4.multiply(this, m, this);
    return this;
  }

  premultiply(m: Mat4): this {
    Mat4.multiply(m, this, this);
    return this;
  }

  invert(): this {
    const e = this.elements;
    const a00 = e[0]!, a01 = e[1]!, a02 = e[2]!, a03 = e[3]!;
    const a10 = e[4]!, a11 = e[5]!, a12 = e[6]!, a13 = e[7]!;
    const a20 = e[8]!, a21 = e[9]!, a22 = e[10]!, a23 = e[11]!;
    const a30 = e[12]!, a31 = e[13]!, a32 = e[14]!, a33 = e[15]!;

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-12) {
      throw new RangeError("Mat4 is not invertible");
    }
    const inv = 1 / det;

    e[0] = (a11 * b11 - a12 * b10 + a13 * b09) * inv;
    e[1] = (a02 * b10 - a01 * b11 - a03 * b09) * inv;
    e[2] = (a31 * b05 - a32 * b04 + a33 * b03) * inv;
    e[3] = (a22 * b04 - a21 * b05 - a23 * b03) * inv;
    e[4] = (a12 * b08 - a10 * b11 - a13 * b07) * inv;
    e[5] = (a00 * b11 - a02 * b08 + a03 * b07) * inv;
    e[6] = (a32 * b02 - a30 * b05 - a33 * b01) * inv;
    e[7] = (a20 * b05 - a22 * b02 + a23 * b01) * inv;
    e[8] = (a10 * b10 - a11 * b08 + a13 * b06) * inv;
    e[9] = (a01 * b08 - a00 * b10 - a03 * b06) * inv;
    e[10] = (a30 * b04 - a31 * b02 + a33 * b00) * inv;
    e[11] = (a21 * b02 - a20 * b04 - a23 * b00) * inv;
    e[12] = (a11 * b07 - a10 * b09 - a12 * b06) * inv;
    e[13] = (a00 * b09 - a01 * b07 + a02 * b06) * inv;
    e[14] = (a31 * b01 - a30 * b03 - a32 * b00) * inv;
    e[15] = (a20 * b03 - a21 * b01 + a22 * b00) * inv;
    return this;
  }

  transpose(): this {
    const e = this.elements;
    const out = new Float64Array(16);
    for (let col = 0; col < 4; col += 1) {
      for (let row = 0; row < 4; row += 1) {
        out[row * 4 + col] = e[col * 4 + row]!;
      }
    }
    this.elements.set(out);
    return this;
  }

  compose(position: Vec3, rotation: Quat, scale: Vec3): this {
    const { x, y, z, w } = rotation;
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;
    const sx = scale.x;
    const sy = scale.y;
    const sz = scale.z;
    const e = this.elements;
    e[0] = (1 - (yy + zz)) * sx;
    e[1] = (xy + wz) * sx;
    e[2] = (xz - wy) * sx;
    e[3] = 0;
    e[4] = (xy - wz) * sy;
    e[5] = (1 - (xx + zz)) * sy;
    e[6] = (yz + wx) * sy;
    e[7] = 0;
    e[8] = (xz + wy) * sz;
    e[9] = (yz - wx) * sz;
    e[10] = (1 - (xx + yy)) * sz;
    e[11] = 0;
    e[12] = position.x;
    e[13] = position.y;
    e[14] = position.z;
    e[15] = 1;
    return this;
  }

  transformPoint(v: Vec3, out = new Vec3()): Vec3 {
    const e = this.elements;
    const x = v.x;
    const y = v.y;
    const z = v.z;
    const w = e[3]! * x + e[7]! * y + e[11]! * z + e[15]!;
    const invW = w === 0 ? 1 : 1 / w;
    return out.set(
      (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * invW,
      (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * invW,
      (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * invW,
    );
  }

  transformDirection(v: Vec3, out = new Vec3()): Vec3 {
    const e = this.elements;
    return out.set(
      e[0]! * v.x + e[4]! * v.y + e[8]! * v.z,
      e[1]! * v.x + e[5]! * v.y + e[9]! * v.z,
      e[2]! * v.x + e[6]! * v.y + e[10]! * v.z,
    );
  }

  getTranslation(out = new Vec3()): Vec3 {
    return out.set(this.elements[12]!, this.elements[13]!, this.elements[14]!);
  }

  equals(m: Mat4, epsilon = 1e-9): boolean {
    for (let i = 0; i < 16; i += 1) {
      if (Math.abs(this.elements[i]! - m.elements[i]!) > epsilon) return false;
    }
    return true;
  }
}
