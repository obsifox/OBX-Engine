import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Vec3, AABB, Mat4, Color, Colors, Vec2 } from "@obx/math";
import {
  LightRig,
  makeAmbient,
  makeDirectional,
  makePoint,
  makeSpot,
  makeArea,
  packLights,
  evaluateLighting,
  LIGHT_UNIFORM_STRIDE,
  PbrMaterial,
  shadePbr,
  distributionGgx,
  fresnelSchlick,
  rgb,
  orthographicLightViewProjection,
  renderShadowMap,
  sampleShadowMap,
  pcfSample,
  cascadeSplits,
  CascadedShadowMaps,
  makeSky,
  skyRadiance,
  bakeProbeFromSky,
  sampleReflection,
  computeIrradiance,
  renderSky,
  createFrameBuffer,
  applyPostChain,
  defaultPostSettings,
  toneMapValue,
  Frustum,
  RenderQueue,
  selectLodIndex,
  sortRenderQueue,
  RenderGraph,
  measureBottlenecks,
  qualitySettings,
  scaledQuality,
  qualityLevels,
  QualityController,
  GpuParticleSystem,
  ParticleTrail,
  GpuEffectSystem,
  mulberry32,
  PARTICLE_INSTANCE_STRIDE,
  SoftwareBackend,
  Renderer2D,
  Camera2D,
  encodePng,
} from "@obx/rendering";
import { VfxNodeGraph, MaterialGraph } from "@obx/vfx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "output");
mkdirSync(outDir, { recursive: true });

const origin = { position: new Vec3(0, 0, 0), normal: new Vec3(0, 1, 0) };

const rig = new LightRig();
rig.add(makeAmbient(new Color(0.25, 0.3, 0.4), 1));
rig.add(makeDirectional(new Vec3(-0.4, -0.8, -0.45), new Color(1, 0.95, 0.85), 1.4));
rig.add(makePoint(new Vec3(2.5, 3, 1.5), new Color(1, 0.55, 0.25), 12, 14));
rig.add(makeSpot(new Vec3(-3, 4, 2), new Vec3(0.55, -0.75, -0.35), new Color(0.35, 0.75, 1), 18, 0.5, 0.35, 18));
rig.add(makeArea(new Vec3(0, 5, -2), new Vec3(0, -1, 0.2), new Color(0.9, 0.9, 1), 3, 2, 12));
const packedLights = packLights(rig.lights);
const rigEvaluation = rig.evaluate(origin, rgb(0.7, 0.55, 0.4));

const material = new PbrMaterial({
  baseColor: new Color(0.78, 0.42, 0.22),
  metallic: 0.15,
  roughness: 0.38,
  emissive: new Color(0.05, 0.02, 0.01),
  emissionStrength: 1.5,
  specular: 0.6,
});
const shaded = shadePbr(material, {
  point: origin,
  viewDir: new Vec3(0.2, 1, 0.2).normalize(),
  lights: rig.lights,
  shadow: 0.85,
});
const shadowedOnly = shadePbr(material, { point: origin, viewDir: new Vec3(0, 1, 0), lights: rig.lights, shadow: 0 });

const quad = [
  { a: new Vec3(-8, 0, -8), b: new Vec3(8, 0, -8), c: new Vec3(8, 0, 8) },
  { a: new Vec3(-8, 0, -8), b: new Vec3(8, 0, 8), c: new Vec3(-8, 0, 8) },
];
const shadowVp = orthographicLightViewProjection(new Vec3(0, 12, 0), new Vec3(0, -1, 0), 12);
const shadowMap = renderShadowMap(quad, shadowVp, 64, 64);
const litSample = sampleShadowMap(shadowMap, new Vec3(0, 1, 0));
const occludedSample = sampleShadowMap(shadowMap, new Vec3(0, -1, 0));
const softEdge = pcfSample(shadowMap, new Vec3(0, 1, 0), 0.002, 4, 1);
const splits = cascadeSplits(1, 120, 4);
const csm = new CascadedShadowMaps();
const cascadeOfTarget = csm.cascadeForDepth(34, splits);

