import { describe, expect, it } from "vitest";
import { contentHash, createAssetGuid, isAssetGuid } from "../src/index.js";

describe("asset guids", () => {
  it("creates deterministic guids from seeds", () => {
    const a = createAssetGuid("textures/hero.png");
    const b = createAssetGuid("textures/hero.png");
    const c = createAssetGuid("textures/other.png");
    const n1 = createAssetGuid(7);
    const n2 = createAssetGuid(7);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(n1).toBe(n2);
    expect(n1).not.toBe(a);
    expect(isAssetGuid(a)).toBe(true);
    expect(isAssetGuid(n1)).toBe(true);
  });

  it("creates valid random guids", () => {
    const guids = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const guid = createAssetGuid();
      expect(isAssetGuid(guid)).toBe(true);
      guids.add(guid);
    }
    expect(guids.size).toBe(50);
    expect(isAssetGuid("nope")).toBe(false);
    expect(isAssetGuid(42)).toBe(false);
    expect(isAssetGuid("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("hashes content stably", () => {
    const text = "hello obx";
    const bytes = new TextEncoder().encode(text);
    expect(contentHash(text)).toBe(contentHash(bytes));
    expect(contentHash(text)).not.toBe(contentHash(`${text}!`));
    expect(contentHash(text)).toMatch(/^[0-9a-f]{16}$/);
  });
});
