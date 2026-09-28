import { describe, expect, it } from "vitest";
import { Random } from "@obx/core";
import {
  DayNightCycle,
  Heightfield,
  LodSystem,
  Region,
  RegionSystem,
  SimulationTiers,
  WeatherScheduler,
  WorldPartition,
  WorldPersistence,
  chunkKey,
} from "../src/index.js";

describe("Heightfield", () => {
  it("is deterministic per seed", () => {
    const a = Heightfield.generate(16, 16, { seed: 42, amplitude: 4, frequency: 0.15, octaves: 3 });
    const b = Heightfield.generate(16, 16, { seed: 42, amplitude: 4, frequency: 0.15, octaves: 3 });
    const c = Heightfield.generate(16, 16, { seed: 7, amplitude: 4, frequency: 0.15, octaves: 3 });
    expect([...a.heights]).toEqual([...b.heights]);
    expect([...a.heights]).not.toEqual([...c.heights]);
  });

  it("stays within amplitude bounds and samples with clamping", () => {
    const field = Heightfield.generate(20, 12, { seed: 3, amplitude: 5, frequency: 0.3, octaves: 2 });
    for (const h of field.heights) expect(Math.abs(h)).toBeLessThanOrEqual(5 + 1e-9);
    expect(Number.isFinite(field.sample(-4, -4))).toBe(true);
    expect(Number.isFinite(field.sample(999, 999))).toBe(true);
    expect(field.sample(3, 2)).toBe(field.heights[2 * 20 + 3]);
    expect(() => new Heightfield(2, 2, new Float32Array(3))).toThrow(RangeError);
  });

  it("computes unit-scale normals", () => {
    const field = Heightfield.generate(10, 10, { seed: 1, amplitude: 2, frequency: 0.25, octaves: 2 });
    const n = field.normal(5, 5);
    const length = Math.hypot(n.x, n.y, n.z);
    expect(length).toBeGreaterThan(0.9);
    expect(length).toBeLessThan(1.1);
  });
});

describe("WorldPartition", () => {
  it("loads the neighbourhood up to the budget per tick", () => {
    const partition = new WorldPartition({
      chunkSize: 10,
      viewDistance: 15,
      unloadDistance: 20,
      budgetPerTick: 5,
      lodDistances: [20, 40],
    });
    const first = partition.update(5, 5, 0);
    expect(first.loaded.length).toBe(5);
    expect(first.unloaded.length).toBe(0);
    const second = partition.update(5, 5, 1);
    expect(second.loaded.length).toBe(4);
    expect(partition.loadedCount()).toBe(9);
    expect(partition.isLoaded(0, 0)).toBe(true);
    expect(partition.loadedKeys).toContain(chunkKey(1, 0));
    const third = partition.update(5, 5, 2);
    expect(third.loaded.length).toBe(0);
    const record = partition.chunks.get(chunkKey(0, 0))!;
    expect(record.lod).toBe(0);
  });

  it("unloads cells beyond unload distance with hysteresis", () => {
    const partition = new WorldPartition({
      chunkSize: 10,
      viewDistance: 15,
      unloadDistance: 20,
      budgetPerTick: 64,
      lodDistances: [20, 40],
    });
    partition.update(5, 5, 0);
    expect(partition.loadedCount()).toBe(9);
    const away = partition.update(105, 5, 1);
    expect(away.unloaded.length).toBe(9);
    expect(partition.isLoaded(0, 0)).toBe(false);
    expect(partition.isLoaded(10, 0)).toBe(true);
    const settled = partition.update(105, 5, 2);
    expect(settled.unloaded.length).toBe(0);
    expect(settled.loaded.length).toBe(0);
    expect(() =>
      new WorldPartition({
        chunkSize: 10,
        viewDistance: 30,
        unloadDistance: 10,
        budgetPerTick: 1,
        lodDistances: [],
      }),
    ).toThrow(RangeError);
  });
});

describe("LodSystem", () => {
  it("picks the level from distance thresholds", () => {
    expect(LodSystem.pick(5, [20, 50, 120])).toBe(0);
    expect(LodSystem.pick(25, [20, 50, 120])).toBe(1);
    expect(LodSystem.pick(60, [20, 50, 120])).toBe(2);
    expect(LodSystem.pick(500, [20, 50, 120])).toBe(3);
    expect(LodSystem.pick(999, [])).toBe(0);
  });
});

describe("RegionSystem", () => {
  it("indexes overlapping regions and tags", () => {
    const forest = new Region("forest", { minX: 0, minZ: 0, maxX: 10, maxZ: 10 });
    forest.tags.add("trees");
    const lake = new Region("lake", { minX: 8, minZ: 8, maxX: 14, maxZ: 14 });
    lake.tags.add("water");
    const regions = new RegionSystem();
    regions.add(forest);
    regions.add(lake);
    expect(regions.at(5, 5).map((r) => r.id)).toEqual(["forest"]);
    expect(regions.at(9, 9).map((r) => r.id).sort()).toEqual(["forest", "lake"]);
    expect(regions.at(100, 100)).toEqual([]);
    expect(regions.tagged("water").map((r) => r.id)).toEqual(["lake"]);
    expect(forest.contains(-1, 5)).toBe(false);
  });
});

