import { Signal } from "@obx/core";
import type { AssetGUID } from "./guid.js";

export type ReloadKind = "texture" | "material" | "shader" | "scene" | "script" | "audio" | "asset";

export interface ReloadEvent {
  kind: ReloadKind;
  guid: AssetGUID;
  path: string;
  data: unknown;
  reloadCount: number;
}

export type ReloadHandler = (event: ReloadEvent) => void;

export class HotReloadHub {
  readonly onReload = new Signal<[ReloadEvent]>();
  readonly #handlers = new Map<ReloadKind | "*", Set<ReloadHandler>>();
  readonly #history: ReloadEvent[] = [];
  readonly #reloadCounts = new Map<AssetGUID, number>();
  #enabled = true;

  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  register(kind: ReloadKind | "*", handler: ReloadHandler): () => void {
    let set = this.#handlers.get(kind);
    if (!set) {
      set = new Set();
      this.#handlers.set(kind, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  notify(kind: ReloadKind, guid: AssetGUID, path: string, data: unknown = null): ReloadEvent | null {
    if (!this.#enabled) return null;
    const count = (this.#reloadCounts.get(guid) ?? 0) + 1;
    this.#reloadCounts.set(guid, count);
    const event: ReloadEvent = { kind, guid, path, data, reloadCount: count };
    this.#history.push(event);
    const handlers = [...(this.#handlers.get(kind) ?? []), ...(this.#handlers.get("*") ?? [])];
    for (const handler of handlers) handler(event);
    this.onReload.emit(event);
    return event;
  }

  reloadCount(guid: AssetGUID): number {
    return this.#reloadCounts.get(guid) ?? 0;
  }

  history(): ReloadEvent[] {
    return [...this.#history];
  }

  clear(): void {
    this.#handlers.clear();
    this.#history.length = 0;
    this.#reloadCounts.clear();
    this.onReload.clear();
  }
}

export function kindForExtension(path: string): ReloadKind {
  const index = path.lastIndexOf(".");
  const extension = index === -1 ? "" : path.slice(index + 1).toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "bmp", "svg"].includes(extension)) return "texture";
  if (["wgsl", "glsl", "frag", "vert"].includes(extension)) return "shader";
  if (["wav", "ogg", "mp3"].includes(extension)) return "audio";
  if (["scene", "prefab"].includes(extension)) return "scene";
  if (["js", "ts", "mjs"].includes(extension)) return "script";
  if (["mat", "material"].includes(extension)) return "material";
  return "asset";
}
