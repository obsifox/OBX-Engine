import { describe, expect, it } from "vitest";
import { Quat, Vec3 } from "@obx/math";
import {
  AnimationEditor,
  AnimationEventEmitter,
  AnimationEventPlayer,
  AnimationLayerStack,
  BlendTree2D,
  BlendTree2DEditor,
  DirectBlend,
  EventTrack,
  LayerStackEditor,
  SkeletonEditor,
  blendAdditive,
  buildRetargetMap,
  ccdSolve,
  chainLengths,
  fabrikSolve,
  lookAtRotation,
  retargetPose,
  rotationBetween,
  scaleSkeleton,
} from "../src/index.js";
import { AnimationClip, AnimationTrack, Skeleton, rootMotion } from "../src/animation.js";

function clip(name: string, xKeys: [number, number][]): AnimationClip {
  const track = new AnimationTrack("bone.position", xKeys.map(([time, x]) => ({ time, value: new Vec3(x, 0, 0) })));
  return new AnimationClip(name, 1, [track], true);
}

describe("animation events", () => {
  it("fires events in ranges including loop wraps", () => {
    const track = new EventTrack([
      { time: 0.25, name: "footstep", payload: { foot: "left" } },
      { time: 0.75, name: "footstep", payload: { foot: "right" } },
    ]);
    expect(track.eventsInRange(0, 0.5).map((event) => event.payload?.foot)).toEqual(["left"]);
    const wrapped = track.eventsInRange(0.8, 0.3, 1, true);
    expect(wrapped.map((event) => event.time)).toEqual([0.25]);
  });

  it("emits through listeners and playback cursors", () => {
    const emitter = new AnimationEventEmitter();
    const seen: string[] = [];
    emitter.on("hit", (event) => seen.push(event.name));
    emitter.onAny((event) => seen.push(`any:${event.name}`));
    const track = new EventTrack([{ time: 0.5, name: "hit" }]);
    expect(emitter.emitRange(track, 0, 1)).toBe(2);
    expect(seen).toEqual(["hit", "any:hit"]);
    const player = new AnimationEventPlayer(new EventTrack([{ time: 0.2, name: "footstep" }]), { time: 0, duration: 1, loop: true });
    let fired = 0;
    player.emitter.onAny(() => {
      fired += 1;
    });
    expect(player.advance(0.5)).toBe(1);
    expect(player.time).toBe(0.5);
    expect(fired).toBe(1);
  });

  it("adds and removes events with editor API", () => {
    const editor = new AnimationEditor("walk", 1);
    editor.addEvent({ time: 0.5, name: "footstep" });
    editor.addEvent({ time: 0.9, name: "footstep" });
    expect(editor.removeEvent("footstep", 0.5)).toBe(1);
    expect(editor.eventTrack().events).toHaveLength(1);
  });
});

