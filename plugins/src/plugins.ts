import { satisfies } from "@obx/project";

export class PluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginError";
  }
}

export type PluginPermission =
  | "file.read"
  | "file.write"
  | "network"
  | "native"
  | "scripting"
  | "rendering"
  | "physics"
  | "audio";

export const pluginPermissions: PluginPermission[] = [
  "file.read",
  "file.write",
  "network",
  "native",
  "scripting",
  "rendering",
  "physics",
  "audio",
];

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  engine: string;
  entry: string;
  permissions: PluginPermission[];
  dependencies: Record<string, string>;
  license: string;
  description: string;
}

export type ManifestInput = Partial<PluginManifest> & { id: string; name: string };

export function parsePluginManifest(raw: unknown): PluginManifest {
  if (typeof raw !== "object" || raw === null) throw new PluginError("invalid plugin manifest");
  const data = raw as ManifestInput;
  if (!/^[a-z][a-z0-9-]*$/.test(data.id ?? "")) throw new PluginError(`invalid plugin id ${data.id}`);
  if (!data.name) throw new PluginError("plugin manifest missing name");
  const version = data.version ?? "0.1.0";
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new PluginError(`invalid plugin version ${version}`);
  const permissions: PluginPermission[] = [];
  for (const permission of data.permissions ?? []) {
    if (!pluginPermissions.includes(permission)) throw new PluginError(`unknown permission ${permission}`);
    permissions.push(permission);
  }
  return {
    id: data.id,
    name: data.name,
    version,
    engine: data.engine ?? "*",
    entry: data.entry ?? "index.js",
    permissions,
    dependencies: { ...(data.dependencies ?? {}) },
    license: data.license ?? "MIT",
    description: data.description ?? "",
  };
}

export interface PluginApi {
  log: (message: string) => void;
  can: (permission: PluginPermission) => boolean;
  guard: (permission: PluginPermission, action: () => void) => void;
}

export interface PluginModule {
  onLoad?: (api: PluginApi) => void;
  onStart?: () => void;
  onStop?: () => void;
  onTick?: (tick: number) => void;
}

export type PluginFactory = (api: PluginApi) => PluginModule;

export class PluginSandbox {
  private readonly granted: Set<PluginPermission>;
  private readonly violationLog: string[] = [];

  constructor(permissions: PluginPermission[]) {
    this.granted = new Set(permissions);
  }

  can(permission: PluginPermission): boolean {
    return this.granted.has(permission);
  }

  guard(permission: PluginPermission, action: () => void): void {
    if (!this.granted.has(permission)) {
      this.violationLog.push(permission);
      throw new PluginError(`permission denied: ${permission}`);
    }
    action();
  }

  get violations(): string[] {
    return [...this.violationLog];
  }
}

interface PluginEntry {
  manifest: PluginManifest;
  factory: PluginFactory;
  module: PluginModule | null;
  sandbox: PluginSandbox;
  state: "registered" | "loaded" | "started" | "stopped";
  errors: string[];
}

export class PluginLoader {
  private readonly entries = new Map<string, PluginEntry>();
  private tickCount = 0;

  constructor(readonly options: { engineVersion?: string } = {}) {}

  register(manifest: PluginManifest, factory: PluginFactory): void {
    if (this.entries.has(manifest.id)) throw new PluginError(`plugin ${manifest.id} already registered`);
    const engineVersion = this.options.engineVersion ?? "1.0.0";
    if (manifest.engine !== "*" && !satisfies(engineVersion, manifest.engine)) {
      throw new PluginError(`plugin ${manifest.id} requires engine ${manifest.engine}`);
    }
    this.entries.set(manifest.id, {
      manifest,
      factory,
      module: null,
      sandbox: new PluginSandbox(manifest.permissions),
      state: "registered",
      errors: [],
    });
  }

  resolveOrder(): string[] {
    const state = new Map<string, number>();
    const order: string[] = [];
    const visit = (id: string, path: string[]): void => {
      const entry = this.entries.get(id);
      if (!entry) throw new PluginError(`missing dependency ${id}`);
      const current = state.get(id) ?? 0;
      if (current === 2) return;
      if (current === 1) throw new PluginError(`dependency cycle: ${[...path, id].join(" -> ")}`);
      state.set(id, 1);
      for (const dependency of Object.keys(entry.manifest.dependencies)) visit(dependency, [...path, id]);
      state.set(id, 2);
      order.push(id);
    };
    for (const id of this.entries.keys()) visit(id, []);
    return order;
  }

  load(id: string): PluginModule {
    const entry = this.entries.get(id);
    if (!entry) throw new PluginError(`unknown plugin ${id}`);
    if (entry.module) return entry.module;
    const api: PluginApi = {
      log: () => undefined,
      can: (permission) => entry.sandbox.can(permission),
      guard: (permission, action) => entry.sandbox.guard(permission, action),
    };
    try {
      entry.module = entry.factory(api);
      entry.module.onLoad?.(api);
      entry.state = "loaded";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      entry.errors.push(message);
      throw new PluginError(`plugin ${id} failed to load: ${message}`);
    }
    return entry.module;
  }

  loadAll(): string[] {
    return this.resolveOrder().map((id) => {
      this.load(id);
      return id;
    });
  }

  start(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) throw new PluginError(`unknown plugin ${id}`);
    if (!entry.module) this.load(id);
    try {
      entry.module!.onStart?.();
      entry.state = "started";
    } catch (error) {
      entry.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  stop(id: string): void {
    const entry = this.entries.get(id);
    if (!entry?.module) return;
    try {
      entry.module.onStop?.();
    } catch (error) {
      entry.errors.push(error instanceof Error ? error.message : String(error));
    }
    entry.state = "stopped";
  }

  startAll(): void {
    for (const id of this.resolveOrder()) this.start(id);
  }

  stopAll(): void {
    for (const id of [...this.entries.keys()].reverse()) this.stop(id);
  }

  tick(tick: number): void {
    this.tickCount = tick;
    for (const entry of this.entries.values()) {
      if (entry.state !== "started") continue;
      try {
        entry.module?.onTick?.(tick);
      } catch (error) {
        entry.errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  isActive(id: string): boolean {
    return this.entries.get(id)?.state === "started";
  }

  stateOf(id: string): string {
    return this.entries.get(id)?.state ?? "unknown";
  }

  errorsFor(id: string): string[] {
    return [...(this.entries.get(id)?.errors ?? [])];
  }

  sandboxFor(id: string): PluginSandbox | null {
    return this.entries.get(id)?.sandbox ?? null;
  }

  manifestFor(id: string): PluginManifest | null {
    return this.entries.get(id)?.manifest ?? null;
  }

  stats(): { registered: number; loaded: number; started: number; errors: number; violations: number; tick: number } {
    let loaded = 0;
    let started = 0;
    let errors = 0;
    let violations = 0;
    for (const entry of this.entries.values()) {
      if (entry.state === "loaded" || entry.state === "started" || entry.state === "stopped") loaded += 1;
      if (entry.state === "started") started += 1;
      errors += entry.errors.length;
      violations += entry.sandbox.violations.length;
    }
    return { registered: this.entries.size, loaded, started, errors, violations, tick: this.tickCount };
  }
}

export const PLUGINS_VERSION = "1.0.0";
