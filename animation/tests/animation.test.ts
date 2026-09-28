import { describe, expect, it } from "vitest";
import { Quat, Vec3 } from "@obx/math";
import {
  AnimationClip,
  AnimationPlayer,
  AnimationStateMachine,
  AnimationTrack,
  BlendTree1D,
  Skeleton,
  applyLayer,
  blendPoses,
  blendValues,
  rootMotion,
  slerp,
  twoBoneIK,
} from "../src/index.js";

const walk = new AnimationClip(
  "walk",
  1,
  [new AnimationTrack("root.position", [{ time: 0, value: new Vec3(0, 0, 0) }, { time: 1, value: new Vec3(2, 0, 0) }])],
  false,
);
const run = new AnimationClip(
  "run",
  1,
  [new AnimationTrack("root.position", [{ time: 0, value: new Vec3(0, 0, 0) }, { time: 1, value: new Vec3(6, 0, 0) }])],
  false,
);

describe("tracks and clips", () => {
  it("interpolates linearly between keyframes", () => {
    const track = new AnimationTrack("x", [
      { time: 0, value: 0 },
      { time: 1, value: 10 },
    ]);
    expect(track.sample(0.5)).toBeCloseTo(5, 12);
    expect(track.sample(0)).toBe(0);
    expect(track.sample(2)).toBe(10);
  });

  it("holds values with step interpolation", () => {
    const track = new AnimationTrack("x", [
      { time: 0, value: 0 },
      { time: 1, value: 10 },
    ], "step");
    expect(track.sample(0.99)).toBe(0);
    expect(track.sample(1)).toBe(10);
  });

  it("blends vec3 and quat values", () => {
    const mid = blendValues(new Vec3(0, 0, 0), new Vec3(2, 4, 6), 0.5) as Vec3;
    expect(mid.x).toBeCloseTo(1, 12);
    const rotation = slerp(Quat.identity(), Quat.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2), 0.5);
    const applied = rotation.rotateVec3(new Vec3(1, 0, 0));
    expect(applied.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(applied.z).toBeCloseTo(-Math.SQRT1_2, 6);
  });

  it("wraps looping clips", () => {
    const clip = new AnimationClip(
      "loop",
      1,
      [new AnimationTrack("x", [{ time: 0, value: 0 }, { time: 1, value: 1 }])],
      true,
    );
    expect((clip.sample(1.5) as Map<string, number>).get("x")).toBeCloseTo(0.5, 12);
    expect((clip.sample(-0.25) as Map<string, number>).get("x")).toBeCloseTo(0.75, 12);
  });
});

describe("AnimationPlayer", () => {
  it("advances time and respects speed", () => {
    const player = new AnimationPlayer(walk);
    const pose = player.update(0.25)!;
    expect((pose.get("root.position") as Vec3).x).toBeCloseTo(0.5, 12);
    player.speed = 2;
    player.update(0.25);
    expect(player.time).toBeCloseTo(0.75, 12);
  });

  it("stops at the end of non-looping clips", () => {
    const player = new AnimationPlayer(walk);
    player.update(2);
    expect(player.playing).toBe(false);
    expect(player.time).toBe(1);
    player.stop();
    expect(player.time).toBe(0);
  });
});

describe("state machine", () => {
  it("transitions with crossfade", () => {
    const idle = new AnimationClip("idle", 1, [
      new AnimationTrack("root.position", [{ time: 0, value: new Vec3(0, 0, 0) }, { time: 1, value: new Vec3(0, 0, 0) }]),
    ]);
    const machine = new AnimationStateMachine(
      [
        { name: "idle", clip: idle },
        { name: "walk", clip: walk },
      ],
      [{ from: "idle", to: "walk", condition: (params) => params.get("speed") === 1, fadeTime: 0.2 }],
    );
    machine.update(0.1);
    machine.set("speed", 1);
    const mid = machine.update(0.1);
    const position = mid.get("root.position") as Vec3;
    expect(machine.current).toBe("walk");
    expect(position.x).toBeGreaterThan(0);
    expect(position.x).toBeLessThan(0.2);
  });
});

describe("blend tree", () => {
  it("blends clips by parameter", () => {
    const tree = new BlendTree1D([
      { clip: walk, threshold: 0 },
      { clip: run, threshold: 1 },
    ]);
    tree.parameter = 0.5;
    const pose = tree.sample(0.5);
    expect((pose.get("root.position") as Vec3).x).toBeCloseTo(2, 12);
    tree.parameter = -1;
    expect((tree.sample(1).get("root.position") as Vec3).x).toBeCloseTo(2, 12);
    tree.parameter = 2;
    expect((tree.sample(1).get("root.position") as Vec3).x).toBeCloseTo(6, 12);
  });
});

describe("skeleton", () => {
  it("computes world poses through the hierarchy", () => {
    const skeleton = new Skeleton([
      { name: "root", parent: null, position: new Vec3(0, 0, 0), rotation: Quat.identity() },
      {
        name: "arm",
        parent: "root",
        position: new Vec3(1, 0, 0),
        rotation: Quat.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2),
      },
      { name: "hand", parent: "arm", position: new Vec3(1, 0, 0), rotation: Quat.identity() },
    ]);
    const world = skeleton.worldPose(skeleton.restPose());
    const hand = world.get("hand")!;
    expect(hand.position.x).toBeCloseTo(1, 6);
    expect(hand.position.z).toBeCloseTo(-1, 6);
  });

  it("applies weighted layers with masks", () => {
    const base = new Map([["arm.rotation", Quat.identity()]]);
    const layer = new Map([["arm.rotation", Quat.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2)]]);
    const blended = applyLayer(base, layer, 0.5, new Set(["arm"]));
    const rotation = blended.get("arm.rotation") as Quat;
    const applied = rotation.rotateVec3(new Vec3(1, 0, 0));
    expect(applied.x).toBeCloseTo(Math.SQRT1_2, 6);
    const masked = applyLayer(base, layer, 0.5, new Set(["leg"]));
    expect((masked.get("arm.rotation") as Quat).w).toBe(1);
    const full = blendPoses(base, layer, 1).get("arm.rotation") as Quat;
    expect(full.y).toBeCloseTo((layer.get("arm.rotation") as Quat).y, 9);
  });

  it("extracts root motion deltas", () => {
    const delta = rootMotion(walk, 0.25, 0.75);
    expect(delta.position.x).toBeCloseTo(1, 12);
  });
});

describe("two bone IK", () => {
  it("solves joint angles that reach the target distance", () => {
    const result = twoBoneIK(1, 1, new Vec3(1.5, 0, 0));
    const endX = Math.cos(result.rootAngle) + Math.cos(result.rootAngle - result.midAngle);
    const endY = Math.sin(result.rootAngle) + Math.sin(result.rootAngle - result.midAngle);
    expect(Math.hypot(endX, endY)).toBeCloseTo(1.5, 4);
    const max = twoBoneIK(1, 1, new Vec3(10, 0, 0));
    expect(Math.cos(max.rootAngle) * 2).toBeCloseTo(2, 3);
  });
});