describe("blend trees and layers", () => {
  it("blends two 2D samples toward the query point", () => {
    const tree = new BlendTree2D([
      { x: 0, y: 0, clip: clip("idle", [[0, 0], [1, 0]]) },
      { x: 1, y: 0, clip: clip("run", [[0, 1], [1, 1]]) },
    ]);
    const pose = tree.sample(0.5, 0.5, 0)!;
    const value = pose.get("bone.position") as Vec3;
    expect(value.x).toBeGreaterThan(0.2);
    expect(value.x).toBeLessThan(0.8);
  });

  it("composes layers with masks and additive blending", () => {
    const base = clip("base", [[0, 1], [1, 1]]);
    const overlay = clip("overlay", [[0, 2], [1, 2]]);
    const stack = new AnimationLayerStack();
    stack.add({ name: "upper", clip: overlay, weight: 0.5, mask: new Set(["bone"]) });
    const pose = stack.compose(0.5, base.sample(0.5));
    const value = pose.get("bone.position") as Vec3;
    expect(value.x).toBeCloseTo(1.5, 5);
    stack.setWeight("upper", 1);
    const direct = new DirectBlend(base, overlay, 0.25).sample(0.5).get("bone.position") as Vec3;
    expect(direct.x).toBeCloseTo(1.25, 5);
  });

  it("adds additive deltas over a base pose", () => {
    const base: Map<string, Vec3> = new Map([["bone.position", new Vec3(1, 0, 0)]]);
    const additive: Map<string, Vec3> = new Map([["bone.position", new Vec3(2, 0, 0)]]);
    const result = blendAdditive(base, additive, 0.5);
    expect((result.get("bone.position") as Vec3).x).toBeCloseTo(2, 5);
  });

  it("builds layer stacks from the editor", () => {
    const editor = new LayerStackEditor();
    const clipEditor = new AnimationEditor("add", 1);
    clipEditor.setKey("bone.position", 0, new Vec3(1, 0, 0));
    clipEditor.setKey("bone.position", 1, new Vec3(1, 0, 0));
    editor.addLayer("additive", clipEditor, 1, null, true);
    const stack = editor.build();
    const pose = stack.compose(0.5, new Map([["bone.position", new Vec3(0, 0, 0)]]));
    expect((pose.get("bone.position") as Vec3).x).toBeCloseTo(1, 5);
  });
});

describe("retargeting", () => {
  it("maps bones by name and retargets rotations", () => {
    const sourceSkeleton = new Skeleton([
      { name: "root", parent: null, position: new Vec3(0, 0, 0), rotation: Quat.identity() },
      { name: "spine", parent: "root", position: new Vec3(0, 1, 0), rotation: Quat.identity() },
    ]);
    const targetSkeleton = new Skeleton([
      { name: "root", parent: null, position: new Vec3(0, 0, 0), rotation: Quat.identity() },
      { name: "torso", parent: "root", position: new Vec3(0, 2, 0), rotation: Quat.identity() },
    ]);
    const map = buildRetargetMap(sourceSkeleton, targetSkeleton, { spine: "torso" }, 2);
    expect(map.boneMap.get("spine")).toBe("torso");
    const sourcePose = sourceSkeleton.restPose();
    sourcePose.set("spine.rotation", Quat.fromAxisAngle(new Vec3(1, 0, 0), Math.PI / 2));
    const retargeted = retargetPose(sourcePose, map, sourceSkeleton, targetSkeleton);
    const torsoRotation = retargeted.get("torso.rotation") as Quat;
    expect(torsoRotation.equals(Quat.fromAxisAngle(new Vec3(1, 0, 0), Math.PI / 2), 1e-6)).toBe(true);
    expect((retargeted.get("torso.position") as Vec3).y).toBeCloseTo(2, 5);
    const scaled = scaleSkeleton(sourceSkeleton, 2);
    expect(scaled[1]!.position.y).toBeCloseTo(2, 5);
  });
});

describe("inverse kinematics", () => {
  it("solves FABRIK chains toward reachable targets", () => {
    const positions = [new Vec3(0, 0, 0), new Vec3(1, 0, 0), new Vec3(2, 0, 0)];
    const lengths = chainLengths(positions);
    expect(lengths).toEqual([1, 1]);
    const solved = fabrikSolve({ positions, lengths }, new Vec3(1, 1, 0), 20, 1e-4);
    const end = solved[solved.length - 1]!;
    expect(end.distanceTo(new Vec3(1, 1, 0))).toBeLessThan(0.02);
    expect(solved[0]!.distanceTo(new Vec3(0, 0, 0))).toBeLessThan(1e-6);
  });

  it("extends fully when the target is out of reach", () => {
    const solved = fabrikSolve({ positions: [new Vec3(0, 0, 0), new Vec3(1, 0, 0)], lengths: [1] }, new Vec3(10, 0, 0));
    expect(solved[1]!.x).toBeCloseTo(1, 5);
  });

  it("solves CCD chains and look-at rotations", () => {
    const joints = [
      { rotation: Quat.identity(), position: new Vec3(0, 0, 0) },
      { rotation: Quat.identity(), position: new Vec3(1, 0, 0) },
      { rotation: Quat.identity(), position: new Vec3(2, 0, 0) },
    ];
    const solved = ccdSolve(joints, new Vec3(1, 1, 0), 24, 1e-4);
    expect(solved[2]!.position.distanceTo(new Vec3(1, 1, 0))).toBeLessThan(0.05);
    const look = lookAtRotation(new Vec3(1, 0, 0), new Vec3(0, 1, 0));
    const rotated = look.rotation.rotateVec3(new Vec3(1, 0, 0));
    expect(rotated.y).toBeCloseTo(1, 4);
    const between = rotationBetween(new Vec3(1, 0, 0), new Vec3(1, 0, 0));
    expect(between.equals(Quat.identity())).toBe(true);
  });
});

