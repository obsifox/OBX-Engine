import { Quat, Vec3 } from "@obx/math";
import { Body } from "./body.js";
import type { Joint } from "./joints.js";
import { BallJoint, FixedJoint, HingeJoint } from "./joints2.js";
import { sphereShape } from "./shapes.js";

export interface RagdollBone {
  name: string;
  parent: string | null;
  offset: Vec3;
  radius: number;
  mass: number;
  joint?: "ball" | "hinge" | "fixed";
  axis?: Vec3;
}

export interface RagdollPoseEntry {
  name: string;
  position: Vec3;
  rotation: Quat;
}

export class Ragdoll {
  readonly bodies = new Map<string, Body>();
  readonly joints: Joint[] = [];
  readonly bones: RagdollBone[];

  constructor(bones: readonly RagdollBone[], origin = new Vec3(0, 0, 0)) {
    this.bones = bones.map((bone) => ({ ...bone, offset: bone.offset.clone() }));
    for (const bone of this.bones) {
      this.bodies.set(bone.name, new Body({ shape: sphereShape(bone.radius), position: origin.clone().add(bone.offset), mass: bone.mass }));
    }
    for (const bone of this.bones) {
      if (!bone.parent) continue;
      const parent = this.bodies.get(bone.parent)!;
      const child = this.bodies.get(bone.name)!;
      const anchorA = bone.offset.clone();
      const anchorB = new Vec3(0, 0, 0);
      switch (bone.joint ?? "ball") {
        case "hinge":
          this.joints.push(new HingeJoint(parent, child, anchorA, anchorB, bone.axis ?? new Vec3(1, 0, 0)));
          break;
        case "fixed":
          this.joints.push(new FixedJoint(parent, child, anchorA, anchorB));
          break;
        default:
          this.joints.push(new BallJoint(parent, child, anchorA, anchorB));
      }
    }
  }

  applyGravity(gravity: Vec3, dt: number): void {
    for (const body of this.bodies.values()) {
      if (body.inverseMass === 0) continue;
      body.velocity.add(gravity.clone().scale(dt));
    }
  }

  integrate(dt: number): void {
    for (const body of this.bodies.values()) {
      body.position.add(body.velocity.clone().scale(dt));
    }
    for (const joint of this.joints) joint.solveVelocity();
    for (let iteration = 0; iteration < 4; iteration += 1) {
      for (const joint of this.joints) joint.solveVelocity();
    }
  }

  step(dt: number, gravity = new Vec3(0, -9.81, 0)): void {
    this.applyGravity(gravity, dt);
    this.integrate(dt);
  }

  applyImpulse(boneName: string, impulse: Vec3): boolean {
    const body = this.bodies.get(boneName);
    if (!body || body.inverseMass === 0) return false;
    body.velocity.add(impulse.clone().scale(body.inverseMass));
    return true;
  }

  pose(): RagdollPoseEntry[] {
    return [...this.bodies.entries()].map(([name, body]) => ({ name, position: body.position.clone(), rotation: body.rotation.clone() }));
  }

  totalKineticEnergy(): number {
    let energy = 0;
    for (const body of this.bodies.values()) {
      energy += 0.5 * body.mass * body.velocity.lengthSq();
    }
    return energy;
  }
}

export function humanoidRagdoll(): RagdollBone[] {
  return [
    { name: "hips", parent: null, offset: new Vec3(0, 1, 0), radius: 0.16, mass: 12 },
    { name: "torso", parent: "hips", offset: new Vec3(0, 0.32, 0), radius: 0.18, mass: 16, joint: "ball" },
    { name: "head", parent: "torso", offset: new Vec3(0, 0.34, 0), radius: 0.12, mass: 5, joint: "ball" },
    { name: "upperArmL", parent: "torso", offset: new Vec3(-0.26, 0.18, 0), radius: 0.08, mass: 3, joint: "ball" },
    { name: "lowerArmL", parent: "upperArmL", offset: new Vec3(-0.26, 0, 0), radius: 0.07, mass: 2, joint: "hinge", axis: new Vec3(0, 1, 0) },
    { name: "upperArmR", parent: "torso", offset: new Vec3(0.26, 0.18, 0), radius: 0.08, mass: 3, joint: "ball" },
    { name: "lowerArmR", parent: "upperArmR", offset: new Vec3(0.26, 0, 0), radius: 0.07, mass: 2, joint: "hinge", axis: new Vec3(0, 1, 0) },
    { name: "upperLegL", parent: "hips", offset: new Vec3(-0.12, -0.34, 0), radius: 0.09, mass: 6, joint: "ball" },
    { name: "lowerLegL", parent: "upperLegL", offset: new Vec3(0, -0.36, 0), radius: 0.08, mass: 4, joint: "hinge", axis: new Vec3(1, 0, 0) },
    { name: "upperLegR", parent: "hips", offset: new Vec3(0.12, -0.34, 0), radius: 0.09, mass: 6, joint: "ball" },
    { name: "lowerLegR", parent: "upperLegR", offset: new Vec3(0, -0.36, 0), radius: 0.08, mass: 4, joint: "hinge", axis: new Vec3(1, 0, 0) },
  ];
}
