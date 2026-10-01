import type { UiNode, UiStyle, UiWidgetType } from "./ui.js";
import { append, createUiNode, uiStyle } from "./ui.js";

export interface UiDocumentSnapshot {
  tree: SerializedUiNode;
  selection: string | null;
}

export interface SerializedUiNode {
  id: string;
  type: UiWidgetType;
  style: Partial<UiStyle>;
  text: string;
  value: number | string;
  children: SerializedUiNode[];
}

export type UiEditorCommand =
  | { kind: "add"; parentId: string | null; node: SerializedUiNode }
  | { kind: "remove"; nodeId: string }
  | { kind: "style"; nodeId: string; style: Partial<UiStyle> }
  | { kind: "text"; nodeId: string; text: string }
  | { kind: "move"; nodeId: string; parentId: string; index: number };

function serializeNode(node: UiNode): SerializedUiNode {
  return {
    id: node.id,
    type: node.type,
    style: { ...node.style },
    text: node.text,
    value: node.value,
    children: node.children.map(serializeNode),
  };
}

function deserializeNode(data: SerializedUiNode): UiNode {
  const node = createUiNode(data.type, { id: data.id, style: uiStyle(data.style), text: data.text, value: data.value });
  for (const child of data.children) node.children.push(deserializeNode(child));
  return node;
}

export class UiDocument {
  #root: UiNode;
  #undo: UiDocumentSnapshot[] = [];
  #redo: UiDocumentSnapshot[] = [];
  selection: string | null = null;
  #nextId = 1;

  constructor(rootType: UiWidgetType = "panel") {
    this.#root = createUiNode(rootType, { id: "root" });
  }

  get root(): UiNode {
    return this.#root;
  }

  find(id: string, node: UiNode = this.#root): UiNode | null {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = this.find(id, child);
      if (found) return found;
    }
    return null;
  }

  #snapshot(): UiDocumentSnapshot {
    return { tree: serializeNode(this.#root), selection: this.selection };
  }

  #pushUndo(): void {
    this.#undo.push(this.#snapshot());
    this.#redo = [];
    if (this.#undo.length > 64) this.#undo.shift();
  }

  apply(command: UiEditorCommand): boolean {
    this.#pushUndo();
    switch (command.kind) {
      case "add": {
        const parent = command.parentId === null ? this.#root : this.find(command.parentId);
        if (!parent) return false;
        append(parent, deserializeNode(command.node));
        return true;
      }
      case "remove": {
        if (command.nodeId === "root") return false;
        const parent = this.#parentOf(command.nodeId);
        if (!parent) return false;
        parent.children = parent.children.filter((child) => child.id !== command.nodeId);
        return true;
      }
      case "style": {
        const node = this.find(command.nodeId);
        if (!node) return false;
        node.style = uiStyle({ ...node.style, ...command.style });
        return true;
      }
      case "text": {
        const node = this.find(command.nodeId);
        if (!node) return false;
        node.text = command.text;
        return true;
      }
      case "move": {
        const node = this.find(command.nodeId);
        const parent = this.find(command.parentId);
        if (!node || !parent || command.nodeId === "root") return false;
        const oldParent = this.#parentOf(command.nodeId);
        if (!oldParent) return false;
        oldParent.children = oldParent.children.filter((child) => child.id !== command.nodeId);
        parent.children.splice(Math.min(command.index, parent.children.length), 0, node);
        return true;
      }
      default:
        return false;
    }
  }

  #parentOf(id: string, node: UiNode = this.#root): UiNode | null {
    for (const child of node.children) {
      if (child.id === id) return node;
      const found = this.#parentOf(id, child);
      if (found) return found;
    }
    return null;
  }

  undo(): boolean {
    const previous = this.#undo.pop();
    if (!previous) return false;
    this.#redo.push(this.#snapshot());
    this.#root = deserializeNode(previous.tree);
    this.selection = previous.selection;
    return true;
  }

  redo(): boolean {
    const next = this.#redo.pop();
    if (!next) return false;
    this.#undo.push(this.#snapshot());
    this.#root = deserializeNode(next.tree);
    this.selection = next.selection;
    return true;
  }

  serialize(): UiDocumentSnapshot {
    return this.#snapshot();
  }

  static deserialize(snapshot: UiDocumentSnapshot): UiDocument {
    const document = new UiDocument(snapshot.tree.type);
    document.#root = deserializeNode(snapshot.tree);
    document.selection = snapshot.selection;
    return document;
  }

  generateId(prefix: string): string {
    return `${prefix}-${this.#nextId++}`;
  }

  validate(): string[] {
    const errors: string[] = [];
    const seen = new Set<string>();
    const visit = (node: UiNode): void => {
      if (seen.has(node.id)) errors.push(`duplicate id ${node.id}`);
      seen.add(node.id);
      for (const child of node.children) visit(child);
    };
    visit(this.#root);
    return errors;
  }
}
