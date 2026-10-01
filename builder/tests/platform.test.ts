import { describe, expect, it } from "vitest";
import {
  CiPipeline,
  ProductionBuildPipeline,
  buildMatrix,
  buildFileHash,
  compileShaderPackage,
  compressBytes,
  convertPixelFormat,
  cookMesh,
  cookTexture,
  decompressBytes,
  extractRuntimeEntry,
  generateMipmaps,
  generateArtifacts,
  hmacSha256Hex,
  optimizeVertexOrder,
  packageRuntimeAssets,
  performanceTests,
  platformTests,
  regressionCompare,
  resizePixels,
  sha256Hex,
  signBuild,
  stripDependencies,
  validatePackage,
  verifyBuild,
  weldVertices,
  type MeshVertex,
  type ProductionBuildInput,
} from "../src/index.js";

describe("compression", () => {
  it("round-trips byte streams through rle compression", () => {
    const data = Uint8Array.from([1, 1, 1, 1, 1, 2, 3, 4, 5, 9, 9, 9, 9, 9, 9, 9, 9, 7]);
    const compressed = compressBytes(data);
    expect(compressed.length).toBeLessThan(data.length);
    expect(Array.from(decompressBytes(compressed))).toEqual(Array.from(data));
    const flat = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Array.from(decompressBytes(compressBytes(flat)))).toEqual(Array.from(flat));
    expect(Array.from(decompressBytes(compressBytes(new Uint8Array(0))))).toEqual([]);
  });
});

describe("texture cooking", () => {
  it("converts formats resizes and generates mipmaps", () => {
    const rgba = {
      width: 4,
      height: 4,
      format: "rgba8" as const,
      data: new Uint8Array(4 * 4 * 4).fill(255),
    };
    const rgb565 = convertPixelFormat(rgba, "rgb565");
    expect(rgb565.format).toBe("rgb565");
    expect(rgb565.data.length).toBe(32);
    const la8 = convertPixelFormat(rgba, "la8");
    expect(la8.data.length).toBe(32);
    const r8 = convertPixelFormat(rgba, "r8");
    expect(r8.data.length).toBe(16);

    const small = resizePixels(rgba, 2, 2);
    expect(small.width).toBe(2);
    expect(small.height).toBe(2);
    const mips = generateMipmaps(rgba);
    expect(mips[0]!.width).toBe(4);
    expect(mips[mips.length - 1]!.width).toBe(1);
    expect(mips.length).toBe(3);
  });

  it("cooks textures with compression and mip chains", () => {
    const cooked = cookTexture({
      name: "hero",
      pixels: { width: 8, height: 8, format: "rgba8", data: new Uint8Array(8 * 8 * 4).fill(200) },
      targetFormat: "la8",
      generateMipmaps: true,
      compress: true,
    });
    expect(cooked.format).toBe("la8");
    expect(cooked.mips.length).toBe(4);
    expect(cooked.compressed).toBe(true);
    expect(cooked.cookedBytes).toBeLessThan(cooked.originalBytes);
  });
});

describe("mesh cooking", () => {
  it("welds quantizes and reorders vertices", () => {
    const vertex = (x: number, y: number, z: number): MeshVertex => ({
      position: [x, y, z],
      normal: [0, 1, 0],
      uv: [x, y],
    });
    const welded = weldVertices([vertex(0, 0, 0), vertex(0, 0, 0), vertex(1, 0, 0)], [0, 1, 2], 1e-6);
    expect(welded.vertices).toHaveLength(2);
    expect(welded.indices).toEqual([0, 0, 1]);

    const reordered = optimizeVertexOrder([vertex(5, 0, 0), vertex(6, 0, 0), vertex(7, 0, 0)], [2, 0, 1]);
    expect(reordered.vertices[0]!.position[0]).toBe(7);
    expect(reordered.indices).toEqual([0, 1, 2]);

    const cooked = cookMesh({
      name: "cube",
      vertices: [vertex(0, 0, 0), vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0)],
      indices: [0, 1, 2, 3],
      quantizeBits: 16,
      weldEpsilon: 1e-6,
    });
    expect(cooked.vertexCount).toBe(3);
    expect(cooked.indexCount).toBe(4);
    expect(cooked.positions.length).toBe(9);
    expect(cooked.cookedBytes).toBeLessThan(cooked.originalBytes);
    expect(cooked.positions[0]).toBe(0);
    expect(cooked.positions.some((value) => value === 1)).toBe(true);
  });
});

