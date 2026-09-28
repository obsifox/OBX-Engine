import { describe, expect, it } from "vitest";
import { Random } from "@obx/core";
import { DecalProjector, FoliageInstancer, HeightFog, WaterSurface } from "../src/index.js";

describe("HeightFog", () => {
  it("fades with height and distance", () => {
    const fog = new HeightFog({ density: 0.1, heightFalloff: 0.5, baseHeight: 0, color: [138, 148, 166] });
    expect(fog.factorAt(0, 0)).toBe(0);
    expect(fog.factorAt(0, 10)).toBeCloseTo(1 - Math.exp(-1), 5);
    expect(fog.factorAt(20, 10)).toBeLessThan(fog.factorAt(0, 10));
    const shaded = fog.shade([255, 255, 255], 0, 10);
    expect(shaded[0]).toBeLessThan(255);
    expect(shaded[0]).toBeGreaterThan(138);
  });
});

describe("FoliageInstancer", () => {
  it("scatters deterministic instances into batches", () => {
    const instancer = new FoliageInstancer({ cellSize: 10 });
    const rng = new Random(4);
    const random = () => rng.next();
    const placed = instancer.scatter({ x0: 0, y0: 0, x1: 20, y1: 20 }, 12, random);
    expect(placed).toHaveLength(12);
    expect(instancer.count).toBe(12);
    expect(instancer.batches().length).toBeGreaterThan(1);
    const visible = instancer.visible({ x0: 0, y0: 0, x1: 10, y1: 10 });
    expect(visible.every((instance) => instance.x <= 10 && instance.y <= 10)).toBe(true);
    const again = new FoliageInstancer({ cellSize: 10 });
    const rng2 = new Random(4);
    const placed2 = again.scatter({ x0: 0, y0: 0, x1: 20, y1: 20 }, 12, () => rng2.next());
    expect(placed2).toEqual(placed);
  });
});

describe("DecalProjector", () => {
  it("projects and queries overlapping decals", () => {
    const projector = new DecalProjector();
    const decal = projector.project({ x: 5, y: 5, width: 4, height: 2, rotation: 0, source: "blood" });
    expect(decal.id).toBe("decal_1");
    projector.project({ x: 50, y: 50, width: 4, height: 4, rotation: 0.5, source: "scorch" });
    expect(projector.overlapping({ x0: 0, y0: 0, x1: 8, y1: 8 }).map((d) => d.source)).toEqual(["blood"]);
    expect(projector.remove(decal.id)).toBe(true);
    expect(projector.remove("missing")).toBe(false);
    expect(projector.count).toBe(1);
  });
});

describe("WaterSurface", () => {
  it("samples wave heights and normals", () => {
    const water = new WaterSurface();
    expect(water.height(0, 0, 0)).toBeCloseTo(0, 5);
    const height = water.height(1.5, 2.5, 3);
    expect(Math.abs(height)).toBeLessThanOrEqual(0.7);
    const normal = water.normal(1.5, 2.5, 3);
    const length = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
    expect(length).toBeCloseTo(1, 5);
    expect(normal.y).toBeGreaterThan(0);
    expect([true, false]).toContain(water.foam(1.5, 2.5, 3));
    const flat = new WaterSurface([{ amplitude: 0, wavelength: 2, speed: 1, direction: 0 }]);
    expect(flat.height(1, 1, 1)).toBe(0);
  });
});
