import { type Vec2 } from "../core/model.js";

export interface ViewportCamera {
  x: number;
  y: number;
  zoom: number;
}

export class Viewport {
  camera: ViewportCamera = { x: 0, y: 0, zoom: 1 };

  worldToScreen(point: Vec2): Vec2 {
    return {
      x: (point.x - this.camera.x) * this.camera.zoom,
      y: (point.y - this.camera.y) * this.camera.zoom,
    };
  }

  screenToWorld(point: Vec2): Vec2 {
    return {
      x: point.x / this.camera.zoom + this.camera.x,
      y: point.y / this.camera.zoom + this.camera.y,
    };
  }

  pan(dx: number, dy: number): void {
    this.camera.x += dx / this.camera.zoom;
    this.camera.y += dy / this.camera.zoom;
  }

  zoomAt(point: Vec2, factor: number): void {
    const before = this.screenToWorld(point);
    this.camera.zoom = Math.min(8, Math.max(0.1, this.camera.zoom * factor));
    const after = this.screenToWorld(point);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
  }

  frame(bounds: { min: Vec2; max: Vec2 }, padding = 1): void {
    const width = Math.max(0.01, bounds.max.x - bounds.min.x);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    this.camera.zoom = Math.min(8, Math.max(0.1, 200 / Math.max(width, height) / padding));
    this.camera.x = (bounds.min.x + bounds.max.x) / 2;
    this.camera.y = (bounds.min.y + bounds.max.y) / 2;
  }
}

