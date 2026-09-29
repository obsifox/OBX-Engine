import { describe, expect, it } from "vitest";
import {
  AssetCache,
  AssetDatabase,
  AssetDatabaseError,
  AssetWatcher,
  createAssetGuid,
  type AssetWatcherEvent,
} from "../src/index.js";

const encoder = new TextEncoder();

function makeDatabase(now = () => 1000): AssetDatabase {
  return new AssetDatabase({ now, guidSeed: "test-suite" });
}

describe("asset database", () => {
  it("registers assets with deterministic guids and queries them", () => {
    const database = makeDatabase();
    const a = database.register("textures/hero.png");
    const b = database.register("scenes/main.scene", { type: "scene" });
    expect(a.guid).toBe(createAssetGuid("test-suite:textures/hero.png:0"));
    expect(b.type).toBe("scene");
    expect(database.byPath("textures/hero.png")).toBe(a);
    expect(database.byPath("./textures/hero.png")).toBe(a);
    expect(database.byGuid(a.guid)).toBe(a);
    expect(database.guidOf("scenes/main.scene")).toBe(b.guid);
    expect(database.size).toBe(2);
    expect(database.query({ type: "scene" })).toEqual([b]);
    expect(database.query({ importer: "png" })).toEqual([a]);
    expect(() => database.register("textures/hero.png")).toThrow(AssetDatabaseError);
    expect(() => database.register("dup.png", { guid: a.guid })).toThrow(AssetDatabaseError);
    expect(() => database.register("bad.png", { guid: "not-a-guid" })).toThrow(AssetDatabaseError);
  });

  it("unregisters assets and cleans graph state", () => {
    const database = makeDatabase();
    const a = database.register("a.json");
    const b = database.register("b.json");
    database.addDependency(b.guid, a.guid);
    expect(database.unregister("a.json")).toBe(true);
    expect(database.unregister("a.json")).toBe(false);
    expect(database.byGuid(a.guid)).toBeNull();
    expect(database.dependentsOf(a.guid)).toEqual([]);
  });

  it("imports sources through the pipeline with caching", () => {
    let time = 100;
    const database = makeDatabase(() => (time += 5));
    const asset = database.register("data/config.json", { type: "json" });
    const first = database.import(asset.path, '{"level": 3}');
    expect(first.cached).toBe(false);
    expect(first.changed).toBe(true);
    expect(asset.data).toEqual({ level: 3 });
    expect(asset.type).toBe("json");
    expect(asset.version).toBe(1);
    expect(asset.metadata.importedAt).toBe(105);
    expect(asset.metadata.custom).toMatchObject({});
    const second = database.import(asset.path, '{"level": 3}');
    expect(second.cached).toBe(true);
    expect(second.changed).toBe(false);
    expect(asset.version).toBe(2);
    const third = database.import(asset.path, '{"level": 4}');
    expect(third.cached).toBe(false);
    expect(third.changed).toBe(true);
    expect(asset.data).toEqual({ level: 4 });
    const stats = database.cache.stats();
    expect(stats).toMatchObject({ hits: 1, misses: 2, size: 1 });
  });

  it("tracks dependencies, detects cycles and cascades invalidation", () => {
    const database = makeDatabase();
    const root = database.register("levels/root.json");
    const mid = database.register("levels/mid.json");
    const leaf = database.register("levels/leaf.json");
    database.addDependency(root.guid, mid.guid);
    database.addDependency(mid.guid, leaf.guid);
    expect(database.dependenciesOf(root.guid)).toEqual([mid.guid]);
    expect(database.dependentsOf(leaf.guid)).toEqual([mid.guid]);
    expect(database.detectCycle(leaf.guid, root.guid)).toBe(true);
    expect(database.detectCycle(root.guid, leaf.guid)).toBe(false);
    expect(() => database.addDependency(leaf.guid, root.guid)).toThrow(AssetDatabaseError);
    expect(() => database.addDependency(root.guid, root.guid)).toThrow(AssetDatabaseError);
    database.import(leaf.path, "1");
    database.import(mid.path, "2");
    database.import(root.path, "3");
    expect(database.cache.size()).toBe(3);
    const invalidated = database.invalidate(leaf.guid);
    expect(invalidated).toEqual([mid.guid, root.guid]);
    expect(database.cache.size()).toBe(0);
    expect(database.cache.stats().invalidations).toBe(3);
  });

  it("auto-registers import dependencies without cycles", () => {
    const database = makeDatabase();
    const model = database.register("models/ship.gltf");
    const result = database.import(model.path, JSON.stringify({ buffers: [{ uri: "ship.bin" }], images: [{ uri: "ship.png" }], meshes: [{}] }));
    expect(result.asset.dependencies).toHaveLength(2);
    expect(database.byPath("ship.bin")).not.toBeNull();
    expect(database.byPath("ship.png")).not.toBeNull();
    expect(database.dependentsOf(database.guidOf("ship.bin")!)).toEqual([model.guid]);
  });

  it("rejects self dependencies through importer output", () => {
    const database = makeDatabase();
    const asset = database.register("loop.obj");
    expect(() => database.import(asset.path, "mtllib loop.obj")).toThrow(AssetDatabaseError);
  });

  it("detects file changes through the watcher", () => {
    const database = makeDatabase();
    const asset = database.register("textures/wall.png");
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 4, 0, 0, 0, 4, 8, 6, 0, 0, 0,
    ]);
    database.import(asset.path, png);
    const events: AssetWatcherEvent[] = [];
    database.watcher.onChange.connect((event) => events.push(event));
    database.notifyChange(asset.path, png);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ path: "textures/wall.png", guid: asset.guid });
    const changed = new Uint8Array(png);
    changed[16] = 9;
    const scanned = database.scan([{ path: asset.path, source: changed }]);
    expect(scanned).toHaveLength(1);
    expect(scanned[0]!.guid).toBe(asset.guid);
    expect(database.watcher.detected).toBe(2);
  });

  it("serializes and restores database state", () => {
    const database = makeDatabase();
    const a = database.register("a.json");
    const b = database.register("b.json");
    database.addDependency(b.guid, a.guid);
    database.import(a.path, "{}");
    const serialized = database.serialize();
    const restored = makeDatabase();
    restored.restore(serialized);
    expect(restored.size).toBe(2);
    expect(restored.byPath("b.json")!.dependencies).toEqual([a.guid]);
    expect(restored.dependentsOf(a.guid)).toEqual([b.guid]);
  });

  it("supports standalone cache and watcher units", () => {
    const cache = new AssetCache();
    expect(cache.get("g", "h")).toBeNull();
    cache.put("g", "h", 1, { type: "x", data: 1, dependencies: [], metadata: {} });
    expect(cache.get("g", "h")).not.toBeNull();
    expect(cache.get("g", "other")).toBeNull();
    expect(cache.invalidate("g")).toBe(true);
    expect(cache.invalidate("g")).toBe(false);
    const watcher = new AssetWatcher();
    watcher.watch("a", "1");
    expect(watcher.watched).toBe(1);
    watcher.unwatch("a");
    expect(watcher.watched).toBe(0);
  });
});
