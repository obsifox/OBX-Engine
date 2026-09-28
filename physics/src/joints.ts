import { Vec3 } from "@obx/math";
import type { Body } from "./body.js";

export interface Joint {
  readonly bodyA: Body;
  readonly bodyB: Body;
  applyForces(dt: number): void;
  solveVelocity(): void;
}

export class DistanceJoint implements Joint {
  restLength: number;
  stiffness: number;

  constructor(
    readonly bodyA: Body,
    readonly bodyB: Body,
    readonly anchorA: Vec3,
    readonly anchorB: Vec3,
    restLength?: number,
    stiffness = 1,
  ) {
    this.restLength = restLength ?? anchorB.clone().add(bodyB.position).sub(anchorA.clone().add(bodyA.position)).length();
    this.stiffness = stiffness;
  }

  applyForces(): void {}

  solveVelocity(): void {
    const pointA = this.anchorA.clone().add(this.bodyA.position);
    const pointB = this.anchorB.clone().add(this.bodyB.position);
    const delta = pointB.clone().sub(pointA);
    const length = delta.length();
    if (length < 1e-9) return;
    const axis = delta.scale(1 / length);
    const invMassSum = this.bodyA.inverseMass + this.bodyB.inverseMass;
    if (invMassSum === 0) return;
    const relative = this.bodyB.velocity.clone().sub(this.bodyA.velocity);
    const velocityAlongAxis = relative.dot(axis);
    const correction = (length - this.restLength) * this.stiffness;
    const impulse = axis.scale((-velocityAlongAxis + correction * 0.2) / invMassSum);
    this.bodyA.velocity.sub(impulse.clone().scale(this.bodyA.inverseMass));
    this.bodyB.velocity.add(impulse.clone().scale(this.bodyB.inverseMass));
  }
}

export class SpringJoint implements Joint {
  private force = new Vec3(0, 0, 0);

  constructor(
    readonly bodyA: Body,
    readonly bodyB: Body,
    readonly anchorA: Vec3,
    readonly anchorB: Vec3,
    readonly restLength: number,
    readonly stiffness: number,
    readonly damping: number,
  ) {}

  applyForces(dt: number): void {
    const pointA = this.anchorA.clone().add(this.bodyA.position);
    const pointB = this.anchorB.clone().add(this.bodyB.position);
    const delta = pointB.clone().sub(pointA);
    const length = delta.length();
    if (length < 1e-9) return;
    const axis = delta.scale(1 / length);
    const relative = this.bodyB.velocity.clone().sub(this.bodyA.velocity);
    const stretch = length - this.restLength;
    const magnitude = -this.stiffness * stretch - this.damping * relative.dot(axis);
    this.force = axis.scale(magnitude);
    this.bodyA.applyForce(this.force.clone().scale(-1));
    this.bodyB.applyForce(this.force);
    void dt;
  }

  solveVelocity(): void {}
}
