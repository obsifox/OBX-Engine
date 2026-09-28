export type SettingValue = string | number | boolean;

export interface ProjectDependency {
  name: string;
  version: string;
  optional?: boolean;
}

export interface ProjectManifest {
  format: number;
  name: string;
  version: string;
  engine: string;
  dependencies: ProjectDependency[];
  settings: Record<string, SettingValue>;
  plugins: string[];
}

export const CURRENT_FORMAT = 2;

export interface ManifestInput {
  name: string;
  version?: string;
  engine?: string;
  dependencies?: ProjectDependency[];
  settings?: Record<string, SettingValue>;
  plugins?: string[];
}

export const defaultSettings: Record<string, SettingValue> = {
  "render.width": 1280,
  "render.height": 720,
  "physics.gravity": -9.81,
  "editor.gridSnap": true,
  "locale.default": "en",
};

export const standardFolders = [
  "project",
  "assets",
  "scenes",
  "scripts",
  "shaders",
  "materials",
  "audio",
  "ui",
  "plugins",
  "config",
  "builds",
];

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

export function createManifest(input: ManifestInput): ProjectManifest {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(input.name)) {
    throw new ProjectError(`invalid project name ${input.name}`);
  }
  return {
    format: CURRENT_FORMAT,
    name: input.name,
    version: input.version ?? "0.1.0",
    engine: input.engine ?? "0.10.0",
    dependencies: [...(input.dependencies ?? [])],
    settings: { ...defaultSettings, ...(input.settings ?? {}) },
    plugins: [...(input.plugins ?? [])],
  };
}

export interface ProjectFile {
  path: string;
  content: string;
}

export class Project {
  manifest: ProjectManifest;
  readonly files = new Map<string, string>();

  constructor(manifest: ProjectManifest) {
    this.manifest = manifest;
    this.files.set("project.json", JSON.stringify(manifest, null, 2));
    for (const folder of standardFolders) {
      this.files.set(`${folder}/.keep`, "");
    }
  }

  static create(input: ManifestInput): Project {
    return new Project(createManifest(input));
  }

  static fromJson(json: string): Project {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new ProjectError("invalid project.json");
    }
    const manifest = migrateManifest(raw);
    return new Project(manifest);
  }

  get name(): string {
    return this.manifest.name;
  }

  setting<T extends SettingValue>(key: string, fallback: T): T {
    return (this.manifest.settings[key] as T | undefined) ?? fallback;
  }

  setSetting(key: string, value: SettingValue): void {
    this.manifest.settings[key] = value;
    this.files.set("project.json", JSON.stringify(this.manifest, null, 2));
  }

  resolve(path: string): string {
    const parts = path.split("/").filter((part) => part.length > 0 && part !== ".");
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "..") {
        if (stack.length === 0) throw new ProjectError(`path escapes project root: ${path}`);
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join("/");
  }

  writeFile(path: string, content: string): string {
    const resolved = this.resolve(path);
    this.files.set(resolved, content);
    return resolved;
  }

  readFile(path: string): string | null {
    return this.files.get(this.resolve(path)) ?? null;
  }

  listFiles(prefix = ""): string[] {
    const resolved = prefix === "" ? "" : this.resolve(prefix);
    return [...this.files.keys()].filter((path) => path.startsWith(resolved)).sort();
  }

  addDependency(dependency: ProjectDependency): void {
    const existing = this.manifest.dependencies.find((entry) => entry.name === dependency.name);
    if (existing) throw new ProjectError(`dependency ${dependency.name} already exists`);
    this.manifest.dependencies.push(dependency);
    this.files.set("project.json", JSON.stringify(this.manifest, null, 2));
  }

  checkDependencies(installed: Record<string, string>, required: Record<string, string> = {}): string[] {
    const issues: string[] = [];
    for (const dependency of this.manifest.dependencies) {
      const version = installed[dependency.name];
      if (!version) {
        if (!dependency.optional) issues.push(`missing dependency ${dependency.name}`);
        continue;
      }
      if (!satisfies(version, dependency.version)) {
        issues.push(`${dependency.name} ${version} does not satisfy ${dependency.version}`);
      }
    }
    for (const [name, range] of Object.entries(required)) {
      if (!satisfies(this.manifest.engine, range)) {
        issues.push(`engine ${this.manifest.engine} does not satisfy required ${range} (${name})`);
      }
    }
    return issues;
  }

  addPlugin(id: string): void {
    if (this.manifest.plugins.includes(id)) throw new ProjectError(`plugin ${id} already registered`);
    this.manifest.plugins.push(id);
    this.files.set("project.json", JSON.stringify(this.manifest, null, 2));
  }

  serialize(): string {
    return JSON.stringify(this.manifest, null, 2);
  }
}

