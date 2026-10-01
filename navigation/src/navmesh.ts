export interface NavPoint {
  x: number;
  y: number;
  z: number;
}

export interface NavPolygon {
  id: number;
  vertices: NavPoint[];
  cost: number;
}

export interface PathEntry {
  point: NavPoint;
  polygonId: number;
  viaLink: boolean;
}

const EPSILON = 1e-5;

export function navPoint(x: number, y: number, z: number): NavPoint {
  return { x, y, z };
}

export function navDistance(a: NavPoint, b: NavPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function samePoint(a: NavPoint, b: NavPoint): boolean {
  return navDistance(a, b) <= EPSILON;
}

export function centroid(vertices: readonly NavPoint[]): NavPoint {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const vertex of vertices) {
    x += vertex.x;
    y += vertex.y;
    z += vertex.z;
  }
  const n = Math.max(vertices.length, 1);
  return { x: x / n, y: y / n, z: z / n };
}

export function pointInPolygon(point: NavPoint, vertices: readonly NavPoint[]): boolean {
  if (vertices.length < 3) return false;
  let positive = 0;
  let negative = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    const cross = (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
    if (Math.abs(cross) <= EPSILON) continue;
    if (cross > 0) positive += 1;
    else negative += 1;
  }
  return positive === 0 || negative === 0;
}

export function segmentWalkable(from: NavPoint, to: NavPoint, polygons: readonly NavPolygon[]): boolean {
  const distance = navDistance(from, to);
  const steps = Math.max(2, Math.ceil(distance / 0.25));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const sample: NavPoint = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    };
    let covered = false;
    for (const polygon of polygons) {
      if (pointInPolygon(sample, polygon.vertices)) {
        covered = true;
        break;
      }
    }
    if (!covered) return false;
  }
  return true;
}

let nextPolygonId = 0;

export class NavRegion {
  readonly id: string;
  readonly polygons: NavPolygon[] = [];

  constructor(id: string) {
    this.id = id;
  }

  addPolygon(vertices: NavPoint[], cost = 1): NavPolygon {
    const polygon: NavPolygon = { id: nextPolygonId, vertices: [...vertices], cost };
    nextPolygonId += 1;
    this.polygons.push(polygon);
    return polygon;
  }

  removePolygon(id: number): boolean {
    const index = this.polygons.findIndex((polygon) => polygon.id === id);
    if (index < 0) return false;
    this.polygons.splice(index, 1);
    return true;
  }

  polygonAt(point: NavPoint): NavPolygon | null {
    for (const polygon of this.polygons) {
      if (pointInPolygon(point, polygon.vertices)) return polygon;
    }
    return null;
  }

  nearest(point: NavPoint): { polygon: NavPolygon; point: NavPoint } | null {
    let best: { polygon: NavPolygon; point: NavPoint } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const polygon of this.polygons) {
      const center = centroid(polygon.vertices);
      const distance = navDistance(point, center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { polygon, point: center };
      }
    }
    return best;
  }
}

export class OffMeshLink {
  readonly from: NavPoint;
  readonly to: NavPoint;
  readonly cost: number;
  readonly bidirectional: boolean;

  constructor(from: NavPoint, to: NavPoint, cost = 1, bidirectional = true) {
    this.from = from;
    this.to = to;
    this.cost = cost;
    this.bidirectional = bidirectional;
  }
}

interface Adjacency {
  neighbors: Map<number, number[]>;
  linkEdges: { from: number; to: number; link: OffMeshLink }[];
}

export class NavMesh {
  readonly regions: NavRegion[] = [];
  readonly links: OffMeshLink[] = [];
  #adjacency: Adjacency | null = null;

  addRegion(region: NavRegion): NavRegion {
    this.regions.push(region);
    this.#adjacency = null;
    return region;
  }

  addLink(link: OffMeshLink): OffMeshLink {
    this.links.push(link);
    this.#adjacency = null;
    return link;
  }

  allPolygons(): NavPolygon[] {
    const polygons: NavPolygon[] = [];
    for (const region of this.regions) polygons.push(...region.polygons);
    return polygons;
  }

  findPolygon(ref: { regionId: string; polygonId: number }): NavPolygon | null {
    const region = this.regions.find((candidate) => candidate.id === ref.regionId);
    return region?.polygons.find((polygon) => polygon.id === ref.polygonId) ?? null;
  }

  invalidate(): void {
    this.#adjacency = null;
  }

  #buildAdjacency(): Adjacency {
    if (this.#adjacency) return this.#adjacency;
    const polygons = this.allPolygons();
    const neighbors = new Map<number, number[]>();
    for (const polygon of polygons) neighbors.set(polygon.id, []);
    for (let i = 0; i < polygons.length; i += 1) {
      for (let j = i + 1; j < polygons.length; j += 1) {
        const a = polygons[i]!;
        const b = polygons[j]!;
        if (polygonsAdjacent(a, b)) {
          neighbors.get(a.id)!.push(b.id);
          neighbors.get(b.id)!.push(a.id);
        }
      }
    }
    const linkEdges: { from: number; to: number; link: OffMeshLink }[] = [];
    for (const link of this.links) {
      const start = this.#polygonFor(link.from);
      const end = this.#polygonFor(link.to);
      if (!start || !end) continue;
      linkEdges.push({ from: start.id, to: end.id, link });
    }
    this.#adjacency = { neighbors, linkEdges };
    return this.#adjacency;
  }

