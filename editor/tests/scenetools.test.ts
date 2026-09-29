import { describe, expect, it } from "vitest";
import {
  CameraController,
  SnapService,
  TransformGizmo,
  SceneDocument,
  Selection,
  CommandStack,
  Viewport,
  resetNodeCounter,
} from "../src/index.js";

function makeNode() {
  resetNodeCounter();
  const document = new SceneDocument();
  const node = document.addNode("Node2D", "Target");
  return node;
}

describe("transform gizmo", () => {
  it("builds geometry and hit tests handles", () => {
    const gizmo = new TransformGizmo();
    const geometry = gizmo.geometry({ origin: { x: 100, y: 100 }, mode: "translate" });
    expect(geometry.map((entry) => entry.handle)).toEqual(["translate-x", "translate-y", "translate-z"]);
    const hit = gizmo.hitTest({ x: 148, y: 100 }, geometry);
    expect(hit).toBe("translate-x");
    expect(gizmo.hitTest({ x: 100, y: 60 }, geometry)).not.toBe("none");
    expect(gizmo.hitTest({ x: 0, y: 0 }, geometry)).toBe("none");
    const scaleGeometry = gizmo.geometry({ origin: { x: 0, y: 0 }, mode: "scale" });
    expect(scaleGeometry).toHaveLength(4);
  });

  it("drags translate handles in world space", () => {
    const gizmo = new TransformGizmo();
    const node = makeNode();
    gizmo.beginDrag("translate-x", { x: 0, y: 0 });
    gizmo.drag({ x: 30, y: 10 });
    gizmo.applyTo([node], { x: 30, y: 10 }, 1);
    expect(node.transform.position.x).toBe(30);
    expect(node.transform.position.y).toBe(0);
    const delta = gizmo.endDrag();
    expect(delta).toEqual({ x: 30, y: 10 });
    expect(gizmo.activeHandle).toBe("none");
  });

  it("rotates and scales through handles", () => {
    const gizmo = new TransformGizmo();
    const node = makeNode();
    gizmo.beginDrag("rotate-z", { x: 0, y: 0 });
    gizmo.applyTo([node], { x: 45, y: 0 }, 1);
    expect(node.transform.rotation.z).toBe(45);
    gizmo.endDrag();
    gizmo.beginDrag("scale-uniform", { x: 0, y: 0 });
    gizmo.applyTo([node], { x: 100, y: 0 }, 1);
    expect(node.transform.scale.x).toBeCloseTo(2, 5);
    expect(node.transform.scale.y).toBeCloseTo(2, 5);
  });

  it("applies local-space rotation to translate deltas", () => {
    const gizmo = new TransformGizmo();
    const node = makeNode();
    node.transform.rotation.z = 90;
    gizmo.space = "local";
    gizmo.beginDrag("translate-x", { x: 0, y: 0 });
    gizmo.applyTo([node], { x: 10, y: 0 }, 1);
    expect(node.transform.position.x).toBeCloseTo(0, 5);
    expect(node.transform.position.y).toBeCloseTo(10, 5);
    void 0;
    const worldGizmo = new TransformGizmo();
    worldGizmo.beginDrag("translate-x", { x: 0, y: 0 });
    const other = makeNode();
    other.transform.rotation.z = 90;
    worldGizmo.applyTo([other], { x: 10, y: 0 }, 1);
    expect(other.transform.position.x).toBe(10);
    expect(other.transform.position.y).toBe(0);
  });
});

describe("snap service", () => {
  it("snaps to grid", () => {
    const snap = new SnapService();
    expect(snap.snapToGrid(0.7)).toBe(0.5);
    expect(snap.snapToGrid(0.9)).toBe(1);
    expect(snap.snapPoint({ x: 0.7, y: -0.3 })).toEqual({ x: 0.5, y: -0.5 });
    snap.settings.gridEnabled = false;
    expect(snap.resolve({ x: 0.7, y: 0.2 })).toEqual({ x: 0.7, y: 0.2 });
  });

  it("snaps to nearby vertices and prefers them over grid", () => {
    const snap = new SnapService();
    const candidates = [
      { x: 1.1, y: 2.2 },
      { x: 5, y: 5 },
    ];
    expect(snap.snapToPoints({ x: 1.0, y: 2.0 }, candidates)).toEqual({ x: 1.1, y: 2.2 });
    expect(snap.snapToPoints({ x: 0, y: 0 }, candidates)).toBeNull();
    expect(snap.resolve({ x: 1.0, y: 2.0 }, candidates)).toEqual({ x: 1.1, y: 2.2 });
    expect(snap.resolve({ x: 0.7, y: 0.2 }, [])).toEqual({ x: 0.5, y: 0 });
    snap.settings.vertexEnabled = false;
    expect(snap.snapToPoints({ x: 1, y: 2 }, candidates)).toBeNull();
    expect(snap.collectPoints([{ transform: { position: { x: 3, y: 4, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } } as never])).toEqual([{ x: 3, y: 4 }]);
  });
});

describe("camera controller", () => {
  it("navigates and frames nodes", () => {
    const viewport = new Viewport();
    const camera = new CameraController(viewport);
    const a = makeNode();
    const b = makeNode();
    a.transform.position = { x: -10, y: -5, z: 0 };
    b.transform.position = { x: 10, y: 5, z: 0 };
    camera.frameNodes([a, b]);
    expect(viewport.camera.x).toBeCloseTo(0, 5);
    expect(viewport.camera.y).toBeCloseTo(0, 5);
    camera.flyTo(a, 3);
    expect(viewport.camera.x).toBe(-10);
    expect(viewport.camera.zoom).toBe(3);
    camera.navigateTo(2, 2);
    expect(viewport.camera.zoom).toBe(1);
    camera.frameNodes([]);
    expect(viewport.camera.x).toBe(2);
  });
});

describe("viewport integration", () => {
  it("round-trips world and screen coordinates", () => {
    const viewport = new Viewport();
    const screen = viewport.worldToScreen({ x: 5, y: 5 });
    expect(screen).toEqual({ x: 5, y: 5 });
    viewport.pan(10, 10);
    expect(viewport.screenToWorld(viewport.worldToScreen({ x: 3, y: 3 }))).toEqual({ x: 3, y: 3 });
  });
});

describe("selection sanity", () => {
  it("toggles membership", () => {
    const selection = new Selection();
    selection.add("a");
    selection.toggle("a");
    selection.toggle("b");
    expect(selection.list).toEqual(["b"]);
    selection.clear();
    expect(selection.size).toBe(0);
  });

  it("keeps command stack transaction semantics", () => {
    resetNodeCounter();
    const document = new SceneDocument();
    const stack = new CommandStack();
    stack.beginTransaction("batch");
    stack.execute({
      label: "noop",
      apply: () => undefined,
      undo: () => undefined,
    } as never);
    stack.commitTransaction();
    expect(stack.depth).toBe(1);
    expect(stack.history).toEqual(["batch"]);
  });
});
