import { describe, expect, it } from "vitest";
import {
  BuildCache,
  BuildError,
  BuildGraph,
  BuildPipeline,
  analyzeDependencies,
  bundleModules,
  exportTarget,
  exportTargets,
  extractAsset,
  hashContent,
  optimizeCode,
  packageProject,
  parseImports,
  processAssets,
} from "../src/index.js";

describe("BuildGraph", () => {
  it("orders nodes and rebuilds dirty ones", () => {
    const graph = new BuildGraph();
    const files = new Map<string, string>();
    const ran: string[] = [];
    graph.addNode({ id: "compile", inputs: ["src"], outputs: ["js"], run: () => ran.push("compile") });
    graph.addNode({ id: "bundle", inputs: ["js"], outputs: ["bundle"], run: () => ran.push("bundle") });
    graph.addNode({ id: "package", inputs: ["bundle"], outputs: ["zip"], run: () => ran.push("package") });
    graph.addEdge("compile", "bundle");
    graph.addEdge("bundle", "package");
    expect(graph.order()).toEqual(["compile", "bundle", "package"]);
    expect(graph.dirty).toHaveLength(3);
    const first = graph.build(files);
    expect(first.ran).toEqual(["compile", "bundle", "package"]);
    expect(first.skipped).toEqual([]);
    const second = graph.build(files);
    expect(second.ran).toEqual([]);
    expect(second.skipped).toEqual(["compile", "bundle", "package"]);
    graph.markDirty("compile");
    expect(graph.dirty).toEqual(["compile", "bundle", "package"]);
    expect(graph.build(files).ran).toEqual(["compile", "bundle", "package"]);
    expect(graph.size).toBe(3);
    expect(() => graph.markDirty("ghost")).toThrow(BuildError);
    expect(() => graph.addNode({ id: "compile", inputs: [], outputs: [], run: () => undefined })).toThrow(BuildError);
  });

  it("detects cycles", () => {
    const graph = new BuildGraph();
    graph.addNode({ id: "a", inputs: [], outputs: [], run: () => undefined });
    graph.addNode({ id: "b", inputs: [], outputs: [], run: () => undefined });
    graph.addEdge("a", "b");
    graph.addEdge("b", "a");
    expect(() => graph.order()).toThrow(BuildError);
  });
});

describe("BuildCache", () => {
  it("counts hits and misses", () => {
    const cache = new BuildCache();
    expect(cache.get("k")).toBeNull();
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
    expect(cache.get("k")).toBe("v");
    expect(cache.hits).toBe(2);
    expect(cache.misses).toBe(1);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.hits).toBe(0);
  });
});

describe("dependency analysis", () => {
  it("extracts imports and orders modules", () => {
    const code = `
      import { a } from "src/b.js";
      import "src/c.js";
      export const x = 1;
    `;
    expect(parseImports(code)).toEqual(["src/b.js", "src/c.js"]);
    const report = analyzeDependencies({
      "src/a.js": 'import { b } from "src/b.js";',
      "src/b.js": 'import { c } from "src/c.js";',
      "src/c.js": "export const c = 1;",
    });
    expect(report.order).toEqual(["src/c.js", "src/b.js", "src/a.js"]);
    expect(report.cycles).toEqual([]);
  });

  it("reports cycles without throwing", () => {
    const report = analyzeDependencies({
      "a.js": 'import "b.js";',
      "b.js": 'import "a.js";',
    });
    expect(report.cycles.length).toBeGreaterThan(0);
  });
});

describe("bundling", () => {
  it("bundles dependency-first and evaluates", () => {
    const bundle = bundleModules({
      "src/a.js": 'import { leaf } from "src/b.js";\nmodule.exports.value = leaf + 1;',
      "src/b.js": "module.exports.leaf = 7;",
    });
    const aIndex = bundle.indexOf('__obx.register("src/a.js"');
    const bIndex = bundle.indexOf('__obx.register("src/b.js"');
    expect(bIndex).toBeLessThan(aIndex);
    expect(() => bundleModules({ "a.js": 'import "b.js";', "b.js": 'import "a.js";' })).toThrow(BuildError);
  });
});

describe("assets", () => {
  it("compresses and restores content", () => {
    const records = processAssets({
      "assets/level.txt": "aaaaabbbbbccccc",
      "assets/hero.txt": "hello",
    });
    expect(records.map((record) => record.path)).toEqual(["assets/hero.txt", "assets/level.txt"]);
    const level = records[1]!;
    expect(level.size).toBe(15);
    expect(level.compressedSize).toBeLessThan(level.size);
    expect(extractAsset(level)).toBe("aaaaabbbbbccccc");
    expect(extractAsset(records[0]!)).toBe("hello");
  });
});

describe("optimizeCode", () => {
  it("strips comments and blank lines", () => {
    const code = "// header\nconst a = 1; // trailing\n\n  \nconst b = 2;\n";
    expect(optimizeCode(code)).toBe("const a = 1;\nconst b = 2;");
  });
});

describe("export targets", () => {
  it("defines all five platforms", () => {
    expect(Object.keys(exportTargets).sort()).toEqual(["android", "linux", "server", "web", "windows"]);
    expect(exportTarget("windows").entryFile).toBe("bin/game.exe");
    expect(exportTarget("web").platform).toBe("browser");
    expect(exportTarget("server").config.headless).toBe(true);
    expect(exportTarget("android").artifactExtension).toBe(".apk");
    expect(() => exportTarget("dreamcast" as never)).toThrow(BuildError);
  });
});

describe("BuildPipeline", () => {
  it("runs the full chain with caching", () => {
    const cache = new BuildCache();
    const pipeline = new BuildPipeline({ cache });
    const input = {
      name: "MyGame",
      version: "0.2.0",
      entry: "src/main.js",
      files: new Map([
        ["src/main.js", 'import "src/util.js";\n// entry\nconst main = 1;'],
        ["src/util.js", "const util = 2;"],
        ["assets/level.txt", "aaaaabbbbbccccc"],
      ]),
    };
    const result = pipeline.run(input, "web");
    expect(result.steps[0]).toBe("analyze(2)");
    expect(result.steps).toContain("sign");
    expect(result.steps[result.steps.length - 1]).toBe("release");
    expect(result.files.has("bundle.js")).toBe(true);
    expect(result.files.has("manifest.json")).toBe(true);
    expect(result.files.has("checksums.json")).toBe(true);
    expect(result.files.has("runtime/web-glue.js")).toBe(true);
    const manifest = JSON.parse(result.manifest);
    expect(manifest).toMatchObject({ name: "MyGame", version: "0.2.0", target: "web", modules: 2, assets: 1 });
    expect(result.checksums["bundle.js"]).toBe(hashContent(result.files.get("bundle.js")!));
    expect(result.cacheHits).toBe(0);
    expect(result.totalBytes).toBeGreaterThan(0);
    const again = pipeline.run(input, "web");
    expect(again.cacheHits).toBe(1);
    const pkg = packageProject(input, result);
    expect(JSON.parse(pkg).files).toContain("manifest.json");
  });

  it("skips signing when disabled", () => {
    const pipeline = new BuildPipeline({ sign: false });
    const result = pipeline.run({
      name: "Tiny",
      version: "1.0.0",
      entry: "main.js",
      files: new Map([["main.js", "const x = 1;"]]),
    }, "server");
    expect(result.steps).not.toContain("sign");
    expect(result.files.has("checksums.json")).toBe(false);
    expect(result.files.has("runtime/headless-glue.js")).toBe(true);
  });
});
