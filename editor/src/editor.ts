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

export class SceneDocument {
  private readonly nodes = new Map<string, EditorNode>();
  readonly rootId: string;

  constructor(rootName = "Scene") {
    nodeCounter += 1;
    const root: EditorNode = {
      id: `node_${nodeCounter}`,
      name: rootName,
      type: "Node2D",
      transform: identityTransform(),
      properties: {},
      children: [],
      parent: null,
    };
    this.nodes.set(root.id, root);
    this.rootId = root.id;
  }

  get size(): number {
    return this.nodes.size;
  }

  node(id: string): EditorNode {
    const node = this.nodes.get(id);
    if (!node) throw new RangeError(`unknown node ${id}`);
    return node;
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  all(): EditorNode[] {
    return [...this.nodes.values()];
  }

  addNode(type: string, name: string, parentId: string | null = null): EditorNode {
    nodeCounter += 1;
    const parent = parentId ?? this.rootId;
    this.node(parent);
    const node: EditorNode = {
      id: `node_${nodeCounter}`,
      name,
      type,
      transform: identityTransform(),
      properties: {},
      children: [],
      parent,
    };
    this.nodes.set(node.id, node);
    this.node(parent).children.push(node.id);
    return node;
  }

  removeNode(id: string): EditorNode[] {
    const node = this.node(id);
    if (id === this.rootId) throw new RangeError("cannot remove the root node");
    const removed: EditorNode[] = [];
    const visit = (current: EditorNode) => {
      removed.push(current);
      for (const childId of current.children) visit(this.node(childId));
    };
    visit(node);
    for (const entry of removed) this.nodes.delete(entry.id);
    const parent = node.parent ? this.node(node.parent) : null;
    if (parent) parent.children = parent.children.filter((childId) => childId !== id);
    return removed;
  }

  renameNode(id: string, name: string): string {
    const node = this.node(id);
    const previous = node.name;
    node.name = name;
    return previous;
  }

  reparent(id: string, newParentId: string): string | null {
    const node = this.node(id);
    const newParent = this.node(newParentId);
    if (id === this.rootId) throw new RangeError("cannot reparent the root node");
    if (id === newParentId || this.isAncestor(id, newParentId)) {
      throw new RangeError("reparent would create a cycle");
    }
    const previous = node.parent;
    if (previous) {
      const parent = this.node(previous);
      parent.children = parent.children.filter((childId) => childId !== id);
    }
    node.parent = newParentId;
    newParent.children.push(id);
    return previous;
  }

  isAncestor(ancestorId: string, nodeId: string): boolean {
    let cursor: string | null = nodeId;
    while (cursor) {
      if (cursor === ancestorId) return true;
      cursor = this.node(cursor).parent;
    }
    return false;
  }

  findByName(name: string): EditorNode | null {
    return this.all().find((node) => node.name === name) ?? null;
  }

  snapshot(): SceneSnapshot {
    return {
      rootId: this.rootId,
      nodes: this.all().map((node) => structuredClone(node)),
    };
  }

  restore(snapshot: SceneSnapshot): void {
    this.nodes.clear();
    for (const node of snapshot.nodes) this.nodes.set(node.id, structuredClone(node));
  }
}

export abstract class Command {
  abstract readonly label: string;
  abstract apply(): void;
  abstract undo(): void;
}

export class CommandStack {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private openTransaction: Command[] | null = null;

  constructor(readonly limit = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get history(): string[] {
    return [...this.undoStack].reverse().map((command) => command.label);
  }

  get depth(): number {
    return this.undoStack.length;
  }

  execute(command: Command): void {
    command.apply();
    if (this.openTransaction) {
      this.openTransaction.push(command);
      return;
    }
    this.push(command);
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.apply();
    this.undoStack.push(command);
    return true;
  }

  beginTransaction(label: string): void {
    if (this.openTransaction) throw new RangeError("transaction already open");
    this.openTransaction = [];
    this.transactionLabel = label;
  }

  commitTransaction(): boolean {
    if (!this.openTransaction) return false;
    const commands = this.openTransaction;
    this.openTransaction = null;
    if (commands.length === 0) return true;
    this.push(new CompositeCommand(this.transactionLabel, commands));
    return true;
  }

  private transactionLabel = "transaction";

  private push(command: Command): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }
}

export class CompositeCommand extends Command {
  constructor(
    readonly label: string,
    readonly commands: Command[],
  ) {
    super();
  }

  apply(): void {
    for (const command of this.commands) command.apply();
  }

  override undo(): void {
    for (let index = this.commands.length - 1; index >= 0; index -= 1) {
      this.commands[index]!.undo();
    }
  }
}

export class AddNodeCommand extends Command {
  createdId: string | null = null;
  private afterAdd: SceneSnapshot | null = null;

