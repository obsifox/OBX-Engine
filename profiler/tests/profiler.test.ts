import { describe, expect, it } from "vitest";
import {
  ChannelTracker,
  CpuProfiler,
  FrameDebugger,
  MemoryProfiler,
  ProfileReport,
} from "../src/index.js";

describe("CpuProfiler", () => {
  it("measures nested spans", () => {
    const cpu = new CpuProfiler();
    cpu.begin("update");
    cpu.advance(2);
    cpu.begin("physics");
    cpu.advance(3);
    expect(cpu.end("physics").duration).toBe(3);
    cpu.advance(1);
    cpu.end("update");
    cpu.begin("update");
    cpu.advance(4);
    cpu.end("update");
    expect(() => cpu.end("ghost")).toThrow(RangeError);
    cpu.begin("render");
    expect(() => cpu.begin("render")).toThrow(RangeError);
    expect(cpu.openSpans).toEqual(["render"]);
    const report = cpu.report();
    expect(report[0]).toMatchObject({ name: "update", count: 2, total: 10, max: 6 });
    expect(report.find((entry) => entry.name === "physics")).toMatchObject({ average: 3 });
    expect(cpu.stats).toEqual({ begun: 4, closed: 3 });
    expect(cpu.samples).toHaveLength(3);
  });
});

describe("MemoryProfiler", () => {
  it("tracks current and peak bytes", () => {
    const memory = new MemoryProfiler();
    memory.alloc("textures", 500);
    memory.alloc("textures", 300);
    memory.alloc("meshes", 100);
    memory.free("textures", 400);
    const snapshot = memory.snapshot();
    expect(snapshot.find((entry) => entry.name === "textures")).toEqual({ name: "textures", current: 400, peak: 800, allocations: 2 });
    expect(memory.totalCurrent).toBe(500);
    expect(memory.totalPeak).toBe(900);
    expect(() => memory.free("ghost", 1)).toThrow(RangeError);
  });
});

describe("ChannelTracker", () => {
  it("aggregates per-channel metrics", () => {
    const network = new ChannelTracker("network");
    network.record("bytes", 100);
    network.record("bytes", 300);
    network.record("packets", 5);
    const report = network.report();
    expect(report.bytes).toEqual({ count: 2, total: 400, average: 200, max: 300 });
    expect(report.packets).toEqual({ count: 1, total: 5, average: 5, max: 5 });
    expect(network.channel).toBe("network");
  });
});

describe("FrameDebugger", () => {
  it("captures frames and draw statistics", () => {
    const frames = new FrameDebugger();
    frames.advance(1);
    frames.beginFrame(1);
    frames.event("shadow-pass");
    frames.drawCall(12, 4000);
    frames.drawCall(3, 250);
    frames.advance(8);
    const frame = frames.endFrame();
    expect(frame).toMatchObject({ tick: 1, events: ["shadow-pass"], draws: { count: 15, triangles: 4250 }, duration: 8 });
    expect(() => frames.event("x")).toThrow(RangeError);
    frames.beginFrame(2);
    frames.drawCall(5, 100);
    frames.endFrame();
    expect(frames.drawStats()).toEqual({ frames: 2, calls: 20, triangles: 4350, averageCalls: 10 });
    expect(frames.openFrame).toBe(false);
    frames.beginFrame(3);
    expect(frames.openFrame).toBe(true);
  });
});

describe("ProfileReport", () => {
  it("combines all profilers into json", () => {
    const cpu = new CpuProfiler();
    cpu.begin("tick");
    cpu.advance(2);
    cpu.end("tick");
    const memory = new MemoryProfiler();
    memory.alloc("audio", 64);
    const asset = new ChannelTracker("asset");
    asset.record("loads", 3);
    const frames = new FrameDebugger();
    frames.beginFrame(1);
    frames.drawCall(1, 10);
    frames.endFrame();
    const bundle = ProfileReport.combine(cpu, memory, [asset], frames);
    expect(bundle.cpu[0]!.name).toBe("tick");
    expect(bundle.memory[0]!.name).toBe("audio");
    expect(bundle.channels.asset.loads.total).toBe(3);
    expect(bundle.frames).toHaveLength(1);
    const parsed = JSON.parse(ProfileReport.toJson(bundle));
    expect(parsed.frames[0].draws.count).toBe(1);
  });
});
