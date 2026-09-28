import { describe, expect, it } from "vitest";
import {
  UiTweenManager,
  append,
  backspace,
  click,
  createUiNode,
  defaultTheme,
  easings,
  hitTest,
  layout,
  measure,
  measureText,
  paint,
  scroll,
  setSliderValue,
  typeText,
  uiStyle,
} from "../src/index.js";

describe("measure", () => {
  it("measures text deterministically", () => {
    const size = measureText("hello", 10);
    expect(size.width).toBeCloseTo(30, 12);
    expect(size.height).toBeCloseTo(12.5, 12);
  });

  it("measures auto and fixed nodes", () => {
    const label = createUiNode("label", { text: "hello", style: uiStyle({ fontSize: 10 }) });
    expect(measure(label).width).toBeCloseTo(30, 12);
    const panel = createUiNode("panel", { style: uiStyle({ width: 100, height: 40 }) });
    expect(measure(panel)).toEqual({ width: 100, height: 40 });
    const container = createUiNode("panel", { style: uiStyle({ direction: "row", gap: 5 }) });
    append(container, createUiNode("label", { text: "hi", style: uiStyle({ fontSize: 10 }) }));
    append(container, createUiNode("label", { text: "hi", style: uiStyle({ fontSize: 10 }) }));
    expect(measure(container).width).toBeCloseTo(12 * 2 + 5, 12);
  });
});

describe("layout", () => {
  it("lays out flex rows with padding and alignment", () => {
    const root = createUiNode("panel", {
      style: uiStyle({ width: 200, height: 100, direction: "row", gap: 10, padding: { top: 5, right: 5, bottom: 5, left: 5 }, align: "center" }),
    });
    const a = append(root, createUiNode("panel", { style: uiStyle({ width: 50, height: 20 }) }));
    const b = append(root, createUiNode("panel", { style: uiStyle({ width: 30, height: 20 }) }));
    const map = layout(root, { x: 0, y: 0, width: 200, height: 100 });
    expect(map.get(a.id)).toEqual({ x: 5, y: 40, width: 50, height: 20 });
    expect(map.get(b.id)).toEqual({ x: 65, y: 40, width: 30, height: 20 });
  });

  it("places absolute children with anchors and pivots", () => {
    const root = createUiNode("panel", { style: uiStyle({ width: 100, height: 100 }) });
    const badge = append(
      root,
      createUiNode("label", {
        text: "x",
        style: uiStyle({ width: 20, height: 10, position: "absolute", anchorX: 1, anchorY: 0, pivotX: 1, pivotY: 0 }),
      }),
    );
    const map = layout(root, { x: 10, y: 10, width: 100, height: 100 });
    expect(map.get(badge.id)).toEqual({ x: 90, y: 10, width: 20, height: 10 });
  });

  it("distributes space-between", () => {
    const root = createUiNode("panel", {
      style: uiStyle({ width: 100, height: 20, direction: "row", justify: "space-between" }),
    });
    const a = append(root, createUiNode("panel", { style: uiStyle({ width: 20, height: 20 }) }));
    const b = append(root, createUiNode("panel", { style: uiStyle({ width: 20, height: 20 }) }));
    const map = layout(root, { x: 0, y: 0, width: 100, height: 20 });
    expect(map.get(a.id)!.x).toBe(0);
    expect(map.get(b.id)!.x).toBe(80);
  });
});

describe("widgets", () => {
  it("paints panels, labels and buttons", () => {
    const root = createUiNode("panel", {
      style: uiStyle({ width: 100, height: 40, color: defaultTheme.surface }),
    });
    const button = append(
      root,
      createUiNode("button", { text: "OK", style: uiStyle({ width: 60, height: 20, color: defaultTheme.primary }) }),
    );
    const map = layout(root, { x: 0, y: 0, width: 100, height: 40 });
    const commands = paint(root, map);
    expect(commands.filter((c) => c.kind === "rect").length).toBe(2);
    const text = commands.find((c) => c.kind === "text");
    expect(text!.text).toBe("OK");
    void button;
  });

  it("handles clicks with hit testing", () => {
    const root = createUiNode("panel", { style: uiStyle({ width: 100, height: 100 }) });
    let clicks = 0;
    const button = append(
      root,
      createUiNode("button", {
        text: "Go",
        style: uiStyle({ width: 40, height: 20 }),
        handlers: { onClick: () => {
          clicks += 1;
        } },
      }),
    );
    const map = layout(root, { x: 0, y: 0, width: 100, height: 100 });
    expect(hitTest(root, map, 200, 200)).toBeNull();
    expect(click(root, map, 10, 10)).toBe(button);
    expect(clicks).toBe(1);
    expect(click(root, map, 90, 90)).toBe(root);
    expect(clicks).toBe(1);
  });

  it("edits input fields", () => {
    const changes: Array<string> = [];
    const input = createUiNode("input", {
      handlers: { onChange: (_node, value) => changes.push(String(value)) },
    });
    typeText(input, "obx");
    backspace(input);
    expect(input.value).toBe("ob");
    expect(changes).toEqual(["obx", "ob"]);
    const label = createUiNode("label", { text: "x" });
    typeText(label, "y");
    expect(label.text).toBe("x");
  });

  it("drives sliders from pointer positions", () => {
    const slider = createUiNode("slider", {
      style: uiStyle({ width: 100, height: 16 }),
      min: 0,
      max: 10,
    });
    const root = createUiNode("panel", { style: uiStyle({ width: 100, height: 40 }) });
    append(root, slider);
    const map = layout(root, { x: 0, y: 0, width: 100, height: 40 });
    setSliderValue(slider, map, 25);
    expect(slider.value).toBeCloseTo(2.5, 12);
    setSliderValue(slider, map, 500);
    expect(slider.value).toBe(10);
  });

  it("scrolls lists and paints items", () => {
    const list = createUiNode("list", {
      items: ["a", "b", "c"],
      style: uiStyle({ width: 80, height: 40, color: defaultTheme.surface }),
    });
    const root = createUiNode("panel", { style: uiStyle({ width: 80, height: 40 }) });
    append(root, list);
    const map = layout(root, { x: 0, y: 0, width: 80, height: 40 });
    const texts = paint(root, map).filter((c) => c.kind === "text").map((c) => c.text);
    expect(texts).toEqual(["a", "b", "c"]);
    scroll(list, 5);
    expect(list.scrollOffset).toBe(5);
    scroll(list, -10);
    expect(list.scrollOffset).toBe(0);
    const window = createUiNode("window", { title: "Inventory" });
    const wMap = layout(window, { x: 0, y: 0, width: 200, height: 100 });
    expect(paint(window, wMap)[0]!.text).toBe("Inventory");
  });

  it("tweens style properties", () => {
    const node = createUiNode("panel", { style: uiStyle({ opacity: 0 }) });
    const tweens = new UiTweenManager();
    tweens.animate(node, { opacity: 1 }, 1, easings.linear);
    tweens.update(0.5);
    expect(node.style.opacity).toBeCloseTo(0.5, 12);
    tweens.update(0.5);
    expect(node.style.opacity).toBeCloseTo(1, 12);
  });
});
