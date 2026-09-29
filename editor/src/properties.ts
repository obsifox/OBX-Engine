import type { EditorNode, Inspector, InspectorSchema, PropertyDescriptor, PropertyValue, Vec2, Vec3 } from "./editor.js";

export type ExtendedPropertyKind = PropertyDescriptor["kind"] | "array" | "resource" | "reference";

export interface ExtendedPropertyDescriptor extends Omit<PropertyDescriptor, "kind"> {
  kind: ExtendedPropertyKind;
  itemKind?: ExtendedPropertyKind;
  resourceType?: string;
  referenceType?: string;
  defaultValue?: PropertyValue | PropertyValue[];
}

export type ExtendedPropertyValue = PropertyValue | PropertyValue[] | null;

export interface PropertyValidationIssue {
  path: string;
  message: string;
}

export interface MultiEditResult {
  updated: number;
  issues: PropertyValidationIssue[];
}

export class ExtendedInspector {
  constructor(readonly base: Inspector, readonly schemas: InspectorSchema[] = []) {}

  schemaForType(type: string): ExtendedPropertyDescriptor[] {
    const schema = this.schemas.find((entry) => entry.type === type) ?? null;
    if (schema) return schema.properties as unknown as ExtendedPropertyDescriptor[];
    return this.base.describe({ type } as EditorNode) as unknown as ExtendedPropertyDescriptor[];
  }

  describe(node: EditorNode): ExtendedPropertyDescriptor[] {
    return this.schemaForType(node.type);
  }

  read(node: EditorNode, path: string): ExtendedPropertyValue {
    if (path.endsWith("[]")) {
      const values = node.properties[path.slice(0, -2)];
      return Array.isArray(values) ? ([...values] as PropertyValue[]) : [];
    }
    return this.base.read(node, path);
  }

  write(node: EditorNode, path: string, value: ExtendedPropertyValue): void {
    if (path.endsWith("[]")) {
      node.properties[path.slice(0, -2)] = (value as PropertyValue[]) ?? [];
      return;
    }
    if (value === null) {
      delete node.properties[path];
      return;
    }
    if (path === "name") {
      node.name = String(value);
      return;
    }
    if (path.startsWith("transform.")) {
      const [, axis, component] = path.split(".");
      const target = node.transform[axis as "position" | "rotation" | "scale"];
      if (!component) {
        Object.assign(target, value as object);
        return;
      }
      target[component as "x" | "y" | "z"] = value as number;
      return;
    }
    node.properties[path] = value;
  }

  validate(descriptor: ExtendedPropertyDescriptor, value: ExtendedPropertyValue): PropertyValidationIssue | null {
    if (descriptor.kind === "array") {
      if (!Array.isArray(value)) return { path: descriptor.path, message: "expected an array" };
      for (const item of value) {
        const itemDescriptor: ExtendedPropertyDescriptor = {
          path: descriptor.path,
          label: descriptor.label,
          kind: descriptor.itemKind ?? "number",
          min: descriptor.min,
          max: descriptor.max,
          options: descriptor.options,
        };
        const issue = this.validate(itemDescriptor, item);
        if (issue) return issue;
      }
      return null;
    }
    if (descriptor.kind === "resource") {
      if (value !== null && typeof value !== "string") return { path: descriptor.path, message: "expected a resource guid" };
      return null;
    }
    if (descriptor.kind === "reference") {
      if (value !== null && typeof value !== "string") return { path: descriptor.path, message: "expected a node reference" };
      return null;
    }
    const issue = this.base.validate(descriptor as PropertyDescriptor, value as PropertyValue);
    return issue ? { path: descriptor.path, message: issue } : null;
  }

  validateNode(node: EditorNode): PropertyValidationIssue[] {
    const issues: PropertyValidationIssue[] = [];
    for (const descriptor of this.describe(node)) {
      const value = this.read(node, descriptor.path);
      if (value === null && descriptor.kind !== "resource" && descriptor.kind !== "reference") continue;
      const issue = this.validate(descriptor, value);
      if (issue) issues.push(issue);
    }
    return issues;
  }

  resetToDefault(node: EditorNode, descriptor: ExtendedPropertyDescriptor): boolean {
    const fallback =
      descriptor.defaultValue !== undefined
        ? structuredClone(descriptor.defaultValue)
        : defaultForKind(descriptor.kind);
    if (fallback === undefined) return false;
    if (descriptor.kind === "array" && !Array.isArray(fallback)) {
      this.write(node, descriptor.path, []);
      return true;
    }
    this.write(node, descriptor.path, fallback as ExtendedPropertyValue);
    return true;
  }

  assignResource(node: EditorNode, path: string, guid: string | null): void {
    this.write(node, path, guid);
  }

  setReference(node: EditorNode, path: string, targetNodeId: string | null): void {
    this.write(node, path, targetNodeId);
  }

  multiEdit(nodes: EditorNode[], path: string, value: ExtendedPropertyValue): MultiEditResult {
    const issues: PropertyValidationIssue[] = [];
    let updated = 0;
    for (const node of nodes) {
      const descriptor = this.describe(node).find((entry) => entry.path === path || entry.path === `${path}[]`);
      if (descriptor) {
        const issue = this.validate(descriptor, value);
        if (issue) {
          issues.push({ ...issue, message: `${node.name}: ${issue.message}` });
          continue;
        }
      }
      this.write(node, path, value);
      updated += 1;
    }
    return { updated, issues };
  }
}

function defaultForKind(kind: ExtendedPropertyKind): ExtendedPropertyValue | undefined {
  switch (kind) {
    case "number":
      return 0;
    case "string":
      return "";
    case "bool":
      return false;
    case "enum":
      return "";
    case "vec2":
      return { x: 0, y: 0 } satisfies Vec2;
    case "vec3":
      return { x: 0, y: 0, z: 0 } satisfies Vec3;
    case "array":
      return [];
    case "resource":
    case "reference":
      return null;
    default:
      return undefined;
  }
}
