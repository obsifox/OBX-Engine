import { describe, expect, it } from "vitest";
import { Random } from "../src/index.js";

describe("Random", () => {
  it("produces a stable seeded sequence", () => {
    const a = new Random(42);
    const b = new Random(42);
    for (let i = 0; i < 16; i += 1) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("keeps next in [0, 1)", () => {
    const random = new Random(7);
    for (let i = 0; i < 1000; i += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("samples ranges and ints", () => {
    const random = new Random(3);
    for (let i = 0; i < 100; i += 1) {
      const value = random.range(2, 5);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThan(5);
      const int = random.int(1, 4);
      expect(Number.isInteger(int)).toBe(true);
      expect(int).toBeGreaterThanOrEqual(1);
      expect(int).toBeLessThan(4);
    }
  });

  it("supports bool, sign, pick and shuffle", () => {
    const random = new Random(11);
    expect(typeof random.bool()).toBe("boolean");
    expect([1, -1]).toContain(random.sign());
    expect(["a", "b", "c"]).toContain(random.pick(["a", "b", "c"]));
    expect(() => random.pick([])).toThrow();
    const items = [1, 2, 3, 4, 5];
    const shuffled = random.shuffle(items);
    expect(shuffled).toHaveLength(5);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
