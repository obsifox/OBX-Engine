export type AssetEntryKind = "folder" | "asset";

export interface AssetEntry {
  path: string;
  name: string;
  kind: AssetEntryKind;
  type: string;
  size: number;
  modified: number;
  guid: string | null;
  metadata: Record<string, string | number | boolean>;
}

export interface AssetPreview {
  path: string;
  type: string;
  summary: string;
  details: Record<string, string | number | boolean>;
}

export type SortKey = "name" | "type" | "size" | "modified";

export interface BrowserFilter {
  query: string;
  kinds: AssetEntryKind[] | null;
  types: string[] | null;
}

export interface DragPayload {
  paths: string[];
  source: "asset-browser";
}

export interface MenuItem {
  id: string;
  label: string;
  enabled: boolean;
}

export interface ImportReport {
  path: string;
  status: "imported" | "reimported" | "failed";
  message: string;
}

export type ImportHandler = (entry: AssetEntry) => { ok: boolean; message: string };
export type PreviewHandler = (entry: AssetEntry) => AssetPreview;

export class AssetBrowser {
  private readonly entries = new Map<string, AssetEntry>();
  cwd = "/";
  sortKey: SortKey = "name";
  sortAscending = true;
  filter: BrowserFilter = { query: "", kinds: null, types: null };
  selection: string[] = [];
  drag: DragPayload | null = null;
  private importHandler: ImportHandler;
  private previewHandler: PreviewHandler;
  private clock = 0;

  constructor(options: { importer?: ImportHandler; previewer?: PreviewHandler } = {}) {
    this.importHandler = options.importer ?? (() => ({ ok: true, message: "imported" }));
    this.previewHandler = options.previewer ?? ((entry) => ({
      path: entry.path,
      type: entry.type,
      summary: `${entry.name} (${entry.type})`,
      details: { size: entry.size, guid: entry.guid ?? "", ...entry.metadata },
    }));
  }

  addEntry(entry: Omit<AssetEntry, "modified"> & { modified?: number }): AssetEntry {
    const stored: AssetEntry = {
      ...entry,
      path: normalize(entry.path),
      modified: entry.modified ?? this.nextClock(),
    };
    this.entries.set(stored.path, stored);
    return stored;
  }

  removeEntry(path: string): boolean {
    const normalized = normalize(path);
    this.selection = this.selection.filter((entry) => entry !== normalized);
    return this.entries.delete(normalized);
  }

  entry(path: string): AssetEntry | null {
    return this.entries.get(normalize(path)) ?? null;
  }

  all(): AssetEntry[] {
    return [...this.entries.values()];
  }

  navigate(path: string): void {
    this.cwd = normalize(path);
    this.selection = [];
  }

  up(): void {
    const parts = this.cwd.split("/").filter((part) => part.length > 0);
    parts.pop();
    this.cwd = `/${parts.join("/")}`.replace(/\/$/, "") || "/";
    this.selection = [];
  }

  folders(): string[] {
    const folders = new Set<string>();
    for (const entry of this.entries.values()) {
      if (entry.kind === "folder") folders.add(entry.path);
    }
    return [...folders].sort();
  }

  visible(): AssetEntry[] {
    const prefix = this.cwd === "/" ? "/" : `${this.cwd}/`;
    const query = this.filter.query.toLowerCase();
    const list = [...this.entries.values()].filter((entry) => {
      if (this.cwd !== "/" && !entry.path.startsWith(prefix) && entry.path !== this.cwd) return false;
      if (this.cwd !== "/" && entry.path === this.cwd) return false;
      if (this.cwd === "/" && entry.path.split("/").filter((part) => part.length > 0).length !== 1 && entry.kind !== "folder") {
        const depth = entry.path.split("/").filter((part) => part.length > 0).length;
        if (depth > 1 && !this.filter.query) return false;
      }
      if (this.filter.kinds && !this.filter.kinds.includes(entry.kind)) return false;
      if (this.filter.types && !this.filter.types.includes(entry.type)) return false;
      if (query && !entry.name.toLowerCase().includes(query)) return false;
      return true;
    });
    return this.sort(list);
  }

  search(query: string): AssetEntry[] {
    const lowered = query.toLowerCase();
    return this.sort([...this.entries.values()].filter((entry) => entry.name.toLowerCase().includes(lowered)));
  }

  private sort(list: AssetEntry[]): AssetEntry[] {
    const direction = this.sortAscending ? 1 : -1;
    return [...list].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      switch (this.sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * direction;
        case "type":
          return (a.type.localeCompare(b.type) || a.name.localeCompare(b.name)) * direction;
        case "size":
          return (a.size - b.size || a.name.localeCompare(b.name)) * direction;
        case "modified":
          return (a.modified - b.modified || a.name.localeCompare(b.name)) * direction;
      }
    });
  }

  setSort(key: SortKey, ascending = true): void {
    this.sortKey = key;
    this.sortAscending = ascending;
  }

  setFilter(filter: Partial<BrowserFilter>): void {
    this.filter = { ...this.filter, ...filter };
  }

  select(paths: string[]): void {
    this.selection = paths.map(normalize);
  }

  import(paths: string[]): ImportReport[] {
    return paths.map((path) => {
      const entry = this.entries.get(normalize(path));
      if (!entry) return { path, status: "failed" as const, message: "missing entry" };
      try {
        const result = this.importHandler(entry);
        return {
          path,
          status: entry.metadata.imported ? ("reimported" as const) : ("imported" as const),
          message: result.message,
        };
      } catch (error) {
        return { path, status: "failed" as const, message: (error as Error).message };
      }
    });
  }

  preview(path: string): AssetPreview | null {
    const entry = this.entries.get(normalize(path));
    return entry ? this.previewHandler(entry) : null;
  }

  beginDrag(paths: string[]): DragPayload {
    this.drag = { paths: paths.map(normalize), source: "asset-browser" };
    return this.drag;
  }

  drop(targetFolder: string): string[] {
    if (!this.drag) return [];
    const target = normalize(targetFolder);
    const moved: string[] = [];
    for (const sourcePath of this.drag.paths) {
      const entry = this.entries.get(sourcePath);
      if (!entry || entry.kind === "folder") continue;
      const newPath = `${target === "/" ? "" : target}/${entry.name}`;
      this.entries.delete(sourcePath);
      entry.path = normalize(newPath);
      this.entries.set(entry.path, entry);
      moved.push(entry.path);
    }
    this.drag = null;
    return moved;
  }

  contextMenu(path: string): MenuItem[] {
    const entry = this.entries.get(normalize(path));
    if (!entry) return [];
    return [
      { id: "import", label: "Import", enabled: entry.kind === "asset" },
      { id: "reimport", label: "Reimport", enabled: entry.kind === "asset" },
      { id: "rename", label: "Rename", enabled: true },
      { id: "delete", label: "Delete", enabled: true },
      { id: "copy-path", label: "Copy Path", enabled: true },
      { id: "show-metadata", label: "Show Metadata", enabled: true },
    ];
  }

  metadata(path: string): Record<string, string | number | boolean> | null {
    return this.entries.get(normalize(path))?.metadata ?? null;
  }

  private nextClock(): number {
    this.clock += 1;
    return this.clock;
  }
}

function normalize(path: string): string {
  const cleaned = path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  return cleaned.length === 0 ? "/" : cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}
