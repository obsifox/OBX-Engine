import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CiPipeline,
  ProductionBuildPipeline,
  buildMatrix,
  signBuild,
  verifyBuild,
} from "@obx/build";
import {
  FrameProfiler,
  GpuProfiler,
  ProfileStream,
  gpuCaps,
} from "@obx/profiler";
import {
  DebugSession,
  InMemoryTransport,
} from "@obx/editor";
import {
  applyPostChain,
  createFrameBuffer,
  defaultPostSettings,
  encodePng,
} from "@obx/rendering";
import { renderScene } from "./render.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "output");
mkdirSync(outDir, { recursive: true });

const report = { version: "1.8.0", demo: "v180-demo", errors: 0, scenarios: {} };

const sources = {
  "main.js": 'import "world.js";\nimport "player.js";\nexport function start() { return world() + player(); }',
  "world.js": 'import "math.js";\nexport function world() { return clamp(10); }',
  "player.js": 'import "math.js";\nexport function player() { return clamp(5); }',
  "math.js": "export function clamp(v) { return v > 0 ? v : 0; }",
  "debug-only.js": 'import "math.js";\nexport function debug() { return clamp(1); }',
};

const textures = [
  {
    name: "albedo",
    pixels: { width: 8, height: 8, format: "rgba8", data: new Uint8Array(8 * 8 * 4).fill(180) },
    targetFormat: "la8",
    generateMipmaps: true,
    compress: true,
  },
  {
    name: "metallic",
    pixels: { width: 4, height: 4, format: "rgba8", data: new Uint8Array(4 * 4 * 4).fill(64) },
    targetFormat: "r8",
    generateMipmaps: false,
    compress: true,
  },
];

const quad = (s) => [
  { position: [0, 0, 0], normal: [0, 1, 0], uv: [0, 0] },
  { position: [s, 0, 0], normal: [0, 1, 0], uv: [1, 0] },
  { position: [s, s, 0], normal: [0, 1, 0], uv: [1, 1] },
  { position: [0, s, 0], normal: [0, 1, 0], uv: [0, 1] },
];
const meshes = [{ name: "quad", vertices: quad(1), indices: [0, 1, 2, 0, 2, 3], quantizeBits: 16, weldEpsilon: 1e-6 }];
const shaders = [
  { name: "lit", stage: "vertex", source: "uniform mat4 mvp; void main() { gl_Position = mvp * vec4(0,0,0,1); }" },
  { name: "lit", stage: "fragment", source: "uniform vec3 lightDir; uniform sampler2d albedo; void main() {}" },
];

const pipeline = new ProductionBuildPipeline();
const buildInput = {
  version: "1.8.0",
  sources,
  textures,
  meshes,
  shaders,
  roots: ["main.js"],
  target: "linux-release",
  secret: "obx-demo-secret",
  epochStartUnix: 1780000000,
};
const buildA = pipeline.run(buildInput);
const buildB = pipeline.run(buildInput);
const manifestCheck = verifyBuild(buildA.manifest, [
  ...Object.entries(sources).filter(([name]) => buildA.manifest.files.some((file) => file.path === name)).map(([path, content]) => ({ path, content })),
  { path: "bundle.js", content: buildA.bundle },
  { path: "package.bin", content: buildA.runtimePackage.blob },
], "obx-demo-secret");
report.scenarios.build = {
  ok: buildA.ok,
  stages: buildA.stages.map((stage) => stage.stage),
  allStagesOk: buildA.stages.every((stage) => stage.ok),
  stripped: buildA.stripped,
  textureCount: buildA.textures.length,
  textureCookedBytes: buildA.textures.reduce((total, texture) => total + texture.cookedBytes, 0),
  textureOriginalBytes: buildA.textures.reduce((total, texture) => total + texture.originalBytes, 0),
  meshVertices: buildA.meshes[0].vertexCount,
  shaderPackages: buildA.shaders.length,
  shaderUniforms: buildA.shaders.map((shader) => shader.uniforms.map((uniform) => uniform.name)),
  runtimeEntries: buildA.runtimePackage.index.length,
  runtimeCookedBytes: buildA.runtimePackage.totalCookedBytes,
  treeHash: buildA.manifest.treeHash,
  signatureLength: buildA.manifest.signature.length,
  reproducible: pipeline.isReproducible(buildA, buildB),
  manifestVerified: manifestCheck.ok,
};

const profiler = new FrameProfiler(new GpuProfiler(gpuCaps("demo-gl", { timingSupported: true })));
for (let frame = 0; frame < 3; frame += 1) {
  profiler.beginFrame();
  profiler.cpu.begin("update");
  profiler.cpu.advance(2 + frame * 0.5);
  profiler.cpu.end("update");
  profiler.cpu.begin("render");
  profiler.cpu.advance(4 + frame);
  profiler.cpu.end("render");
  profiler.memory.alloc("heap", 8000 + frame * 512);
  profiler.memory.alloc("textures", 24000);
  profiler.gpu.recordDraw(120 + frame * 4);
  profiler.gpu.recordGpuTime(6.5 + frame * 0.5);
  profiler.gpu.addTextureMemory(24000);
  profiler.systems.sample("rendering", 4 + frame, 120, 24000);
  profiler.systems.sample("physics", 1.5 + frame * 0.25, 42, 8192);
  profiler.systems.sample("ecs", 0.8, 300, 4096);
  profiler.systems.sample("audio", 0.3, 12, 1024);
  profiler.systems.sample("network", 0.4, 8, 2048);
  profiler.systems.sample("assets", 0.2, 3, 512);
  profiler.endFrame();
}
const budgets = profiler.checkBudgets({ frameMs: 16, memoryBytes: 1024 * 1024, drawCalls: 200 });
const stream = new ProfileStream(64);
profiler.reports.forEach((frameReport) => stream.pushFrame(frameReport));
const summary = profiler.summary();
report.scenarios.profiler = {
  frames: summary.frames,
  averageFrameMs: summary.averageFrameMs,
  peakFrameMs: summary.peakFrameMs,
  averageMemoryBytes: summary.averageMemoryBytes,
  gpuSummary: profiler.gpu.summary(),
  hottestSystem: profiler.systems.hottestSystem(),
  budgetViolations: budgets.length,
  streamedChunks: stream.stats.sent,
  cpuProfiled: profiler.reports[0].spans.map((span) => span.name),
};

