import { describe, expect, it } from "vitest";
import { MemoryFileSystem, VirtualFileSystem } from "@obx/vfs";
import {
  ResourceCache,
  ResourceError,
  ResourceHandle,
  ResourceManager,
  type ResourceLoader,
} from "../src/index.js";

function makeVfs(): VirtualFileSystem {
  const vfs = new VirtualFileSystem();
  vfs.mount("/", new MemoryFileSystem());
  return vfs;
}

const textLoader: ResourceLoader<string> = {
  type: "text",
  extensions: ["txt"],
  load: (path, vfs) => vfs.readText(path),
};

const jsonLoader: ResourceLoader<Record<string, unknown>> = {
  type: "json",
  extensions: ["json"],
  load: (path, vfs) => {
    const value = JSON.parse(vfs.readText(path)) as Record<string, unknown>;
    return { value, dependencies: typeof value.dep === "string" ? [value.dep] : [] };
  },
};

describe("resource manager", () => {
  it("loads resources through registered loaders", () => {
    const vfs = makeVfs();
    vfs.writeText("/data/hello.txt", "world");
    const manager = new ResourceManager(vfs);
    manager.registerLoader(textLoader);
    const handle = manager.load<string>("/data/hello.txt");
    expect(handle.state).toBe("ready");
    expect(handle.value).toBe("world");
    expect(handle.type).toBe("text");
    expect(handle.refCount).toBe(1);
  });

  it("selects loaders by extension and rejects unknown types", () => {
    const vfs = makeVfs();
    const manager = new ResourceManager(vfs);
    manager.registerLoader(textLoader);
    expect(manager.loaderFor("/a/b.txt")?.type).toBe("text");
    expect(manager.loaderFor("/a/b.bin")).toBeUndefined();
    vfs.writeText("/a/b.bin", "x");
    expect(() => manager.load("/a/b.bin")).toThrow(ResourceError);
  });

  it("rejects duplicate loader types", () => {
    const manager = new ResourceManager(makeVfs());
    manager.registerLoader(textLoader);
    expect(() => manager.registerLoader({ ...textLoader })).toThrow(ResourceError);
  });

  it("caches handles and counts hits and misses", () => {
    const vfs = makeVfs();
    vfs.writeText("/note.txt", "n");
    const manager = new ResourceManager(vfs);
    manager.registerLoader(textLoader);
    const first = manager.load<string>("/note.txt");
    const second = manager.load<string>("/note.txt");
    expect(second).toBe(first);
    expect(first.refCount).toBe(2);
    expect(manager.stats().cache.hits).toBe(1);
    expect(manager.stats().cache.misses).toBe(1);
    first.release();
    expect(first.refCount).toBe(1);
  });

  it("tracks dependencies and cascades invalidation", () => {
    const vfs = makeVfs();
    vfs.writeText("/mat.json", JSON.stringify({ dep: "/tex.txt" }));
    vfs.writeText("/tex.txt", "pixels");
    const manager = new ResourceManager(vfs);
    manager.registerLoader(textLoader);
    manager.registerLoader(jsonLoader);
    const material = manager.load<Record<string, unknown>>("/mat.json");
    expect(material.value).toEqual({ dep: "/tex.txt" });
    expect(manager.dependenciesOf("/mat.json")).toEqual(["/tex.txt"]);
    expect(manager.dependentsOf("/tex.txt")).toEqual(["/mat.json"]);
    const affected = manager.invalidate("/tex.txt");
    expect(affected).toEqual(["/tex.txt", "/mat.json"]);
    expect(manager.get("/mat.json")).toBeUndefined();
    const reloaded = manager.load<Record<string, unknown>>("/mat.json");
    expect(reloaded.state).toBe("ready");
    expect(reloaded.version).toBe(2);
  });

  it("tracks dependencies declared through the load context", () => {
    const vfs = makeVfs();
    vfs.writeText("/scene.bin", "s");
    const manager = new ResourceManager(vfs);
    manager.registerLoader({
      type: "scene",
      extensions: ["bin"],
      load: (path, fs, context) => {
        context.declareDependencies(["/a.txt", "/b.txt"]);
        return fs.readText(path);
      },
    });
    const handle = manager.load<string>("/scene.bin");
    expect(handle.dependencies).toEqual(["/a.txt", "/b.txt"]);
    expect(manager.dependenciesOf("/scene.bin")).toEqual(["/a.txt", "/b.txt"]);
  });

  it("records load failures on the handle", () => {
    const vfs = makeVfs();
    const manager = new ResourceManager(vfs);
    manager.registerLoader({
      type: "broken",
      extensions: ["bad"],
      load: () => {
        throw new Error("parse failure");
      },
    });
    vfs.writeText("/file.bad", "x");
    expect(() => manager.load("/file.bad")).toThrow();
    const handle = manager.get("/file.bad");
    expect(handle?.state).toBe("failed");
    expect(handle?.error).toContain("parse failure");
  });

  it("unloads resources with reference guards", () => {
    const vfs = makeVfs();
    vfs.writeText("/temp.txt", "t");
    const manager = new ResourceManager(vfs);
    manager.registerLoader(textLoader);
    const handle = manager.load<string>("/temp.txt");
    expect(manager.unload("/temp.txt")).toBe(false);
    handle.release();
    expect(manager.unload("/temp.txt")).toBe(true);
    expect(handle.state).toBe("unloaded");
    expect(manager.get("/temp.txt")).toBeUndefined();
    expect(manager.unload("/temp.txt")).toBe(false);
  });

  it("supports async loading", async () => {
    const vfs = makeVfs();
    vfs.writeText("/async.txt", "later");
    const manager = new ResourceManager(vfs);
    manager.registerLoader(textLoader);
    const handle = await manager.loadAsync<string>("/async.txt");
    expect(handle.value).toBe("later");
  });

  it("exposes cache statistics", () => {
    const vfs = makeVfs();
    vfs.writeText("/x.txt", "1");
    const manager = new ResourceManager(vfs);
    manager.registerLoader(textLoader);
    manager.load("/x.txt");
    manager.invalidate("/x.txt");
    const stats = manager.stats();
    expect(stats.cache.size).toBe(0);
    expect(stats.cache.invalidations).toBe(1);
    expect(stats.loaders).toBe(1);
  });

  it("maintains handle listeners across state changes", () => {
    const handle = new ResourceHandle<number>("/x", "text");
    const states: string[] = [];
    handle.onChange((updated) => states.push(updated.state));
    handle.state = "ready";
    handle.value = 5;
    handle.notify();
    expect(states).toEqual(["ready"]);
    expect(handle.value).toBe(5);
  });

  it("keeps cache path listings sorted", () => {
    const cache = new ResourceCache();
    const mk = (path: string): ResourceHandle => new ResourceHandle(path, "text");
    cache.set("/b.txt", mk("/b.txt"));
    cache.set("/a.txt", mk("/a.txt"));
    expect(cache.paths()).toEqual(["/a.txt", "/b.txt"]);
    expect(cache.has("/a.txt")).toBe(true);
    cache.clear();
    expect(cache.paths()).toEqual([]);
  });
});