export interface AssetRecord {
  path: string;
  type: string;
  meta: Record<string, SettingValue>;
}

export class AssetIndex {
  private readonly assets = new Map<string, AssetRecord>();

  register(record: AssetRecord): AssetRecord {
    const path = normalizeAssetPath(record.path);
    if (this.assets.has(path)) throw new ProjectError(`asset ${path} already registered`);
    const stored: AssetRecord = { ...record, path, meta: { ...record.meta } };
    this.assets.set(path, stored);
    return stored;
  }

  get(path: string): AssetRecord | null {
    return this.assets.get(normalizeAssetPath(path)) ?? null;
  }

  byType(type: string): AssetRecord[] {
    return [...this.assets.values()].filter((record) => record.type === type);
  }

  remove(path: string): boolean {
    return this.assets.delete(normalizeAssetPath(path));
  }

  get size(): number {
    return this.assets.size;
  }

  missing(project: Project): string[] {
    return [...this.assets.keys()].filter((path) => project.readFile(path) === null);
  }

  serialize(): string {
    return JSON.stringify([...this.assets.values()], null, 2);
  }

  restore(serialized: string): void {
    this.assets.clear();
    for (const record of JSON.parse(serialized) as AssetRecord[]) {
      this.assets.set(record.path, record);
    }
  }
}

function normalizeAssetPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

export function parseVersion(text: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  if (!match) throw new ProjectError(`invalid version ${text}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function satisfies(version: string, range: string): boolean {
  const cleanRange = range.replace(/^[\^~>=<\s]+/, "");
  const [a1, b1, c1] = parseVersion(version);
  const [a2, b2, c2] = parseVersion(cleanRange);
  if (range.startsWith("^")) return a1 === a2 && (b1 > b2 || (b1 === b2 && c1 >= c2));
  if (range.startsWith("~")) return a1 === a2 && b1 === b2 && c1 >= c2;
  if (range.startsWith(">=")) return a1 > a2 || (a1 === a2 && (b1 > b2 || (b1 === b2 && c1 >= c2)));
  return a1 === a2 && b1 === b2 && c1 === c2;
}

export function migrateManifest(raw: unknown): ProjectManifest {
  if (typeof raw !== "object" || raw === null) throw new ProjectError("invalid manifest");
  const data = raw as Partial<ProjectManifest> & { format?: number };
  const format = data.format ?? 1;
  if (format > CURRENT_FORMAT) throw new ProjectError(`manifest format ${format} is newer than ${CURRENT_FORMAT}`);
  if (!data.name) throw new ProjectError("manifest missing name");
  let manifest: ProjectManifest = {
    format,
    name: String(data.name),
    version: data.version ?? "0.1.0",
    engine: data.engine ?? "0.10.0",
    dependencies: data.dependencies ?? [],
    settings: data.settings ?? {},
    plugins: data.plugins ?? [],
  };
  if (format < 2) manifest = migrateV1ToV2(manifest);
  manifest.format = CURRENT_FORMAT;
  return manifest;
}

function migrateV1ToV2(manifest: ProjectManifest): ProjectManifest {
  const settings: Record<string, SettingValue> = {};
  for (const [key, value] of Object.entries(manifest.settings)) {
    settings[key === "width" ? "render.width" : key === "height" ? "render.height" : key] = value;
  }
  return {
    ...manifest,
    settings: { ...defaultSettings, ...settings },
  };
}

export const PROJECT_VERSION = "0.10.0";