const sky = makeSky();
const probe = bakeProbeFromSky(sky, 8);
const irradiance = computeIrradiance(probe);
const skyTop = skyRadiance(sky, new Vec3(0, 1, 0));
const skyHorizon = skyRadiance(sky, new Vec3(1, 0, 0));
const reflection = sampleReflection(probe, new Vec3(0, 1, 0));
const skyPixels = renderSky(sky, { position: new Vec3(0, 1, 0), forward: new Vec3(0, 0, -1), up: new Vec3(0, 1, 0), fovRadians: 1.2, aspect: 2 }, 32, 8);

const hdr = createFrameBuffer(16, 9, true);
for (let i = 0; i < hdr.color.length; i += 4) {
  const x = (i / 4) % 16;
  hdr.color[i] = 0.2 + x * 0.18;
  hdr.color[i + 1] = 0.16 + x * 0.11;
  hdr.color[i + 2] = 0.3 + x * 0.06;
  hdr.color[i + 3] = 1;
}
const postSettings = defaultPostSettings();
postSettings.bloom.threshold = 0.6;
postSettings.toneMap = "aces";
applyPostChain(hdr, postSettings, null);
const toneAnchors = [toneMapValue(0, "aces"), toneMapValue(1, "aces"), toneMapValue(2, "reinhard")];

const particles = new GpuParticleSystem({ seed: 2026, rate: 240, maxParticles: 512, velocitySpread: 0.6, emitter: "sphere", emitterSize: new Vec3(1.2, 1.2, 1.2) });
for (let step = 0; step < 24; step += 1) particles.simulate(0.05);
const trail = new ParticleTrail({ maxPoints: 16, width: 0.15 });
for (let i = 0; i < 12; i += 1) trail.push(new Vec3(i * 0.25, Math.sin(i * 0.7), i * 0.1));
const effects = new GpuEffectSystem(particles, { turbulence: 0.4, vortex: 0.25, burst: 0 });
effects.apply(0.05, 1.25);
const uploads = [];
const particleBuffer = particles.createInstanceBuffer({
  createBuffer: (descriptor) => ({ write: (data) => uploads.push(data.byteLength), size: descriptor.size }),
});
particles.updateInstanceBuffer(particleBuffer);
const rng = mulberry32(99);
const rngSamples = [rng(), rng(), rng()];

const view = Mat4.lookAt(new Vec3(0, 6, 14), new Vec3(0, 1, 0), new Vec3(0, 1, 0));
const projection = Mat4.perspective(Math.PI / 3, 16 / 9, 0.1, 100);
const frustum = Frustum.fromViewProjection(projection.multiply(view));
const queue = new RenderQueue();
const sceneItems = [
  { id: "floor", bounds: AABB.fromCenterSize(new Vec3(0, -0.5, 0), new Vec3(16, 1, 16)) },
  { id: "tower", bounds: AABB.fromCenterSize(new Vec3(-3, 2, -2), new Vec3(2, 4, 2)) },
  { id: "rock", bounds: AABB.fromCenterSize(new Vec3(2.5, 0.75, 3), new Vec3(1.5, 1.5, 1.5)) },
  { id: "behind", bounds: AABB.fromCenterSize(new Vec3(0, 1, 40), new Vec3(2, 2, 2)) },
];
for (const item of sceneItems) queue.push(item);
const cullResult = queue.cull(frustum);
const sortedVisible = sortRenderQueue(cullResult.visible, new Vec3(0, 6, 14));
const lodForTarget = selectLodIndex(34, [12, 36, 80]);

const graph = new RenderGraph();
graph.addResource({ name: "shadow", size: 8 });
graph.addResource({ name: "gbuffer", size: 8 });
graph.addResource({ name: "hdr", size: 8 });
graph.addResource({ name: "backbuffer", size: 8 });
graph.addPass({ name: "shadow-map", writes: ["shadow"], execute: () => undefined });
graph.addPass({ name: "gbuffer", writes: ["gbuffer"], execute: () => undefined });
graph.addPass({ name: "lighting", reads: ["gbuffer", "shadow"], writes: ["hdr"], execute: () => undefined });
graph.addPass({ name: "post-fx", reads: ["hdr"], writes: ["backbuffer"], execute: () => undefined });
graph.addPass({ name: "particles", reads: ["backbuffer"], writes: ["backbuffer"], execute: () => undefined });
const graphStats = graph.execute();
const bottlenecks = measureBottlenecks(graphStats, 0);

const qualityTable = {};
for (const level of qualityLevels()) qualityTable[level] = qualitySettings(level);
const controller = new QualityController("high");
const scaled = controller.apply(0.5);
const scaledLow = scaledQuality("low", 2);

