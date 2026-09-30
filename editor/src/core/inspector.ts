import { type EditorNode, type PropertyDescriptor, type PropertyValue } from "../core/model.js";
import {  } from "../shell/docking.js";

export interface InspectorSchema {
  type: string;
  properties: PropertyDescriptor[];
}

export const defaultInspectorSchemas: InspectorSchema[] = [
  {
    type: "Node2D",
    properties: [
      { path: "name", label: "Name", kind: "string" },
      { path: "transform.position", label: "Position", kind: "vec2" },
      { path: "transform.rotation", label: "Rotation", kind: "vec3" },
      { path: "transform.scale", label: "Scale", kind: "vec2" },
    ],
  },
  {
    type: "Camera",
    properties: [
      { path: "name", label: "Name", kind: "string" },
      { path: "transform.position", label: "Position", kind: "vec2" },
      { path: "zoom", label: "Zoom", kind: "number", min: 0.1, max: 10 },
    ],
  },
  {
    type: "Light",
    properties: [
      { path: "name", label: "Name", kind: "string" },
      { path: "intensity", label: "Intensity", kind: "number", min: 0, max: 8 },
      { path: "color", label: "Color", kind: "vec3" },
    ],
  },
];

export class Inspector {
  constructor(readonly schemas: InspectorSchema[] = defaultInspectorSchemas) {}

  schemaFor(type: string): InspectorSchema | null {
    return this.schemas.find((schema) => schema.type === type) ?? null;
  }

  describe(node: EditorNode): PropertyDescriptor[] {
    return this.schemaFor(node.type)?.properties ?? [
      { path: "name", label: "Name", kind: "string" },
      { path: "transform.position", label: "Position", kind: "vec2" },
    ];
  }

  read(node: EditorNode, path: string): PropertyValue | null {
    if (path === "name") return node.name;
    if (path.startsWith("transform.")) {
      const [, axis, component] = path.split(".");
      const target = node.transform[axis as "position" | "rotation" | "scale"];
      return component ? target[component as "x" | "y" | "z"] : { ...target };
    }
    return node.properties[path] ?? null;
  }

  validate(descriptor: PropertyDescriptor, value: PropertyValue): string | null {
    switch (descriptor.kind) {
      case "number":
        if (typeof value !== "number") return "expected a number";
        if (descriptor.min !== undefined && value < descriptor.min) return `min ${descriptor.min}`;
        if (descriptor.max !== undefined && value > descriptor.max) return `max ${descriptor.max}`;
        return null;
      case "string":
        return typeof value === "string" ? null : "expected a string";
      case "bool":
        return typeof value === "boolean" ? null : "expected a boolean";
      case "enum":
        return descriptor.options?.includes(String(value)) ? null : "invalid option";
      case "vec2":
      case "vec3":
        return typeof value === "object" && value !== null && "x" in value ? null : "expected a vector";
    }
  }
}

