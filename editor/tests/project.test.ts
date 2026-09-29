import { describe, expect, it } from "vitest";
import { ProjectError, ProjectManager } from "../src/index.js";

describe("project manager", () => {
  it("creates and opens projects", () => {
    const manager = new ProjectManager();
    const project = manager.create("Demo", "/projects/demo");
    expect(project.name).toBe("Demo");
    expect(manager.current!.id).toBe(project.id);
    expect(manager.recent()[0]!.id).toBe(project.id);
    expect(() => manager.create("Other", "/projects/demo")).toThrow(ProjectError);
  });

  it("tracks recents and switching", () => {
    const manager = new ProjectManager();
    const first = manager.create("A", "/a");
    const second = manager.create("B", "/b");
    expect(manager.recent().map((entry) => entry.name)).toEqual(["B", "A"]);
    manager.open(first.id);
    expect(manager.current!.name).toBe("A");
    expect(manager.recent().map((entry) => entry.name)).toEqual(["A", "B"]);
    expect(manager.close(second.id)).toBe(true);
    expect(manager.close(second.id)).toBe(false);
    expect(manager.all()).toHaveLength(1);
  });

  it("tracks scenes and dirty state", () => {
    const manager = new ProjectManager();
    const project = manager.create("Game", "/game");
    manager.addScene(project.id, "scenes/level1.scene");
    manager.addScene(project.id, "scenes/level1.scene");
    expect(project.scenes).toEqual(["scenes/level1.scene"]);
    expect(project.dirty).toBe(true);
    manager.markSaved(project.id);
    expect(project.dirty).toBe(false);
    expect(() => manager.addScene("nope", "x")).toThrow(ProjectError);
    expect(() => manager.open("nope")).toThrow(ProjectError);
    expect(() => manager.markSaved("nope")).toThrow(ProjectError);
  });
});
