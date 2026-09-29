export interface ShortcutBinding {
  combo: string;
  commandId: string;
  when?: string;
}

export function normalizeCombo(combo: string): string {
  const parts = combo
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
  const modifiers = parts.filter((part) => ["ctrl", "shift", "alt", "meta"].includes(part));
  const key = parts.find((part) => !["ctrl", "shift", "alt", "meta"].includes(part)) ?? "";
  return [...modifiers.sort(), key].join("+");
}

export function parseCombo(combo: string): { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string } {
  const normalized = normalizeCombo(combo).split("+");
  return {
    ctrl: normalized.includes("ctrl"),
    shift: normalized.includes("shift"),
    alt: normalized.includes("alt"),
    meta: normalized.includes("meta"),
    key: normalized[normalized.length - 1] ?? "",
  };
}

export class Shortcuts {
  private readonly bindings = new Map<string, ShortcutBinding>();

  bind(combo: string, commandId: string, when?: string): void {
    this.bindings.set(normalizeCombo(combo), { combo: normalizeCombo(combo), commandId, when });
  }

  unbind(combo: string): boolean {
    return this.bindings.delete(normalizeCombo(combo));
  }

  lookup(combo: string): ShortcutBinding | null {
    return this.bindings.get(normalizeCombo(combo)) ?? null;
  }

  resolve(combo: string, context: Record<string, unknown> = {}): string | null {
    const binding = this.lookup(combo);
    if (!binding) return null;
    if (binding.when && context[binding.when] !== true) return null;
    return binding.commandId;
  }

  all(): ShortcutBinding[] {
    return [...this.bindings.values()];
  }

  clear(): void {
    this.bindings.clear();
  }
}

export interface PaletteCommand {
  id: string;
  title: string;
  category: string;
  keywords?: string[];
  run: () => void;
}

export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 1;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let score = 0;
  let index = 0;
  for (const char of q) {
    const found = t.indexOf(char, index);
    if (found === -1) return 0;
    score += found === index ? 2 : 1;
    index = found + 1;
  }
  return score;
}

export class CommandPalette {
  private readonly commands = new Map<string, PaletteCommand>();
  private readonly history: string[] = [];

  register(command: PaletteCommand): void {
    this.commands.set(command.id, command);
  }

  unregister(id: string): boolean {
    return this.commands.delete(id);
  }

  get(id: string): PaletteCommand | null {
    return this.commands.get(id) ?? null;
  }

  search(query: string, limit = 20): PaletteCommand[] {
    return [...this.commands.values()]
      .map((command) => ({
        command,
        score: Math.max(
          fuzzyScore(query, command.title),
          fuzzyScore(query, command.category),
          ...(command.keywords ?? []).map((keyword) => fuzzyScore(query, keyword)),
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))
      .slice(0, limit)
      .map((entry) => entry.command);
  }

  execute(id: string): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    command.run();
    this.history.push(id);
    return true;
  }

  recent(): string[] {
    return [...this.history].reverse();
  }

  get size(): number {
    return this.commands.size;
  }
}

export interface PreferenceValue {
  [key: string]: string | number | boolean | PreferenceValue;
}

export class Preferences {
  private readonly values = new Map<string, string | number | boolean>();

  constructor(defaults: Record<string, string | number | boolean> = {}) {
    for (const [key, value] of Object.entries(defaults)) this.values.set(key, value);
  }

  get<T extends string | number | boolean>(key: string, fallback: T): T {
    const value = this.values.get(key);
    return value === undefined ? fallback : (value as T);
  }

  set(key: string, value: string | number | boolean): void {
    this.values.set(key, value);
  }

  reset(key: string): boolean {
    return this.values.delete(key);
  }

  entries(): Record<string, string | number | boolean> {
    return Object.fromEntries(this.values);
  }

  serialize(): string {
    return JSON.stringify(this.entries(), null, 2);
  }

  restore(serialized: string): void {
    this.values.clear();
    for (const [key, value] of Object.entries(JSON.parse(serialized) as Record<string, string | number | boolean>)) {
      this.values.set(key, value);
    }
  }
}

export class LayoutPersistence {
  private readonly layouts = new Map<string, unknown>();

  save(name: string, layout: unknown): void {
    this.layouts.set(name, structuredClone(layout));
  }

  load<T = unknown>(name: string): T | null {
    const layout = this.layouts.get(name);
    return layout === undefined ? null : (structuredClone(layout) as T);
  }

  remove(name: string): boolean {
    return this.layouts.delete(name);
  }

  names(): string[] {
    return [...this.layouts.keys()];
  }

  serialize(): string {
    return JSON.stringify(Object.fromEntries(this.layouts), null, 2);
  }

  restore(serialized: string): void {
    this.layouts.clear();
    for (const [name, layout] of Object.entries(JSON.parse(serialized) as Record<string, unknown>)) {
      this.layouts.set(name, layout);
    }
  }
}
