import { Quat, Vec3 } from "@obx/math";
import type { Body } from "./body.js";
import type { Joint } from "./joints.js";

function applyImpulse(body: Body, impulse: Vec3): void {
  if (body.inverseMass === 0) return;
  body.velocity.add(impulse.clone().scale(body.inverseMass));
}

function relative(anchorA: Vec3, anchorB: Vec3, bodyA: Body, bodyB: Body): { pointA: Vec3; pointB: Vec3; delta: Vec3; length: number } {
  const pointA = anchorA.clone().add(bodyA.position);
  const pointB = anchorB.clone().add(bodyB.position);
  const delta = pointB.clone().sub(pointA);
  return { pointA, pointB, delta, length: delta.length() };
}

export class HingeJoint implements Joint {
  limits: { min: number; max: number } | null = null;
  stiffness: number;

  constructor(
    readonly bodyA: Body,
    readonly bodyB: Body,
    readonly anchorA: Vec3,
    readonly anchorB: Vec3,
    readonly axis: Vec3,
    stiffness = 1,
  ) {
    this.stiffness = stiffness;
  }

  applyForces(_dt: number): void {}

  solveVelocity(): void {
    const { delta, length } = relative(this.anchorA, this.anchorB, this.bodyA, this.bodyB);
    if (length > 1e-9) {
      const axis = delta.scale(1 / length);
      const invMassSum = this.bodyA.inverseMass + this.bodyB.inverseMass;
      if (invMassSum > 0) {
        const velocityAlongAxis = this.bodyB.velocity.clone().sub(this.bodyA.velocity).dot(axis);
        const impulse = axis.scale((-(velocityAlongAxis) + (length) * 0.2 * this.stiffness) / invMassSum);
        applyImpulse(this.bodyA, impulse.clone().scale(-this.bodyA.inverseMass));
        applyImpulse(this.bodyB, impulse.clone().scale(this.bodyB.inverseMass));
      }
    }
    const relativeAngular = this.bodyB.velocity.clone().sub(this.bodyA.velocity);
    const swing = relativeAngular.clone().sub(this.axis.clone().scale(relativeAngular.dot(this.axis)));
    const correction = swing.scale(0.5 * this.stiffness);
    this.bodyA.velocity.add(correction);
    this.bodyB.velocity.sub(correction);
    if (this.limits) {
      const angle = signedAngleAroundAxis(this.bodyA.rotation, this.bodyB.rotation, this.axis);
      if (angle < this.limits.min) {
        this.bodyB.velocity.add(this.axis.clone().scale((this.limits.min - angle) * 0.2));
      } else if (angle > this.limits.max) {
        this.bodyB.velocity.sub(this.axis.clone().scale((angle - this.limits.max) * 0.2));
      }
    }
  }
}

export class BallJoint implements Joint {
  coneLimitRadians: number | null = null;
  stiffness: number;

  constructor(
    readonly bodyA: Body,
    readonly bodyB: Body,
    readonly anchorA: Vec3,
    readonly anchorB: Vec3,
    stiffness = 1,
  ) {
    this.stiffness = stiffness;
  }

  applyForces(_dt: number): void {}

  solveVelocity(): void {
    const { delta, length } = relative(this.anchorA, this.anchorB, this.bodyA, this.bodyB);
    if (length < 1e-9) return;
    const axis = delta.scale(1 / length);
    const invMassSum = this.bodyA.inverseMass + this.bodyB.inverseMass;
    if (invMassSum === 0) return;
    const velocityAlongAxis = this.bodyB.velocity.clone().sub(this.bodyA.velocity).dot(axis);
    const impulse = axis.scale((-velocityAlongAxis + length * 0.2 * this.stiffness) / invMassSum);
    applyImpulse(this.bodyA, impulse.clone().scale(-this.bodyA.inverseMass));
    applyImpulse(this.bodyB, impulse.clone().scale(this.bodyB.inverseMass));
    if (this.coneLimitRadians !== null) {
      const tilt = Math.acos(Math.min(1, Math.max(-1, axis.dot(new Vec3(0, 1, 0)))));
      if (tilt > this.coneLimitRadians) {
        const push = axis.clone().cross(new Vec3(0, 1, 0)).normalize().scale((tilt - this.coneLimitRadians) * 0.2);
        applyImpulse(this.bodyB, push);
      }
    }
  }
}

