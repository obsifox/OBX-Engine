import { describe, expect, it } from "vitest";
import { AsyncStreamer, HlodSystem, OcclusionGrid, WorldSimulation } from "../src/index.js";

describe("AsyncStreamer", () => {
  it("loads by priority budget and unloads", () => {
    const streamer = new AsyncStreamer({ budgetPerTick: 2, maxQueue: 3 });
    const unloaded: string[] = [];
    expect(streamer.enqueue({ id: "low", priority: 1, load: () => "low-asset", unload: (a) => unloaded.push(String(a)) })).toBe(true);
    expect(streamer.enqueue({ id: "high", priority: 10, load: () => "high-asset" })).toBe(true);
    expect(streamer.enqueue({ id: "mid", priority: 5, load: () => "mid-asset" })).toBe(true);
    expect(streamer.enqueue({ id: "extra", priority: 0, load: () => "x" })).toBe(false);
    expect(streamer.enqueue({ id: "high", priority: 0, load: () => "x" })).toBe(false);
    expect(streamer.isLoading("high")).toBe(true);
    const first = streamer.tick();
    expect(first.loaded).toEqual(["high", "mid"]);
    const second = streamer.tick();
    expect(second.loaded).toEqual(["low"]);
    expect(streamer.loadedIds().sort()).toEqual(["high", "low", "mid"]);
    expect(streamer.get("high")).toBe("high-asset");
    expect(streamer.unload("low")).toBe(true);
    expect(unloaded).toEqual(["low-asset"]);
    expect(streamer.unload("low")).toBe(false);
    expect(streamer.stats).toMatchObject({ enqueued: 3, loaded: 3, unloaded: 1, dropped: 1 });
  });
});

describe("HlodSystem", () => {
  it("selects lod level per distance", () => {
    const hlod = new HlodSystem();
    hlod.register("near", 1, 1);
    hlod.register("mid", 20, 0);
    hlod.register("far", 100, 0);
    expect(hlod.levelFor(5).mesh).toBe("high");
    expect(hlod.levelFor(25).mesh).toBe("medium");
    expect(hlod.levelFor(999).mesh).toBe("low");
    expect(hlod.resolve({ x: 0, y: 0 })).toEqual([
      { id: "far", level: 2, mesh: "low" },
      { id: "mid", level: 1, mesh: "medium" },
      { id: "near", level: 0, mesh: "high" },
    ]);
    expect(hlod.unregister("mid")).toBe(true);
    expect(hlod.count).toBe(2);
  });
});

describe("OcclusionGrid", () => {
  it("hides targets behind occluders", () => {
    const grid = new OcclusionGrid(10, 10);
    grid.block(4, 1, 4, 8);
    expect(grid.blockedCells).toBe(8);
    expect(grid.visible({ x: 0, y: 4 }, { x: 9, y: 4 })).toBe(false);
    expect(grid.visible({ x: 0, y: 4 }, { x: 3, y: 4 })).toBe(true);
    expect(grid.visible({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(true);
    expect(grid.query({ x: 0, y: 4 }, [
      { id: "hidden", x: 9, y: 4 },
      { id: "visible", x: 2, y: 4 },
    ])).toEqual(["visible"]);
  });
});

describe("WorldSimulation", () => {
  it("advances seasons, population and events", () => {
    const sim = new WorldSimulation({ seed: 11, daysPerSeason: 30, population: { village: 10 } });
    expect(sim.state).toEqual({ season: "spring", day: 1, temperature: 12 });
    const after = sim.advance(60);
    expect(after.day).toBe(61);
    expect(after.season).toBe("autumn");
    const festival = sim.spawnEvent("festival");
    expect(festival.type).toBe("festival");
    expect(festival.id).toMatch(/^event_/);
    expect(sim.events.length).toBeGreaterThanOrEqual(1);
    expect(sim.demographics.village).toBeGreaterThanOrEqual(0);
    const rerun = new WorldSimulation({ seed: 11, daysPerSeason: 30, population: { village: 10 } });
    rerun.advance(60);
    expect(rerun.demographics).toEqual(sim.demographics);
  });
});
