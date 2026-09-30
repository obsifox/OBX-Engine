import { describe, expect, it } from "vitest";
import { AABB, Color, Mat4, Vec3 } from "@obx/math";
import {
  Frustum,
  OcclusionBuffer,
  occlusionCull,
  RenderQueue,
  selectLodIndex,
  sortRenderQueue,
  type CullableItem,
} from "../src/culling.js";
import { measureBottlenecks, RenderGraph, RenderGraphError, type RenderPass } from "../src/rendergraph.js";
import { QualityController, qualityLevels, qualitySettings, scaledQuality } from "../src/quality.js";
import {
  GpuEffectSystem,
  GpuParticleSystem,
  mulberry32,
  ParticleTrail,
  PARTICLE_INSTANCE_STRIDE,
  type ParticleGpuBuffer,
  type ParticleGpuDevice,
} from "../src/gpuparticles.js";

const box = (id: string, x: number, y: number, z: number, size = 1): CullableItem => ({
  id,
  bounds: AABB.fromCenterSize(new Vec3(x, y, z), new Vec3(size, size, size)),
});

describe("culling", () => {
  const view = Mat4.lookAt(new Vec3(0, 0, 5), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
  const projection = Mat4.perspective(Math.PI / 2, 1, 0.1, 100);
  const frustum = Frustum.fromViewProjection(projection.multiply(view));

  it("keeps objects in view and rejects objects behind the camera", () => {
    expect(frustum.testAabb(AABB.fromCenterSize(new Vec3(0, 0, 0), new Vec3(1, 1, 1)))).toBe(true);
    expect(frustum.testAabb(AABB.fromCenterSize(new Vec3(0, 0, 8), new Vec3(1, 1, 1)))).toBe(false);
    expect(frustum.testAabb(AABB.fromCenterSize(new Vec3(0, 0, -10), new Vec3(1, 1, 1)))).toBe(true);
    expect(frustum.testAabb(AABB.fromCenterSize(new Vec3(60, 0, 0), new Vec3(1, 1, 1)))).toBe(false);
  });

  it("reports culling statistics", () => {
    const items = [box("near", 0, 0, 0), box("behind", 0, 0, 8), box("far-side", 60, 0, 0)];
    const queue = new RenderQueue<string>();
    for (const item of items) queue.push(item);
    expect(queue.size).toBe(3);
    const result = queue.cull(frustum);
    expect(result.stats).toEqual({ submitted: 3, visible: 1, culled: 2, lodDowngrades: 0 });
    expect(result.visible.map((item) => item.id)).toEqual(["near"]);
    queue.clear();
    expect(queue.size).toBe(0);
  });

  it("selects lod tiers by distance thresholds", () => {
    expect(selectLodIndex(5, [10, 20, 40])).toBe(0);
    expect(selectLodIndex(15, [10, 20, 40])).toBe(1);
    expect(selectLodIndex(100, [10, 20, 40])).toBe(3);
    expect(selectLodIndex(100, [])).toBe(0);
  });

  it("sorts opaque front to back and transparent back to front", () => {
    const items = [box("far", 0, 0, -5), box("near", 0, 0, -1), box("mid", 0, 0, -3)];
    const sorted = sortRenderQueue(items, new Vec3(0, 0, 5));
    expect(sorted.map((item) => item.id)).toEqual(["near", "mid", "far"]);
    const mixed = items.map((item) => ({ ...item, transparent: true }));
    const back = sortRenderQueue(mixed, new Vec3(0, 0, 5));
    expect(back.map((item) => item.id)).toEqual(["far", "mid", "near"]);
  });

  it("culls geometry hidden behind nearer depth", () => {
    const occlusion = new OcclusionBuffer(2, 2, new Float32Array([0, 0, 0, 0]));
    const hidden = occlusionCull([box("hidden", 0, 0, 0, 2)], occlusion, 5);
    expect(hidden.stats.culled).toBe(1);
    const open = new OcclusionBuffer(2, 2);
    const shown = occlusionCull([box("shown", 0, 0, 0, 2)], open, 5);
    expect(shown.stats.visible).toBe(1);
  });

  it("downscales depth buffers for coarse occlusion", () => {
    const source = new Float32Array(16).fill(1);
    source[0] = 0.5;
    const coarse = OcclusionBuffer.fromDepth(source, 4, 4, 2);
    expect(coarse.width).toBe(2);
    expect(coarse.depth[0]).toBe(0.5);
    expect(coarse.depth[3]).toBe(1);
  });
});

describe("render graph", () => {
  const pass = (name: string, reads?: string[], writes?: string[]): RenderPass => ({
    name,
    reads,
    writes,
    execute: () => undefined,
  });

  it("orders passes by resource dependencies", () => {
    const graph = new RenderGraph();
    graph.addResource({ name: "color", size: 4 });
    graph.addPass(pass("composite", ["color"], ["screen"]));
    graph.addPass(pass("geometry", [], ["color"]));
    expect(graph.compile().map((entry) => entry.name)).toEqual(["geometry", "composite"]);
  });

  it("rejects cyclic graphs", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("a", ["r2"], ["r1"]));
    graph.addPass(pass("b", ["r1"], ["r2"]));
    expect(() => graph.compile()).toThrow(RenderGraphError);
  });

  it("executes passes with injectable timing", () => {
    const graph = new RenderGraph();
    graph.addResource({ name: "scratch", size: 2 });
    const order: number[] = [];
    graph.addPass({ name: "first", writes: ["scratch"], execute: () => order.push(1) });
    graph.addPass({ name: "second", reads: ["scratch"], execute: () => order.push(2) });
    let clock = 0;
    const stats = graph.execute(() => {
      clock += 10;
      return clock;
    });
    expect(order).toEqual([1, 2]);
    expect(stats.passes).toBe(2);
    expect(stats.passTimings[0]!.durationMs).toBeCloseTo(10, 6);
    expect(stats.totalMs).toBeCloseTo(50, 6);
    const bottlenecks = measureBottlenecks(stats, 5);
    expect(bottlenecks).toHaveLength(2);
    expect(bottlenecks[0]!.durationMs).toBeGreaterThanOrEqual(bottlenecks[1]!.durationMs);
  });

  it("resets pass and resource state", () => {
    const graph = new RenderGraph();
    graph.addPass(pass("only"));
    graph.reset();
    expect(graph.passCount).toBe(0);
    expect(graph.resourceCount).toBe(0);
  });
});

