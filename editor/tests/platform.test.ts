import { describe, expect, it } from "vitest";
import { Vec3 } from "@obx/math";
import { AiEditorPanel, AnimationEditorPanel, goapAction } from "../src/index.js";

describe("animation editor panel", () => {
  it("authors clips, keys and events with undo", () => {
    const panel = new AnimationEditorPanel();
    panel.createClip("walk", 1);
    panel.setKey("root.position", 0, new Vec3(0, 0, 0));
    panel.setKey("root.position", 1, new Vec3(1, 0, 0));
    panel.addEvent({ time: 0.5, name: "footstep" });
    expect(panel.eventTrack().events).toHaveLength(1);
    expect(panel.state.dirty).toBe(true);
    panel.undo();
    expect(panel.eventTrack().events).toHaveLength(0);
    panel.redo();
    expect(panel.eventTrack().events).toHaveLength(1);
    expect(panel.validate()).toEqual([]);
  });

  it("edits skeletons and exports documents", () => {
    const panel = new AnimationEditorPanel();
    expect(panel.addBone("root", null, new Vec3(0, 0, 0))).toBe(true);
    expect(panel.addBone("root", null)).toBe(false);
    panel.createClip("idle", 0.5);
    panel.setKey("root.position", 0, new Vec3(0, 1, 0));
    const exported = panel.exportAll();
    expect(exported.clips).toHaveLength(1);
    expect(exported.skeleton.bones).toHaveLength(1);
    panel.importClips([{ name: "run", duration: 0.4, loop: false, tracks: [], events: [] }]);
    expect(panel.clips.has("run")).toBe(true);
    expect(panel.selectClip("run")).toBe(true);
  });
});

describe("ai editor panel", () => {
  it("authors behavior trees and ticks with the debugger", () => {
    const panel = new AiEditorPanel();
    panel.setTree({
      kind: "selector",
      name: "root",
      children: [
        {
          kind: "sequence",
          name: "work",
          children: [
            { kind: "condition", name: "ready?", key: "ready", equals: true },
            { kind: "action", name: "do", effectKey: "done", effectValue: true },
          ],
        },
      ],
    });
    const snapshot = panel.tick(new Map([["ready", true]]));
    expect(snapshot.lastStatus).toBe("success");
    expect(panel.inspect(0)).not.toBeNull();
    expect(panel.validate()).toEqual([]);
    panel.undo();
    expect(panel.tree).toBeNull();
    panel.redo();
    expect(panel.tree).not.toBeNull();
  });

  it("authors utility actions and plans goap goals", () => {
    const panel = new AiEditorPanel();
    panel.addUtilityAction("patrol", [{ name: "alert", key: "alert", curve: "inverse" }]);
    panel.addUtilityAction("attack", [{ name: "alert", key: "alert", curve: "quadratic" }]);
    expect(panel.utilityActions).toHaveLength(2);
    panel.blackboard.set("hasAxe", true);
    panel.setGoal({ fireLit: true });
    const plan = panel.plan([
      goapAction("chop-tree", 1, { hasAxe: true }, { hasWood: true }),
      goapAction("make-fire", 1, { hasWood: true }, { fireLit: true }),
    ]);
    expect(plan).not.toBeNull();
    expect(plan!.actions.map((action) => action.name)).toEqual(["chop-tree", "make-fire"]);
    const sensed = panel.sense([{ id: "e", kind: "enemy", position: { x: 2, y: 0, z: 0 }, strength: 1 }]);
    expect(sensed).toHaveLength(1);
    panel.debugger.pause();
    panel.tick();
    expect(panel.debugger.paused).toBe(true);
  });
});
