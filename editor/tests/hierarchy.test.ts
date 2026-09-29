import { describe, expect, it } from "vitest";
import {
  DuplicateNodeCommand,
  HierarchyPanel,
  SceneDocument,
  Selection,
  CommandStack,
  resetNodeCounter,
} from "../src/index.js";

function makeHierarchy(): { document: SceneDocument; selection: Selection; stack: CommandStack; panel: HierarchyPanel } {
  resetNodeCounter();
  const document = new SceneDocument("Level");
  const selection = new Selection();
  const stack = new CommandStack();
  const panel = new HierarchyPanel(document, selection, stack);
  return { document, selection, stack, panel };
}

describe("hierarchy panel", () => {
  it("builds rows with depth and expansion", () => {
    const { document, panel } = makeHierarchy();
    const child = panel.addNode("Node2D", "Child");
    panel.collapseAll();
    expect(panel.rows().map((row) => row.name)).toEqual(["Level", "Child"]);
    expect(panel.rows()[1]!.expanded).toBe(false);
    panel.expandAll();
    const rows = panel.rows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ id: child, name: "Child", depth: 1, parent: document.rootId, expanded: true });
    panel.toggle(child);
    expect(panel.rows()[1]!.expanded).toBe(false);
  });

  it("adds, renames, reparents and deletes through commands", () => {
    const { document, selection, stack, panel } = makeHierarchy();
    const a = panel.addNode("Node2D", "A");
    const b = panel.addNode("Node2D", "B");
    expect(selection.list).toEqual([b]);
    panel.rename(a, "Alpha");
    expect(document.node(a).name).toBe("Alpha");
    stack.undo();
    expect(document.node(a).name).toBe("A");
    stack.redo();
    expect(document.node(a).name).toBe("Alpha");
    panel.reparent(b, a);
    expect(document.node(b).parent).toBe(a);
    expect(document.node(a).children).toContain(b);
    panel.selectMany([a, b]);
    expect(selection.size).toBe(2);
    panel.deleteSelected();
    expect(document.has(a)).toBe(false);
    expect(document.has(b)).toBe(false);
    expect(selection.size).toBe(0);
    stack.undo();
    stack.undo();
    expect(document.has(a)).toBe(true);
    expect(document.has(b)).toBe(true);
  });

  it("duplicates subtrees with fresh ids", () => {
    const { document, panel, selection } = makeHierarchy();
    const parent = panel.addNode("Node2D", "Parent");
    const child = panel.addNode("Node2D", "Child", parent);
    document.node(child).properties.score = 7 as never;
    const copyId = panel.duplicate(parent);
    expect(copyId).not.toBe(parent);
    const copy = document.node(copyId);
    expect(copy.name).toBe("Parent Copy");
    expect(copy.children).toHaveLength(1);
    const copiedChild = document.node(copy.children[0]!);
    expect(copiedChild.name).toBe("Child Copy");
    expect(copiedChild.id).not.toBe(child);
    expect(copiedChild.parent).toBe(copyId);
    expect(selection.list).toEqual([copyId]);
  });

  it("replays duplicate commands correctly", () => {
    const { document, stack } = makeHierarchy();
    const command = new DuplicateNodeCommand(document, document.rootId);
    expect(command.label).toContain("Duplicate");
    stack.execute(command);
    expect(document.size).toBe(2);
    stack.undo();
    expect(document.size).toBe(1);
    stack.redo();
    expect(document.size).toBe(2);
  });

  it("keeps expansion through expandTo", () => {
    const { panel } = makeHierarchy();
    const a = panel.addNode("Node2D", "A");
    const b = panel.addNode("Node2D", "B", a);
    panel.collapseAll();
    panel.expandTo(b);
    const rows = panel.rows();
    expect(rows.map((row) => row.name)).toEqual(["Level", "A", "B"]);
  });
});
