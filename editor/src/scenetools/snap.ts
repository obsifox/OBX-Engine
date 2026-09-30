import { type EditorNode, type Vec2 } from "../core/model.js";

export interface SnapSettingsExt {
  gridEnabled: boolean;
  gridSize: number;
  vertexEnabled: boolean;
  vertexRadius: number;
}

export class SnapService {
  settings: SnapSettingsExt = { gridEnabled: true, gridSize: 0.5, vertexEnabled: true, vertexRadius: 0.35 };

  snapToGrid(value: number): number {
    const step = this.settings.gridSize;
    return Math.round(value / step) * step;
  }

  snapPoint(point: Vec2): Vec2 {
    return { x: this.snapToGrid(point.x), y: this.snapToGrid(point.y) };
  }

  snapToPoints(point: Vec2, candidates: Vec2[]): Vec2 | null {
    if (!this.settings.vertexEnabled) return null;
    let best: Vec2 | null = null;
    let bestDistance = this.settings.vertexRadius;
    for (const candidate of candidates) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = { ...candidate };
      }
    }
    return best;
  }

  resolve(point: Vec2, candidates: Vec2[] = []): Vec2 {
    return this.snapToPoints(point, candidates) ?? (this.settings.gridEnabled ? this.snapPoint(point) : { ...point });
  }

  collectPoints(nodes: EditorNode[]): Vec2[] {
    return nodes.map((node) => ({ x: node.transform.position.x, y: node.transform.position.y }));
  }
}

