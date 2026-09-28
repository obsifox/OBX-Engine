import { Mat4, Vec2 } from "@obx/math";

export class Camera2D {
  position = new Vec2(0, 0);
  rotation = 0;
  zoom = 1;
  viewportWidth = 1280;
  viewportHeight = 720;

  constructor(options: {
    position?: Vec2;
    rotation?: number;
    zoom?: number;
    viewportWidth?: number;
    viewportHeight?: number;
  } = {}) {
    if (options.position) this.position.copy(options.position);
    this.rotation = options.rotation ?? 0;
    this.zoom = options.zoom ?? 1;
    this.viewportWidth = options.viewportWidth ?? this.viewportWidth;
    this.viewportHeight = options.viewportHeight ?? this.viewportHeight;
  }

  worldToScreen(point: Vec2, out = new Vec2()): Vec2 {
    out.copy(point).sub(this.position).scale(this.zoom).rotate(-this.rotation);
    out.x += this.viewportWidth / 2;
    out.y += this.viewportHeight / 2;
    return out;
  }

  screenToWorld(point: Vec2, out = new Vec2()): Vec2 {
    out.set(point.x - this.viewportWidth / 2, point.y - this.viewportHeight / 2);
    out.rotate(this.rotation);
    if (Math.abs(this.zoom) > 1e-12) {
      out.x /= this.zoom;
      out.y /= this.zoom;
    }
    return out.add(this.position);
  }

  viewMatrix(out = new Mat4()): Mat4 {
    const c = Math.cos(-this.rotation);
    const s = Math.sin(-this.rotation);
    const z = this.zoom;
    const e = out.elements;
    e.fill(0);
    e[0] = c * z;
    e[1] = s * z;
    e[4] = -s * z;
    e[5] = c * z;
    e[10] = 1;
    e[12] = -this.position.x * c * z + this.position.y * s * z + this.viewportWidth / 2;
    e[13] = -this.position.x * s * z - this.position.y * c * z + this.viewportHeight / 2;
    e[15] = 1;
    return out;
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }
}
