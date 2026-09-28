import { Vec3 } from "@obx/math";
import { Body } from "./body.js";
import { sphereShape } from "./shapes.js";
import type { PhysicsWorld } from "./world.js";

export interface CharacterInput {
  move: Vec3;
  jump: boolean;
  run: boolean;
  crouch: boolean;
  fly: boolean;
}

export function characterInput(over: Partial<CharacterInput> = {}): CharacterInput {
  return {
    move: over.move?.clone() ?? new Vec3(0, 0, 0),
    jump: over.jump ?? false,
    run: over.run ?? false,
    crouch: over.crouch ?? false,
    fly: over.fly ?? false,
  };
}

export type LocomotionState = "grounded" | "airborne" | "crouching" | "flying";

export interface CharacterControllerOptions {
  radius?: number;
  height?: number;
  walkSpeed?: number;
  runSpeed?: number;
  crouchSpeed?: number;
  jumpSpeed?: number;
  flySpeed?: number;
  gravityScale?: number;
  maxStepHeight?: number;
  position?: Vec3;
}

export class CharacterController {
  readonly body: Body;
  radius: number;
  height: number;
  walkSpeed: number;
  runSpeed: number;
  crouchSpeed: number;
  jumpSpeed: number;
  flySpeed: number;
  maxStepHeight: number;
  state: LocomotionState = "airborne";
  grounded = false;

  constructor(world: PhysicsWorld, options: CharacterControllerOptions = {}) {
    this.radius = options.radius ?? 0.4;
    this.height = options.height ?? 1.8;
    this.walkSpeed = options.walkSpeed ?? 4;
    this.runSpeed = options.runSpeed ?? 7;
    this.crouchSpeed = options.crouchSpeed ?? 2;
    this.jumpSpeed = options.jumpSpeed ?? 5;
    this.flySpeed = options.flySpeed ?? 6;
    this.maxStepHeight = options.maxStepHeight ?? 0.35;
    this.body = world.addBody(
      new Body({
        type: "kinematic",
        shape: sphereShape(this.radius),
        position: options.position?.clone() ?? new Vec3(0, this.radius, 0),
        gravityScale: 0,
        friction: 0,
        restitution: 0,
        mass: 1,
      }),
    );
  }

  update(dt: number, input: CharacterInput, world: PhysicsWorld): void {
    const gravity = world.gravity;
    const move = input.move.clone();
    if (move.lengthSq() > 1) move.normalize();
    const speed = input.fly
      ? this.flySpeed
      : input.crouch && this.grounded
        ? this.crouchSpeed
        : input.run
          ? this.runSpeed
          : this.walkSpeed;

    const desired = move.scale(speed);
    if (input.fly) {
      this.body.velocity.set(desired.x, desired.y, desired.z);
      this.state = "flying";
    } else {
      this.body.velocity.x = desired.x;
      this.body.velocity.z = desired.z;
      this.body.velocity.add(gravity.clone().scale(dt));
      if (this.grounded && this.body.velocity.y < 0) {
        this.body.velocity.y = Math.max(this.body.velocity.y, -2);
      }
    }

    if (input.jump && this.grounded && !input.fly) {
      this.body.velocity.y = this.jumpSpeed;
      this.grounded = false;
    }

    const delta = this.body.velocity.clone().scale(dt);
    this.moveAndSlide(delta, world);

    if (input.fly) {
      this.state = "flying";
    } else if (input.crouch && this.grounded) {
      this.state = "crouching";
    } else if (this.grounded) {
      this.state = "grounded";
    } else {
      this.state = "airborne";
    }
  }

  private moveAndSlide(delta: Vec3, world: PhysicsWorld): void {
    let remaining = delta.clone();
    const skin = 0.01;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const distance = remaining.length();
      if (distance < 1e-9) break;
      const direction = remaining.clone().scale(1 / distance);
      const hits = world.sphereCastAll(this.body.position, direction, this.radius, distance + skin);
      const hit = hits.find((candidate) => candidate.normal.dot(direction) <= 1e-6) ?? null;
      if (!hit) {
        this.body.position.add(remaining);
        break;
      }
      const allowed = Math.max(hit.distance - skin, 0);
      this.body.position.add(direction.clone().scale(allowed));
      const leftover = remaining.clone().scale(1 - allowed / distance);
      const into = leftover.dot(hit.normal);
      remaining = leftover.sub(hit.normal.clone().scale(into));
      if (hit.normal.y > 0.5) {
        this.grounded = true;
        if (this.body.velocity.y < 0) this.body.velocity.y = 0;
      }
    }
    this.updateGrounded(world);
  }

  private updateGrounded(world: PhysicsWorld): void {
    const down = new Vec3(0, -1, 0);
    const hits = world.sphereCastAll(this.body.position, down, this.radius, this.radius + 0.08);
    const hit = hits.find((candidate) => candidate.normal.y > 0.5) ?? null;
    this.grounded = !!hit && this.body.velocity.y <= 0.01;
  }
}
