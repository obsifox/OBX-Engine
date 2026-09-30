export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TransformData {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export type PropertyValue = number | string | boolean | Vec2 | Vec3 | PropertyValue[];

export interface PropertyDescriptor {
  path: string;
  label: string;
  kind: "number" | "string" | "bool" | "vec2" | "vec3" | "enum";
  options?: string[];
  min?: number;
  max?: number;
}

export interface EditorNode {
  id: string;
  name: string;
  type: string;
  transform: TransformData;
  properties: Record<string, PropertyValue>;
  children: string[];
  parent: string | null;
}

export interface SceneSnapshot {
  nodes: EditorNode[];
  rootId: string;
}

let nodeCounter = 0;

export function nextNodeId(): string {
  nodeCounter += 1;
  return `node_${nodeCounter}`;
}

export function resetNodeCounter(): void {
  nodeCounter = 0;
}

export function identityTransform(): TransformData {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

