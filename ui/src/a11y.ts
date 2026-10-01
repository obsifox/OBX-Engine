export type A11yRole =
  | "button"
  | "label"
  | "textbox"
  | "checkbox"
  | "slider"
  | "list"
  | "listitem"
  | "dialog"
  | "progressbar"
  | "heading"
  | "image"
  | "custom";

export type LiveRegion = "off" | "polite" | "assertive";

export interface A11yNode {
  id: string;
  role: A11yRole;
  label: string;
  value?: string;
  focusable: boolean;
  focused?: boolean;
  live?: LiveRegion;
  children: A11yNode[];
  textScale?: number;
  reducedMotion?: boolean;
}

export function a11yNode(id: string, role: A11yRole, label: string, over: Partial<A11yNode> = {}): A11yNode {
  return {
    id,
    role,
    label,
    value: over.value,
    focusable: over.focusable ?? (role === "button" || role === "textbox" || role === "checkbox" || role === "slider"),
    focused: over.focused ?? false,
    live: over.live ?? "off",
    children: over.children ?? [],
    textScale: over.textScale ?? 1,
    reducedMotion: over.reducedMotion ?? false,
  };
}

export class FocusManager {
  #root: A11yNode;
  #focusedId: string | null = null;
  #announcements: string[] = [];

  constructor(root: A11yNode) {
    this.#root = root;
  }

  get focusedId(): string | null {
    return this.#focusedId;
  }

  get announcements(): string[] {
    return [...this.#announcements];
  }

  focusables(): A11yNode[] {
    const result: A11yNode[] = [];
    const visit = (node: A11yNode): void => {
      if (node.focusable) result.push(node);
      for (const child of node.children) visit(child);
    };
    visit(this.#root);
    return result;
  }

  focus(id: string): boolean {
    const target = this.focusables().find((node) => node.id === id);
    if (!target) return false;
    this.#focusedId = id;
    target.focused = true;
    if (target.live !== "off") this.announce(target.label, target.live);
    return true;
  }

  focusNext(): A11yNode | null {
    const nodes = this.focusables();
    if (nodes.length === 0) return null;
    const currentIndex = nodes.findIndex((node) => node.id === this.#focusedId);
    const next = nodes[(currentIndex + 1) % nodes.length]!;
    this.focus(next.id);
    return next;
  }

  focusPrevious(): A11yNode | null {
    const nodes = this.focusables();
    if (nodes.length === 0) return null;
    const currentIndex = nodes.findIndex((node) => node.id === this.#focusedId);
    const previous = nodes[(currentIndex - 1 + nodes.length) % nodes.length]!;
    this.focus(previous.id);
    return previous;
  }

  announce(message: string, live: LiveRegion = "polite"): void {
    if (live === "off") return;
    this.#announcements.push(message);
  }

  describe(node: A11yNode): string {
    const parts = [node.role, node.label];
    if (node.value !== undefined) parts.push(`value ${node.value}`);
    return parts.join(", ");
  }
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastReport {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
  passesAALarge: boolean;
}

export function checkContrast(foreground: [number, number, number], background: [number, number, number]): ContrastReport {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
    passesAALarge: ratio >= 3,
  };
}

export class TextScaler {
  #scale = 1;

  get scale(): number {
    return this.#scale;
  }

  setScale(scale: number): number {
    this.#scale = Math.min(3, Math.max(0.5, scale));
    return this.#scale;
  }

  apply(fontSize: number): number {
    return fontSize * this.#scale;
  }
}

export interface MotionPreference {
  reduced: boolean;
}

export function resolveMotion(override: boolean | undefined, system: MotionPreference): MotionPreference {
  return { reduced: override ?? system.reduced };
}

export function scaledDuration(durationMs: number, preference: MotionPreference): number {
  return preference.reduced ? 0 : durationMs;
}

export function accessibilityAudit(root: A11yNode): string[] {
  const issues: string[] = [];
  const visit = (node: A11yNode): void => {
    if (node.label.trim().length === 0) issues.push(`${node.id}: missing label`);
    if (node.role === "custom") issues.push(`${node.id}: custom role lacks semantic mapping`);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return issues;
}