describe("shader compilation", () => {
  it("extracts uniforms and tokenizes source", () => {
    const compiled = compileShaderPackage(
      "lit",
      "fragment",
      `uniform vec3 lightDir;
       uniform sampler2d albedo;
       uniform float roughness;
       void main() { vec3 c = texture(albedo, uv).rgb * roughness; }`,
    );
    expect(compiled.stage).toBe("fragment");
    expect(compiled.uniforms.map((uniform) => uniform.name)).toEqual(["lightDir", "albedo", "roughness"]);
    expect(compiled.uniforms[0]!.type).toBe("vec3");
    expect(compiled.tokens).toContain("void");
    expect(compiled.packageBytes).toBeGreaterThan(0);
    expect(compiled.sourceBytes).toBeGreaterThan(0);
  });
});

describe("dependency stripping and packaging", () => {
  it("keeps reachable modules and strips the rest", () => {
    const result = stripDependencies(
      [
        { id: "main.js", dependencies: ["util.js"] },
        { id: "util.js", dependencies: [] },
        { id: "orphan.js", dependencies: ["util.js"] },
      ],
      ["main.js"],
    );
    expect(result.kept).toEqual(["main.js", "util.js"]);
    expect(result.stripped).toEqual(["orphan.js"]);
  });

  it("packages and extracts runtime assets", () => {
    const pkg = packageRuntimeAssets([
      { name: "tex", kind: "texture", bytes: Uint8Array.from([1, 1, 1, 1, 2]) },
      { name: "mesh", kind: "mesh", bytes: Uint8Array.from([9, 8, 7]) },
    ]);
    expect(pkg.index).toHaveLength(2);
    expect(pkg.totalCookedBytes).toBeLessThanOrEqual(pkg.totalRawBytes + 32);
    const extracted = extractRuntimeEntry(pkg, "tex");
    expect(Array.from(extracted!)).toEqual([1, 1, 1, 1, 2]);
    expect(extractRuntimeEntry(pkg, "missing")).toBeNull();
  });
});

describe("signing", () => {
  it("produces standard sha256 digests", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
  });

  it("signs builds and detects tampering", () => {
    const files = [
      { path: "b.js", content: "world" },
      { path: "a.js", content: "hello" },
    ];
    const manifest = signBuild("1.0.0", files, "secret", 1000);
    expect(manifest.files.map((file) => file.path)).toEqual(["a.js", "b.js"]);
    expect(manifest.signature).toHaveLength(64);
    expect(manifest.signedAtUnix).toBe(1000);
    const verified = verifyBuild(manifest, files, "secret");
    expect(verified.ok).toBe(true);
    expect(verified.signatureValid).toBe(true);

    const tampered = verifyBuild(manifest, [{ path: "a.js", content: "hell0" }, files[0]!], "secret");
    expect(tampered.ok).toBe(false);
    expect(tampered.tamperedFiles).toEqual(["a.js"]);
    const forged = verifyBuild({ ...manifest, signature: "0".repeat(64) }, files, "secret");
    expect(forged.signatureValid).toBe(false);
    expect(hmacSha256Hex("k", "m")).toHaveLength(64);
    expect(buildFileHash({ path: "x", content: "y" })).toHaveLength(64);
  });
});

