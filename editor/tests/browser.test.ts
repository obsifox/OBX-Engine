import { describe, expect, it } from "vitest";
import { AssetBrowser, type AssetEntry } from "../src/index.js";

function makeBrowser(): AssetBrowser {
  const browser = new AssetBrowser();
  browser.addEntry({ path: "/assets", name: "assets", kind: "folder", type: "folder", size: 0, guid: null, metadata: {} });
  browser.addEntry({ path: "/assets/hero.png", name: "hero.png", kind: "asset", type: "image", size: 2048, guid: "g-hero", metadata: { imported: true, width: 64 } });
  browser.addEntry({ path: "/assets/crate.obj", name: "crate.obj", kind: "asset", type: "model", size: 512, guid: "g-crate", metadata: {} });
  browser.addEntry({ path: "/music.ogg", name: "music.ogg", kind: "asset", type: "audio", size: 4096, guid: "g-music", metadata: {} });
  return browser;
}

describe("asset browser", () => {
  it("navigates folders", () => {
    const browser = makeBrowser();
    expect(browser.folders()).toEqual(["/assets"]);
    browser.navigate("/assets");
    expect(browser.visible().map((entry) => entry.name)).toEqual(["crate.obj", "hero.png"]);
    browser.up();
    expect(browser.cwd).toBe("/");
    expect(browser.visible().length).toBeGreaterThanOrEqual(2);
  });

  it("searches, filters and sorts entries", () => {
    const browser = makeBrowser();
    expect(browser.search("HERO").map((entry) => entry.name)).toEqual(["hero.png"]);
    browser.navigate("/assets");
    browser.setFilter({ types: ["model"] });
    expect(browser.visible().map((entry) => entry.name)).toEqual(["crate.obj"]);
    browser.setFilter({ types: null, query: "o" });
    expect(browser.visible().map((entry) => entry.name)).toEqual(["crate.obj", "hero.png"]);
    browser.setFilter({ query: "" });
    browser.setSort("size", false);
    expect(browser.visible().map((entry) => entry.name)).toEqual(["hero.png", "crate.obj"]);
    browser.setSort("type");
    expect(browser.visible().map((entry) => entry.type)).toEqual(["image", "model"]);
    browser.setFilter({ kinds: ["folder"] });
    expect(browser.visible()).toHaveLength(0);
  });

  it("imports and reimports through a handler", () => {
    const imported: string[] = [];
    const browser = new AssetBrowser({
      importer: (entry: AssetEntry) => {
        if (entry.name === "bad.png") throw new Error("broken header");
        imported.push(entry.path);
        return { ok: true, message: `imported ${entry.name}` };
      },
    });
    browser.addEntry({ path: "/a.png", name: "a.png", kind: "asset", type: "image", size: 1, guid: null, metadata: {} });
    browser.addEntry({ path: "/bad.png", name: "bad.png", kind: "asset", type: "image", size: 1, guid: null, metadata: {} });
    const reports = browser.import(["/a.png", "/bad.png", "/missing.png"]);
    expect(reports[0]).toMatchObject({ status: "imported", message: "imported a.png" });
    expect(reports[1]).toMatchObject({ status: "failed", message: "broken header" });
    expect(reports[2]!.status).toBe("failed");
    expect(imported).toEqual(["/a.png"]);
  });

  it("previews assets with metadata", () => {
    const browser = makeBrowser();
    const preview = browser.preview("/assets/hero.png")!;
    expect(preview.type).toBe("image");
    expect(preview.details.width).toBe(64);
    expect(browser.preview("/missing.png")).toBeNull();
    expect(browser.metadata("/assets/hero.png")).toMatchObject({ width: 64 });
  });

  it("supports drag and drop moves", () => {
    const browser = makeBrowser();
    browser.beginDrag(["/music.ogg"]);
    expect(browser.drag!.source).toBe("asset-browser");
    const moved = browser.drop("/assets");
    expect(moved).toEqual(["/assets/music.ogg"]);
    expect(browser.entry("/music.ogg")).toBeNull();
    expect(browser.entry("/assets/music.ogg")!.name).toBe("music.ogg");
    expect(browser.drop("/assets")).toEqual([]);
  });

  it("builds context menus and selection", () => {
    const browser = makeBrowser();
    const menu = browser.contextMenu("/assets/hero.png");
    expect(menu.map((item) => item.id)).toContain("reimport");
    expect(menu.find((item) => item.id === "import")!.enabled).toBe(true);
    expect(browser.contextMenu("/assets").find((item) => item.id === "import")!.enabled).toBe(false);
    expect(browser.contextMenu("/nothing")).toEqual([]);
    browser.select(["/assets/hero.png"]);
    expect(browser.selection).toEqual(["/assets/hero.png"]);
    expect(browser.removeEntry("/assets/hero.png")).toBe(true);
    expect(browser.selection).toEqual([]);
  });
});
