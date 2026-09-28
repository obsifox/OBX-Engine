export interface CommandContribution {
  id: string;
  title: string;
  run: (context: ExtensionContext) => unknown;
}

export interface PanelContribution {
  id: string;
  title: string;
  location: "left" | "right" | "bottom";
  order?: number;
}

export interface MenuContribution {
  id: string;
  menu: string;
  commandId: string;
  order?: number;
}

export interface InspectorContribution {
  type: string;
  priority?: number;
  describe: () => Array<{ path: string; label: string; kind: string; options?: string[] }>;
}

export interface ToolContribution {
  id: string;
  label: string;
  run: (context: ExtensionContext) => unknown;
}

export interface GizmoContribution {
  id: string;
  nodeType: string;
  draw: (context: ExtensionContext) => unknown;
}

export interface ImporterContribution {
  id: string;
  extensions: string[];
  import: (source: string) => unknown;
}

export interface AssetTypeContribution {
  type: string;
  extensions: string[];
}

export interface NodeTypeContribution {
  type: string;
  create: (name: string) => unknown;
}

export interface ExtensionContributions {
  commands?: CommandContribution[];
  panels?: PanelContribution[];
  menus?: MenuContribution[];
  inspectors?: InspectorContribution[];
  tools?: ToolContribution[];
  gizmos?: GizmoContribution[];
  importers?: ImporterContribution[];
  assetTypes?: AssetTypeContribution[];
  nodeTypes?: NodeTypeContribution[];
}

export interface EditorExtension {
  id: string;
  name: string;
  version: string;
  contributions: ExtensionContributions;
  activate?: (context: ExtensionContext) => void;
  deactivate?: () => void;
}

export interface ExtensionContext {
  extensionId: string;
  state: Map<string, unknown>;
  log: (message: string) => void;
  executeCommand: (id: string) => unknown;
}

export class ExtensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionError";
  }
}

export interface RegistryOptions {
  log?: (extensionId: string, message: string) => void;
}

export class ExtensionRegistry {
  private readonly extensions = new Map<string, EditorExtension>();
  private readonly activated = new Set<string>();
  private readonly states = new Map<string, Map<string, unknown>>();
  private readonly errors = new Map<string, string[]>();

  constructor(readonly options: RegistryOptions = {}) {}

  register(extension: EditorExtension): void {
    if (this.extensions.has(extension.id)) {
      throw new ExtensionError(`extension ${extension.id} already registered`);
    }
    this.extensions.set(extension.id, extension);
  }

  unregister(id: string): boolean {
    const extension = this.extensions.get(id);
    if (!extension) return false;
    this.deactivate(id);
    this.extensions.delete(id);
    this.errors.delete(id);
    return true;
  }

  activate(id: string): ExtensionContext {
    const extension = this.extensions.get(id);
    if (!extension) throw new ExtensionError(`unknown extension ${id}`);
    const context = this.contextFor(id);
    if (!this.activated.has(id)) {
      this.guard(id, () => extension.activate?.(context));
      this.activated.add(id);
    }
    return context;
  }

  deactivate(id: string): boolean {
    const extension = this.extensions.get(id);
    if (!extension || !this.activated.has(id)) return false;
    this.guard(id, () => extension.deactivate?.());
    this.activated.delete(id);
    return true;
  }

  isActive(id: string): boolean {
    return this.activated.has(id);
  }

  executeCommand(id: string): unknown {
    const command = this.findCommand(id);
    if (!command) throw new ExtensionError(`unknown command ${id}`);
    const owner = this.ownerOfCommand(id)!;
    this.activate(owner.id);
    return this.guard(owner.id, () => command.run(this.contextFor(owner.id))) ?? null;
  }

  commands(): CommandContribution[] {
    return this.collect((extension) => extension.contributions.commands ?? []);
  }

  panels(location?: PanelContribution["location"]): PanelContribution[] {
    return this.collect((extension) => extension.contributions.panels ?? [])
      .filter((panel) => !location || panel.location === location)
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  menus(menu?: string): MenuContribution[] {
    return this.collect((extension) => extension.contributions.menus ?? [])
      .filter((entry) => !menu || entry.menu === menu)
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  inspectorFor(type: string): InspectorContribution | null {
    const candidates = this.collect((extension) => extension.contributions.inspectors ?? []).filter(
      (inspector) => inspector.type === type,
    );
    candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return candidates[0] ?? null;
  }

  tools(): ToolContribution[] {
    return this.collect((extension) => extension.contributions.tools ?? []);
  }

  gizmoFor(nodeType: string): GizmoContribution | null {
    return this.collect((extension) => extension.contributions.gizmos ?? []).find((gizmo) => gizmo.nodeType === nodeType) ?? null;
  }

  importerFor(path: string): ImporterContribution | null {
    const dot = path.lastIndexOf(".");
    const extension = dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
    return (
      this.collect((entry) => entry.contributions.importers ?? []).find((importer) =>
        importer.extensions.includes(extension),
      ) ?? null
    );
  }

  assetTypeFor(path: string): AssetTypeContribution | null {
    const dot = path.lastIndexOf(".");
    const extension = dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
    return (
      this.collect((entry) => entry.contributions.assetTypes ?? []).find((asset) =>
        asset.extensions.includes(extension),
      ) ?? null
    );
  }

  createNode(type: string, name: string): unknown {
    const contribution = this.collect((entry) => entry.contributions.nodeTypes ?? []).find((node) => node.type === type);
    if (!contribution) throw new ExtensionError(`unknown node type ${type}`);
    return contribution.create(name);
  }

  errorsFor(id: string): string[] {
    return [...(this.errors.get(id) ?? [])];
  }

  get size(): number {
    return this.extensions.size;
  }

  get activeCount(): number {
    return this.activated.size;
  }

  stats(): Record<string, { active: boolean; errors: number; contributions: number }> {
    const out: Record<string, { active: boolean; errors: number; contributions: number }> = {};
    for (const [id, extension] of this.extensions) {
      const contributions = Object.values(extension.contributions).reduce((total, list) => total + (list?.length ?? 0), 0);
      out[id] = {
        active: this.activated.has(id),
        errors: this.errors.get(id)?.length ?? 0,
        contributions,
      };
    }
    return out;
  }

  private collect<T>(pick: (extension: EditorExtension) => T[]): T[] {
    const out: T[] = [];
    for (const extension of this.extensions.values()) out.push(...pick(extension));
    return out;
  }

  private findCommand(id: string): CommandContribution | null {
    return this.collect((extension) => extension.contributions.commands ?? []).find((command) => command.id === id) ?? null;
  }

  private ownerOfCommand(id: string): EditorExtension | null {
    return (
      [...this.extensions.values()].find((extension) =>
        (extension.contributions.commands ?? []).some((command) => command.id === id),
      ) ?? null
    );
  }

  private contextFor(id: string): ExtensionContext {
    if (!this.states.has(id)) this.states.set(id, new Map());
    return {
      extensionId: id,
      state: this.states.get(id)!,
      log: (message) => this.options.log?.(id, message),
      executeCommand: (commandId) => this.executeCommand(commandId),
    };
  }

  private guard<T>(id: string, run: () => T): T | null {
    try {
      return run();
    } catch (error) {
      const message = (error as Error).message;
      const list = this.errors.get(id) ?? [];
      list.push(message);
      this.errors.set(id, list);
      return null;
    }
  }
}

export const EXTENSIONS_VERSION = "0.10.0";