const vfxGraph = new VfxNodeGraph();
vfxGraph.addNode({ id: "emit", type: "emitter", params: { rate: 240 } });
vfxGraph.addNode({ id: "force", type: "force", params: { strength: 0.4 } });
vfxGraph.addNode({ id: "tint", type: "color", params: {} });
vfxGraph.addNode({ id: "out", type: "output", params: {} });
vfxGraph.link("emit", "force").link("force", "tint").link("tint", "out");
const vfxOrder = vfxGraph.compileOrder();
const materialGraph = new MaterialGraph();
materialGraph.add({ id: "uv", op: "uv", params: { scale: 2, offset: 1 } });
materialGraph.add({ id: "mul", op: "mul", params: { value: 1.5 } });
const materialSample = materialGraph.sample(0.5, 0.25);

const W = 640, H = 360;
const backend = new SoftwareBackend(W, H);
const renderer = new Renderer2D(backend);
const camera = new Camera2D({ viewportWidth: W, viewportHeight: H, position: new Vec2(W / 2, H / 2) });

const toColor = (value) => new Color(Math.min(1, Math.max(0, value.r)), Math.min(1, Math.max(0, value.g)), Math.min(1, Math.max(0, value.b)));
const bar = (x, y, w, h, color) => renderer.drawRect({ x, y, width: w, height: h, color });

renderer.begin(camera, Colors.obsidian);
bar(0, 0, W, 22, Colors.surface);
bar(8, 6, 70, 10, Colors.foxOrange);
bar(88, 7, 40, 8, Colors.ember);
bar(136, 7, 30, 8, Colors.slate);
bar(W - 120, 6, 112, 10, Colors.signalCyan);

for (let x = 0; x < W; x += 8) {
  const t = x / W;
  const band = skyRadiance(sky, new Vec3(0, 1 - t * 1.4, -0.4).normalize());
  bar(x, 30, 8, 64, toColor(band));
}
bar(0, 30, W, 2, Colors.surface);
bar(0, 92, W, 2, Colors.surface);

bar(8, 102, 200, 128, Colors.surface);
bar(16, 110, 80, 8, Colors.signalCyan);
const shadowCells = 12;
for (let i = 0; i < shadowCells * 4; i += 1) {
  const sx = i % (shadowCells * 2);
  const sy = Math.floor(i / (shadowCells * 2));
  const value = shadowMap.depth[Math.min(shadowMap.depth.length - 1, (sy * 5 + 2) * shadowMap.width + sx * 5 + 2)];
  bar(16 + sx * 8, 128 + sy * 8, 7, 7, value < -0.8 ? Colors.signalCyan : Colors.obsidian);
}
bar(16, 192, 60, 6, Colors.slate);
bar(82, 192, 110, 6, litSample === 1 ? Colors.ember : Colors.slate);

bar(216, 102, 200, 128, Colors.surface);
bar(224, 110, 90, 8, Colors.foxOrange);
const sphereShade = toColor(shaded);
const sphereShadow = toColor(shadowedOnly);
bar(228, 132, 72, 72, sphereShade);
bar(316, 132, 72, 72, sphereShadow);
bar(228, 212, 72, 6, Colors.ember);
bar(316, 212, 72, 6, Colors.slate);

bar(424, 102, 208, 128, Colors.surface);
bar(432, 110, 100, 8, Colors.ember);
const rand = mulberry32(7);
for (let i = 0; i < 42; i += 1) {
  const angle = rand() * Math.PI * 2;
  const radius = rand();
  const px = 528 + Math.cos(angle) * radius * 84;
  const py = 172 + Math.sin(angle) * radius * 46;
  const alpha = 1 - radius;
  bar(px, py, 4, 4, new Color(1, 0.55 + alpha * 0.35, 0.2 + alpha * 0.5));
}
bar(432, 212, 96, 6, Colors.signalCyan);

bar(8, 238, 200, 84, Colors.surface);
bar(16, 246, 70, 8, Colors.foxOrange);
const postSteps = ["ssao", "bloom", "aces", "grade", "fxaa", "dof", "blur", "taa", "vignette"];
for (let i = 0; i < postSteps.length; i += 1) {
  bar(16 + i * 20, 266, 14, 34, i < 5 ? Colors.foxOrange : Colors.slate);
}
bar(16, 306, 120, 6, Colors.light);

