export type PanelKind =
  | "project-manager"
  | "scene-view"
  | "hierarchy"
  | "inspector"
  | "asset-browser"
  | "console"
  | "script-editor"
  | "toolbar"
  | "status-bar";

export type DockSplitDirection = "horizontal" | "vertical";

export interface DockLeaf {
  kind: "leaf";
  id: string;
  tabs: PanelKind[];
  activeTab: PanelKind;
}

export interface DockSplit {
  kind: "split";
  id: string;
  direction: DockSplitDirection;
  ratio: number;
  first: DockNode;
  second: DockNode;
}

export type DockNode = DockLeaf | DockSplit;

export interface DockLayout {
  root: DockNode;
  focused: PanelKind | null;
  maximized: PanelKind | null;
}

let dockCounter = 0;

function leaf(...tabs: PanelKind[]): DockLeaf {
  dockCounter += 1;
  return { kind: "leaf", id: `dock_${dockCounter}`, tabs: [...tabs], activeTab: tabs[0]! };
}

function split(direction: DockSplitDirection, ratio: number, first: DockNode, second: DockNode): DockSplit {
  dockCounter += 1;
  return { kind: "split", id: `dock_${dockCounter}`, direction, ratio, first, second };
}

export function defaultLayout(): DockLayout {
  return {
    root: split(
      "horizontal",
      0.22,
      leaf("project-manager", "asset-browser"),
      split("horizontal", 0.62, leaf("scene-view", "script-editor"), split("vertical", 0.6, leaf("hierarchy", "console"), leaf("inspector"))),
    ),
    focused: "scene-view",
    maximized: null,
  };
}

export class DockingSystem {
  layout: DockLayout;

  constructor(layout: DockLayout = defaultLayout()) {
    this.layout = layout;
  }

  find(panel: PanelKind): DockLeaf | null {
    const visit = (node: DockNode): DockLeaf | null => {
      if (node.kind === "leaf") return node.tabs.includes(panel) ? node : null;
      return visit(node.first) ?? visit(node.second);
    };
    return visit(this.layout.root);
  }

  focus(panel: PanelKind): boolean {
    const leafNode = this.find(panel);
    if (!leafNode) return false;
    leafNode.activeTab = panel;
    this.layout.focused = panel;
    return true;
  }

  splitPanel(panel: PanelKind, direction: DockSplitDirection, newPanel: PanelKind, ratio = 0.5): boolean {
    const located = this.locate(panel);
    if (!located) return false;
    const replacement: DockNode = split(direction, ratio, leaf(panel), leaf(newPanel));
    located.replace(replacement);
    this.focus(newPanel);
    return true;
  }

  tabify(panel: PanelKind, newPanel: PanelKind): boolean {
    const leafNode = this.find(panel);
    if (!leafNode || leafNode.tabs.includes(newPanel)) return false;
    if (this.find(newPanel)) this.closePanel(newPanel);
    leafNode.tabs.push(newPanel);
    leafNode.activeTab = newPanel;
    this.focus(newPanel);
    return true;
  }

  closePanel(panel: PanelKind): boolean {
    const located = this.locate(panel);
    if (!located) return false;
    const leafNode = located.node;
    if (leafNode.kind !== "leaf") return false;
    if (leafNode.tabs.length > 1) {
      const index = leafNode.tabs.indexOf(panel);
      leafNode.tabs.splice(index, 1);
      if (leafNode.activeTab === panel) leafNode.activeTab = leafNode.tabs[Math.max(0, index - 1)]!;
      return true;
    }
    const parent = this.locateParentOf(leafNode.id);
    if (!parent) return false;
    const sibling = parent.node.first.id === leafNode.id ? parent.node.second : parent.node.first;
    parent.replace(sibling);
    return true;
  }

