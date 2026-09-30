import { describe, expect, it } from "vitest";
import { MaterialGraph, VfxGraphError, VfxNodeGraph, type VfxNode } from "../src/graph.js";

const node = (id: string, type: VfxNode["type"] = "emitter"): VfxNode => ({ id, type, params: {} });

describe("vfx node graph", () => {
  it("links nodes and compiles dependency order", () => {
    const graph = new VfxNodeGraph();
    graph.addNode(node("emitter")).addNode(node("color", "color")).addNode(node("output", "output"));
    graph.link("emitter", "color");
    graph.link("color", "output");
    expect(graph.compileOrder()).toEqual(["emitter", "color", "output"]);
    expect(graph.validate()).toEqual([]);
  });

  it("rejects duplicate node identifiers", () => {
    const graph = new VfxNodeGraph();
    graph.addNode(node("a"));
    expect(() => graph.addNode(node("a"))).toThrow(VfxGraphError);
  });

  it("rejects links to unknown nodes", () => {
    const graph = new VfxNodeGraph();
    graph.addNode(node("a"));
    expect(() => graph.link("a", "missing")).toThrow(VfxGraphError);
  });

  it("detects cycles and dangling nodes", () => {
    const graph = new VfxNodeGraph();
    graph.addNode(node("a")).addNode(node("b"));
    graph.link("a", "b").link("b", "a");
    const errors = graph.validate();
    expect(errors.some((error) => error.startsWith("cycle at"))).toBe(true);
    expect(() => graph.compileOrder()).toThrow(VfxGraphError);

    const dangling = new VfxNodeGraph();
    dangling.addNode(node("lonely"));
    expect(dangling.validate()).toEqual(["dangling node lonely"]);
    expect(dangling.compileOrder()).toEqual(["lonely"]);
  });
});

describe("material graph", () => {
  it("samples node chains deterministically", () => {
    const graph = new MaterialGraph();
    graph.add({ id: "uv", op: "uv", params: { scale: 2, offset: 1 } });
    graph.add({ id: "mul", op: "mul", params: { value: 3 } });
    expect(graph.sample(0.5, 0)).toBeCloseTo(6, 6);
    expect(graph.nodes.size).toBe(2);
  });

  it("produces stable noise values", () => {
    const graph = new MaterialGraph();
    graph.add({ id: "noise", op: "noise", params: { seed: 1 } });
    const first = graph.sample(0.25, 0.75);
    const second = graph.sample(0.25, 0.75);
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
  });
});