  constructor(
    readonly document: SceneDocument,
    readonly type: string,
    readonly name: string,
    readonly parentId: string | null,
  ) {
    super();
  }

  get label(): string {
    return `Add ${this.type} "${this.name}"`;
  }

  apply(): void {
    if (this.afterAdd && this.createdId && !this.document.has(this.createdId)) {
      this.document.restore(this.afterAdd);
      return;
    }
    const node = this.document.addNode(this.type, this.name, this.parentId);
    this.createdId = node.id;
    this.afterAdd = this.document.snapshot();
  }

  override undo(): void {
    if (this.createdId && this.document.has(this.createdId)) {
      this.document.removeNode(this.createdId);
    }
  }
}

export class RemoveNodeCommand extends Command {
  private snapshot: SceneSnapshot | null = null;

  constructor(
    readonly document: SceneDocument,
    readonly nodeId: string,
  ) {
    super();
  }

  get label(): string {
    return `Remove ${this.nodeId}`;
  }

  apply(): void {
    this.snapshot = this.document.snapshot();
    this.document.removeNode(this.nodeId);
  }

  override undo(): void {
    if (this.snapshot) this.document.restore(this.snapshot);
  }
}

export class RenameNodeCommand extends Command {
  private previous = "";

  constructor(
    readonly document: SceneDocument,
    readonly nodeId: string,
    readonly name: string,
  ) {
    super();
  }

  get label(): string {
    return `Rename to "${this.name}"`;
  }

  apply(): void {
    this.previous = this.document.renameNode(this.nodeId, this.name);
  }

  override undo(): void {
    this.document.renameNode(this.nodeId, this.previous);
  }
}

export class ReparentNodeCommand extends Command {
  private previous: string | null = null;

  constructor(
    readonly document: SceneDocument,
    readonly nodeId: string,
    readonly parentId: string,
  ) {
    super();
  }

  get label(): string {
    return `Reparent ${this.nodeId}`;
  }

  apply(): void {
    this.previous = this.document.reparent(this.nodeId, this.parentId);
  }

  override undo(): void {
    if (this.previous) this.document.reparent(this.nodeId, this.previous);
  }
}

export class SetPropertyCommand<T extends PropertyValue = PropertyValue> extends Command {
  readonly label: string;
  private previous: T | null = null;

  constructor(
    readonly node: EditorNode,
    readonly path: string,
    readonly value: T,
  ) {
    super();
    this.label = `Set ${path}`;
  }

  override apply(): void {
    if (this.path === "name") {
      this.previous = this.node.name as T;
      this.node.name = String(this.value);
      return;
    }
    this.previous = (this.node.properties[this.path] ?? null) as T | null;
    if (this.path.startsWith("transform.")) {
      const [, axis, component] = this.path.split(".");
      const target = this.node.transform[axis as "position" | "rotation" | "scale"];
      target[component as "x" | "y" | "z"] = this.value as number;
      return;
    }
    this.node.properties[this.path] = this.value;
  }

  override undo(): void {
    if (this.path === "name") {
      this.node.name = String(this.previous);
      return;
    }
    if (this.path.startsWith("transform.")) {
      const [, axis, component] = this.path.split(".");
      const target = this.node.transform[axis as "position" | "rotation" | "scale"];
      target[component as "x" | "y" | "z"] = (this.previous ?? 0) as number;
      return;
    }
    if (this.previous === null) delete this.node.properties[this.path];
    else this.node.properties[this.path] = this.previous;
  }
}

export class Selection {
  private readonly ids = new Set<string>();

  get size(): number {
    return this.ids.size;
  }

  get list(): string[] {
    return [...this.ids];
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  select(id: string): void {
    this.ids.clear();
    this.ids.add(id);
  }

  toggle(id: string): void {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
  }

  add(id: string): void {
    this.ids.add(id);
  }

  clear(): void {
    this.ids.clear();
  }
}

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

export type ToolMode = "select" | "translate" | "rotate" | "scale";

export interface SnapSettings {
  translateStep: number;
  rotateStep: number;
  scaleStep: number;
}

export class TransformTool {
  mode: ToolMode = "select";
  snap: SnapSettings = { translateStep: 0.5, rotateStep: 15, scaleStep: 0.25 };

  setMode(mode: ToolMode): void {
    this.mode = mode;
  }

