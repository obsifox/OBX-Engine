import { describe, expect, it } from "vitest";
import {
  AssetIndex,
  CURRENT_FORMAT,
  Project,
  ProjectError,
  createManifest,
  defaultSettings,
  migrateManifest,
  parseVersion,
  satisfies,
  standardFolders,
} from "../src/index.js";

describe("createManifest", () => {
  it("builds manifests with defaults", () => {
    const manifest = createManifest({ name: "MyGame" });
    expect(manifest.format).toBe(CURRENT_FORMAT);
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.settings["render.width"]).toBe(1280);
    expect(() => createManifest({ name: "1bad" })).toThrow(ProjectError);
  });
});

describe("Project", () => {
  it("creates the standard folder layout", () => {
    const project = Project.create({ name: "MyGame" });
    for (const folder of standardFolders) {
      expect(project.files.has(`${folder}/.keep`)).toBe(true);
    }
    expect(project.readFile("project.json")).toContain("MyGame");
    expect(project.name).toBe("MyGame");
    expect(project.setting("render.height", 0)).toBe(720);
    project.setSetting("render.height", 1080);
    expect(project.setting("render.height", 0)).toBe(1080);
    expect(project.readFile("project.json")).toContain("1080");
  });

  it("resolves paths safely and manages files", () => {
    const project = Project.create({ name: "Paths" });
    expect(project.resolve("./assets//hero.png")).toBe("assets/hero.png");
    expect(project.resolve("assets/../scenes/main.scene")).toBe("scenes/main.scene");
    expect(() => project.resolve("../escape")).toThrow(ProjectError);
    project.writeFile("assets/hero.png", "png-bytes");
    expect(project.readFile("assets/hero.png")).toBe("png-bytes");
    expect(project.readFile("missing")).toBe(null);
    project.writeFile("scenes/main.scene", "{}");
    expect(project.listFiles("scenes")).toEqual(["scenes/.keep", "scenes/main.scene"]);
  });

  it("tracks dependencies and version ranges", () => {
    const project = Project.create({
      name: "Deps",
      dependencies: [{ name: "@obx/physics", version: "^0.10.0" }, { name: "extra", version: "1.0.0", optional: true }],
    });
    project.addDependency({ name: "@obx/audio", version: "~0.10.0" });
    expect(() => project.addDependency({ name: "@obx/audio", version: "1.0.0" })).toThrow(ProjectError);
    expect(project.checkDependencies({ "@obx/physics": "0.10.0", "@obx/audio": "0.10.3" })).toEqual([]);
    expect(project.checkDependencies({ "@obx/physics": "0.9.0" })).toEqual([
      "@obx/physics 0.9.0 does not satisfy ^0.10.0",
      "missing dependency @obx/audio",
    ]);
    const engineProject = Project.create({ name: "EngineCheck" });
    expect(engineProject.checkDependencies({}, { editor: "^0.11.0" })[0]).toContain("engine 0.10.0");
  });

  it("manages plugins and round-trips serialization", () => {
    const project = Project.create({ name: "Plugins" });
    project.addPlugin("obsifox.terrain");
    expect(() => project.addPlugin("obsifox.terrain")).toThrow(ProjectError);
    const clone = Project.fromJson(project.serialize());
    expect(clone.manifest.plugins).toEqual(["obsifox.terrain"]);
    expect(() => Project.fromJson("not json")).toThrow(ProjectError);
  });
});

describe("migrations and versions", () => {
  it("migrates v1 manifests to the current format", () => {
    const migrated = migrateManifest({ format: 1, name: "Old", width: 800, height: 600, settings: { width: 800, height: 600 } });
    expect(migrated.format).toBe(CURRENT_FORMAT);
    expect(migrated.settings["render.width"]).toBe(800);
    expect(migrated.settings["render.height"]).toBe(600);
    expect(migrated.settings["editor.gridSnap"]).toBe(defaultSettings["editor.gridSnap"]);
    expect(migrateManifest({ name: "NoFormat" }).format).toBe(CURRENT_FORMAT);
    expect(() => migrateManifest({ format: 99, name: "Future" })).toThrow(ProjectError);
    expect(() => migrateManifest(null)).toThrow(ProjectError);
    expect(() => migrateManifest({})).toThrow(ProjectError);
  });

  it("parses versions and range satisfaction", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    expect(() => parseVersion("nope")).toThrow(ProjectError);
    expect(satisfies("1.2.3", "1.2.3")).toBe(true);
    expect(satisfies("1.2.3", "^1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfies("1.2.5", "~1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfies("1.2.0", ">=1.1.9")).toBe(true);
  });
});

describe("AssetIndex", () => {
  it("registers assets and detects missing files", () => {
    const project = Project.create({ name: "Assets" });
    project.writeFile("assets/hero.png", "png");
    const index = new AssetIndex();
    index.register({ path: "./assets/hero.png", type: "texture", meta: { size: 3 } });
    index.register({ path: "assets/hero.anim", type: "animation", meta: {} });
    expect(() => index.register({ path: "assets/hero.png", type: "texture", meta: {} })).toThrow(ProjectError);
    expect(index.get("assets/hero.png")?.type).toBe("texture");
    expect(index.byType("texture").length).toBe(1);
    index.register({ path: "assets/ghost.png", type: "texture", meta: {} });
    expect(index.missing(project)).toEqual(["assets/hero.anim", "assets/ghost.png"]);
    expect(index.remove("assets/hero.anim")).toBe(true);
    expect(index.size).toBe(2);

    const restored = new AssetIndex();
    restored.restore(index.serialize());
    expect(restored.get("assets/ghost.png")?.type).toBe("texture");
  });
});
