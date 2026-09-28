import { Quat, Vec3 } from "@obx/math";
import type { Shape } from "./shapes.js";
import { boundsForShape, sphereShape } from "./shapes.js";

export type BodyType = "dynamic" | "static" | "kinematic";

export interface BodyOptions {
  type?: BodyType;
  shape?: Shape;
  position?: Vec3;
  velocity?: Vec3;
  mass?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  gravityScale?: number;
  isTrigger?: boolean;
  layer?: number;
  mask?: number;
  userData?: unknown;
}

let nextBodyId = 1;

export class Body {
  readonly id = nextBodyId++;
  type: BodyType;
  shape: Shape;
  position: Vec3;
  velocity: Vec3;
  force = new Vec3(0, 0, 0);
  rotation = Quat.identity();
  angularVelocity = new Vec3(0, 0, 0);
  mass: number;
  inverseMass: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  gravityScale: number;
  isTrigger: boolean;
  layer: number;
  mask: number;
  userData: unknown;
  sleeping = false;

  constructor(options: BodyOptions = {}) {
    this.type = options.type ?? "dynamic";
    this.shape = options.shape ?? sphereShape(0.5);
    this.position = options.position?.clone() ?? new Vec3(0, 0, 0);
    this.velocity = options.velocity?.clone() ?? new Vec3(0, 0, 0);
    this.mass = options.mass ?? 1;
    this.restitution = options.restitution ?? 0.3;
    this.friction = options.friction ?? 0.5;
    this.linearDamping = options.linearDamping ?? 0;
    this.gravityScale = options.gravityScale ?? 1;
    this.isTrigger = options.isTrigger ?? false;
    this.layer = options.layer ?? 1;
    this.mask = options.mask ?? 0xffffffff;
    this.userData = options.userData;
    this.inverseMass = this.type === "dynamic" && this.mass > 0 ? 1 / this.mass : 0;
  }

  applyForce(force: Vec3): void {
    this.force.add(force);
  }

  applyImpulse(impulse: Vec3): void {
    if (this.inverseMass === 0) return;
    this.velocity.add(impulse.clone().scale(this.inverseMass));
    this.sleeping = false;
  }

  bounds(): { min: Vec3; max: Vec3 } {
    return boundsForShape(this.shape, this.position);
  }

  setType(type: BodyType): void {
    this.type = type;
    this.inverseMass = type === "dynamic" && this.mass > 0 ? 1 / this.mass : 0;
    if (type !== "dynamic") this.velocity.set(0, 0, 0);
  }
}

export interface ContactPair {
  a: Body;
  b: Body;
}

export interface CollisionEvent extends ContactPair {
  normal: Vec3;
  penetration: number;
}

export type ContactCallback = (event: CollisionEvent) => void;
