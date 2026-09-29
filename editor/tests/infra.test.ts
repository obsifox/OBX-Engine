import { describe, expect, it } from "vitest";
import {
  CommandPalette,
  LayoutPersistence,
  Preferences,
  Shortcuts,
  fuzzyScore,
  normalizeCombo,
  parseCombo,
} from "../src/index.js";

describe("shortcuts", () => {
  it("normalizes and resolves combos", () => {
    expect(normalizeCombo("Ctrl+Shift+P")).toBe("ctrl+shift+p");
    expect(normalizeCombo("shift + ctrl + S")).toBe("ctrl+shift+s");
    const parsed = parseCombo("Alt+Ctrl+K");
    expect(parsed).toEqual({ ctrl: true, shift: false, alt: true, meta: false, key: "k" });
    const shortcuts = new Shortcuts();
    shortcuts.bind("Ctrl+S", "file.save");
    shortcuts.bind("Ctrl+P", "view.palette", "sceneFocused");
    expect(shortcuts.resolve("ctrl+s")).toBe("file.save");
    expect(shortcuts.resolve("ctrl+p")).toBeNull();
    expect(shortcuts.resolve("ctrl+p", { sceneFocused: true })).toBe("view.palette");
    expect(shortcuts.lookup("CTRL+s")!.commandId).toBe("file.save");
    expect(shortcuts.unbind("ctrl+s")).toBe(true);
    expect(shortcuts.resolve("ctrl+s")).toBeNull();
    shortcuts.bind("ctrl+z", "edit.undo");
    expect(shortcuts.all()).toHaveLength(2);
    shortcuts.clear();
    expect(shortcuts.all()).toHaveLength(0);
  });
});

describe("command palette", () => {
  it("registers, searches and executes commands", () => {
    const palette = new CommandPalette();
    const ran: string[] = [];
    palette.register({ id: "a", title: "Save Scene", category: "File", run: () => ran.push("a") });
    palette.register({ id: "b", title: "Add Entity", category: "Scene", keywords: ["spawn"], run: () => ran.push("b") });
    palette.register({ id: "c", title: "Toggle Grid", category: "View", run: () => ran.push("c") });
    expect(palette.size).toBe(3);
    expect(palette.search("save")[0]!.id).toBe("a");
    expect(palette.search("sce")[0]!.id).toBe("b");
    expect(palette.search("spawn")[0]!.id).toBe("b");
    expect(palette.search("grid")).toHaveLength(1);
    expect(palette.search("zzz")).toHaveLength(0);
    expect(palette.execute("b")).toBe(true);
    expect(palette.execute("zz")).toBe(false);
    expect(ran).toEqual(["b"]);
    expect(palette.recent()[0]).toBe("b");
    expect(palette.get("a")!.category).toBe("File");
    expect(palette.unregister("a")).toBe(true);
  });

  it("scores fuzzy matches deterministically", () => {
    expect(fuzzyScore("", "anything")).toBe(1);
    expect(fuzzyScore("sc", "save scene")).toBeGreaterThan(0);
    expect(fuzzyScore("xyz", "abc")).toBe(0);
  });
});

describe("preferences and layouts", () => {
  it("stores typed preferences with defaults", () => {
    const prefs = new Preferences({ "theme.name": "obsidian", "grid.size": 0.5 });
    expect(prefs.get("theme.name", "light")).toBe("obsidian");
    expect(prefs.get("missing", 42)).toBe(42);
    prefs.set("grid.size", 1);
    expect(prefs.get("grid.size", 0.5)).toBe(1);
    expect(prefs.reset("grid.size")).toBe(true);
    expect(prefs.get("grid.size", 0.25)).toBe(0.25);
    const serialized = prefs.serialize();
    const restored = new Preferences();
    restored.restore(serialized);
    expect(restored.get("theme.name", "")).toBe("obsidian");
  });

  it("persists named layouts", () => {
    const layouts = new LayoutPersistence();
    layouts.save("default", { split: 0.5, panels: ["a", "b"] });
    layouts.save("debug", { split: 0.2, panels: ["console"] });
    expect(layouts.names()).toEqual(["default", "debug"]);
    const loaded = layouts.load<{ split: number }>("default")!;
    expect(loaded.split).toBe(0.5);
    expect(layouts.load("missing")).toBeNull();
    const restored = new LayoutPersistence();
    restored.restore(layouts.serialize());
    expect(restored.load("debug")).not.toBeNull();
    expect(layouts.remove("debug")).toBe(true);
  });
});
