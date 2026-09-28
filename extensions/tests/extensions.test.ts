import { describe, expect, it } from "vitest";
import {
  ExtensionError,
  ExtensionRegistry,
  type EditorExtension,
} from "../src/index.js";

function toolExtension(): EditorExtension {
  return {
    id: "obsifox.tools",
    name: "ObsiFox Tools",
    version: "1.0.0",
    contributions: {
      commands: [
        {
          id: "tools.snap",
          title: "Toggle Snap",
          run: (context) => {
            const next = !(context.state.get("snap") ?? true);
            context.state.set("snap", next);
            return next;
          },
        },
        {
          id: "tools.chain",
          title: "Chain Command",
          run: (context) => context.executeCommand("tools.snap"),
        },
      ],
      panels: [
        { id: "tools.panel", title: "Tools", location: "bottom", order: 5 },
        { id: "tools.side", title: "Side", location: "left", order: 20 },
      ],
      menus: [
        { id: "tools.menuSnap", menu: "edit", commandId: "tools.snap", order: 10 },
        { id: "tools.menuChain", menu: "edit", commandId: "tools.chain", order: 5 },
      ],
      tools: [{ id: "tools.ruler", label: "Ruler", run: () => 42 }],
    },
    activate: (context) => context.log("activated"),
  };
}

function contentExtension(): EditorExtension {
  return {
    id: "obsifox.content",
    name: "Content Pipeline",
    version: "1.0.0",
    contributions: {
      inspectors: [
        {
          type: "Enemy",
          priority: 5,
          describe: () => [{ path: "health", label: "Health", kind: "number" }],
        },
        {
          type: "Enemy",
          priority: 10,
          describe: () => [{ path: "ai", label: "AI", kind: "string" }],
        },
      ],
      gizmos: [{ id: "content.pathGizmo", nodeType: "Path", draw: () => "path" }],
      importers: [{ id: "content.png", extensions: ["png"], import: (source) => `imported:${source}` }],
      assetTypes: [{ type: "texture", extensions: ["png", "jpg"] }],
      nodeTypes: [{ type: "Enemy", create: (name) => ({ kind: "Enemy", name }) }],
    },
  };
}

describe("ExtensionRegistry", () => {
  it("registers and activates extensions with lifecycle", () => {
    const messages: string[] = [];
    const registry = new ExtensionRegistry({ log: (id, message) => messages.push(`${id}:${message}`) });
    registry.register(toolExtension());
    expect(registry.size).toBe(1);
    expect(() => registry.register(toolExtension())).toThrow(ExtensionError);
    const context = registry.activate("obsifox.tools");
    expect(registry.isActive("obsifox.tools")).toBe(true);
    expect(registry.activate("obsifox.tools").extensionId).toBe("obsifox.tools");
    expect(messages).toEqual(["obsifox.tools:activated"]);
    expect(context.state.size).toBe(0);
    expect(registry.deactivate("obsifox.tools")).toBe(true);
    expect(registry.deactivate("obsifox.tools")).toBe(false);
    expect(() => registry.activate("ghost")).toThrow(ExtensionError);
    expect(registry.unregister("obsifox.tools")).toBe(true);
    expect(registry.unregister("obsifox.tools")).toBe(false);
  });

  it("runs commands with state and chaining", () => {
    const registry = new ExtensionRegistry();
    registry.register(toolExtension());
    expect(registry.executeCommand("tools.snap")).toBe(false);
    expect(registry.executeCommand("tools.snap")).toBe(true);
    expect(registry.executeCommand("tools.chain")).toBe(false);
    expect(() => registry.executeCommand("ghost")).toThrow(ExtensionError);
    expect(registry.commands().length).toBe(2);
    expect(registry.stats()["obsifox.tools"]!.active).toBe(true);
    expect(registry.tools()[0]!.run({} as never)).toBe(42);
  });

  it("isolates extension errors", () => {
    const registry = new ExtensionRegistry();
    registry.register({
      id: "broken",
      name: "Broken",
      version: "1.0.0",
      contributions: {
        commands: [
          {
            id: "broken.run",
            title: "Boom",
            run: () => {
              throw new Error("boom");
            },
          },
        ],
      },
      activate: () => {
        throw new Error("activate failed");
      },
    });
    expect(registry.executeCommand("broken.run")).toBe(null);
    expect(registry.errorsFor("broken")).toEqual(["activate failed", "boom"]);
    registry.deactivate("broken");
    registry.activate("broken");
    expect(registry.errorsFor("broken")).toEqual(["activate failed", "boom", "activate failed"]);
    expect(registry.stats().broken!.errors).toBe(3);
  });

  it("collects panels and menus in order", () => {
    const registry = new ExtensionRegistry();
    registry.register(toolExtension());
    registry.register(contentExtension());
    expect(registry.panels("bottom").map((panel) => panel.id)).toEqual(["tools.panel"]);
    expect(registry.panels().map((panel) => panel.id)).toEqual(["tools.panel", "tools.side"]);
    expect(registry.menus("edit").map((entry) => entry.id)).toEqual(["tools.menuChain", "tools.menuSnap"]);
    expect(registry.menus().length).toBe(2);
    expect(registry.activeCount).toBe(0);
  });

  it("resolves custom inspectors, gizmos, importers and node types", () => {
    const registry = new ExtensionRegistry();
    registry.register(contentExtension());
    expect(registry.inspectorFor("Enemy")!.describe()[0]!.path).toBe("ai");
    expect(registry.inspectorFor("Hero")).toBe(null);
    expect(registry.gizmoFor("Path")!.draw({} as never)).toBe("path");
    expect(registry.gizmoFor("Node2D")).toBe(null);
    expect(registry.importerFor("art/hero.PNG")!.import("hero.PNG")).toBe("imported:hero.PNG");
    expect(registry.importerFor("notes.txt")).toBe(null);
    expect(registry.assetTypeFor("a.jpg")!.type).toBe("texture");
    expect(registry.createNode("Enemy", "Grunt")).toEqual({ kind: "Enemy", name: "Grunt" });
    expect(() => registry.createNode("Hero", "X")).toThrow(ExtensionError);
  });
});
