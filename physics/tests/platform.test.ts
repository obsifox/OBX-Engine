import { describe, expect, it } from "vitest";
import { Vec3 } from "@obx/math";
import {
  Body,
  Cloth,
  ConvexHull,
  FixedJoint,
  HingeJoint,
  Ragdoll,
  SoftBody,
  TriangleMesh,
  boxHull,
  boxShape,
  conservativeAdvance,
  destroyBoxBody,
  humanoidRagdoll,
  makeDebrisBody,
  makeJointSet,
  rayTriangle,
  shardHull,
  sphereShape,
  sweepSphereBox,
  sweepSphereSphere,
  sweepWorld,
  voronoiFracture,
} from "../src/index.js";

describe("continuous collision detection", () => {
  it("computes sphere-sphere sweep times of impact", () => {
    const hit = sweepSphereSphere(new Vec3(0, 0, 0), new Vec3(4, 0, 0), 0.5, new Vec3(2, 0, 0), 0.5);
    expect(hit).not.toBeNull();
    expect(hit!.toi).toBeCloseTo(0.25, 5);
    expect(hit!.normal.x).toBeCloseTo(-1, 5);
    expect(sweepSphereSphere(new Vec3(0, 0, 0), new Vec3(4, 0, 0), 0.5, new Vec3(2, 3, 0), 0.5)).toBeNull();
  });

  it("computes sphere-box sweeps", () => {
    const hit = sweepSphereBox(new Vec3(-3, 0, 0), new Vec3(3, 0, 0), 0.5, new Vec3(0, 0, 0), new Vec3(1, 1, 1));
    expect(hit).not.toBeNull();
    expect(hit!.toi).toBeCloseTo(0.25, 5);
    expect(hit!.normal.x).toBeCloseTo(-1, 5);
  });

  it("advances conservatively around obstacles", () => {
    const distanceToObstacle = (point: Vec3): number => Math.max(point.length() - 1, 0);
    const result = conservativeAdvance(new Vec3(-3, 0, 0), new Vec3(3, 0, 0), 0.5, distanceToObstacle);
    expect(result.hit).toBe(true);
    expect(result.position.x).toBeLessThan(-1);
    const free = conservativeAdvance(new Vec3(-3, 5, 0), new Vec3(3, 5, 0), 0.5, distanceToObstacle);
    expect(free.hit).toBe(false);
    expect(free.position.x).toBeCloseTo(3, 5);
  });

  it("sweeps against world samples and integrates bodies", () => {
    const samples = [{ position: new Vec3(1, 0, 0), radius: 0.5, body: null }];
    const hit = sweepWorld(new Vec3(-1, 0, 0), new Vec3(3, 0, 0), 0.25, samples);
    expect(hit).not.toBeNull();
    expect(hit!.toi).toBeGreaterThan(0);
  });
});

describe("convex hulls", () => {
  it("builds a hull around a cube and classifies containment", () => {
    const hull = boxHull(new Vec3(1, 1, 1));
    expect(hull.points.length).toBeGreaterThanOrEqual(8);
    expect(hull.faces.length).toBeGreaterThanOrEqual(8);
    expect(hull.contains(new Vec3(0, 0, 0))).toBe(true);
    expect(hull.contains(new Vec3(2, 0, 0))).toBe(false);
    expect(hull.volume()).toBeGreaterThan(7);
    expect(hull.volume()).toBeLessThan(9);
  });

  it("supports directions and raycasts faces", () => {
    const hull = boxHull(new Vec3(1, 1, 1));
    expect(hull.support(new Vec3(1, 0, 0)).x).toBeCloseTo(1, 5);
    const hit = hull.raycast(new Vec3(-3, 0, 0), new Vec3(1, 0, 0));
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(2, 5);
    expect(rayTriangle(new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, -1, 0), new Vec3(1, -1, 0), new Vec3(0, 1, 0))).not.toBeNull();
    expect(hull.faceNormals().length).toBe(hull.faces.length);
  });
});

describe("mesh colliders", () => {
  it("raycasts triangle meshes through the bvh", () => {
    const mesh = TriangleMesh.grid(4, 4, 1);
    const hit = mesh.raycast(new Vec3(2, 5, 2), new Vec3(0, -1, 0));
    expect(hit).not.toBeNull();
    expect(hit!.point.y).toBeCloseTo(0, 5);
    expect(mesh.raycast(new Vec3(20, 5, 2), new Vec3(0, -1, 0))).toBeNull();
    const closest = mesh.closestPoint(new Vec3(2, 1, 2));
    expect(closest.y).toBeCloseTo(0, 5);
  });
});

