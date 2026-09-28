import { describe, expect, it } from "vitest";
import {
  AddNodeCommand,
  CommandStack,
  EditorConsole,
  EditorSession,
  Inspector,
  Profiler,
  RemoveNodeCommand,
  RenameNodeCommand,
  ReparentNodeCommand,
  SceneDocument,
  Selection,
  SetPropertyCommand,
  TransformTool,
  Viewport,
  resetNodeCounter,
} from "../src/index.js";

describe("SceneDocument", () => {
  it("adds, renames and removes nodes with hierarchy", () => {
    resetNodeCounter();
    const scene = new SceneDocument("World");
    expect(scene.size).toBe(1);
    const player = scene.addNode("Node2D", "Player");
    const weapon = scene.addNode("Node2D", "Weapon", player.id);
    expect(scene.size).toBe(3);
    expect(scene.node(player.id).children).toEqual([weapon.id]);
    expect(scene.findByName("Weapon")?.id).toBe(weapon.id);
    expect(scene.renameNode(player.id, "Hero")).toBe("Player");
    const removed = scene.removeNode(player.id);
    expect(removed.length).toBe(2);
    expect(scene.has(weapon.id)).toBe(false);
    expect(() => scene.removeNode(scene.rootId)).toThrow(RangeError);
    expect(() => scene.node("ghost")).toThrow(RangeError);
  });

  it("reparents without cycles", () => {
    const scene = new SceneDocument();
    const a = scene.addNode("Node2D", "A");
    const b = scene.addNode("Node2D", "B", a.id);
    const c = scene.addNode("Node2D", "C", b.id);
    expect(scene.reparent(b.id, scene.rootId)).toBe(a.id);
    expect(scene.node(a.id).children).toEqual([]);
    expect(scene.isAncestor(a.id, b.id)).toBe(false);
    expect(() => scene.reparent(b.id, c.id)).toThrow(RangeError);
    expect(() => scene.reparent(a.id, a.id)).toThrow(RangeError);
  });

  it("snapshots and restores", () => {
    const scene = new SceneDocument();
    const node = scene.addNode("Node2D", "X");
    const snapshot = scene.snapshot();
    scene.renameNode(node.id, "Y");
    scene.removeNode(node.id);
    scene.restore(snapshot);
    expect(scene.findByName("X")?.id).toBe(node.id);
  });
});

describe("CommandStack", () => {
  it("executes, undoes and redoes commands", () => {
    resetNodeCounter();
    const scene = new SceneDocument();
    const stack = new CommandStack();
    const add = new AddNodeCommand(scene, "Camera", "MainCamera", null);
    stack.execute(add);
    expect(scene.size).toBe(2);
    expect(stack.canUndo).toBe(true);
    expect(stack.history[0]).toContain("Add Camera");
    stack.undo();
    expect(scene.size).toBe(1);
    expect(stack.canRedo).toBe(true);
    stack.redo();
    expect(scene.size).toBe(2);
    expect(scene.findByName("MainCamera")).not.toBe(null);

    const node = scene.findByName("MainCamera")!;
    stack.execute(new RenameNodeCommand(scene, node.id, "Camera2D"));
    expect(node.name).toBe("Camera2D");
    stack.undo();
    expect(node.name).toBe("MainCamera");
  });

  it("groups transactions and enforces history limit", () => {
    resetNodeCounter();
    const scene = new SceneDocument();
    const stack = new CommandStack(4);
    stack.beginTransaction("spawn wave");
    stack.execute(new AddNodeCommand(scene, "Enemy", "E1", null));
    stack.execute(new AddNodeCommand(scene, "Enemy", "E2", null));
    stack.commitTransaction();
    expect(scene.size).toBe(3);
    expect(stack.depth).toBe(1);
    expect(stack.history).toEqual(["spawn wave"]);
    stack.undo();
    expect(scene.size).toBe(1);
    stack.redo();
    expect(scene.size).toBe(3);

    for (let index = 0; index < 6; index += 1) {
      stack.execute(new AddNodeCommand(scene, "Node2D", `N${index}`, null));
    }
    expect(stack.depth).toBe(4);
    expect(stack.undo()).toBe(true);
  });

  it("handles property edits with undo", () => {
    const scene = new SceneDocument();
    const node = scene.addNode("Node2D", "Box");
    const stack = new CommandStack();
    stack.execute(new SetPropertyCommand(node, "transform.position.x", 5));
    stack.execute(new SetPropertyCommand(node, "name", "Crate"));
    expect(node.transform.position.x).toBe(5);
    expect(node.name).toBe("Crate");
    stack.undo();
    expect(node.name).toBe("Box");
    stack.undo();
    expect(node.transform.position.x).toBe(0);
    stack.redo();
    expect(node.transform.position.x).toBe(5);

    stack.execute(new SetPropertyCommand(node, "color", "red"));
    expect(node.properties.color).toBe("red");
    stack.undo();
    expect(node.properties.color).toBe(undefined);
  });

  it("removes and re-adds nodes across undo and redo", () => {
    resetNodeCounter();
    const scene = new SceneDocument();
    const node = scene.addNode("Node2D", "Temp");
    const stack = new CommandStack();
    stack.execute(new RemoveNodeCommand(scene, node.id));
    expect(scene.has(node.id)).toBe(false);
    stack.undo();
    expect(scene.findByName("Temp")?.id).toBe(node.id);
  });

  it("reparents with undo", () => {
    const scene = new SceneDocument();
    const a = scene.addNode("Node2D", "A");
    const b = scene.addNode("Node2D", "B");
    const stack = new CommandStack();
    stack.execute(new ReparentNodeCommand(scene, b.id, a.id));
    expect(scene.node(b.id).parent).toBe(a.id);
    stack.undo();
    expect(scene.node(b.id).parent).toBe(scene.rootId);
    expect(stack.commitTransaction()).toBe(false);
  });
});

