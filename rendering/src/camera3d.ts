import { Mat4, Quat, Vec3, type AABB } from "@obx/math";

export type Plane4 = [number, number, number, number];

export class Camera3D {
  position = new Vec3(0, 0, 5);
  rotation = Quat.identity();
  fovY = Math.PI / 3;
  near = 0.1;
  far = 100;
  aspect = 16 / 9;

  constructor(options: {
    position?: Vec3;
    rotation?: Quat;
    fovY?: number;
    near?: number;
    far?: number;
    aspect?: number;
  } = {}) {
    if (options.position) this.position.copy(options.position);
    if (options.rotation) this.rotation.copy(options.rotation);
    this.fovY = options.fovY ?? this.fovY;
    this.near = options.near ?? this.near;
    this.far = options.far ?? this.far;
    this.aspect = options.aspect ?? this.aspect;
  }

  setLookAt(eye: Vec3, target: Vec3, up = new Vec3(0, 1, 0)): this {
    this.position.copy(eye);
    const z = eye.clone().sub(target);
    if (z.lengthSq() < 1e-12) z.set(0, 0, 1);
    z.normalize();
    const x = up.clone().cross(z);
    if (x.lengthSq() < 1e-12) x.set(1, 0, 0);
    x.normalize();
    const y = z.clone().cross(x);

    const cameraToWorld = new Mat4();
    const e = cameraToWorld.elements;
    e[0] = x.x;
    e[1] = x.y;
    e[2] = x.z;
    e[4] = y.x;
    e[5] = y.y;
    e[6] = y.z;
    e[8] = z.x;
    e[9] = z.y;
    e[10] = z.z;

    const m00 = e[0]!;
    const m01 = e[4]!;
    const m02 = e[8]!;
    const m10 = e[1]!;
    const m11 = e[5]!;
    const m12 = e[9]!;
    const m20 = e[2]!;
    const m21 = e[6]!;
    const m22 = e[10]!;
    const trace = m00 + m11 + m22;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      this.rotation
        .set((m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4)
        .normalize();
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      this.rotation
        .set(s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s)
        .normalize();
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      this.rotation
        .set((m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s)
        .normalize();
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      this.rotation
        .set((m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s)
        .normalize();
    }
    return this;
  }

  forward(out = new Vec3()): Vec3 {
    return this.rotation.rotateVec3(new Vec3(0, 0, -1), out);
  }

  viewMatrix(out = new Mat4()): Mat4 {
    const rotation = new Mat4().compose(new Vec3(0, 0, 0), this.rotation, new Vec3(1, 1, 1));
    const inverseRotation = rotation.invert();
    const translation = Mat4.fromTranslation(-this.position.x, -this.position.y, -this.position.z);
    return Mat4.multiply(inverseRotation, translation, out);
  }

  projectionMatrix(out = new Mat4()): Mat4 {
    return out.copy(Mat4.perspective(this.fovY, this.aspect, this.near, this.far));
  }

  viewProjectionMatrix(out = new Mat4()): Mat4 {
    const view = this.viewMatrix();
    const projection = this.projectionMatrix();
    return Mat4.multiply(projection, view, out);
  }

  worldToScreen(point: Vec3): { x: number; y: number; depth: number } {
    const view = this.viewMatrix().transformPoint(point);
    const projected = this.projectionMatrix().transformPoint(view);
    return {
      x: (projected.x + 1) / 2,
      y: (1 - projected.y) / 2,
      depth: projected.z,
    };
  }

  frustumPlanes(): Plane4[] {
    const m = this.viewProjectionMatrix().elements;
    const rows: Plane4[] = [
      [m[0]! + m[3]!, m[4]! + m[7]!, m[8]! + m[11]!, m[12]! + m[15]!],
      [-m[0]! + m[3]!, -m[4]! + m[7]!, -m[8]! + m[11]!, -m[12]! + m[15]!],
      [m[1]! + m[3]!, m[5]! + m[7]!, m[9]! + m[11]!, m[13]! + m[15]!],
      [-m[1]! + m[3]!, -m[5]! + m[7]!, -m[9]! + m[11]!, -m[13]! + m[15]!],
      [m[2]! + m[3]!, m[6]! + m[7]!, m[10]! + m[11]!, m[14]! + m[15]!],
      [-m[2]! + m[3]!, -m[6]! + m[7]!, -m[10]! + m[11]!, -m[14]! + m[15]!],
    ];
    return rows.map(([a, b, c, d]) => {
      const length = Math.hypot(a, b, c) || 1;
      return [a / length, b / length, c / length, d / length] as Plane4;
    });
  }
}

export function aabbVisible(planes: readonly Plane4[], box: AABB): boolean {
  for (const [a, b, c, d] of planes) {
    const px = a! >= 0 ? box.max.x : box.min.x;
    const py = b! >= 0 ? box.max.y : box.min.y;
    const pz = c! >= 0 ? box.max.z : box.min.z;
    if (a! * px + b! * py + c! * pz + d! < 0) {
      return false;
    }
  }
  return true;
}
