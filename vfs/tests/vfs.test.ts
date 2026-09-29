import { describe, expect, it } from "vitest";
import {
  MemoryFileSystem,
  PackageFileSystem,
  PhysicalFileSystem,
  VirtualFileSystem,
  VfsError,
  joinVirtualPath,
  normalizeVirtualPath,
  parentVirtualPath,
} from "../src/index.js";

function memPlatformRoot(): {
  read(path: string): Uint8Array;
  write(path: string, data: Uint8Array): void;
  exists(path: string): boolean;
  list(path: string): string[];
  remove(path: string): void;
  stat(path: string): { size: number; directory: boolean };
} {
  const files = new Map<string, Uint8Array>();
  return {
    read: (path) => {
      const data = files.get(path);
      if (!data) throw new Error(`missing ${path}`);
      return data;
    },
    write: (path, data) => {
      files.set(path, data);
    },
    exists: (path) => files.has(path),
    list: (path) => [...files.keys()].filter((key) => key.startsWith(`${path}/`)).map((key) => key.slice(path.length + 1)),
    remove: (path) => {
      files.delete(path);
    },
    stat: (path) => {
      const data = files.get(path);
      if (!data) throw new Error(`missing ${path}`);
      return { size: data.length, directory: false };
    },
  };
}

describe("virtual file system", () => {
  it("normalizes virtual paths and blocks traversal", () => {
    expect(normalizeVirtualPath("/a/b.txt")).toBe("/a/b.txt");
    expect(normalizeVirtualPath("a//b/./c.txt")).toBe("/a/b/c.txt");
    expect(normalizeVirtualPath("/a/b/../c")).toBe("/a/c");
    expect(() => normalizeVirtualPath("/../etc/passwd")).toThrow(VfsError);
    expect(() => normalizeVirtualPath("")).toThrow(VfsError);
    expect(joinVirtualPath("/root", "sub", "file.txt")).toBe("/root/sub/file.txt");
    expect(parentVirtualPath("/a/b/c")).toBe("/a/b");
    expect(parentVirtualPath("/a")).toBe("/");
  });

  it("stores and lists files in memory", () => {
    const fs = new MemoryFileSystem();
    fs.write("/levels/one.txt", new TextEncoder().encode("alpha"));
    fs.write("/levels/two.txt", new TextEncoder().encode("beta"));
    expect(new TextDecoder().decode(fs.read("/levels/one.txt"))).toBe("alpha");
    expect(fs.list("/levels")).toEqual(["one.txt", "two.txt"]);
    expect(fs.list("/")).toEqual(["levels"]);
    expect(fs.stat("/levels/one.txt")).toEqual({ size: 5, directory: false });
    expect(fs.stat("/levels").directory).toBe(true);
    fs.remove("/levels/one.txt");
    expect(fs.exists("/levels/one.txt")).toBe(false);
    expect(() => fs.read("/levels/one.txt")).toThrow(VfsError);
  });

  it("maps virtual paths onto a physical root", () => {
    const backing = memPlatformRoot();
    const fs = new PhysicalFileSystem({ root: "/store", files: backing });
    fs.write("/data/raw.bin", new Uint8Array([1, 2, 3]));
    expect(fs.read("/data/raw.bin")).toEqual(new Uint8Array([1, 2, 3]));
    expect(backing.exists("/store/data/raw.bin")).toBe(true);
    expect(fs.stat("/data/raw.bin").size).toBe(3);
    fs.remove("/data/raw.bin");
    expect(fs.exists("/data/raw.bin")).toBe(false);
  });

  it("serves read-only package entries", () => {
    const pack = new PackageFileSystem({ "/shaders/basic.txt": "vec", "/meta.json": "{}" });
    expect(new TextDecoder().decode(pack.read("/shaders/basic.txt"))).toBe("vec");
    expect(pack.list("/")).toEqual(["meta.json", "shaders"]);
    expect(pack.list("/shaders")).toEqual(["basic.txt"]);
    expect(pack.exists("/shaders")).toBe(true);
    expect(() => pack.write("/x", new Uint8Array())).toThrow(VfsError);
    expect(() => pack.remove("/x")).toThrow(VfsError);
  });

  it("routes reads across mounts by longest prefix", () => {
    const vfs = new VirtualFileSystem();
    const memory = new MemoryFileSystem();
    const pack = new PackageFileSystem({ "/core.txt": "from-pack" });
    vfs.mount("/game", memory);
    vfs.mount("/game/vendor", pack);
    memory.write("/saves/slot.txt", new TextEncoder().encode("save"));
    vfs.write("/game/notes.txt", new TextEncoder().encode("note"));
    expect(vfs.readText("/game/notes.txt")).toBe("note");
    expect(vfs.readText("/game/saves/slot.txt")).toBe("save");
    vfs.mount("/vendor", pack);
    expect(vfs.readText("/vendor/core.txt")).toBe("from-pack");
    expect(vfs.readText("/game/vendor/core.txt")).toBe("from-pack");
    expect(() => vfs.read("/unmounted/file.txt")).toThrow(VfsError);
  });

  it("merges directory listings across mounts", () => {
    const vfs = new VirtualFileSystem();
    const memory = new MemoryFileSystem();
    const pack = new PackageFileSystem({ "/pack-entry.txt": "p" });
    vfs.mount("/data", memory);
    vfs.mount("/data/pack", pack);
    memory.write("/local.txt", new Uint8Array([1]));
    expect(vfs.list("/data")).toEqual(["local.txt", "pack"]);
    expect(vfs.list("/data/pack")).toEqual(["pack-entry.txt"]);
  });

  it("manages mount lifecycle", () => {
    const vfs = new VirtualFileSystem();
    const memory = new MemoryFileSystem();
    vfs.mount("/a", memory);
    expect(() => vfs.mount("/a", memory)).toThrow(VfsError);
    expect(vfs.mounts()).toHaveLength(1);
    expect(vfs.unmount("/a")).toBe(true);
    expect(vfs.unmount("/a")).toBe(false);
    expect(vfs.mounts()).toHaveLength(0);
  });

  it("writes through mounted adapters and reports stats", () => {
    const vfs = new VirtualFileSystem();
    const memory = new MemoryFileSystem();
    vfs.mount("/", memory);
    vfs.writeText("/config/app.cfg", "mode=dev");
    expect(vfs.exists("/config/app.cfg")).toBe(true);
    expect(vfs.stat("/config/app.cfg")).toEqual({ size: 8, directory: false });
    vfs.remove("/config/app.cfg");
    expect(vfs.exists("/config/app.cfg")).toBe(false);
    expect(() => vfs.stat("/config/app.cfg")).toThrow(VfsError);
  });
});
