export interface UiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type UiSize = number | "auto";

export interface UiStyle {
  x: number;
  y: number;
  width: UiSize;
  height: UiSize;
  anchorX: number;
  anchorY: number;
  pivotX: number;
  pivotY: number;
  position: "flow" | "absolute";
  direction: "row" | "column";
  gap: number;
  padding: UiInsets;
  justify: "start" | "center" | "end" | "space-between";
  align: "start" | "center" | "end" | "stretch";
  opacity: number;
  visible: boolean;
  color: string;
  textColor: string;
  fontSize: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
}

export type UiWidgetType =
  | "panel"
  | "label"
  | "button"
  | "image"
  | "input"
  | "slider"
  | "list"
  | "scroll"
  | "window"
  | "modal";

export interface UiHandlers {
  onClick?: (node: UiNode) => void;
  onChange?: (node: UiNode, value: number | string) => void;
}

export interface UiNode {
  id: string;
  type: UiWidgetType;
  style: UiStyle;
  text: string;
  value: number | string;
  min: number;
  max: number;
  items: string[];
  scrollOffset: number;
  title: string;
  handlers: UiHandlers;
  children: UiNode[];
  parent: UiNode | null;
  userData: unknown;
}

let nextId = 1;

export function uiStyle(over: Partial<UiStyle> = {}): UiStyle {
  return {
    x: over.x ?? 0,
    y: over.y ?? 0,
    width: over.width ?? "auto",
    height: over.height ?? "auto",
    anchorX: over.anchorX ?? 0,
    anchorY: over.anchorY ?? 0,
    pivotX: over.pivotX ?? 0,
    pivotY: over.pivotY ?? 0,
    position: over.position ?? "flow",
    direction: over.direction ?? "column",
    gap: over.gap ?? 0,
    padding: over.padding ?? { top: 0, right: 0, bottom: 0, left: 0 },
    justify: over.justify ?? "start",
    align: over.align ?? "start",
    opacity: over.opacity ?? 1,
    visible: over.visible ?? true,
    color: over.color ?? "transparent",
    textColor: over.textColor ?? "#E8ECF2",
    fontSize: over.fontSize ?? 14,
    borderColor: over.borderColor ?? "transparent",
    borderWidth: over.borderWidth ?? 0,
    radius: over.radius ?? 0,
  };
}

export function createUiNode(type: UiWidgetType, over: Partial<UiNode> = {}): UiNode {
  return {
    id: over.id ?? `ui-${nextId++}`,
    type,
    style: over.style ?? uiStyle(),
    text: over.text ?? "",
    value: over.value ?? (type === "slider" ? 0 : type === "input" ? "" : 0),
    min: over.min ?? 0,
    max: over.max ?? 1,
    items: over.items ?? [],
    scrollOffset: over.scrollOffset ?? 0,
    title: over.title ?? "",
    handlers: over.handlers ?? {},
    children: [],
    parent: null,
    userData: over.userData,
  };
}