describe("quality", () => {
  it("exposes four ascending presets", () => {
    expect(qualityLevels()).toEqual(["low", "medium", "high", "ultra"]);
    expect(qualitySettings("low").shadowMapSize).toBe(512);
    expect(qualitySettings("low").bloomEnabled).toBe(false);
    expect(qualitySettings("ultra").shadowMapSize).toBeGreaterThan(qualitySettings("low").shadowMapSize);
    expect(qualitySettings("ultra").maxLights).toBeGreaterThan(qualitySettings("low").maxLights);
    expect(qualitySettings("ultra").bloomEnabled).toBe(true);
  });

  it("scales quality budgets deterministically", () => {
    const scaled = scaledQuality("low", 2);
    expect(scaled.level).toBe("low");
    expect(scaled.shadowMapSize).toBe(1024);
  });

  it("clamps controller level switches", () => {
    const controller = new QualityController("medium");
    expect(controller.level).toBe("medium");
    controller.setLevel("ultra");
    expect(controller.settings.shadowMapSize).toBe(qualitySettings("ultra").shadowMapSize);
    const applied = controller.apply(0.5);
    expect(applied.shadowMapSize).toBe(Math.round(qualitySettings("ultra").shadowMapSize * 0.5));
    expect(controller.settings.maxLights).toBe(applied.maxLights);
  });
});

