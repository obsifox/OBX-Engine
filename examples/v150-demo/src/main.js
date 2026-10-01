import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Vec3, AABB, Mat4, Color, Colors } from "@obx/math";
import {
  LightRig,
  makeAmbient,
  makeDirectional,
  makePoint,
  makeSpot,
  makeArea,
  packLights,
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
  LIGHT_UNIFORM_STRIDE,
  encodePng,
} from "@obx/rendering";
import { VfxNodeGraph, MaterialGraph } from "@obx/vfx";
import { renderScene } from "./render.js";

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

const stats = {
  version: "1.5.0",
  demo: "v150-demo",
  errors: 0,
  render: {
    width: WIDTH,
    height: HEIGHT,
    supersample: "2x2",
    renderMs,
    spheres: 6,
    lightsInScene: scene.lights.length,
    bounceDepth: 2,
    postChain: ["bloom", "aces", "grade", "fxaa", "vignette"],
  },
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
console.log(`render ${WIDTH}x${HEIGHT} in ${renderMs}ms · spheres=6 lights=${scene.lights.length} · lit=${litSample} alive=${particles.aliveCount}`);