  applyDrag(node: EditorNode, delta: Vec3, useSnap = false): void {
    if (this.mode === "translate") {
      const step = useSnap ? this.snap.translateStep : 0;
      node.transform.position.x = this.adjust(node.transform.position.x, delta.x, step);
      node.transform.position.y = this.adjust(node.transform.position.y, delta.y, step);
      node.transform.position.z = this.adjust(node.transform.position.z, delta.z, step);
      return;
    }
    if (this.mode === "rotate") {
      const step = useSnap ? this.snap.rotateStep : 0;
      node.transform.rotation.x = this.adjust(node.transform.rotation.x, delta.x, step);
      node.transform.rotation.y = this.adjust(node.transform.rotation.y, delta.y, step);
      node.transform.rotation.z = this.adjust(node.transform.rotation.z, delta.z, step);
      return;
    }
    if (this.mode === "scale") {
      const step = useSnap ? this.snap.scaleStep : 0;
      node.transform.scale.x = Math.max(0.01, this.adjust(node.transform.scale.x, delta.x, step));
      node.transform.scale.y = Math.max(0.01, this.adjust(node.transform.scale.y, delta.y, step));
      node.transform.scale.z = Math.max(0.01, this.adjust(node.transform.scale.z, delta.z, step));
    }
  }

  private adjust(current: number, delta: number, step: number): number {
    const next = current + delta;
    return step > 0 ? Math.round(next / step) * step : next;
  }
}

export type LogLevel = "info" | "warn" | "error";

export interface ConsoleEntry {
  level: LogLevel;
  message: string;
  time: number;
}

export class EditorConsole {
  readonly entries: ConsoleEntry[] = [];
  private clock = 0;

  log(level: LogLevel, message: string): void {
    this.clock += 1;
    this.entries.push({ level, message, time: this.clock });
  }

  filter(level: LogLevel | "all"): ConsoleEntry[] {
    return level === "all" ? [...this.entries] : this.entries.filter((entry) => entry.level === level);
  }

  clear(): void {
    this.entries.length = 0;
  }

  get counts(): Record<LogLevel, number> {
    const counts: Record<LogLevel, number> = { info: 0, warn: 0, error: 0 };
    for (const entry of this.entries) counts[entry.level] += 1;
    return counts;
  }
}

export interface FrameSample {
  label: string;
  milliseconds: number;
}

export class Profiler {
  readonly samples: FrameSample[] = [];
  private readonly totals = new Map<string, { count: number; sum: number; max: number }>();

  record(label: string, milliseconds: number): void {
    this.samples.push({ label, milliseconds });
    const entry = this.totals.get(label) ?? { count: 0, sum: 0, max: 0 };
    entry.count += 1;
    entry.sum += milliseconds;
    entry.max = Math.max(entry.max, milliseconds);
    this.totals.set(label, entry);
  }

  report(): Array<{ label: string; average: number; max: number; count: number }> {
    return [...this.totals.entries()]
      .map(([label, entry]) => ({
        label,
        average: Number((entry.sum / entry.count).toFixed(3)),
        max: entry.max,
        count: entry.count,
      }))
      .sort((a, b) => b.average - a.average);
  }

  get frameTotal(): number {
    return this.samples.reduce((total, sample) => total + sample.milliseconds, 0);
  }
}

export interface ViewportCamera {
  x: number;
  y: number;
  zoom: number;
}

export class Viewport {
  camera: ViewportCamera = { x: 0, y: 0, zoom: 1 };

  worldToScreen(point: Vec2): Vec2 {
    return {
      x: (point.x - this.camera.x) * this.camera.zoom,
      y: (point.y - this.camera.y) * this.camera.zoom,
    };
  }

  screenToWorld(point: Vec2): Vec2 {
    return {
      x: point.x / this.camera.zoom + this.camera.x,
      y: point.y / this.camera.zoom + this.camera.y,
    };
  }

  pan(dx: number, dy: number): void {
    this.camera.x += dx / this.camera.zoom;
    this.camera.y += dy / this.camera.zoom;
  }

  zoomAt(point: Vec2, factor: number): void {
    const before = this.screenToWorld(point);
    this.camera.zoom = Math.min(8, Math.max(0.1, this.camera.zoom * factor));
    const after = this.screenToWorld(point);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
  }

  frame(bounds: { min: Vec2; max: Vec2 }, padding = 1): void {
    const width = Math.max(0.01, bounds.max.x - bounds.min.x);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    this.camera.zoom = Math.min(8, Math.max(0.1, 200 / Math.max(width, height) / padding));
    this.camera.x = (bounds.min.x + bounds.max.x) / 2;
    this.camera.y = (bounds.min.y + bounds.max.y) / 2;
  }
}

export class EditorSession {
  readonly document: SceneDocument;
  readonly stack: CommandStack;
  readonly selection = new Selection();
  readonly inspector = new Inspector();
  readonly tool = new TransformTool();
  readonly console = new EditorConsole();
  readonly profiler = new Profiler();
  readonly viewport = new Viewport();

  constructor(rootName = "Scene") {
    this.document = new SceneDocument(rootName);
    this.stack = new CommandStack();
  }
}