export class SliderJoint implements Joint {
  limits: { min: number; max: number } | null = null;
  stiffness: number;

  constructor(
    readonly bodyA: Body,
    readonly bodyB: Body,
    readonly anchorA: Vec3,
    readonly anchorB: Vec3,
    readonly axis: Vec3,
    stiffness = 1,
  ) {
    this.stiffness = stiffness;
  }

  applyForces(_dt: number): void {}

  solveVelocity(): void {
    const { delta } = relative(this.anchorA, this.anchorB, this.bodyA, this.bodyB);
    const free = this.axis.clone().scale(delta.dot(this.axis));
    const locked = delta.clone().sub(free);
    const invMassSum = this.bodyA.inverseMass + this.bodyB.inverseMass;
    if (invMassSum === 0) return;
    const lockedLength = locked.length();
    if (lockedLength > 1e-9) {
      const axis = locked.scale(1 / lockedLength);
      const velocityAlongAxis = this.bodyB.velocity.clone().sub(this.bodyA.velocity).dot(axis);
      const impulse = axis.scale((-velocityAlongAxis + lockedLength * 0.2 * this.stiffness) / invMassSum);
      applyImpulse(this.bodyA, impulse.clone().scale(-this.bodyA.inverseMass));
      applyImpulse(this.bodyB, impulse.clone().scale(this.bodyB.inverseMass));
    }
    const projection = delta.dot(this.axis);
    if (this.limits) {
      if (projection < this.limits.min) {
        applyImpulse(this.bodyB, this.axis.clone().scale((this.limits.min - projection) * 0.2));
      } else if (projection > this.limits.max) {
        applyImpulse(this.bodyB, this.axis.clone().scale((this.limits.max - projection) * -0.2));
      }
    }
  }
}

export class FixedJoint implements Joint {
  stiffness: number;

  constructor(
    readonly bodyA: Body,
    readonly bodyB: Body,
    readonly anchorA: Vec3,
    readonly anchorB: Vec3,
    stiffness = 1,
  ) {
    this.stiffness = stiffness;
  }

  applyForces(_dt: number): void {}

  solveVelocity(): void {
    const { delta, length } = relative(this.anchorA, this.anchorB, this.bodyA, this.bodyB);
    if (length > 1e-9) {
      const axis = delta.scale(1 / length);
      const invMassSum = this.bodyA.inverseMass + this.bodyB.inverseMass;
      if (invMassSum > 0) {
        const velocityAlongAxis = this.bodyB.velocity.clone().sub(this.bodyA.velocity).dot(axis);
        const impulse = axis.scale((-velocityAlongAxis + length * 0.2 * this.stiffness) / invMassSum);
        applyImpulse(this.bodyA, impulse.clone().scale(-this.bodyA.inverseMass));
        applyImpulse(this.bodyB, impulse.clone().scale(this.bodyB.inverseMass));
      }
    }
    const alignment = this.bodyB.rotation.clone().multiply(this.bodyA.rotation.clone().invert());
    const twist = new Vec3(alignment.x, alignment.y, alignment.z).scale(0.3 * this.stiffness);
    this.bodyB.velocity.sub(twist);
    this.bodyA.velocity.add(twist);
  }
}

function signedAngleAroundAxis(a: Quat, b: Quat, axis: Vec3): number {
  const relative = b.clone().multiply(a.clone().invert());
  const vector = new Vec3(relative.x, relative.y, relative.z);
  const projected = vector.dot(axis.clone().normalize());
  return Math.asin(Math.min(1, Math.max(-1, projected * 2)));
}

export function makeJointSet(
  kind: "hinge" | "ball" | "slider" | "fixed",
  bodyA: Body,
  bodyB: Body,
  anchorA: Vec3,
  anchorB: Vec3,
  axis = new Vec3(0, 1, 0),
): Joint {
  switch (kind) {
    case "hinge":
      return new HingeJoint(bodyA, bodyB, anchorA, anchorB, axis);
    case "ball":
      return new BallJoint(bodyA, bodyB, anchorA, anchorB);
    case "slider":
      return new SliderJoint(bodyA, bodyB, anchorA, anchorB, axis);
    default:
      return new FixedJoint(bodyA, bodyB, anchorA, anchorB);
  }
}
