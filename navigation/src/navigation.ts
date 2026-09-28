export interface PathPoint {
  x: number;
  z: number;
}

export class NavGrid {
  readonly costs: Float32Array;
  readonly walkable: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize = 1,
  ) {
    this.costs = new Float32Array(width * height).fill(1);
    this.walkable = new Uint8Array(width * height).fill(1);
  }

  index(x: number, z: number): number {
    return z * this.width + x;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.height;
  }

  isWalkable(x: number, z: number): boolean {
    return this.inBounds(x, z) && this.walkable[this.index(x, z)] === 1;
  }

  setWalkable(x: number, z: number, walkable: boolean): void {
    if (!this.inBounds(x, z)) return;
    this.walkable[this.index(x, z)] = walkable ? 1 : 0;
  }

  setCost(x: number, z: number, cost: number): void {
    if (!this.inBounds(x, z)) return;
    this.costs[this.index(x, z)] = Math.max(0.01, cost);
  }

  cost(x: number, z: number): number {
    return this.costs[this.index(x, z)] ?? 1;
  }

  blockRect(x: number, z: number, width: number, height: number, walkable = false): void {
    for (let dz = 0; dz < height; dz += 1) {
      for (let dx = 0; dx < width; dx += 1) {
        this.setWalkable(x + dx, z + dz, walkable);
      }
    }
  }

  worldToCell(x: number, z: number): { x: number; z: number } {
    return { x: Math.floor(x / this.cellSize), z: Math.floor(z / this.cellSize) };
  }

  cellToWorld(x: number, z: number): PathPoint {
    return { x: (x + 0.5) * this.cellSize, z: (z + 0.5) * this.cellSize };
  }
}

export interface GridNode {
  x: number;
  z: number;
  g: number;
  f: number;
  order: number;
}

const neighborOffsets = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

export class AStar {
  constructor(readonly grid: NavGrid) {}

  findPath(start: PathPoint, goal: PathPoint): PathPoint[] {
    const grid = this.grid;
    const s = grid.worldToCell(start.x, start.z);
    const g = grid.worldToCell(goal.x, goal.z);
    if (!grid.isWalkable(s.x, s.z) || !grid.isWalkable(g.x, g.z)) return [];
    if (s.x === g.x && s.z === g.z) return [grid.cellToWorld(s.x, s.z)];

    const open: GridNode[] = [];
    const cameFrom = new Map<number, number>();
    const bestG = new Map<number, number>();
    let order = 0;
    const heuristic = (x: number, z: number) => Math.hypot(x - g.x, z - g.z);
    const startNode: GridNode = { x: s.x, z: s.z, g: 0, f: heuristic(s.x, s.z), order: order++ };
    open.push(startNode);
    bestG.set(grid.index(s.x, s.z), 0);
    const closed = new Set<number>();

    while (open.length > 0) {
      open.sort((a, b) => a.f - b.f || b.g - a.g || a.order - b.order);
      const current = open.shift()!;
      const currentIndex = grid.index(current.x, current.z);
      if (closed.has(currentIndex)) continue;
      closed.add(currentIndex);
      if (current.x === g.x && current.z === g.z) {
        const path: PathPoint[] = [];
        let cursor = currentIndex;
        while (cursor !== undefined) {
          const cx = cursor % grid.width;
          const cz = Math.floor(cursor / grid.width);
          path.push(grid.cellToWorld(cx, cz));
          cursor = cameFrom.get(cursor)!;
        }
        path.reverse();
        return path;
      }
      for (const [dx, dz] of neighborOffsets) {
        const nx = current.x + dx;
        const nz = current.z + dz;
        if (!grid.isWalkable(nx, nz)) continue;
        if (dx !== 0 && dz !== 0) {
          if (!grid.isWalkable(current.x + dx, current.z) || !grid.isWalkable(current.x, current.z + dz)) continue;
        }
        const neighborIndex = grid.index(nx, nz);
        if (closed.has(neighborIndex)) continue;
        const step = (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) * (0.5 + grid.cost(nx, nz) * 0.5);
        const tentative = current.g + step;
        const known = bestG.get(neighborIndex);
        if (known !== undefined && tentative >= known) continue;
        bestG.set(neighborIndex, tentative);
        cameFrom.set(neighborIndex, currentIndex);
        open.push({ x: nx, z: nz, g: tentative, f: tentative + heuristic(nx, nz), order: order++ });
      }
    }
    return [];
  }
}

