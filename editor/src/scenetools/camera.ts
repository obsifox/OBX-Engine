import { type EditorNode, type Vec2 } from "../core/model.js";
import { Viewport } from "../core/viewport.js";

export interface CameraFrame {
  min: Vec2;
  max: Vec2;
}

export class CameraController {
  constructor(readonly viewport: Viewport) {}

  navigateTo(x: number, y: number, zoom = 1): void {
    this.viewport.camera.x = x;
    this.viewport.camera.y = y;
    this.viewport.camera.zoom = Math.min(8, Math.max(0.1, zoom));
  }

  frameNodes(nodes: EditorNode[], padding = 1.4): void {
    if (nodes.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.transform.position.x);
      minY = Math.min(minY, node.transform.position.y);
      maxX = Math.max(maxX, node.transform.position.x);
      maxY = Math.max(maxY, node.transform.position.y);
    }
    this.viewport.frame({ min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }, padding);
  }

  flyTo(node: EditorNode, zoom = 2): void {
    this.navigateTo(node.transform.position.x, node.transform.position.y, zoom);
  }
}

