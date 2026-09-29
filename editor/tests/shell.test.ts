import { describe, expect, it } from "vitest";
import {
  DockingSystem,
  StatusBar,
  Toolbar,
  defaultLayout,
  type PanelKind,
} from "../src/index.js";

describe("docking system", () => {
  it("builds a default studio layout with all core panels", () => {
    const docking = new DockingSystem();
    const panels: PanelKind[] = ["project-manager", "scene-view", "hierarchy", "inspector", "asset-browser"];
    for (const panel of panels) {
      expect(docking.find(panel), panel).not.toBeNull();
    }
    expect(docking.visiblePanels()).toContain("scene-view");
    expect(docking.layout.focused).toBe("scene-view");
  });

  it("focuses and activates tabs", () => {
    const docking = new DockingSystem();
    expect(docking.focus("script-editor")).toBe(true);
    expect(docking.layout.focused).toBe("script-editor");
    expect(docking.find("script-editor")!.activeTab).toBe("script-editor");
    expect(docking.focus("missing" as PanelKind)).toBe(false);
  });

  it("splits panels and keeps both docks", () => {
    const docking = new DockingSystem();
    expect(docking.splitPanel("scene-view", "vertical", "console", 0.4)).toBe(true);
    expect(docking.find("scene-view")).not.toBeNull();
    expect(docking.find("console")).not.toBeNull();
    expect(docking.layout.focused).toBe("console");
  });

  it("tabifies and closes panels", () => {
    const docking = new DockingSystem();
    expect(docking.tabify("scene-view", "console")).toBe(true);
    const leaf = docking.find("scene-view")!;
    expect(leaf.tabs).toContain("console");
    expect(leaf.activeTab).toBe("console");
    expect(docking.closePanel("console")).toBe(true);
    expect(docking.find("console")).toBeNull();
  });

  it("closes single-tab leaves by collapsing the split", () => {
    const docking = new DockingSystem();
    expect(docking.find("inspector")).not.toBeNull();
    expect(docking.closePanel("inspector")).toBe(true);
    expect(docking.find("inspector")).toBeNull();
    expect(docking.find("hierarchy")).not.toBeNull();
  });

  it("moves tabs between docks", () => {
    const docking = new DockingSystem();
    expect(docking.moveTab("console", "inspector")).toBe(true);
    expect(docking.find("inspector")!.tabs).toContain("console");
    const consoleLeaf = docking.find("console")!;
    const inspectorLeaf = docking.find("inspector")!;
    expect(consoleLeaf.id).toBe(inspectorLeaf.id);
  });

  it("maximizes and restores panels", () => {
    const docking = new DockingSystem();
    docking.maximize("console");
    expect(docking.visiblePanels()).toEqual(["console"]);
    docking.restore();
    expect(docking.visiblePanels()).toContain("scene-view");
  });

  it("serializes and restores layouts", () => {
    const docking = new DockingSystem();
    docking.splitPanel("scene-view", "horizontal", "script-editor", 0.3);
    const serialized = docking.serialize();
    const restored = new DockingSystem();
    restored.restoreLayout(serialized);
    expect(restored.find("script-editor")).not.toBeNull();
    expect(restored.layout.focused).toBe("script-editor");
    expect(defaultLayout().root.kind).toBe("split");
  });
});

describe("toolbar and status bar", () => {
  it("toggles buttons with exclusive tool group", () => {
    const toolbar = new Toolbar();
    toolbar.setActive("rotate", true);
    expect(toolbar.buttons.find((button) => button.id === "rotate")!.active).toBe(true);
    expect(toolbar.buttons.find((button) => button.id === "translate")!.active).toBe(false);
    toolbar.setActive("grid", true);
    expect(toolbar.buttons.find((button) => button.id === "grid")!.active).toBe(true);
    toolbar.setEnabled("play", false);
    expect(toolbar.press("play")).toBe(false);
    toolbar.setEnabled("play", true);
    expect(toolbar.press("play")).toBe(true);
  });

  it("tracks status fields", () => {
    const bar = new StatusBar();
    bar.set("project", "Demo");
    bar.set("entities", "12");
    expect(bar.get("project")).toBe("Demo");
    expect(bar.list()).toHaveLength(2);
    bar.clear();
    expect(bar.get("project")).toBe("");
  });
});