describe("animation editor", () => {
  it("authors clips with keys, events and validation", () => {
    const editor = new AnimationEditor("walk", 1);
    editor.addTrack("root.position");
    editor.setKey("root.position", 0, new Vec3(0, 0, 0));
    editor.setKey("root.position", 1, new Vec3(1, 0, 0));
    editor.addEvent({ time: 0.5, name: "footstep" });
    expect(editor.validate()).toEqual([]);
    const clip = editor.build();
    expect(clip.duration).toBe(1);
    expect(rootMotion(clip, 0, 0.5).position.x).toBeCloseTo(0.5, 5);
    editor.removeKey("root.position", 0);
    editor.removeKey("root.position", 1);
    expect(editor.validate().length).toBeGreaterThan(0);
  });

  it("round trips clip documents through JSON", () => {
    const editor = new AnimationEditor("run", 0.8);
    editor.setKey("root.rotation", 0, Quat.identity());
    editor.setKey("root.rotation", 0.8, Quat.fromAxisAngle(new Vec3(0, 1, 0), Math.PI));
    editor.addEvent({ time: 0.4, name: "footstep", payload: { foot: "left" } });
    const json = JSON.parse(JSON.stringify(editor.serialize()));
    const restored = AnimationEditor.deserialize(json);
    const clip = restored.build();
    expect(clip.name).toBe("run");
    expect(restored.eventTrack().events[0]!.payload?.foot).toBe("left");
  });

  it("edits skeletons with reparent and cycle protection", () => {
    const editor = new SkeletonEditor();
    editor.addBone("root", null, new Vec3(0, 0, 0));
    editor.addBone("spine", "root", new Vec3(0, 1, 0));
    editor.addBone("head", "spine", new Vec3(0, 2, 0));
    expect(editor.reparent("root", "head")).toBe(false);
    expect(editor.removeBone("spine")).toBe(false);
    expect(editor.reparent("head", "root")).toBe(true);
    expect(editor.removeBone("spine")).toBe(true);
    expect(editor.removeBone("head")).toBe(true);
    const json = JSON.parse(JSON.stringify(editor.serialize()));
    const restored = SkeletonEditor.deserialize(json);
    expect(restored.validate()).toEqual([]);
    expect(restored.build().order[0]).toBe("root");
  });

  it("authors 2D blend trees from serialized clips", () => {
    const editor = new BlendTree2DEditor();
    const idle = new AnimationEditor("idle", 1);
    idle.setKey("b.position", 0, new Vec3(0, 0, 0));
    const run = new AnimationEditor("run", 1);
    run.setKey("b.position", 0, new Vec3(1, 0, 0));
    editor.addSample(0, 0, idle);
    editor.addSample(1, 0, run);
    editor.valueX = 1;
    const tree = editor.build();
    expect(tree.samples).toHaveLength(2);
    expect(tree.sample(0)).not.toBeNull();
  });
});