describe("Selection and Inspector", () => {
  it("manages selection state", () => {
    const selection = new Selection();
    selection.select("a");
    selection.add("b");
    selection.toggle("c");
    selection.toggle("a");
    expect(selection.list.sort()).toEqual(["b", "c"]);
    expect(selection.has("b")).toBe(true);
    selection.clear();
    expect(selection.size).toBe(0);
  });

  it("describes and validates properties", () => {
    const inspector = new Inspector();
    const scene = new SceneDocument();
    const camera = scene.addNode("Camera", "Cam");
    const light = scene.addNode("Light", "Sun");
    expect(inspector.schemaFor("Camera")?.properties.length).toBe(3);
    expect(inspector.describe(camera).map((d) => d.path)).toContain("zoom");
    expect(inspector.describe(light).map((d) => d.path)).toContain("color");
    const unknown = scene.addNode("Enemy", "E");
    expect(inspector.describe(unknown)[0]!.path).toBe("name");
    expect(inspector.read(camera, "transform.position")).toEqual({ x: 0, y: 0, z: 0 });
    expect(inspector.read(camera, "name")).toBe("Cam");
    expect(inspector.read(light, "intensity")).toBe(null);
    expect(inspector.validate({ path: "zoom", label: "Zoom", kind: "number", min: 0, max: 10 }, 5)).toBe(null);
    expect(inspector.validate({ path: "zoom", label: "Zoom", kind: "number", min: 0, max: 10 }, 50)).toBe("max 10");
    expect(inspector.validate({ path: "name", label: "Name", kind: "string" }, 3)).toBe("expected a string");
    expect(inspector.validate({ path: "flag", label: "Flag", kind: "bool" }, true)).toBe(null);
    expect(inspector.validate({ path: "mode", label: "Mode", kind: "enum", options: ["a"] }, "b")).toBe("invalid option");
  });
});

describe("TransformTool", () => {
  it("applies translate, rotate and scale with snapping", () => {
    const scene = new SceneDocument();
    const node = scene.addNode("Node2D", "G");
    const tool = new TransformTool();
    tool.setMode("translate");
    tool.applyDrag(node, { x: 1.2, y: -0.3, z: 0 }, true);
    expect(node.transform.position.x).toBe(1);
    expect(node.transform.position.y).toBe(-0.5);
    tool.setMode("rotate");
    tool.applyDrag(node, { x: 20, y: 0, z: 0 }, true);
    expect(node.transform.rotation.x).toBe(15);
    tool.setMode("scale");
    tool.applyDrag(node, { x: 0.3, y: -2, z: 0 }, true);
    expect(node.transform.scale.x).toBe(1.25);
    expect(node.transform.scale.y).toBe(0.01);
  });
});

describe("Console, Profiler, Viewport", () => {
  it("logs and filters console entries", () => {
    const console = new EditorConsole();
    console.log("info", "hello");
    console.log("warn", "careful");
    console.log("error", "broken");
    console.log("info", "again");
    expect(console.entries.length).toBe(4);
    expect(console.filter("warn").length).toBe(1);
    expect(console.filter("all").length).toBe(4);
    expect(console.counts).toEqual({ info: 2, warn: 1, error: 1 });
    console.clear();
    expect(console.entries.length).toBe(0);
  });

  it("records profiler samples", () => {
    const profiler = new Profiler();
    profiler.record("render", 4);
    profiler.record("render", 6);
    profiler.record("physics", 2);
    const report = profiler.report();
    expect(report[0]!.label).toBe("render");
    expect(report[0]!.average).toBe(5);
    expect(profiler.frameTotal).toBe(12);
  });

  it("transforms viewport coordinates", () => {
    const viewport = new Viewport();
    expect(viewport.worldToScreen({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    viewport.pan(50, 20);
    expect(viewport.camera.x).toBe(50);
    const anchor = viewport.screenToWorld({ x: 100, y: 100 });
    viewport.zoomAt({ x: 100, y: 100 }, 2);
    expect(viewport.camera.zoom).toBe(2);
    expect(viewport.screenToWorld({ x: 100, y: 100 })).toEqual(anchor);
    viewport.frame({ min: { x: -10, y: -10 }, max: { x: 10, y: 10 } });
    expect(viewport.camera.x).toBe(0);
    expect(viewport.camera.zoom).toBeGreaterThan(5);
  });
});

describe("EditorSession", () => {
  it("bundles the full editor toolchain", () => {
    resetNodeCounter();
    const session = new EditorSession("Level");
    session.stack.execute(new AddNodeCommand(session.document, "Node2D", "Player", null));
    const player = session.document.findByName("Player")!;
    session.selection.select(player.id);
    session.tool.setMode("translate");
    session.stack.execute(new SetPropertyCommand(player, "transform.position.x", 3));
    session.console.log("info", "scene ready");
    session.profiler.record("render", 3);
    expect(session.document.size).toBe(2);
    expect(session.selection.list).toEqual([player.id]);
    expect(player.transform.position.x).toBe(3);
    expect(session.console.counts.info).toBe(1);
  });
});
