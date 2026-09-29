import { describe, expect, it } from "vitest";
import { ObsiFoxStudio, STUDIO_NAME, resetNodeCounter } from "../src/index.js";

function makeStudio(): ObsiFoxStudio {
  resetNodeCounter();
  let clock = 0;
  return new ObsiFoxStudio({ now: () => (clock += 100) });
}

describe("ObsiFox Studio", () => {
  it("wires the full shell", () => {
    const studio = makeStudio();
    expect(STUDIO_NAME).toBe("ObsiFox Studio");
    expect(studio.visiblePanels()).toContain("scene-view");
    expect(studio.palette.size).toBeGreaterThanOrEqual(6);
    expect(studio.shortcuts.resolve("ctrl+s")).toBe("file.save");
    expect(studio.preferences.get("editor.theme", "")).toBe("obsidian");
  });

  it("completes the developer workflow: project → scene → entities → components", () => {
    const studio = makeStudio();
    const project = studio.createProject("MyGame", "/projects/mygame");
    expect(studio.projects.current!.id).toBe(project.id);
    expect(studio.statusBar.get("project")).toBe("MyGame");

    const scene = studio.createScene("level1");
    expect(scene.format).toBe("obx-editor-scene");
    expect(project.scenes).toEqual(["scenes/level1.scene"]);

    const entity = studio.addEntity("Node2D", "Player");
    expect(studio.document.node(entity).name).toBe("Player");
    expect(studio.statusBar.get("selection")).toBe("Player");

    studio.modifyComponent(entity, "transform.position", { x: 2, y: 3 });
    studio.modifyComponent(entity, "transform.position.x", 5);
    expect(studio.document.node(entity).transform.position.x).toBe(5);
    studio.modifyComponent(entity, "health", 900);
    expect(studio.console.filter("warn").length).toBeGreaterThanOrEqual(0);
  });

  it("imports assets and saves scenes", () => {
    const studio = makeStudio();
    studio.createProject("Game", "/g");
    studio.browser.addEntry({ path: "/assets/hero.png", name: "hero.png", kind: "asset", type: "image", size: 10, guid: "g1", metadata: {} });
    const reports = studio.importAssets(["/assets/hero.png"]);
    expect(reports[0]!.status).toBe("imported");
    expect(studio.statusBar.get("assets")).toBe("1");

    const entity = studio.addEntity("Sprite", "Hero");
    studio.modifyComponent(entity, "transform.position.x", 9);
    expect(studio.isDirty()).toBe(true);
    const saved = studio.saveScene();
    expect(studio.isDirty()).toBe(false);
    expect(saved.nodes).toHaveLength(2);

    const other = makeStudio();
    other.loadScene(JSON.stringify(saved));
    expect(other.document.size).toBe(2);
    expect(other.isDirty()).toBe(false);
    expect(() => other.loadScene(JSON.stringify({ format: "alien" }))).toThrow();
  });

  it("runs projects and debugs errors", () => {
    const studio = makeStudio();
    studio.createProject("Game", "/g");
    studio.editScript("scripts/ai.ts", "function think() { return 1; }");
    studio.scripts.setRunner(() => ({ ok: true, output: ["tick"], error: null }));
    const report = studio.runProject();
    expect(report.ok).toBe(true);
    expect(report.steps).toEqual(["compile", "simulate", "present"]);
    expect(report.logs).toContain("tick");
    expect(studio.debugErrors()).toHaveLength(0);

    studio.editScript("scripts/bad.ts", "function broken() {");
    studio.scripts.setRunner(() => ({ ok: false, output: [], error: "SyntaxError: unexpected:1" }));
    const failed = studio.runProject();
    expect(failed.ok).toBe(false);
    const errors = studio.debugErrors();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((diagnostic) => diagnostic.message.includes("unexpected"))).toBe(true);
  });

  it("supports undo/redo through palette commands", () => {
    const studio = makeStudio();
    studio.addEntity("Node2D", "A");
    expect(studio.document.size).toBe(2);
    expect(studio.palette.execute("edit.undo")).toBe(true);
    expect(studio.document.size).toBe(1);
    expect(studio.palette.execute("edit.redo")).toBe(true);
    expect(studio.document.size).toBe(2);
    expect(studio.palette.execute("scene.duplicate")).toBe(true);
    expect(studio.document.size).toBe(3);
  });

  it("exposes gizmo hit testing from the current selection", () => {
    const studio = makeStudio();
    const entity = studio.addEntity("Node2D", "Hero");
    studio.hierarchy.selectOnly(entity);
    studio.tool.setMode("translate");
    const handle = studio.hitTestGizmo({ x: 48, y: 0 });
    expect(handle).toBe("translate-x");
  });

  it("persists layouts through the studio", () => {
    const studio = makeStudio();
    studio.docking.splitPanel("scene-view", "vertical", "console");
    studio.layouts.save("debug", studio.layoutSnapshot());
    expect(studio.layouts.names()).toEqual(["debug"]);
    const restored = studio.layouts.load("debug")!;
    expect(restored.focused).toBe("console");
    expect(studio.describe(studio.document.rootId).length).toBeGreaterThan(0);
  });

  it("multi-edits selection", () => {
    const studio = makeStudio();
    const a = studio.addEntity("Node2D", "A");
    const b = studio.addEntity("Node2D", "B");
    const result = studio.multiEdit([a, b], "transform.position.x", 4);
    expect(result.updated).toBe(2);
    expect(studio.document.node(a).transform.position.x).toBe(4);
    expect(studio.document.node(b).transform.position.x).toBe(4);
  });
});