const debugProgram = {
  script: "game.js",
  instructions: [
    { op: "enter", name: "main" },
    { op: "line", line: 1 },
    { op: "set", name: "hp", value: 100 },
    { op: "line", line: 2 },
    { op: "expr", name: "shield", expression: "hp * 0.25" },
    { op: "line", line: 3 },
    { op: "enter", name: "takeDamage" },
    { op: "line", line: 7 },
    { op: "expr", name: "hp", expression: "hp - 30" },
    { op: "leave" },
    { op: "line", line: 4 },
    { op: "leave" },
  ],
};
const transport = new InMemoryTransport();
const session = new DebugSession();
session.attach(debugProgram, transport);
session.breakpoints.add({ script: "game.js", line: 3, column: 1 }, "hp > 50");
session.run();
const watch = session.watches.add("hp + shield");
const watchResults = session.watches.evaluate(session.scope());
session.stepOver();
const stackAfter = session.callStack.frames().map((frame) => `${frame.functionName}@${frame.location.line}`);
const remoteStack = transport.sendToServer({ type: "stackTrace" });
const remoteVars = transport.sendToServer({ type: "variables" });
session.continue();
report.scenarios.debugger = {
  pausedAt: 3,
  hitCount: session.breakpoints.all[0].hitCount,
  conditionGuarded: session.breakpoints.all[0].condition,
  watchValue: watchResults[0].value,
  stackAfterStepOver: stackAfter,
  remoteMessages: transport.messages,
  remoteStack: String(remoteStack.frames),
  remoteHasHp: String(remoteVars.scope).includes('"hp"'),
  finalState: session.state,
  diagnostics: session.diagnostics.size,
  watchId: watch.id,
};

const ci = new CiPipeline(new ProductionBuildPipeline());
const targets = buildMatrix(["linux", "web"], ["release"]);
const ciReport = ci.fullRun(
  [buildInput],
  targets,
  [{ name: "unit-suite", suite: "unit", passed: 889, failed: 0, durationMs: 40 }],
  { tests: { "unit-suite": 861 }, performance: { frameMs: 10, memoryBytes: 40000 } },
  { tests: { "unit-suite": 889 }, performance: { frameMs: 11, memoryBytes: 36000 } },
  [{ name: "frameMs", value: 11, limit: 16 }, { name: "memoryBytes", value: 36000, limit: 65536 }],
  "v180",
);
report.scenarios.ci = {
  ok: ciReport.ok,
  buildCells: ciReport.builds.length,
  cellsOk: ciReport.builds.every((cell) => cell.ok),
  testsPassed: ciReport.tests.totalPassed,
  testsFailed: ciReport.tests.totalFailed,
  regressionOk: ciReport.regression.ok,
  packagesOk: ciReport.packages.every((entry) => entry.ok),
  artifacts: ciReport.artifacts.map((artifact) => artifact.name),
  artifactHashesValid: ciReport.artifacts.every((artifact) => artifact.hash.length > 0),
};

const signProbe = signBuild("1.8.0", [{ path: "x", content: "y" }], "secret", 1780000000);
report.scenarios.signing = {
  treeHashLength: signProbe.treeHash.length,
  deterministic: signProbe.treeHash === signBuild("1.8.0", [{ path: "x", content: "y" }], "secret", 1780000000).treeHash,
};

if (report.errors > 0) throw new Error("demo errors");

const WIDTH = 1280;
const HEIGHT = 560;
const startedAt = Date.now();
const scene = renderScene(WIDTH, HEIGHT, 2);
const renderMs = Date.now() - startedAt;

const frameBuffer = createFrameBuffer(WIDTH, HEIGHT);
frameBuffer.color.set(scene.color);
const renderPost = defaultPostSettings();
renderPost.bloom = { enabled: true, threshold: 0.9, intensity: 0.5, radius: 3 };
renderPost.toneMap = "aces";
renderPost.grade = { exposure: 1.0, contrast: 1.06, saturation: 1.12, lift: 0, gamma: 1, gain: 1 };
renderPost.vignette = { strength: 0.22, radius: 0.9 };
renderPost.fxaaEnabled = true;
applyPostChain(frameBuffer, renderPost, null);

const ldr = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
for (let i = 0; i < ldr.length; i += 1) {
  ldr[i] = Math.round(Math.min(1, Math.max(0, frameBuffer.color[i])) * 255);
}
writeFileSync(join(outDir, "frame.png"), encodePng({ width: WIDTH, height: HEIGHT, data: ldr }));

report.render = {
  width: WIDTH,
  height: HEIGHT,
  supersample: "2x2",
  samplesPerPixel: 4,
  renderMs,
  postChain: ["bloom(0.9/0.5/3)", "aces", "grade(1.06/1.12)", "fxaa", "vignette(0.22/0.9)"],
};

writeFileSync(join(outDir, "stats.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
