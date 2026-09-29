import { describe, expect, it } from "vitest";
import {
  PluginError,
  PluginLoader,
  PluginSandbox,
  parsePluginManifest,
  pluginPermissions,
} from "../src/index.js";

const base = { id: "obx-tools", name: "OBX Tools" };

describe("parsePluginManifest", () => {
  it("validates and defaults", () => {
    const manifest = parsePluginManifest(base);
    expect(manifest).toMatchObject({
      id: "obx-tools",
      name: "OBX Tools",
      version: "0.1.0",
      engine: "*",
      entry: "index.js",
      license: "MIT",
      permissions: [],
    });
    const full = parsePluginManifest({
      ...base,
      version: "2.1.0",
      engine: "^1.0.0",
      permissions: ["network", "file.read"],
      dependencies: { "obx-core-plugin": "^1.0.0" },
      license: "Apache-2.0",
    });
    expect(full.permissions).toEqual(["network", "file.read"]);
    expect(full.dependencies).toEqual({ "obx-core-plugin": "^1.0.0" });
    expect(pluginPermissions).toContain("native");
  });

  it("rejects invalid manifests", () => {
    expect(() => parsePluginManifest(null)).toThrow(PluginError);
    expect(() => parsePluginManifest({ id: "Bad Id", name: "x" })).toThrow(PluginError);
    expect(() => parsePluginManifest({ id: "ok-id" })).toThrow(PluginError);
    expect(() => parsePluginManifest({ ...base, version: "one" })).toThrow(PluginError);
    expect(() => parsePluginManifest({ ...base, permissions: ["root"] })).toThrow(PluginError);
  });
});

describe("PluginSandbox", () => {
  it("grants and denies permissions", () => {
    const sandbox = new PluginSandbox(["file.read"]);
    expect(sandbox.can("file.read")).toBe(true);
    expect(sandbox.can("network")).toBe(false);
    let ran = false;
    sandbox.guard("file.read", () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(() => sandbox.guard("network", () => undefined)).toThrow(PluginError);
    expect(() => sandbox.guard("network", () => undefined)).toThrow(PluginError);
    expect(sandbox.violations).toEqual(["network", "network"]);
  });
});

describe("PluginLoader", () => {
  it("resolves dependency order and loads in sequence", () => {
    const loader = new PluginLoader();
    const order: string[] = [];
    loader.register(parsePluginManifest({ id: "ui-kit", name: "UI Kit" }), () => ({
      onLoad: () => order.push("ui-kit"),
    }));
    loader.register(
      parsePluginManifest({ id: "tools", name: "Tools", dependencies: { "ui-kit": "^1.0.0" } }),
      () => ({ onLoad: () => order.push("tools") }),
    );
    expect(loader.resolveOrder()).toEqual(["ui-kit", "tools"]);
    loader.loadAll();
    expect(order).toEqual(["ui-kit", "tools"]);
    loader.load("tools");
    expect(order).toEqual(["ui-kit", "tools"]);
  });

  it("detects missing dependencies and cycles", () => {
    const loader = new PluginLoader();
    loader.register(parsePluginManifest({ id: "a", name: "A", dependencies: { b: "*" } }), () => ({}));
    loader.register(parsePluginManifest({ id: "b", name: "B", dependencies: { a: "*" } }), () => ({}));
    expect(() => loader.resolveOrder()).toThrow(PluginError);
    const missing = new PluginLoader();
    missing.register(parsePluginManifest({ id: "solo", name: "Solo", dependencies: { ghost: "*" } }), () => ({}));
    expect(() => missing.resolveOrder()).toThrow(PluginError);
  });

  it("enforces engine compatibility", () => {
    const loader = new PluginLoader({ engineVersion: "1.0.0" });
    expect(() =>
      loader.register(parsePluginManifest({ id: "future", name: "Future", engine: "^2.0.0" }), () => ({})),
    ).toThrow(PluginError);
    loader.register(parsePluginManifest({ id: "ok", name: "Ok", engine: "^1.0.0" }), () => ({}));
    expect(loader.manifestFor("ok")!.engine).toBe("^1.0.0");
  });

  it("isolates lifecycle failures and records sandbox violations", () => {
    const loader = new PluginLoader();
    loader.register(
      parsePluginManifest({ id: "good", name: "Good", permissions: ["file.read"] }),
      (api) => {
        api.guard("file.read", () => undefined);
        return {
          onStart: () => undefined,
          onTick: () => undefined,
        };
      },
    );
    loader.register(parsePluginManifest({ id: "bad", name: "Bad", permissions: [] }), (api) => ({
      onTick: () => {
        api.guard("network", () => undefined);
      },
    }));
    loader.register(parsePluginManifest({ id: "crash", name: "Crash" }), () => ({
      onStart: () => {
        throw new Error("start failed");
      },
    }));
    loader.loadAll();
    loader.startAll();
    expect(loader.isActive("good")).toBe(true);
    expect(loader.stateOf("bad")).toBe("started");
    expect(loader.stateOf("crash")).toBe("loaded");
    loader.tick(7);
    expect(loader.errorsFor("crash")[0]).toContain("start failed");
    expect(loader.sandboxFor("bad")!.violations).toEqual(["network"]);
    loader.stopAll();
    expect(loader.stateOf("good")).toBe("stopped");
    const stats = loader.stats();
    expect(stats).toMatchObject({ registered: 3, loaded: 3, started: 0, tick: 7 });
    expect(stats.errors).toBeGreaterThanOrEqual(1);
    expect(stats.violations).toBe(1);
  });

  it("throws on duplicates and unknown plugins", () => {
    const loader = new PluginLoader();
    loader.register(parsePluginManifest(base), () => ({}));
    expect(() => loader.register(parsePluginManifest(base), () => ({}))).toThrow(PluginError);
    expect(() => loader.load("ghost")).toThrow(PluginError);
    expect(() => loader.start("ghost")).toThrow(PluginError);
    expect(loader.stateOf("ghost")).toBe("unknown");
  });
});
