import { type EditorNode, type Vec2 } from "../core/model.js";

export type GizmoSpace = "world" | "local";

export type GizmoHandle =
  | "none"
  | "translate-x"
  | "translate-y"
  | "translate-z"
  | "translate-xy"
  | "rotate-x"
  | "rotate-y"
  | "rotate-z"
  | "scale-x"
  | "scale-y"
  | "scale-z"
  | "scale-uniform";

export interface GizmoGeometry {
  handle: GizmoHandle;
  start: Vec2;
  end: Vec2;
  width: number;
}

export interface GizmoOptions {
  space: GizmoSpace;
  origin: Vec2;
  size: number;
  mode: "translate" | "rotate" | "scale";
}

export class TransformGizmo {
  space: GizmoSpace = "world";
  size = 48;
  activeHandle: GizmoHandle = "none";
  private dragStart: Vec2 | null = null;
  private dragDelta: Vec2 = { x: 0, y: 0 };

  geometry(options: Omit<GizmoOptions, "space" | "size">): GizmoGeometry[] {
    const { origin, mode } = options;
    const size = this.size;
    const handles: GizmoHandle[] =
      mode === "translate"
        ? ["translate-x", "translate-y", "translate-z"]
        : mode === "rotate"
          ? ["rotate-x", "rotate-y", "rotate-z"]
          : ["scale-x", "scale-y", "scale-z", "scale-uniform"];
    return handles.map((handle) => {
      const diagonal = handle.endsWith("-z") || handle === "rotate-y";
      const vertical = handle.endsWith("-y") || handle === "rotate-x";
      const end: Vec2 = diagonal
        ? { x: origin.x + size * 0.7, y: origin.y + size * 0.7 }
        : vertical
          ? { x: origin.x, y: origin.y - size }
          : { x: origin.x + size, y: origin.y };
      return { handle, start: { ...origin }, end, width: handle === "scale-uniform" ? 8 : 4 };
    });
  }

  hitTest(point: Vec2, geometry: GizmoGeometry[], threshold = 6): GizmoHandle {
    let best: GizmoHandle = "none";
    let bestDistance = threshold;
    for (const entry of geometry) {
      const distance = distanceToSegment(point, entry.start, entry.end);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = entry.handle;
      }
    }
    return best;
  }

  beginDrag(handle: GizmoHandle, point: Vec2): void {
    this.activeHandle = handle;
    this.dragStart = { ...point };
    this.dragDelta = { x: 0, y: 0 };
  }

  drag(point: Vec2): Vec2 {
    if (!this.dragStart) return { x: 0, y: 0 };
    this.dragDelta = { x: point.x - this.dragStart.x, y: point.y - this.dragStart.y };
    return this.dragDelta;
  }

  endDrag(): Vec2 {
    const delta = this.dragDelta;
    this.activeHandle = "none";
    this.dragStart = null;
    this.dragDelta = { x: 0, y: 0 };
    return delta;
  }

  applyTo(nodes: EditorNode[], screenDelta: Vec2, zoom = 1): void {
    for (const node of nodes) {
      const angle = this.space === "local" ? (node.transform.rotation.z * Math.PI) / 180 : 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const worldX = screenDelta.x / zoom;
      const worldY = screenDelta.y / zoom;
      let localX = 0;
      let localY = 0;
      if (this.activeHandle === "translate-x") {
        localX = worldX;
      } else if (this.activeHandle === "translate-y") {
        localY = worldY;
      } else if (this.activeHandle === "translate-xy") {
        localX = worldX;
        localY = worldY;
      }
      if (this.activeHandle.startsWith("translate") && this.activeHandle !== "translate-z") {
        node.transform.position.x += localX * cos - localY * sin;
        node.transform.position.y += localX * sin + localY * cos;
      }
      if (this.activeHandle === "translate-z") node.transform.position.z += worldX;
      if (this.activeHandle === "rotate-x") node.transform.rotation.x += screenDelta.x;
      if (this.activeHandle === "rotate-y" || this.activeHandle === "rotate-z") {
        node.transform.rotation.z += screenDelta.x;
      }
      if (this.activeHandle === "scale-x") {
        node.transform.scale.x = Math.max(0.01, node.transform.scale.x + worldX * 0.01);
      }
      if (this.activeHandle === "scale-y") {
        node.transform.scale.y = Math.max(0.01, node.transform.scale.y + worldY * 0.01);
      }
      if (this.activeHandle === "scale-z" || this.activeHandle === "scale-uniform") {
        const factor = Math.max(0.01, 1 + screenDelta.x * 0.01);
        node.transform.scale.x *= factor;
        node.transform.scale.y *= factor;
        node.transform.scale.z *= factor;
      }
    }
  }
}

function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}
