import { describe, expect, it } from "vitest";
import {
  FocusManager,
  GlyphRenderer,
  MessageCatalog,
  TextScaler,
  UiAnimationPlayer,
  UiDocument,
  UiTransitionRunner,
  a11yNode,
  accessibilityAudit,
  arabicForms,
  checkContrast,
  contrastRatio,
  defaultFont,
  detectParagraphDirection,
  formatMessage,
  formatNumber,
  graphemeClusters,
  layoutDirectionForText,
  localeInfo,
  pluralCategory,
  resolveBidi,
  sampleUiClip,
  uiAnimationClip,
  visualLines,
} from "../src/index.js";
import { createUiNode, layout, paint, uiStyle } from "../src/ui.js";

describe("glyph rendering and fonts", () => {
  it("rasterizes glyphs and text into coverage bitmaps", () => {
    const renderer = new GlyphRenderer(defaultFont(), 16);
    const glyph = renderer.rasterizeGlyph("A");
    expect(glyph.width).toBeGreaterThan(2);
    expect(glyph.coverage.some((value) => value > 0)).toBe(true);
    const text = renderer.rasterizeText("Hi");
    expect(text.width).toBeGreaterThan(glyph.width);
    expect(text.coverage.some((value) => value > 0)).toBe(true);
    expect(defaultFont().measure("Hello", 20).width).toBeGreaterThan(0);
  });

  it("supports custom glyph registration and metrics", () => {
    const font = defaultFont();
    font.registerGlyph("א", { advance: 0.7, commands: [{ kind: "move", points: [[0.1, 0]] }, { kind: "line", points: [[0.1, 0.9]] }] });
    expect(font.getGlyph("א").advance).toBeCloseTo(0.7, 5);
    expect(font.getGlyph("خ").commands.length).toBeGreaterThan(0);
  });
});

describe("unicode and bidi", () => {
  it("classifies bidi classes and detects paragraph direction", () => {
    expect(detectParagraphDirection("hello")).toBe("ltr");
    expect(detectParagraphDirection("שלום")).toBe("rtl");
    expect(detectParagraphDirection("سلام")).toBe("rtl");
    expect(detectParagraphDirection("123")).toBe("ltr");
  });

  it("reorders mixed-direction text and maps visual to logical", () => {
    const result = resolveBidi("abc");
    expect(result.visual).toBe("abc");
    const rtl = resolveBidi("שלום");
    expect(rtl.direction).toBe("rtl");
    expect(rtl.runs.length).toBeGreaterThan(0);
    const mixed = resolveBidi("ab");
    expect(mixed.logicalToVisual[0]).toBe(0);
    expect(mixed.visualToLogical[0]).toBe(0);
    const lines = visualLines("abcdefgh", 3);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveLength(3);
  });

  it("computes grapheme clusters and arabic joining forms", () => {
    const clusters = graphemeClusters("a\u0301b");
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.codePoints).toHaveLength(2);
    const forms = arabicForms("باب");
    expect(forms[0]!.form).toBe("initial");
    expect(forms[1]!.form).toBe("final");
    expect(forms[2]!.form).toBe("isolated");
  });
});

describe("localization", () => {
  it("resolves locales with plural categories and fallbacks", () => {
    expect(localeInfo("fa").direction).toBe("rtl");
    expect(localeInfo("ar").pluralForm).toBe("zero-one-other");
    expect(pluralCategory(0, localeInfo("ar"))).toBe("zero");
    expect(pluralCategory(1, localeInfo("en"))).toBe("one");
    const catalog = new MessageCatalog(["en"]);
    catalog.addBundle("en", {
      greeting: "Hello {name}",
      apples: "{count, plural, 0 no apples, # {count} apples}",
      role: "{gender, select, admin Administrator, other User}",
    });
    catalog.addBundle("fa", { greeting: "سلام {name}" });
    expect(catalog.format("greeting", { values: { name: "Ada" }, locale: "fa" })).toBe("سلام Ada");
    expect(catalog.format("greeting", { values: { name: "Ada" }, locale: "de" })).toBe("Hello Ada");
    expect(catalog.format("apples", { values: { count: 5 } })).toBe("5 apples");
    expect(catalog.format("role", { values: { gender: "admin" } })).toBe("Administrator");
  });

  it("formats numbers with locale separators", () => {
    expect(formatNumber(1234.5, localeInfo("en"))).toBe("1,234.50");
    expect(formatNumber(1234.5, localeInfo("fa"))).toContain("٬");
    expect(formatMessage("{value, number}", { value: 42 })).toBe("42");
    expect(layoutDirectionForText("سلام", "en")).toBe("rtl");
    expect(layoutDirectionForText("سلام", "fa")).toBe("rtl");
  });
});

