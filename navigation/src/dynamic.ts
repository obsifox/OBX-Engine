import { NavMesh, NavPoint, NavPolygon, PathEntry, pointInPolygon } from "./navmesh.js";

export interface NavObstacle {
  id: string;
  min: NavPoint;
  max: NavPoint;
}

export interface BlockedPolygon {
  regionId: string;
  polygonId: number;
  cost: number;
}

export class DynamicNavMesh extends NavMesh {
  #obstacles = new Map<string, NavObstacle>();
  #blocked = new Map<number, BlockedPolygon>();
  #version = 0;

  get version(): number {
    return this.#version;
  }

  get obstacleCount(): number {
    return this.#obstacles.size;
  }

  addObstacle(id: string, min: NavPoint, max: NavPoint): NavObstacle {
    const obstacle: NavObstacle = { id, min, max };
    this.#obstacles.set(id, obstacle);
    this.rebuild();
    return obstacle;
  }

  removeObstacle(id: string): boolean {
    const removed = this.#obstacles.delete(id);
    if (removed) this.rebuild();
    return removed;
  }

  rebuild(): void {
    this.#blocked.clear();
    for (const region of this.regions) {
      for (const polygon of region.polygons) {
        for (const obstacle of this.#obstacles.values()) {
          if (polygonOverlapsBox(polygon, obstacle)) {
            this.#blocked.set(polygon.id, { regionId: region.id, polygonId: polygon.id, cost: polygon.cost });
            break;
          }
        }
      }
    }
    this.#version += 1;
    this.invalidate();
  }

  isBlocked(polygonId: number): boolean {
    return this.#blocked.has(polygonId);
  }

  blockedPolygons(): BlockedPolygon[] {
    return [...this.#blocked.values()];
  }

  override findPath(from: NavPoint, to: NavPoint): PathEntry[] {
    for (const region of this.regions) {
      for (const polygon of region.polygons) {
        if (this.#blocked.has(polygon.id)) polygon.cost = Number.POSITIVE_INFINITY;
      }
    }
    const result = super.findPath(from, to);
    for (const region of this.regions) {
      for (const polygon of region.polygons) {
        const saved = this.#blocked.get(polygon.id);
        if (saved) polygon.cost = saved.cost;
      }
    }
    return result;
  }
}

function polygonOverlapsBox(polygon: NavPolygon, obstacle: NavObstacle): boolean {
  const center = {
    x: polygon.vertices.reduce((sum, vertex) => sum + vertex.x, 0) / Math.max(polygon.vertices.length, 1),
    y: 0,
    z: polygon.vertices.reduce((sum, vertex) => sum + vertex.z, 0) / Math.max(polygon.vertices.length, 1),
  };
  if (pointInPolygon({ x: (obstacle.min.x + obstacle.max.x) / 2, y: 0, z: (obstacle.min.z + obstacle.max.z) / 2 }, polygon.vertices)) {
    return true;
  }
  for (const vertex of polygon.vertices) {
    if (vertex.x > obstacle.min.x && vertex.x < obstacle.max.x && vertex.z > obstacle.min.z && vertex.z < obstacle.max.z) {
      return true;
    }
  }
  return center.x > obstacle.min.x && center.x < obstacle.max.x && center.z > obstacle.min.z && center.z < obstacle.max.z;
}