export function lineOfSight(grid: NavGrid, a: PathPoint, b: PathPoint): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const distance = Math.hypot(dx, dz);
  const steps = Math.ceil(distance / (grid.cellSize * 0.5));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const cell = grid.worldToCell(a.x + dx * t, a.z + dz * t);
    if (!grid.isWalkable(cell.x, cell.z)) return false;
  }
  return true;
}

export function smoothPath(grid: NavGrid, path: readonly PathPoint[]): PathPoint[] {
  if (path.length <= 2) return [...path];
  const result: PathPoint[] = [path[0]!];
  let anchor = 0;
  for (let i = 2; i < path.length; i += 1) {
    if (!lineOfSight(grid, path[anchor]!, path[i]!)) {
      result.push(path[i - 1]!);
      anchor = i - 1;
    }
  }
  result.push(path[path.length - 1]!);
  return result;
}

export interface AgentOptions {
  speed?: number;
  avoidanceRadius?: number;
  arrival?: number;
}

export class PathAgent {
  x: number;
  z: number;
  path: PathPoint[] = [];
  pathIndex = 0;
  speed: number;
  avoidanceRadius: number;
  arrival: number;
  finished = true;

  constructor(
    readonly grid: NavGrid,
    x: number,
    z: number,
    options: AgentOptions = {},
  ) {
    this.x = x;
    this.z = z;
    this.speed = options.speed ?? 3;
    this.avoidanceRadius = options.avoidanceRadius ?? 1.2;
    this.arrival = options.arrival ?? 0.15;
  }

  setPath(path: readonly PathPoint[]): void {
    this.path = [...path];
    this.pathIndex = 0;
    this.finished = this.path.length === 0;
  }

  update(dt: number, neighbors: readonly PathAgent[] = []): void {
    if (this.finished) return;
    const target = this.path[this.pathIndex];
    if (!target) {
      this.finished = true;
      return;
    }
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= this.arrival) {
      this.pathIndex += 1;
      if (this.pathIndex >= this.path.length) this.finished = true;
      return;
    }
    const step = Math.min(this.speed * dt, distance);
    let moveX = (dx / distance) * step;
    let moveZ = (dz / distance) * step;
    for (const neighbor of neighbors) {
      if (neighbor === this) continue;
      const nx = this.x - neighbor.x;
      const nz = this.z - neighbor.z;
      const nd = Math.hypot(nx, nz);
      if (nd > 1e-6 && nd < this.avoidanceRadius) {
        const push = ((this.avoidanceRadius - nd) / this.avoidanceRadius) * step * 2;
        moveX += (nx / nd) * push;
        moveZ += (nz / nd) * push;
      }
    }
    const nextX = this.x + moveX;
    const nextZ = this.z + moveZ;
    const cell = this.grid.worldToCell(nextX, nextZ);
    if (this.grid.isWalkable(cell.x, cell.z)) {
      this.x = nextX;
      this.z = nextZ;
    } else {
      this.pathIndex += 1;
    }
  }
}

export class Crowd {
  readonly agents: PathAgent[] = [];

  add(agent: PathAgent): PathAgent {
    this.agents.push(agent);
    return agent;
  }

  update(dt: number): void {
    for (const agent of this.agents) agent.update(dt, this.agents);
  }

  get finished(): boolean {
    return this.agents.every((agent) => agent.finished);
  }
}

export class NavigationRegion {
  constructor(
    readonly id: string,
    readonly cost: number,
    readonly rect: { x: number; z: number; width: number; height: number },
  ) {}

  apply(grid: NavGrid): void {
    for (let z = this.rect.z; z < this.rect.z + this.rect.height; z += 1) {
      for (let x = this.rect.x; x < this.rect.x + this.rect.width; x += 1) {
        if (grid.isWalkable(x, z)) grid.setCost(x, z, this.cost);
      }
    }
  }
}

export class DynamicObstacle {
  applied = false;

  constructor(readonly rect: { x: number; z: number; width: number; height: number }) {}

  apply(grid: NavGrid): void {
    grid.blockRect(this.rect.x, this.rect.z, this.rect.width, this.rect.height, false);
    this.applied = true;
  }

  clear(grid: NavGrid): void {
    grid.blockRect(this.rect.x, this.rect.z, this.rect.width, this.rect.height, true);
    this.applied = false;
  }
}