describe("gpu particles", () => {
  it("is deterministic per seed", () => {
    const a = new GpuParticleSystem({ seed: 42, rate: 20 });
    const b = new GpuParticleSystem({ seed: 42, rate: 20 });
    for (let step = 0; step < 5; step += 1) {
      a.simulate(0.05);
      b.simulate(0.05);
    }
    expect(Array.from(a.instanceData())).toEqual(Array.from(b.instanceData()));
  });

  it("spawns by rate and dies by lifetime", () => {
    const shortLived = new GpuParticleSystem({ seed: 7, rate: 10, lifetime: 0.05, velocitySpread: 0 });
    shortLived.simulate(0.1);
    expect(shortLived.aliveCount).toBe(0);
    const sustained = new GpuParticleSystem({ seed: 7, rate: 10, lifetime: 2, velocitySpread: 0 });
    sustained.simulate(0.1);
    expect(sustained.aliveCount).toBe(1);
  });

  it("integrates gravity semi-implicitly", () => {
    const particles = new GpuParticleSystem({ seed: 3, rate: 10, velocity: new Vec3(0, 0, 0), velocitySpread: 0, gravity: new Vec3(0, -10, 0), drag: 0, startSize: 1, endSize: 1, startColor: new Color(1, 1, 1, 1), endColor: new Color(1, 1, 1, 1) });
    particles.simulate(0.1);
    const data = particles.instanceData();
    expect(data[1]).toBeCloseTo(-0.1, 5);
    expect(data[3]).toBeCloseTo(1, 5);
  });

  it("packs instance strides and resets cleanly", () => {
    const particles = new GpuParticleSystem({ seed: 11, rate: 10 });
    particles.simulate(0.1);
    const before = Array.from(particles.instanceData());
    expect(before.length % PARTICLE_INSTANCE_STRIDE).toBe(0);
    particles.reset();
    expect(particles.aliveCount).toBe(0);
    particles.simulate(0.1);
    expect(Array.from(particles.instanceData())).toEqual(before);
  });

  it("uploads instance data through device buffers", () => {
    const particles = new GpuParticleSystem({ seed: 5, rate: 10, maxParticles: 4 });
    particles.simulate(0.1);
    const written: number[] = [];
    const device: ParticleGpuDevice = {
      createBuffer: (descriptor): ParticleGpuBuffer => {
        expect(descriptor.usage).toBe("vertex");
        expect(descriptor.size).toBe(4 * PARTICLE_INSTANCE_STRIDE * 4);
        return { write: (data) => written.push(data.byteLength) };
      },
    };
    const buffer = particles.createInstanceBuffer(device);
    particles.updateInstanceBuffer(buffer);
    expect(written.length).toBe(1);
  });

  it("builds fading trail segments", () => {
    const trail = new ParticleTrail({ maxPoints: 8, width: 0.2 });
    trail.push(new Vec3(0, 0, 0));
    trail.push(new Vec3(1, 0, 0));
    trail.push(new Vec3(2, 0, 0));
    const segments = trail.segments();
    expect(trail.length).toBe(3);
    expect(segments.length).toBe(2 * 2 * PARTICLE_INSTANCE_STRIDE);
    expect(segments[7]!).toBeGreaterThan(segments[segments.length - 1]!);
    trail.clear();
    expect(trail.length).toBe(0);
    expect(trail.segments().length).toBe(0);
  });

  it("advances effect systems without breaking particle state", () => {
    const particles = new GpuParticleSystem({ seed: 9, rate: 10, velocitySpread: 0 });
    const effects = new GpuEffectSystem(particles, { turbulence: 1, vortex: 1, burst: 0 });
    effects.apply(0.1, Math.PI / 2);
    expect(particles.time).toBeCloseTo(0.1, 6);
    expect(particles.aliveCount).toBeGreaterThanOrEqual(0);
    const data = particles.instanceData();
    for (const value of data) expect(Number.isFinite(value)).toBe(true);
  });
});