describe("accessibility", () => {
  it("manages focus order and announcements", () => {
    const root = a11yNode("root", "custom", "window", {
      children: [
        a11yNode("title", "heading", "Settings"),
        a11yNode("ok", "button", "OK", { live: "polite" }),
        a11yNode("cancel", "button", "Cancel"),
      ],
    });
    root.focusable = false;
    const focus = new FocusManager(root);
    expect(focus.focusables()).toHaveLength(2);
    expect(focus.focus("ok")).toBe(true);
    expect(focus.focusedId).toBe("ok");
    const next = focus.focusNext();
    expect(next!.id).toBe("cancel");
    expect(focus.announcements.length).toBeGreaterThan(0);
    expect(focus.describe(focus.focusables()[0]!)).toContain("button");
  });

  it("computes contrast ratios and audits nodes", () => {
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 0);
    const report = checkContrast([26, 26, 26], [255, 255, 255]);
    expect(report.passesAAA).toBe(true);
    const scaler = new TextScaler();
    expect(scaler.setScale(2)).toBe(2);
    expect(scaler.apply(12)).toBe(24);
    const issues = accessibilityAudit(a11yNode("x", "custom", ""));
    expect(issues).toHaveLength(2);
  });
});

describe("ui editor and animation", () => {
  it("authors widget trees with undo and redo", () => {
    const document = new UiDocument();
    const buttonId = document.generateId("button");
    expect(document.apply({ kind: "add", parentId: "root", node: { id: buttonId, type: "button", style: {}, text: "OK", value: 0, children: [] } })).toBe(true);
    expect(document.apply({ kind: "style", nodeId: buttonId, style: { opacity: 0.5 } })).toBe(true);
    expect(document.find(buttonId)!.style.opacity).toBeCloseTo(0.5, 5);
    document.apply({ kind: "text", nodeId: buttonId, text: "Save" });
    expect(document.find(buttonId)!.text).toBe("Save");
    expect(document.undo()).toBe(true);
    expect(document.find(buttonId)!.text).toBe("OK");
    expect(document.redo()).toBe(true);
    expect(document.find(buttonId)!.text).toBe("Save");
    const snapshot = JSON.parse(JSON.stringify(document.serialize()));
    const restored = UiDocument.deserialize(snapshot);
    expect(restored.validate()).toEqual([]);
    expect(restored.find(buttonId)).not.toBeNull();
  });

  it("animates style values through clips and transitions", () => {
    const clip = uiAnimationClip(
      "fade",
      [
        { time: 0, values: { opacity: 0 } },
        { time: 1, values: { opacity: 1 } },
      ],
      1,
    );
    const mid = sampleUiClip(clip, 0.5);
    expect(mid.opacity).toBeGreaterThan(0.2);
    expect(mid.opacity).toBeLessThan(0.8);
    const player = new UiAnimationPlayer();
    player.add(clip);
    const node = createUiNode("panel", { style: uiStyle({ opacity: 0 }) });
    player.play(node, clip, { reduced: true });
    expect(node.style.opacity).toBeCloseTo(1, 5);
    player.update(0.1);
    expect(player.valuesAt(0.5, "fade").opacity).toBeGreaterThan(0);
    const runner = new UiTransitionRunner();
    runner.add("opacity", 0, 1, 100, "linear", { reduced: false });
    runner.update(50);
    expect(runner.value("opacity")).toBeCloseTo(0.5, 5);
    expect(runner.active).toBe(1);
  });

  it("keeps legacy layout and paint working on authored trees", () => {
    const root = createUiNode("panel", { style: uiStyle({ width: 100, height: 40 }) });
    root.children.push(createUiNode("label", { text: "Hi" }));
    const map = layout(root, { x: 0, y: 0, width: 100, height: 40 });
    const commands = paint(root, map);
    expect(map.size).toBeGreaterThan(0);
    expect(commands.length).toBeGreaterThan(0);
  });
});
