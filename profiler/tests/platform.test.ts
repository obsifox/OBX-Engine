import { describe, expect, it } from "vitest";
import {
  FrameProfiler,
  GpuProfiler,
  MemoryProfiler,
  ProfileStream,
  SystemMonitor,
  SystemSampler,
  gpuCaps,
} from "../src/index.js";

describe("gpu profiling", () => {
  it("records counters and reports unavailable backend features", () => {
    const gpu = new GpuProfiler(gpuCaps("gl", { timingSupported: false }));
    gpu.recordDraw(600);
    gpu.recordDraw(200);
    gpu.recordBind();
    gpu.recordShaderSwitch();
    gpu.recordTargetSwitch();
    gpu.addTextureMemory(4096);
    gpu.recordGpuTime(2.5);
    const frame = gpu.endFrame();
    expect(frame.drawCalls).toBe(2);
    expect(frame.triangles).toBe(800);
    expect(frame.textureBinds).toBe(1);
    expect(frame.shaderSwitches).toBe(1);
    expect(frame.renderTargetSwitches).toBe(1);
    expect(frame.textureMemoryBytes).toBe(4096);
    expect(frame.gpuTimeMs).toBe(0);
    expect(gpu.unavailable).toContain("gpu timing");
    expect(gpu.summary().frames).toBe(1);
    expect(gpu.summary().totalDrawCalls).toBe(2);
  });

  it("drops pipeline stats when the backend does not support them", () => {
    const gpu = new GpuProfiler(gpuCaps("null", { pipelineStatsSupported: false, memoryCountersSupported: false }));
    gpu.recordDraw(100);
    gpu.addTextureMemory(128);
    const frame = gpu.endFrame();
    expect(frame.drawCalls).toBe(0);
    expect(frame.textureMemoryBytes).toBe(0);
    expect(gpu.unavailable).toContain("draw statistics");
    expect(gpu.unavailable).toContain("memory counters");
  });
});

describe("system samplers", () => {
  it("samples subsystems and finds the hottest one", () => {
    const sampler = new SystemSampler("physics");
    sampler.sample(2, 10, 512);
    sampler.sample(4, 12, 640);
    sampler.advanceFrame();
    const report = sampler.report();
    expect(report.totalTimeMs).toBe(6);
    expect(report.averageTimeMs).toBe(3);
    expect(report.peakTimeMs).toBe(4);
    expect(report.peakMemoryBytes).toBe(640);
    expect(report.totalItems).toBe(22);

    const monitor = new SystemMonitor();
    monitor.sample("rendering", 5, 100, 1024);
    monitor.sample("physics", 9, 40, 2048);
    monitor.advanceFrame();
    expect(monitor.hottestSystem()).toBe("physics");
    expect(monitor.reports()[0]!.system).toBe("physics");
    expect(monitor.sample("unknown" as never, 1, 1, 1)).toBeNull();
  });
});

describe("frame profiler", () => {
  it("unifies cpu memory gpu and system reports", () => {
    const profiler = new FrameProfiler();
    profiler.memory.alloc("heap", 1000);
    profiler.cpu.begin("update");
    profiler.cpu.advance(2);
    profiler.cpu.end("update");
    profiler.gpu.recordDraw(1200);
    profiler.gpu.recordGpuTime(3.5);
    profiler.systems.sample("ecs", 1.5, 64, 256);
    profiler.beginFrame();
    const report = profiler.endFrame();
    expect(report.frame).toBe(0);
    expect(report.cpuMs).toBe(2);
    expect(report.gpuMs).toBe(3.5);
    expect(report.totalMemoryBytes).toBe(1000);
    expect(report.peakMemoryBytes).toBe(1000);
    expect(report.spans[0]!.name).toBe("update");
    expect(report.gpu!.drawCalls).toBe(1);
    expect(report.systems[0]!.system).toBe("ecs");
    expect(profiler.latest()!.frame).toBe(0);
    expect(profiler.summary().frames).toBe(1);
  });

  it("detects budget violations", () => {
    const profiler = new FrameProfiler();
    profiler.memory.alloc("heap", 5000);
    profiler.cpu.begin("work");
    profiler.cpu.advance(20);
    profiler.cpu.end("work");
    for (let i = 0; i < 1001; i += 1) profiler.gpu.recordDraw(1);
    profiler.endFrame();
    const violations = profiler.checkBudgets({ frameMs: 16, memoryBytes: 4096, drawCalls: 1000 });
    expect(violations.map((violation) => violation.budget).sort()).toEqual(["drawCalls", "frameMs", "memoryBytes"]);
    expect(profiler.checkBudgets({ frameMs: 100, memoryBytes: 10000, drawCalls: 3000 })).toEqual([]);
  });

  it("keeps legacy memory profiler interop", () => {
    const memory = new MemoryProfiler();
    memory.alloc("assets", 256);
    memory.free("assets", 128);
    expect(memory.snapshot()[0]!.current).toBe(128);
  });
});

describe("profile stream", () => {
  it("streams chunks with bounded buffering", () => {
    const stream = new ProfileStream(2);
    const profiler = new FrameProfiler();
    profiler.cpu.begin("a");
    profiler.cpu.advance(1);
    profiler.cpu.end("a");
    const report = profiler.endFrame();
    const received: unknown[] = [];
    stream.pushFrame(report, (chunk) => received.push(ProfileStream.decode(chunk)));
    stream.pushSpans(0, report.spans);
    stream.pushFrame(report);
    expect(received).toHaveLength(1);
    expect(stream.stats.sent).toBe(3);
    expect(stream.stats.dropped).toBe(1);
    expect(stream.drain()).toHaveLength(2);
    expect(stream.drain()).toHaveLength(0);
    expect(stream.stats.bytes).toBeGreaterThan(0);
  });
});
