import { describe, expect, it } from "vitest";
import {
  PackageManager,
  Registry,
  RegistryError,
  checksumOf,
  instantiateTemplate,
  packageKinds,
  parseMetadata,
  parseTemplate,
} from "../src/index.js";

const meta = {
  name: "obx-shaders",
  version: "1.0.0",
  kind: "plugin" as const,
  license: "MIT",
  dependencies: {},
  compatibility: "^1.0.0",
  description: "shader pack",
};

describe("metadata", () => {
  it("validates names, versions and kinds", () => {
    expect(parseMetadata(meta)).toMatchObject({ name: "obx-shaders", kind: "plugin" });
    expect(parseMetadata({ name: "x-pack", version: "0.0.1" }).kind).toBe("asset");
    expect(() => parseMetadata(null)).toThrow(RegistryError);
    expect(() => parseMetadata({ name: "Bad Name", version: "1.0.0" })).toThrow(RegistryError);
    expect(() => parseMetadata({ name: "ok", version: "v1" })).toThrow(RegistryError);
    expect(() => parseMetadata({ name: "ok", version: "1.0.0", kind: "virus" })).toThrow(RegistryError);
    expect(packageKinds).toContain("native");
  });
});

describe("Registry", () => {
  it("publishes, resolves versions and verifies", () => {
    const registry = new Registry();
    registry.publish(meta, "CONTENT-A");
    registry.publish({ ...meta, version: "1.1.0", dependencies: { "core-lib": "^2.0.0" } }, "CONTENT-B");
    expect(registry.versions("obx-shaders")).toEqual(["1.0.0", "1.1.0"]);
    expect(registry.best("obx-shaders", "^1.0.0")!.metadata.version).toBe("1.1.0");
    expect(registry.best("obx-shaders", "1.0.0")!.metadata.version).toBe("1.0.0");
    expect(registry.best("obx-shaders", "^9.0.0")).toBeNull();
    expect(registry.get("obx-shaders", "1.0.0")!.checksum).toBe(checksumOf("CONTENT-A"));
    expect(registry.verify("obx-shaders", "1.0.0", "CONTENT-A")).toBe(true);
    expect(registry.verify("obx-shaders", "1.0.0", "TAMPERED")).toBe(false);
    expect(() => registry.verify("ghost", "1.0.0", "x")).toThrow(RegistryError);
    expect(() => registry.publish(meta, "again")).toThrow(RegistryError);
    const record = registry.get("obx-shaders", "1.0.0")!;
    const signature = registry.sign(record);
    expect(registry.verifySignature(record, signature)).toBe(true);
    expect(registry.verifySignature(record, "nope")).toBe(false);
  });

  it("lists packages by kind", () => {
    const registry = new Registry();
    registry.publish(meta, "a");
    registry.publish({ ...meta, name: "tpl-fps", kind: "template", version: "1.0.0" }, "b");
    expect(registry.list().map((entry) => entry.name)).toEqual(["obx-shaders", "tpl-fps"]);
    expect(registry.list("template")).toHaveLength(1);
  });
});

describe("PackageManager", () => {
  it("installs with dependencies and locks", () => {
    const registry = new Registry();
    registry.publish({ name: "core-lib", version: "2.0.0", kind: "engine", license: "MIT", dependencies: {}, compatibility: "*", description: "" }, "core");
    registry.publish({ ...meta, version: "1.1.0", dependencies: { "core-lib": "^2.0.0" } }, "shaders");
    const manager = new PackageManager(registry, { engineVersion: "1.0.0" });
    const resolved = manager.install("obx-shaders", "^1.0.0");
    expect(resolved).toMatchObject({ name: "obx-shaders", version: "1.1.0", dependencies: ["core-lib"] });
    expect(manager.installedNames()).toEqual(["core-lib", "obx-shaders"]);
    const lockfile = manager.lock();
    expect(lockfile.format).toBe(1);
    expect(lockfile.packages["core-lib"].version).toBe("2.0.0");
    const fresh = new PackageManager(registry);
    expect(fresh.restore(lockfile).sort()).toEqual(["core-lib", "obx-shaders"]);
    expect(fresh.lock()).toEqual(lockfile);
  });

  it("enforces compatibility and lock integrity", () => {
    const registry = new Registry();
    registry.publish({ name: "future-pack", version: "1.0.0", kind: "plugin", license: "MIT", dependencies: {}, compatibility: "^2.0.0", description: "" }, "x");
    const manager = new PackageManager(registry, { engineVersion: "1.0.0" });
    expect(() => manager.install("future-pack", "^1.0.0")).toThrow(RegistryError);
    expect(() => manager.install("ghost-pack", "^1.0.0")).toThrow(RegistryError);
    expect(() =>
      manager.restore({ format: 1, packages: { ghost: { version: "1.0.0", checksum: "c" } } }),
    ).toThrow(RegistryError);
    registry.publish({ name: "flip", version: "1.0.0", kind: "asset", license: "MIT", dependencies: {}, compatibility: "*", description: "" }, "original");
    manager.install("flip", "^1.0.0");
    expect(() =>
      manager.restore({ format: 1, packages: { flip: { version: "1.0.0", checksum: "bogus" } } }),
    ).toThrow(RegistryError);
  });

  it("resolves dependency trees and rejects cycles", () => {
    const registry = new Registry();
    const blank = (name: string, version: string, dependencies: Record<string, string> = {}) => ({
      name,
      version,
      kind: "engine" as const,
      license: "MIT",
      dependencies,
      compatibility: "*",
      description: "",
    });
    registry.publish(blank("app", "1.0.0", { ui: "^1.0.0", net: "^1.0.0" }), "a");
    registry.publish(blank("ui", "1.0.0", { core: "^1.0.0" }), "b");
    registry.publish(blank("net", "1.0.0"), "c");
    registry.publish(blank("core", "1.0.0"), "d");
    const manager = new PackageManager(registry);
    expect(manager.resolveTree({ app: "^1.0.0" })).toEqual(["core", "ui", "net", "app"]);
    registry.publish(blank("loop-a", "1.0.0", { "loop-b": "*" }), "e");
    registry.publish(blank("loop-b", "1.0.0", { "loop-a": "*" }), "f");
    expect(() => manager.resolveTree({ "loop-a": "*" })).toThrow(RegistryError);
    expect(() => manager.resolveTree({ missing: "*" })).toThrow(RegistryError);
  });
});

describe("templates", () => {
  it("parses and instantiates with substitution", () => {
    const template = parseTemplate({
      id: "fps",
      name: "FPS Template",
      description: "first person",
      files: {
        "project.json": '{"name": "{name}"}',
        "src/main.js": "const game = '{name}';",
      },
    });
    expect(template.kind).toBe("template");
    const files = instantiateTemplate(template, "Nebula");
    expect(files.get("project.json")).toBe('{"name": "Nebula"}');
    expect(files.get("src/main.js")).toBe("const game = 'Nebula';");
    expect(() => instantiateTemplate(template, "bad name")).toThrow(RegistryError);
  });

  it("rejects invalid templates", () => {
    expect(() => parseTemplate(null)).toThrow(RegistryError);
    expect(() => parseTemplate({ id: "Bad Id", name: "x", files: { a: "b" } })).toThrow(RegistryError);
    expect(() => parseTemplate({ id: "ok", name: "x" })).toThrow(RegistryError);
  });
});