export function append(parent: UiNode, child: UiNode): UiNode {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

export const CHAR_WIDTH_RATIO = 0.6;
export const LINE_HEIGHT_RATIO = 1.25;

export function measureText(text: string, fontSize: number): { width: number; height: number } {
  return { width: text.length * fontSize * CHAR_WIDTH_RATIO, height: fontSize * LINE_HEIGHT_RATIO };
}

export function measure(node: UiNode): { width: number; height: number } {
  const style = node.style;
  const padding = style.padding;
  const text = measureText(node.text || node.title || "", style.fontSize);
  let contentWidth = text.width;
  let contentHeight = text.height;
  if (node.type === "button" || node.type === "input") {
    contentWidth = Math.max(contentWidth, 60);
    contentHeight = Math.max(contentHeight, style.fontSize * LINE_HEIGHT_RATIO + 8);
  }
  if (node.type === "slider") {
    contentWidth = Math.max(contentWidth, 120);
    contentHeight = Math.max(contentHeight, 16);
  }
  if (node.type === "list") {
    contentHeight = node.items.length * (style.fontSize * LINE_HEIGHT_RATIO + 4);
    for (const item of node.items) {
      contentWidth = Math.max(contentWidth, measureText(item, style.fontSize).width);
    }
  }
  if (node.type === "window" || node.type === "modal") {
    contentHeight += style.fontSize * LINE_HEIGHT_RATIO + 8;
  }
  if (node.children.length > 0) {
    let main = 0;
    let cross = 0;
    for (const child of node.children) {
      if (!child.style.visible || child.style.position === "absolute") continue;
      const size = measure(child);
      if (style.direction === "row") {
        main += size.width + child.style.x;
        cross = Math.max(cross, size.height);
      } else {
        main += size.height + child.style.y;
        cross = Math.max(cross, size.width);
      }
    }
    const gaps = Math.max(0, node.children.filter((c) => c.style.visible && c.style.position !== "absolute").length - 1) * style.gap;
    if (style.direction === "row") {
      contentWidth = Math.max(contentWidth, main + gaps);
      contentHeight = Math.max(contentHeight, cross);
    } else {
      contentHeight = Math.max(contentHeight, main + gaps);
      contentWidth = Math.max(contentWidth, cross);
    }
  }
  return {
    width: style.width === "auto" ? contentWidth + padding.left + padding.right : style.width,
    height: style.height === "auto" ? contentHeight + padding.top + padding.bottom : style.height,
  };
}

export type LayoutMap = Map<string, UiRect>;

export function layout(root: UiNode, viewport: UiRect): LayoutMap {
  const map: LayoutMap = new Map();
  const size = measure(root);
  const width = root.style.width === "auto" ? size.width : root.style.width;
  const height = root.style.height === "auto" ? size.height : root.style.height;
  const x = viewport.x + root.style.anchorX * viewport.width - root.style.pivotX * width + root.style.x;
  const y = viewport.y + root.style.anchorY * viewport.height - root.style.pivotY * height + root.style.y;
  place(root, { x, y, width, height }, map);
  return map;
}

function place(node: UiNode, rect: UiRect, map: LayoutMap): void {
  map.set(node.id, rect);
  const style = node.style;
  const padding = style.padding;
  const content: UiRect = {
    x: rect.x + padding.left,
    y: rect.y + padding.top,
    width: Math.max(0, rect.width - padding.left - padding.right),
    height: Math.max(0, rect.height - padding.top - padding.bottom),
  };
  const flow = node.children.filter((child) => child.style.visible && child.style.position === "flow");
  const absolute = node.children.filter((child) => child.style.visible && child.style.position === "absolute");
  const sizes = flow.map((child) => measure(child));
  const mainTotal = sizes.reduce(
    (sum, size) => sum + (style.direction === "row" ? size.width : size.height),
    Math.max(0, flow.length - 1) * style.gap,
  );
  const mainFree = (style.direction === "row" ? content.width : content.height) - mainTotal;
  let cursor = style.direction === "row" ? content.x : content.y;
  if (style.justify === "center") cursor += mainFree / 2;
  else if (style.justify === "end") cursor += mainFree;
  const spacing = style.justify === "space-between" && flow.length > 1 ? mainFree / (flow.length - 1) : 0;

  flow.forEach((child, index) => {
    const size = sizes[index]!;
    const cs = child.style;
    let x: number;
    let y: number;
    let width = cs.width === "auto" ? size.width : cs.width;
    let height = cs.height === "auto" ? size.height : cs.height;
    if (style.direction === "row") {
      x = cursor + cs.x;
      cursor += size.width + style.gap + spacing;
      y = content.y + cs.y;
      if (style.align === "center") y += (content.height - height) / 2;
      else if (style.align === "end") y += content.height - height;
      else if (style.align === "stretch") height = content.height;
    } else {
      y = cursor + cs.y;
      cursor += size.height + style.gap + spacing;
      x = content.x + cs.x;
      if (style.align === "center") x += (content.width - width) / 2;
      else if (style.align === "end") x += content.width - width;
      else if (style.align === "stretch") width = content.width;
    }
    place(child, { x, y, width, height }, map);
  });

  for (const child of absolute) {
    const size = measure(child);
    const cs = child.style;
    const width = cs.width === "auto" ? size.width : cs.width;
    const height = cs.height === "auto" ? size.height : cs.height;
    const x = rect.x + cs.anchorX * rect.width - cs.pivotX * width + cs.x;
    const y = rect.y + cs.anchorY * rect.height - cs.pivotY * height + cs.y;
    place(child, { x, y, width, height }, map);
  }
}

export interface UiDrawCommand {
  kind: "rect" | "text";
  rect: UiRect;
  color: string;
  text?: string;
  fontSize?: number;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
  opacity: number;
}

export function paint(node: UiNode, map: LayoutMap, output: UiDrawCommand[] = []): UiDrawCommand[] {
  if (!node.style.visible) return output;
  const rect = map.get(node.id);
  if (!rect) return output;
  const style = node.style;
  const pushRect = (color: string, radius = style.radius): void => {
    if (color === "transparent") return;
    output.push({
      kind: "rect",
      rect,
      color,
      radius,
      borderWidth: style.borderWidth,
      borderColor: style.borderColor,
      opacity: style.opacity,
    });
  };
  switch (node.type) {
    case "label":
      break;
    case "button":
    case "input":
    case "panel":
    case "window":
    case "modal":
    case "image":
      pushRect(style.color);
      break;
    case "slider": {
      pushRect(style.color, 4);
      const t = node.max === node.min ? 0 : ((Number(node.value) - node.min) / (node.max - node.min));
      output.push({
        kind: "rect",
        rect: { x: rect.x + (rect.width - 16) * t, y: rect.y, width: 16, height: rect.height },
        color: style.textColor,
        radius: 4,
        opacity: style.opacity,
      });
      break;
    }
    case "list":
      pushRect(style.color);
      break;
    case "scroll":
      pushRect(style.color);
      break;
    default:
      break;
  }
  const textLines: Array<{ text: string; x: number; y: number }> = [];
  if (node.title) {
    textLines.push({ text: node.title, x: rect.x + 8, y: rect.y + 4 });
  }
  if (node.type === "list") {
    const lineHeight = style.fontSize * LINE_HEIGHT_RATIO + 4;
    node.items.forEach((item, index) => {
      textLines.push({ text: item, x: rect.x + 8, y: rect.y + (node.title ? style.fontSize * LINE_HEIGHT_RATIO + 8 : 0) + index * lineHeight - node.scrollOffset });
    });
  } else if (node.text || node.type === "input" || node.type === "label") {
    const content = node.type === "input" ? String(node.value) : node.text;
    if (content) {
      const size = measureText(content, style.fontSize);
      textLines.push({
        text: content,
        x: rect.x + (rect.width - size.width) / 2,
        y: rect.y + (rect.height - size.height) / 2,
      });
    }
  }
  for (const line of textLines) {
    output.push({
      kind: "text",
      rect: { x: line.x, y: line.y, width: measureText(line.text, style.fontSize).width, height: style.fontSize * LINE_HEIGHT_RATIO },
      color: style.textColor,
      text: line.text,
      fontSize: style.fontSize,
      opacity: style.opacity,
    });
  }
  for (const child of node.children) {
    paint(child, map, output);
  }
  return output;
}

export function hitTest(node: UiNode, map: LayoutMap, x: number, y: number): UiNode | null {
  if (!node.style.visible) return null;
  for (let i = node.children.length - 1; i >= 0; i -= 1) {
    const found = hitTest(node.children[i]!, map, x, y);
    if (found) return found;
  }
  const rect = map.get(node.id);
  if (!rect) return null;
  if (x < rect.x || y < rect.y || x > rect.x + rect.width || y > rect.y + rect.height) return null;
  return node;
}

export function click(node: UiNode, map: LayoutMap, x: number, y: number): UiNode | null {
  const found = hitTest(node, map, x, y);
  if (found) found.handlers.onClick?.(found);
  return found;
}

export function typeText(node: UiNode, text: string): void {
  if (node.type !== "input") return;
  node.value = String(node.value) + text;
  node.handlers.onChange?.(node, node.value);
}

export function backspace(node: UiNode): void {
  if (node.type !== "input") return;
  const current = String(node.value);
  node.value = current.slice(0, -1);
  node.handlers.onChange?.(node, node.value);
}

export function setSliderValue(node: UiNode, map: LayoutMap, x: number): void {
  if (node.type !== "slider") return;
  const rect = map.get(node.id);
  if (!rect || rect.width <= 0) return;
  const t = Math.max(0, Math.min(1, (x - rect.x) / rect.width));
  node.value = node.min + t * (node.max - node.min);
  node.handlers.onChange?.(node, node.value);
}

export function scroll(node: UiNode, delta: number): void {
  if (node.type !== "list" && node.type !== "scroll") return;
  node.scrollOffset = Math.max(0, node.scrollOffset + delta);
}

export interface UiTween {
  node: UiNode;
  from: Record<string, number>;
  to: Record<string, number>;
  duration: number;
  elapsed: number;
  easing: (t: number) => number;
}

export const easings = {
  linear: (t: number) => t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

export class UiTweenManager {
  private readonly tweens: UiTween[] = [];

  animate(node: UiNode, to: Record<string, number>, duration: number, easing = easings.easeOutQuad): void {
    const from: Record<string, number> = {};
    for (const key of Object.keys(to)) {
      from[key] = (node.style as unknown as Record<string, number>)[key] ?? 0;
    }
    this.tweens.push({ node, from, to, duration, elapsed: 0, easing });
  }

  update(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const tween = this.tweens[i]!;
      tween.elapsed += dt;
      const t = tween.duration <= 0 ? 1 : Math.min(1, tween.elapsed / tween.duration);
      const eased = tween.easing(t);
      for (const key of Object.keys(tween.to)) {
        const from = tween.from[key] ?? 0;
        const to = tween.to[key] ?? 0;
        (tween.node.style as unknown as Record<string, number>)[key] = from + (to - from) * eased;
      }
      if (t >= 1) this.tweens.splice(i, 1);
    }
  }
}

export interface UiTheme {
  background: string;
  surface: string;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  danger: string;
  radius: number;
  fontSize: number;
}

export const defaultTheme: UiTheme = {
  background: "#0B0E14",
  surface: "#1B2333",
  primary: "#FF6A1A",
  accent: "#41E0FF",
  text: "#E8ECF2",
  textMuted: "#8A94A6",
  danger: "#FF4D4D",
  radius: 8,
  fontSize: 14,
};
