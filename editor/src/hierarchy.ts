import {
  AddNodeCommand,
  Command,
  CommandStack,
  RemoveNodeCommand,
  RenameNodeCommand,
  ReparentNodeCommand,
  SceneDocument,
  Selection,
  identityTransform,
  type EditorNode,
} from "./editor.js";

export interface HierarchyRow {
  id: string;
  name: string;
  type: string;
  depth: number;
  parent: string | null;
  expanded: boolean;
}

export class DuplicateNodeCommand extends Command {
  readonly label: string;
  createdRootId: string | null = null;
  private snapshot: ReturnType<SceneDocument["snapshot"]> | null = null;

  constructor(
    readonly document: SceneDocument,
    readonly sourceId: string,
    readonly targetParentId: string | null = null,
  ) {
    super();
    this.label = `Duplicate "${document.node(sourceId).name}"`;
  }

  override apply(): void {
    if (this.snapshot && this.createdRootId && !this.document.has(this.createdRootId)) {
      this.document.restore(this.snapshot);
      return;
    }
    const source = this.document.node(this.sourceId);
    const parentId = this.targetParentId ?? source.parent ?? this.document.rootId;
    const root = this.cloneSubtree(source, parentId);
    this.createdRootId = root.id;
    this.snapshot = this.document.snapshot();
  }

  override undo(): void {
    if (this.createdRootId && this.document.has(this.createdRootId)) {
      this.document.removeNode(this.createdRootId);
    }
  }

  private cloneSubtree(source: EditorNode, parentId: string): EditorNode {
    const childIds = [...source.children];
    const clone = this.document.addNode(source.type, `${source.name} Copy`, parentId);
    clone.transform = structuredClone(source.transform);
    clone.properties = structuredClone(source.properties);
    for (const childId of childIds) {
      this.cloneSubtree(this.document.node(childId), clone.id);
    }
    return clone;
  }
}

export class HierarchyPanel {
  readonly expanded = new Set<string>();

  constructor(
    readonly document: SceneDocument,
    readonly selection: Selection,
    readonly stack: CommandStack,
  ) {
    this.expanded.add(document.rootId);
  }

  rows(): HierarchyRow[] {
    const rows: HierarchyRow[] = [];
    const visit = (id: string, depth: number) => {
      const node = this.document.node(id);
      const expanded = this.expanded.has(id);
      rows.push({ id, name: node.name, type: node.type, depth, parent: node.parent, expanded });
      if (expanded) {
        for (const childId of node.children) visit(childId, depth + 1);
      }
    };
    visit(this.document.rootId, 0);
    return rows;
  }

  toggle(id: string): void {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
  }

  expandAll(): void {
    for (const node of this.document.all()) this.expanded.add(node.id);
  }

  collapseAll(): void {
    this.expanded.clear();
    this.expanded.add(this.document.rootId);
  }

  addNode(type: string, name: string, parentId: string | null = null): string {
    const command = new AddNodeCommand(this.document, type, name, parentId);
    this.stack.execute(command);
    const created = command.createdId!;
    this.selection.select(created);
    this.expandTo(created);
    return created;
  }

  deleteSelected(): string[] {
    const ids = this.selection.list.filter((id) => id !== this.document.rootId);
    for (const id of ids) {
      if (this.document.has(id)) this.stack.execute(new RemoveNodeCommand(this.document, id));
    }
    this.selection.clear();
    return ids;
  }

  rename(id: string, name: string): void {
    this.stack.execute(new RenameNodeCommand(this.document, id, name));
  }

  reparent(id: string, newParentId: string): void {
    this.stack.execute(new ReparentNodeCommand(this.document, id, newParentId));
    this.expandTo(newParentId);
  }

  duplicate(id: string): string {
    const command = new DuplicateNodeCommand(this.document, id);
    this.stack.execute(command);
    const created = command.createdRootId!;
    this.selection.select(created);
    return created;
  }

  duplicateSelected(): string[] {
    return this.selection.list.map((id) => this.duplicate(id));
  }

  expandTo(id: string): void {
    let cursor = this.document.node(id).parent;
    while (cursor) {
      this.expanded.add(cursor);
      cursor = this.document.node(cursor).parent;
    }
    this.expanded.add(id);
  }

  selectOnly(id: string): void {
    this.selection.select(id);
    this.expandTo(id);
  }

  selectMany(ids: string[]): void {
    this.selection.clear();
    for (const id of ids) {
      this.selection.add(id);
      this.expandTo(id);
    }
  }

  sortedChildren(parentId: string): string[] {
    return [...this.document.node(parentId).children].sort((a, b) =>
      this.document.node(a).name.localeCompare(this.document.node(b).name),
    );
  }
}

export function cloneTransform(): ReturnType<typeof identityTransform> {
  return identityTransform();
}
