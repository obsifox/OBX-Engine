import {  } from "../shell/docking.js";

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

