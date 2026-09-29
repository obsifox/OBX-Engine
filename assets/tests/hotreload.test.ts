import { describe, expect, it } from "vitest";
import { HotReloadHub, kindForExtension, type ReloadEvent } from "../src/index.js";

describe("hot reload", () => {
  it("routes reload events to typed handlers", () => {
    const hub = new HotReloadHub();
    const textureEvents: ReloadEvent[] = [];
    const allEvents: ReloadEvent[] = [];
    hub.register("texture", (event) => textureEvents.push(event));
    hub.register("*", (event) => allEvents.push(event));
    const first = hub.notify("texture", "guid-a", "textures/a.png", { width: 4 });
    const second = hub.notify("texture", "guid-a", "textures/a.png");
    hub.notify("shader", "guid-b", "shaders/b.wgsl");
    expect(textureEvents).toHaveLength(2);
    expect(allEvents).toHaveLength(3);
    expect(first).toMatchObject({ kind: "texture", guid: "guid-a", reloadCount: 1, path: "textures/a.png" });
    expect(second!.reloadCount).toBe(2);
    expect(hub.reloadCount("guid-a")).toBe(2);
    expect(hub.history()).toHaveLength(3);
  });

  it("supports unsubscribe and disabled mode", () => {
    const hub = new HotReloadHub();
    const seen: ReloadEvent[] = [];
    const off = hub.register("scene", (event) => seen.push(event));
    hub.notify("scene", "g", "a.scene");
    off();
    hub.notify("scene", "g", "a.scene");
    expect(seen).toHaveLength(1);
    hub.setEnabled(false);
    expect(hub.notify("scene", "g", "a.scene")).toBeNull();
    hub.setEnabled(true);
    expect(hub.enabled).toBe(true);
    hub.clear();
    expect(hub.history()).toEqual([]);
    expect(hub.reloadCount("g")).toBe(0);
  });

  it("maps extensions to reload kinds", () => {
    expect(kindForExtension("a/b/hero.PNG")).toBe("texture");
    expect(kindForExtension("lighting.wgsl")).toBe("shader");
    expect(kindForExtension("music.ogg")).toBe("audio");
    expect(kindForExtension("level.scene")).toBe("scene");
    expect(kindForExtension("enemy.prefab")).toBe("scene");
    expect(kindForExtension("ai.ts")).toBe("script");
    expect(kindForExtension("ground.material")).toBe("material");
    expect(kindForExtension("data.bin")).toBe("asset");
    expect(kindForExtension("noext")).toBe("asset");
  });
});