  #polygonFor(point: NavPoint): NavPolygon | null {
    for (const region of this.regions) {
      const polygon = region.polygonAt(point);
      if (polygon) return polygon;
    }
    return null;
  }

  findPath(from: NavPoint, to: NavPoint, snapDistance = 0.35): PathEntry[] {
    const polygons = this.allPolygons();
    const startPolygon = this.#polygonFor(from) ?? this.#nearestPolygon(from, snapDistance);
    const goalPolygon = this.#polygonFor(to) ?? this.#nearestPolygon(to, snapDistance);
    if (!startPolygon || !goalPolygon) return [];
    if (startPolygon.id === goalPolygon.id) {
      return [
        { point: { ...from }, polygonId: startPolygon.id, viaLink: false },
        { point: { ...to }, polygonId: goalPolygon.id, viaLink: false },
      ];
    }
    const adjacency = this.#buildAdjacency();
    const centers = new Map<number, NavPoint>();
    for (const polygon of polygons) centers.set(polygon.id, centroid(polygon.vertices));
    const goalCenter = centers.get(goalPolygon.id)!;
    const open: { polygonId: number; g: number; f: number; parent: number | null; viaLink: boolean }[] = [
      { polygonId: startPolygon.id, g: 0, f: navDistance(from, goalCenter), parent: null, viaLink: false },
    ];
    const best = new Map<number, number>([[startPolygon.id, 0]]);
    const cameFrom = new Map<number, { parent: number; viaLink: boolean }>();
    let found: number | null = null;
    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift()!;
      if (current.polygonId === goalPolygon.id) {
        found = current.polygonId;
        break;
      }
      const candidates: { polygonId: number; extra: number; viaLink: boolean }[] = [];
      for (const neighbor of adjacency.neighbors.get(current.polygonId) ?? []) {
        candidates.push({ polygonId: neighbor, extra: navDistance(centers.get(current.polygonId)!, centers.get(neighbor)!), viaLink: false });
      }
      for (const edge of adjacency.linkEdges) {
        if (edge.from === current.polygonId) candidates.push({ polygonId: edge.to, extra: navDistance(edge.link.from, edge.link.to) * edge.link.cost, viaLink: true });
        if (edge.link.bidirectional && edge.to === current.polygonId) candidates.push({ polygonId: edge.from, extra: navDistance(edge.link.from, edge.link.to) * edge.link.cost, viaLink: true });
      }
      for (const candidate of candidates) {
        const polygon = polygons.find((entry) => entry.id === candidate.polygonId)!;
        const g = current.g + candidate.extra * polygon.cost;
        const known = best.get(candidate.polygonId);
        if (known !== undefined && known <= g) continue;
        best.set(candidate.polygonId, g);
        cameFrom.set(candidate.polygonId, { parent: current.polygonId, viaLink: candidate.viaLink });
        open.push({ polygonId: candidate.polygonId, g, f: g + navDistance(centers.get(candidate.polygonId)!, goalCenter), parent: current.polygonId, viaLink: candidate.viaLink });
      }
    }
    if (found === null) return [];
    const chain: { polygonId: number; viaLink: boolean }[] = [];
    let cursor: number | null = found;
    while (cursor !== null) {
      const entry = cameFrom.get(cursor);
      chain.unshift({ polygonId: cursor, viaLink: entry?.viaLink ?? false });
      cursor = entry?.parent ?? null;
    }
    const waypoints: PathEntry[] = [{ point: { ...from }, polygonId: chain[0]!.polygonId, viaLink: false }];
    for (let i = 1; i < chain.length; i += 1) {
      const entry = chain[i]!;
      waypoints.push({ point: { ...centers.get(entry.polygonId)! }, polygonId: entry.polygonId, viaLink: entry.viaLink });
    }
    waypoints.push({ point: { ...to }, polygonId: goalPolygon.id, viaLink: false });
    return this.stringPull(waypoints);
  }

  stringPull(waypoints: PathEntry[]): PathEntry[] {
    if (waypoints.length <= 2) return waypoints;
    const polygons = this.allPolygons();
    const pulled: PathEntry[] = [waypoints[0]!];
    let anchor = 0;
    for (let i = 2; i < waypoints.length; i += 1) {
      const anchorEntry = waypoints[anchor]!;
      const candidate = waypoints[i]!;
      if (candidate.viaLink || anchorEntry.viaLink) continue;
      if (!segmentWalkable(anchorEntry.point, candidate.point, polygons)) {
        pulled.push(waypoints[i - 1]!);
        anchor = i - 1;
      }
    }
    pulled.push(waypoints[waypoints.length - 1]!);
    return pulled;
  }

  #nearestPolygon(point: NavPoint, snapDistance: number): NavPolygon | null {
    let best: NavPolygon | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const polygon of this.allPolygons()) {
      const center = centroid(polygon.vertices);
      let nearest = Number.POSITIVE_INFINITY;
      for (const vertex of polygon.vertices) {
        const edgeMid: NavPoint = { x: (vertex.x + center.x) / 2, y: 0, z: (vertex.z + center.z) / 2 };
        nearest = Math.min(nearest, navDistance(point, vertex), navDistance(point, edgeMid));
      }
      if (nearest < bestDistance) {
        bestDistance = nearest;
        best = polygon;
      }
    }
    return bestDistance <= snapDistance ? best : null;
  }
}

function polygonsAdjacent(a: NavPolygon, b: NavPolygon): boolean {
  let shared = 0;
  for (const vertexA of a.vertices) {
    for (const vertexB of b.vertices) {
      if (samePoint(vertexA, vertexB)) {
        shared += 1;
        break;
      }
    }
  }
  return shared >= 2;
}