describe("DayNightCycle", () => {
  it("wraps the day and tracks sun elevation", () => {
    const cycle = new DayNightCycle({ dayLength: 100, start: 0 });
    expect(cycle.sunElevation).toBeCloseTo(-1, 5);
    expect(cycle.ambient).toBeCloseTo(0.16, 5);
    for (let i = 0; i < 50; i += 1) cycle.update(1);
    expect(cycle.time).toBeCloseTo(0.5, 5);
    expect(cycle.sunElevation).toBeCloseTo(1, 5);
    expect(cycle.ambient).toBeCloseTo(1, 5);
    const noonColor = cycle.sunColor;
    expect(noonColor.g).toBeGreaterThan(0.9);
    for (let i = 0; i < 50; i += 1) cycle.update(1);
    expect(cycle.time).toBeCloseTo(0, 5);
    expect(cycle.sunElevation).toBeCloseTo(-1, 5);
  });

  it("warms the sun near the horizon", () => {
    const dusk = new DayNightCycle({ dayLength: 100, start: 0.75 });
    const noon = new DayNightCycle({ dayLength: 100, start: 0.5 });
    expect(dusk.sunElevation).toBeCloseTo(0, 5);
    expect(dusk.sunColor.g).toBeLessThan(noon.sunColor.g);
    expect(dusk.sunColor.r).toBeGreaterThan(0.9);
  });
});

describe("WeatherScheduler", () => {
  it("stays inside intensity bounds and is seeded", () => {
    const run = (seed: number) => {
      const scheduler = new WeatherScheduler(new Random(seed), 2);
      const states: Array<[string, number]> = [];
      for (let i = 0; i < 200; i += 1) {
        const state = scheduler.update(1);
        expect(state.intensity).toBeGreaterThanOrEqual(0);
        expect(state.intensity).toBeLessThanOrEqual(1);
        expect(["clear", "cloudy", "rain", "storm"]).toContain(state.type);
        states.push([state.type, state.intensity]);
      }
      return states;
    };
    const states = run(9);
    expect(run(9)).toEqual(states);
    expect(new Set(states.map(([type]) => type)).size).toBeGreaterThan(1);
  });

  it("eases intensity toward the weather target", () => {
    const scheduler = new WeatherScheduler(new Random(1), 1000);
    scheduler.type = "storm";
    scheduler.update(6);
    expect(scheduler.intensity).toBeCloseTo(1, 5);
    scheduler.type = "clear";
    scheduler.update(6);
    expect(scheduler.intensity).toBeCloseTo(0, 5);
    scheduler.type = "rain";
    scheduler.update(3);
    expect(scheduler.intensity).toBeCloseTo(0.5, 5);
    expect(scheduler.state().type).toBe("rain");
  });
});

describe("SimulationTiers", () => {
  it("runs work on interval and distance tiers", () => {
    const runs: string[] = [];
    const tiers = new SimulationTiers();
    tiers.register({ x: 0, z: 0, interval: 2, run: () => runs.push("near") });
    tiers.register({ x: 100, z: 0, interval: 1, run: () => runs.push("far") });
    for (let i = 0; i < 4; i += 1) tiers.update(1, 0, 0, 20);
    expect(runs.filter((r) => r === "near").length).toBe(2);
    expect(runs.filter((r) => r === "far").length).toBe(0);
    expect(tiers.count).toBe(2);
  });

  it("slows far entities down by tier", () => {
    let runs = 0;
    const tiers = new SimulationTiers();
    tiers.register({ x: 200, z: 0, interval: 1, run: () => (runs += 1) });
    for (let i = 0; i < 4; i += 1) tiers.update(1, 0, 0);
    expect(runs).toBe(2);
  });
});

describe("WorldPersistence", () => {
  it("round-trips cells and full worlds", () => {
    const persistence = new WorldPersistence();
    persistence.saveCell(chunkKey(2, -1), JSON.stringify({ heights: [1, 2, 3] }));
    expect(persistence.loadCell(chunkKey(2, -1))).toBe(JSON.stringify({ heights: [1, 2, 3] }));
    expect(persistence.loadCell("missing")).toBe(null);
    persistence.saveCell(chunkKey(0, 0), "payload");
    const snapshot = persistence.serialize();
    expect(persistence.deleteCell("missing")).toBe(false);
    const clone = new WorldPersistence();
    expect(clone.restore(snapshot)).toBe(2);
    expect(clone.loadCell(chunkKey(0, 0))).toBe("payload");
    expect(clone.cells.size).toBe(2);
    expect(persistence.deleteCell(chunkKey(0, 0))).toBe(true);
    expect(persistence.loadCell(chunkKey(0, 0))).toBe(null);
  });
});

describe("chunkKey", () => {
  it("is unique per cell", () => {
    expect(chunkKey(1, 2)).not.toBe(chunkKey(2, 1));
    expect(chunkKey(-3, 4)).toContain("-3");
  });
});
