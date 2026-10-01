import { NavMesh, PathEntry, NavPoint, navDistance } from "./navmesh.js";

export type NavAgentState = "idle" | "moving" | "arrived" | "stuck";

export interface NavAgentOptions {
  speed: number;
  arrivalDistance: number;
  replanDistance: number;
}

export function defaultNavAgentOptions(over: Partial<NavAgentOptions> = {}): NavAgentOptions {
  return {
    speed: over.speed ?? 3,
    arrivalDistance: over.arrivalDistance ?? 0.12,
    replanDistance: over.replanDistance ?? 0.5,
  };
}

export class NavAgent {
  position: NavPoint;
  destination: NavPoint | null = null;
  path: PathEntry[] = [];
  state: NavAgentState = "idle";
  options: NavAgentOptions;
  #mesh: NavMesh;
  #pathIndex = 0;
  #stuckTime = 0;

  constructor(mesh: NavMesh, position: NavPoint, options: Partial<NavAgentOptions> = {}) {
    this.#mesh = mesh;
    this.position = { ...position };
    this.options = defaultNavAgentOptions(options);
  }

  setDestination(destination: NavPoint): boolean {
    this.destination = { ...destination };
    const path = this.#mesh.findPath(this.position, this.destination);
    if (path.length === 0) {
      this.path = [];
      this.state = "stuck";
      return false;
    }
    this.path = path;
    this.#pathIndex = 0;
    this.#stuckTime = 0;
    this.state = "moving";
    return true;
  }

  replan(): boolean {
    if (!this.destination) return false;
    return this.setDestination(this.destination);
  }

  step(deltaSeconds: number): NavPoint {
    if (this.state !== "moving" || !this.destination) return { ...this.position };
    const target = this.#currentTarget();
    if (!target) {
      this.state = "arrived";
      return { ...this.position };
    }
    const distance = navDistance(this.position, target);
    const travel = this.options.speed * deltaSeconds;
    if (distance <= Math.max(travel, this.options.arrivalDistance)) {
      this.position = { ...target };
      this.#pathIndex += 1;
      this.#stuckTime = 0;
      if (this.#pathIndex >= this.path.length && navDistance(this.position, this.destination) <= this.options.arrivalDistance) {
        this.state = "arrived";
      }
      return { ...this.position };
    }
    const t = travel / distance;
    this.position = {
      x: this.position.x + (target.x - this.position.x) * t,
      y: this.position.y + (target.y - this.position.y) * t,
      z: this.position.z + (target.z - this.position.z) * t,
    };
    this.#stuckTime += deltaSeconds;
    if (this.#stuckTime > 4) this.state = "stuck";
    return { ...this.position };
  }

  distanceToDestination(): number {
    return this.destination ? navDistance(this.position, this.destination) : Number.POSITIVE_INFINITY;
  }

  #currentTarget(): NavPoint | null {
    if (this.#pathIndex >= this.path.length) return this.destination;
    return this.path[this.#pathIndex]!.point;
  }
}