bar(216, 238, 200, 84, Colors.surface);
bar(224, 246, 90, 8, Colors.signalCyan);
const levelScale = [0.35, 0.55, 0.78, 1];
for (let i = 0; i < 4; i += 1) {
  bar(228, 264 + i * 12, 120 * levelScale[i], 8, i === 2 ? Colors.foxOrange : Colors.slate);
}
bar(356, 264, 48, 8, Colors.ember);

bar(424, 238, 208, 84, Colors.surface);
bar(432, 246, 80, 8, Colors.ember);
for (let i = 0; i < graphStats.passes; i += 1) {
  const timing = graphStats.passTimings[i];
  bar(432, 264 + i * 11, 40 + (i % 3) * 30, 8, i === 2 ? Colors.foxOrange : Colors.light);
}
bar(432, 320, 120, 2, Colors.surface);

bar(8, 330, 624, 22, Colors.surface);
bar(16, 336, 60, 8, Colors.slate);
bar(90, 336, 160, 8, Colors.light);
bar(270, 336, 90, 8, Colors.signalCyan);
bar(380, 336, 130, 8, Colors.ember);
bar(530, 336, 90, 8, Colors.slate);
renderer.end();

const frame = { width: W, height: H, data: backend.pixels };
writeFileSync(join(outDir, "frame.png"), encodePng(frame));

const stats = {
  version: "1.5.0",
  demo: "v150-demo",
  errors: 0,
  lighting: {
    lights: rig.lights.length,
    uniformStride: LIGHT_UNIFORM_STRIDE,
    packedFloats: packedLights.length,
    rigEvaluation: { r: rigEvaluation.r, g: rigEvaluation.g, b: rigEvaluation.b },
  },
  pbr: {
    shaded: { r: shaded.r, g: shaded.g, b: shaded.b },
    shadowedOnly: { r: shadowedOnly.r, g: shadowedOnly.g, b: shadowedOnly.b },
    ggxPeak: distributionGgx(1, 0.38),
    fresnelGrazing: fresnelSchlick(0, rgb(0.04, 0.04, 0.04)).r,
  },
  shadows: {
    mapSize: [shadowMap.width, shadowMap.height],
    litSample,
    occludedSample,
    softEdge,
    splits,
    cascadeOfTarget,
  },
  environment: {
    skyTop: { r: skyTop.r, g: skyTop.g, b: skyTop.b },
    skyHorizon: { r: skyHorizon.r, g: skyHorizon.g, b: skyHorizon.b },
    reflection: { r: reflection.r, g: reflection.g, b: reflection.b },
    irradiance: { r: irradiance.r, g: irradiance.g, b: irradiance.b },
    skyPixels: skyPixels.length,
  },
  post: {
    toneAnchors,
    hdrPixels: hdr.color.length,
    settings: { toneMap: postSettings.toneMap, bloomThreshold: postSettings.bloom.threshold, fxaa: postSettings.fxaaEnabled },
  },
  particles: {
    alive: particles.aliveCount,
    stride: PARTICLE_INSTANCE_STRIDE,
    uploadBytes: uploads,
    trailSegments: trail.length - 1,
    rngSamples,
    time: particles.time,
  },
  optimization: {
    frustumVisible: cullResult.visible.length,
    frustumCulled: cullResult.stats.culled,
    sorted: sortedVisible.map((item) => item.id),
    lodForTarget,
  },
  renderGraph: {
    passes: graphStats.passes,
    resources: graphStats.resources,
    totalMs: graphStats.totalMs,
    timings: graphStats.passTimings.map((timing) => [timing.name, timing.durationMs]),
    bottlenecks: bottlenecks.map((entry) => entry.name),
  },
  quality: {
    levels: qualityLevels(),
    lowShadow: qualityTable.low.shadowMapSize,
    ultraShadow: qualityTable.ultra.shadowMapSize,
    scaledHigh: scaled.shadowMapSize,
    scaledLow: scaledLow.shadowMapSize,
  },
  vfx: {
    order: vfxOrder,
    materialSample,
  },
};

writeFileSync(join(outDir, "stats.json"), JSON.stringify(stats, null, 2));
console.log(`lights=${rig.lights.length} shaded=${shaded.r.toFixed(3)} lit=${litSample} culled=${cullResult.stats.culled} alive=${particles.aliveCount} passes=${graphStats.passes}`);