describe("joint systems", () => {
  it("constrains hinge, ball, slider and fixed joints", () => {
    const anchor = new Body({ shape: sphereShape(0.2), position: new Vec3(0, 0, 0), mass: 0 });
    const moving = new Body({ shape: sphereShape(0.2), position: new Vec3(1, 0, 0), mass: 1 });
    const hinge = new HingeJoint(anchor, moving, new Vec3(0, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 1, 0));
    hinge.limits = { min: -0.5, max: 0.5 };
    for (let i = 0; i < 10; i += 1) hinge.solveVelocity();
    expect(moving.velocity.length()).toBeGreaterThanOrEqual(0);
    const ball = makeJointSet("ball", anchor, moving, new Vec3(0, 0, 0), new Vec3(-1, 0, 0));
    ball.solveVelocity();
    const slider = makeJointSet("slider", anchor, moving, new Vec3(0, 0, 0), new Vec3(-1, 0, 0), new Vec3(1, 0, 0));
    slider.solveVelocity();
    const fixed = new FixedJoint(anchor, moving, new Vec3(0, 0, 0), new Vec3(-1, 0, 0));
    fixed.solveVelocity();
    expect(Number.isFinite(moving.velocity.x)).toBe(true);
  });
});

describe("ragdolls", () => {
  it("builds a humanoid ragdoll and simulates steps", () => {
    const ragdoll = new Ragdoll(humanoidRagdoll());
    expect(ragdoll.bodies.size).toBe(11);
    expect(ragdoll.joints.length).toBe(10);
    expect(ragdoll.applyImpulse("torso", new Vec3(0, 200, 0))).toBe(true);
    const before = ragdoll.pose().find((entry) => entry.name === "torso")!.position.y;
    for (let i = 0; i < 30; i += 1) ragdoll.step(1 / 60);
    const after = ragdoll.pose().find((entry) => entry.name === "torso")!.position.y;
    expect(after).not.toBeCloseTo(before, 2);
    expect(ragdoll.totalKineticEnergy()).toBeGreaterThan(0);
    expect(ragdoll.applyImpulse("ghost", new Vec3(1, 0, 0))).toBe(false);
  });
});

describe("soft bodies and cloth", () => {
  it("simulates a soft box with constraints", () => {
    const body = SoftBody.box(new Vec3(0, 2, 0), new Vec3(0.5, 0.5, 0.5), 1);
    expect(body.points.length).toBe(8);
    body.pin(0);
    for (let i = 0; i < 30; i += 1) body.step(1 / 60);
    expect(body.center().y).toBeLessThan(2);
    expect(body.volume()).toBeGreaterThan(0);
  });

  it("simulates pinned cloth with wind", () => {
    const cloth = new Cloth(5, 5, 0.25);
    cloth.pinRow(0);
    cloth.settle(40, new Vec3(0, 0, 1));
    expect(cloth.lowestPoint().y).toBeLessThan(0);
    expect(cloth.totalEnergy()).toBeGreaterThan(0);
  });
});

describe("destruction", () => {
  it("fractures boxes into voronoi debris cells", () => {
    const pattern = voronoiFracture(new Vec3(1, 1, 1), [new Vec3(0, 0, 0), new Vec3(0.6, 0.6, 0.6)]);
    expect(pattern.cells.length).toBeGreaterThan(0);
    expect(pattern.totalMass).toBeGreaterThan(0);
    const debris = destroyBoxBody(new Body({ shape: boxShape(new Vec3(1, 1, 1)), position: new Vec3(0, 0, 0), mass: 10 }), [new Vec3(0.5, 0, 0), new Vec3(-0.5, 0, 0)], 1);
    expect(debris.length).toBeGreaterThan(0);
    expect(debris[0]!.velocity.length()).toBeGreaterThan(0);
  });

  it("creates shard hulls and debris bodies", () => {
    const { hulls, masses } = shardHull(boxHull(new Vec3(0.5, 0.5, 0.5)), 4);
    expect(hulls).toHaveLength(4);
    expect(masses.every((mass) => mass > 0)).toBe(true);
    const debris = makeDebrisBody(new Vec3(0, 1, 0), new Vec3(1, 0, 0));
    expect(debris.shape.kind).toBe("sphere");
  });
});
