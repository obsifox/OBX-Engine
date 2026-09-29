import { describe, expect, it } from "vitest";
import {
  ExtendedInspector,
  Inspector,
  SceneDocument,
  resetNodeCounter,
  type ExtendedPropertyDescriptor,
} from "../src/index.js";

const schemas = [
  {
    type: "Enemy",
    properties: [
      { path: "name", label: "Name", kind: "string" as const },
      { path: "health", label: "Health", kind: "number" as const, min: 0, max: 100, defaultValue: 50 },
      { path: "mode", label: "Mode", kind: "enum" as const, options: ["idle", "chase"] },
      { path: "tags[]", label: "Tags", kind: "array" as const, itemKind: "string" as const, defaultValue: [] },
      { path: "mesh", label: "Mesh", kind: "resource" as const, resourceType: "model" },
      { path: "target", label: "Target", kind: "reference" as const, referenceType: "Node2D" },
    ],
  },
];

function setup() {
  resetNodeCounter();
  const document = new SceneDocument();
  const node = document.addNode("Enemy", "Goblin");
  const inspector = new ExtendedInspector(new Inspector(), schemas);
  return { document, node, inspector };
}

describe("extended inspector", () => {
  it("describes schema properties including new kinds", () => {
    const { node, inspector } = setup();
    const descriptors = inspector.describe(node);
    expect(descriptors.map((descriptor) => descriptor.kind)).toEqual([
      "string",
      "number",
      "enum",
      "array",
      "resource",
      "reference",
    ]);
  });

  it("reads and writes array properties", () => {
    const { node, inspector } = setup();
    expect(inspector.read(node, "tags[]")).toEqual([]);
    inspector.write(node, "tags[]", ["a", "b"]);
    expect(inspector.read(node, "tags[]")).toEqual(["a", "b"]);
    expect(node.properties.tags).toEqual(["a", "b"]);
  });

  it("assigns resources and references", () => {
    const { node, inspector } = setup();
    inspector.assignResource(node, "mesh", "guid-mesh-1");
    expect(inspector.read(node, "mesh")).toBe("guid-mesh-1");
    inspector.setReference(node, "target", "node_9");
    expect(inspector.read(node, "target")).toBe("node_9");
    inspector.assignResource(node, "mesh", null);
    expect(node.properties.mesh).toBeUndefined();
  });

  it("validates values with per-kind rules", () => {
    const { node, inspector } = setup();
    const descriptors = inspector.describe(node);
    const health = descriptors.find((entry) => entry.path === "health")!;
    expect(inspector.validate(health, 200)).toEqual({ path: "health", message: "max 100" });
    expect(inspector.validate(health, 50)).toBeNull();
    const tags = descriptors.find((entry) => entry.path === "tags[]")!;
    expect(inspector.validate(tags, "nope")).toEqual({ path: "tags[]", message: "expected an array" });
    expect(inspector.validate(tags, ["ok"])).toBeNull();
    const tagNumber: ExtendedPropertyDescriptor = { ...tags, itemKind: "number" };
    expect(inspector.validate(tagNumber, ["x"])).toMatchObject({ message: "expected a number" });
    const mesh = descriptors.find((entry) => entry.path === "mesh")!;
    expect(inspector.validate(mesh, 5)).toMatchObject({ message: "expected a resource guid" });
    expect(inspector.validate(mesh, "guid")).toBeNull();
    expect(inspector.validateNode(node)).toEqual([]);
    inspector.write(node, "health", 999 as never);
    expect(inspector.validateNode(node).length).toBeGreaterThan(0);
  });

  it("resets to defaults", () => {
    const { node, inspector } = setup();
    const health = inspector.describe(node).find((entry) => entry.path === "health")!;
    inspector.write(node, "health", 12);
    expect(inspector.resetToDefault(node, health)).toBe(true);
    expect(inspector.read(node, "health")).toBe(50);
    const mode = inspector.describe(node).find((entry) => entry.path === "mode")!;
    expect(inspector.resetToDefault(node, mode)).toBe(true);
    expect(inspector.read(node, "mode")).toBe("");
    const tags = inspector.describe(node).find((entry) => entry.path === "tags[]")!;
    inspector.write(node, "tags[]", ["x"]);
    inspector.resetToDefault(node, tags);
    expect(inspector.read(node, "tags[]")).toEqual([]);
  });

  it("applies multi-object edits with validation", () => {
    const { document, node, inspector } = setup();
    const other = document.addNode("Enemy", "Orc");
    const plain = document.addNode("Node2D", "Rock");
    const result = inspector.multiEdit([node, other], "health", 30);
    expect(result.updated).toBe(2);
    expect(inspector.read(node, "health")).toBe(30);
    expect(inspector.read(other, "health")).toBe(30);
    const invalid = inspector.multiEdit([node], "health", 500);
    expect(invalid.updated).toBe(0);
    expect(invalid.issues[0]!.message).toContain("Goblin");
    const mixed = inspector.multiEdit([plain], "custom.flag", true);
    expect(mixed.updated).toBe(1);
    expect(plain.properties["custom.flag"]).toBe(true);
  });
});