describe("production build pipeline", () => {
  const input: ProductionBuildInput = {
    version: "1.8.0",
    sources: {
      "main.js": 'import "util.js";\nexport function start() { return util(); }',
      "util.js": "export function util() { return 1; }",
      "orphan.js": 'import "util.js";',
    },
    textures: [
      {
        name: "albedo",
        pixels: { width: 2, height: 2, format: "rgba8", data: new Uint8Array(16).fill(128) },
        targetFormat: "la8",
        generateMipmaps: false,
        compress: true,
      },
    ],
    meshes: [
      {
        name: "quad",
        vertices: [
          { position: [0, 0, 0], normal: [0, 1, 0], uv: [0, 0] },
          { position: [1, 0, 0], normal: [0, 1, 0], uv: [1, 0] },
          { position: [1, 1, 0], normal: [0, 1, 0], uv: [1, 1] },
        ],
        indices: [0, 1, 2],
        quantizeBits: 16,
        weldEpsilon: 1e-6,
      },
    ],
    shaders: [{ name: "lit", stage: "vertex", source: "uniform mat4 mvp; void main() {}" }],
    roots: ["main.js"],
    target: "linux-release",
    secret: "build-secret",
    epochStartUnix: 0,
  };

  it("runs all eight stages and produces a signed reproducible build", () => {
    const pipeline = new ProductionBuildPipeline();
    const result = pipeline.run(input);
    expect(result.ok).toBe(true);
    expect(result.stages.map((stage) => stage.stage)).toEqual([
      "source",
      "dependencies",
      "cooking",
      "compilation",
      "linking",
      "packaging",
      "signing",
      "final",
    ]);
    expect(result.stages.every((stage) => stage.ok)).toBe(true);
    expect(result.stripped).toEqual(["orphan.js"]);
    expect(result.textures[0]!.format).toBe("la8");
    expect(result.meshes[0]!.indexCount).toBe(3);
    expect(result.shaders[0]!.uniforms[0]!.name).toBe("mvp");
    expect(result.manifest.signature).toHaveLength(64);
    expect(result.runtimePackage.index.length).toBe(4);

    const rebuild = pipeline.run(input);
    expect(pipeline.isReproducible(result, rebuild)).toBe(true);
    expect(result.reproducibilityHash).toBe(rebuild.reproducibilityHash);
    expect(pipeline.history).toHaveLength(2);
  });
});

describe("ci pipeline", () => {
  it("runs build and test matrices with regression and package checks", () => {
    const pipeline = new ProductionBuildPipeline();
    const ci = new CiPipeline(pipeline);
    const input: ProductionBuildInput = {
      version: "1.8.0",
      sources: { "main.js": "export function start() { return 1; }" },
      textures: [],
      meshes: [],
      shaders: [],
      roots: ["main.js"],
      target: "linux-release",
      secret: "s",
      epochStartUnix: 0,
    };
    const targets = buildMatrix(["linux", "web"], ["release"]);
    expect(targets).toHaveLength(2);
    const report = ci.fullRun(
      [input],
      targets,
      [{ name: "unit-core", suite: "unit", passed: 12, failed: 0, durationMs: 30 }],
      { tests: { "unit-core": 12, "boot-linux": 1 }, performance: { frameMs: 8 } },
      { tests: { "unit-core": 12, "boot-linux": 1, "boot-web": 1 }, performance: { frameMs: 9 } },
      [{ name: "frameMs", value: 9, limit: 16 }],
      "rel-180",
    );
    expect(report.ok).toBe(true);
    expect(report.builds).toHaveLength(2);
    expect(report.tests.ok).toBe(true);
    expect(report.tests.totalFailed).toBe(0);
    expect(report.regression.ok).toBe(true);
    expect(report.regression.newTests).toEqual(["boot-web"]);
    expect(report.packages.every((entry) => entry.ok)).toBe(true);
    expect(report.artifacts.length).toBe(6);
    expect(report.artifacts.every((artifact) => artifact.hash.length > 0)).toBe(true);
  });

  it("flags regressions performance failures and bad packages", () => {
    const slowdown = regressionCompare(
      { tests: { a: 1 }, performance: { frameMs: 8 } },
      { tests: { a: 1 }, performance: { frameMs: 20 } },
    );
    expect(slowdown.ok).toBe(false);
    expect(slowdown.slowdowns[0]!.name).toBe("frameMs");
    const missing = regressionCompare({ tests: { a: 1, b: 2 }, performance: {} }, { tests: { a: 1 }, performance: {} });
    expect(missing.ok).toBe(false);
    expect(missing.missingTests).toEqual(["b"]);

    const perf = performanceTests([{ name: "frameMs", value: 20, limit: 16 }]);
    expect(perf[0]!.failed).toBe(1);
    const platform = platformTests({ platform: "linux", config: "release" });
    expect(platform.every((run) => run.suite === "platform")).toBe(true);

    const pipeline = new ProductionBuildPipeline();
    const result = pipeline.run({
      version: "1.8.0",
      sources: { "main.js": "export const a = 1;" },
      textures: [],
      meshes: [],
      shaders: [],
      roots: ["main.js"],
      target: "linux-release",
      secret: "s",
      epochStartUnix: 0,
    });
    expect(validatePackage(result).ok).toBe(true);
    expect(validatePackage({ ...result, runtimePackage: { index: [], blob: new Uint8Array(0), totalRawBytes: 0, totalCookedBytes: 0 } }).ok).toBe(false);
    const artifacts = generateArtifacts(result, "build-1");
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(["binary", "manifest", "report"]);
  });
});