  moveTab(panel: PanelKind, targetPanel: PanelKind): boolean {
    if (panel === targetPanel) return false;
    const source = this.find(panel);
    const target = this.find(targetPanel);
    if (!source || !target || source === target) return false;
    const index = source.tabs.indexOf(panel);
    source.tabs.splice(index, 1);
    if (source.activeTab === panel) source.activeTab = source.tabs[0] ?? source.activeTab;
    if (source.tabs.length === 0) this.closePanel(panel);
    const targetLeaf = this.find(targetPanel);
    if (!targetLeaf) return false;
    targetLeaf.tabs.push(panel);
    targetLeaf.activeTab = panel;
    this.focus(panel);
    return true;
  }

  maximize(panel: PanelKind): void {
    if (this.find(panel)) this.layout.maximized = panel;
  }

  restore(): void {
    this.layout.maximized = null;
  }

  visiblePanels(): PanelKind[] {
    if (this.layout.maximized) return [this.layout.maximized];
    const panels: PanelKind[] = [];
    const visit = (node: DockNode) => {
      if (node.kind === "leaf") panels.push(node.activeTab);
      else {
        visit(node.first);
        visit(node.second);
      }
    };
    visit(this.layout.root);
    return panels;
  }

  serialize(): string {
    return JSON.stringify(this.layout, null, 2);
  }

  restoreLayout(serialized: string): void {
    this.layout = JSON.parse(serialized) as DockLayout;
  }

  private locate(panel: PanelKind): { node: DockLeaf; replace(next: DockNode): void } | null {
    const visit = (node: DockNode, replace: (next: DockNode) => void): { node: DockLeaf; replace(next: DockNode): void } | null => {
      if (node.kind === "leaf") {
        return node.tabs.includes(panel) ? { node, replace } : null;
      }
      return (
        visit(node.first, (next) => (node.first = next)) ??
        visit(node.second, (next) => (node.second = next))
      );
    };
    return visit(this.layout.root, (next) => (this.layout.root = next));
  }

  private locateParentOf(id: string): { node: DockSplit; replace(next: DockNode): void } | null {
    const visit = (node: DockNode, replace: (next: DockNode) => void): { node: DockSplit; replace(next: DockNode): void } | null => {
      if (node.kind === "leaf") return null;
      if (node.first.id === id || node.second.id === id) return { node, replace };
      return (
        visit(node.first, (next) => (node.first = next)) ??
        visit(node.second, (next) => (node.second = next))
      );
    };
    return visit(this.layout.root, (next) => (this.layout.root = next));
  }
}

export interface ToolbarButton {
  id: string;
  label: string;
  enabled: boolean;
  active: boolean;
}

export class Toolbar {
  readonly buttons: ToolbarButton[] = [
    { id: "save", label: "Save", enabled: true, active: false },
    { id: "undo", label: "Undo", enabled: true, active: false },
    { id: "redo", label: "Redo", enabled: true, active: false },
    { id: "play", label: "Play", enabled: true, active: false },
    { id: "translate", label: "Move", enabled: true, active: true },
    { id: "rotate", label: "Rotate", enabled: true, active: false },
    { id: "scale", label: "Scale", enabled: true, active: false },
    { id: "grid", label: "Grid", enabled: true, active: true },
  ];

  setEnabled(id: string, enabled: boolean): void {
    const button = this.buttons.find((entry) => entry.id === id);
    if (button) button.enabled = enabled;
  }

  setActive(id: string, active: boolean): void {
    const exclusive = ["translate", "rotate", "scale"];
    const target = this.buttons.find((entry) => entry.id === id);
    if (!target) return;
    if (active && exclusive.includes(id)) {
      for (const button of this.buttons) {
        if (exclusive.includes(button.id)) button.active = button.id === id;
      }
      return;
    }
    target.active = active;
  }

  press(id: string): boolean {
    const button = this.buttons.find((entry) => entry.id === id);
    if (!button || !button.enabled) return false;
    return true;
  }
}

export interface StatusField {
  key: string;
  value: string;
}

export class StatusBar {
  private readonly fields = new Map<string, string>();

  set(key: string, value: string): void {
    this.fields.set(key, value);
  }

  get(key: string): string {
    return this.fields.get(key) ?? "";
  }

  list(): StatusField[] {
    return [...this.fields.entries()].map(([key, value]) => ({ key, value }));
  }

  clear(): void {
    this.fields.clear();
  }
}
