import { nextNodeId } from "./model.js";
import { identityTransform, type EditorNode, type SceneSnapshot } from "../core/model.js";

export class SceneDocument {
  private readonly nodes = new Map<string, EditorNode>();
  readonly rootId: string;

  constructor(rootName = "Scene") {
    const root: EditorNode = {
      id: nextNodeId(),
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
    const parent = parentId ?? this.rootId;
    this.node(parent);
    const node: EditorNode = {
      id: nextNodeId(),
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
