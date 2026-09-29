import { fnv1a, toBase64, fromBase64 } from "@obx/save";
import { satisfies } from "@obx/project";

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export type PackageKind = "engine" | "plugin" | "template" | "asset" | "native";

export const packageKinds: PackageKind[] = ["engine", "plugin", "template", "asset", "native"];

export interface PackageMetadata {
  name: string;
  version: string;
  kind: PackageKind;
  license: string;
  dependencies: Record<string, string>;
  compatibility: string;
  description: string;
}

export interface PublishedPackage {
  metadata: PackageMetadata;
  content: string;
  checksum: string;
  publishedTick: number;
}

export function checksumOf(content: string): string {
  return fnv1a(content);
}

function matches(version: string, range: string): boolean {
  if (range === "*" || range === "") return true;
  try {
    return satisfies(version, range);
  } catch {
    return false;
  }
}

export function parseMetadata(raw: unknown): PackageMetadata {
  if (typeof raw !== "object" || raw === null) throw new RegistryError("invalid package metadata");
  const data = raw as Partial<PackageMetadata>;
  if (!/^[a-z][a-z0-9-]*$/.test(data.name ?? "")) throw new RegistryError(`invalid package name ${data.name}`);
  if (!/^\d+\.\d+\.\d+$/.test(data.version ?? "")) throw new RegistryError(`invalid package version ${data.version}`);
  const kind = data.kind ?? "asset";
  if (!packageKinds.includes(kind)) throw new RegistryError(`invalid package kind ${kind}`);
  return {
    name: data.name!,
    version: data.version!,
    kind,
    license: data.license ?? "MIT",
    dependencies: { ...(data.dependencies ?? {}) },
    compatibility: data.compatibility ?? "*",
    description: data.description ?? "",
  };
}

export class Registry {
  private readonly packages = new Map<string, PublishedPackage[]>();
  private clock = 0;

  publish(metadata: PackageMetadata, content: string): PublishedPackage {
    const validated = parseMetadata(metadata);
    const versions = this.packages.get(validated.name) ?? [];
    if (versions.some((entry) => entry.metadata.version === validated.version)) {
      throw new RegistryError(`package ${validated.name}@${validated.version} already published`);
    }
    this.clock += 1;
    const record: PublishedPackage = {
      metadata: validated,
      content,
      checksum: checksumOf(content),
      publishedTick: this.clock,
    };
    versions.push(record);
    this.packages.set(validated.name, versions);
    return record;
  }

  versions(name: string): string[] {
    return (this.packages.get(name) ?? []).map((entry) => entry.metadata.version);
  }

  get(name: string, version: string): PublishedPackage | null {
    return (this.packages.get(name) ?? []).find((entry) => entry.metadata.version === version) ?? null;
  }

  best(name: string, range: string): PublishedPackage | null {
    const candidates = (this.packages.get(name) ?? [])
      .filter((entry) => matches(entry.metadata.version, range))
      .sort((a, b) => (a.publishedTick > b.publishedTick ? -1 : 1));
    return candidates[0] ?? null;
  }

  list(kind?: PackageKind): PackageMetadata[] {
    const out: PackageMetadata[] = [];
    for (const versions of this.packages.values()) {
      for (const entry of versions) {
        if (!kind || entry.metadata.kind === kind) out.push(entry.metadata);
      }
    }
    return out.sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  verify(name: string, version: string, content: string): boolean {
    const record = this.get(name, version);
    if (!record) throw new RegistryError(`unknown package ${name}@${version}`);
    return record.checksum === checksumOf(content);
  }

  sign(record: PublishedPackage): string {
    return toBase64(`${record.metadata.name}@${record.metadata.version}:${record.checksum}`);
  }

  verifySignature(record: PublishedPackage, signature: string): boolean {
    return signature === this.sign(record);
  }
}

export interface ResolvedPackage {
  name: string;
  version: string;
  checksum: string;
  dependencies: string[];
}

export interface Lockfile {
  format: number;
  packages: Record<string, { version: string; checksum: string }>;
}

export class PackageManager {
  private readonly installed = new Map<string, PublishedPackage>();

  constructor(
    readonly registry: Registry,
    readonly options: { engineVersion?: string } = {},
  ) {}

  install(name: string, range: string): ResolvedPackage {
    const record = this.registry.best(name, range);
    if (!record) throw new RegistryError(`no version of ${name} matches ${range}`);
    const engineVersion = this.options.engineVersion ?? "1.0.0";
    if (!matches(engineVersion, record.metadata.compatibility)) {
      throw new RegistryError(`${name}@${record.metadata.version} requires engine ${record.metadata.compatibility}`);
    }
    for (const [dependency, dependencyRange] of Object.entries(record.metadata.dependencies)) {
      if (!this.installed.has(dependency)) this.install(dependency, dependencyRange);
    }
    this.installed.set(record.metadata.name, record);
    return {
      name: record.metadata.name,
      version: record.metadata.version,
      checksum: record.checksum,
      dependencies: Object.keys(record.metadata.dependencies),
    };
  }

  resolveTree(root: Record<string, string>): string[] {
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (name: string, range: string, path: string[]): void => {
      if (seen.has(name)) return;
      if (path.includes(name)) throw new RegistryError(`dependency cycle: ${[...path, name].join(" -> ")}`);
      const record = this.registry.best(name, range);
      if (!record) throw new RegistryError(`no version of ${name} matches ${range}`);
      for (const [dependency, dependencyRange] of Object.entries(record.metadata.dependencies)) {
        visit(dependency, dependencyRange, [...path, name]);
      }
      seen.add(name);
      order.push(name);
    };
    for (const [name, range] of Object.entries(root)) visit(name, range, []);
    return order;
  }

  lock(): Lockfile {
    const packages: Lockfile["packages"] = {};
    for (const [name, record] of [...this.installed].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      packages[name] = { version: record.metadata.version, checksum: record.checksum };
    }
    return { format: 1, packages };
  }

  restore(lockfile: Lockfile): string[] {
    const restored: string[] = [];
    for (const [name, entry] of Object.entries(lockfile.packages)) {
      const record = this.registry.get(name, entry.version);
      if (!record) throw new RegistryError(`lock references missing ${name}@${entry.version}`);
      if (record.checksum !== entry.checksum) throw new RegistryError(`checksum mismatch for ${name}@${entry.version}`);
      this.installed.set(name, record);
      restored.push(name);
    }
    return restored;
  }

  installedNames(): string[] {
    return [...this.installed.keys()].sort();
  }
}

export interface TemplateDefinition {
  id: string;
  name: string;
  kind: PackageKind;
  description: string;
  files: Record<string, string>;
}

export function parseTemplate(raw: unknown): TemplateDefinition {
  if (typeof raw !== "object" || raw === null) throw new RegistryError("invalid template");
  const data = raw as Partial<TemplateDefinition>;
  if (!/^[a-z0-9-]+$/.test(data.id ?? "")) throw new RegistryError(`invalid template id ${data.id}`);
  if (!data.name) throw new RegistryError("template missing name");
  const files = data.files ?? {};
  if (Object.keys(files).length === 0) throw new RegistryError(`template ${data.id} has no files`);
  return {
    id: data.id!,
    name: data.name,
    kind: data.kind ?? "template",
    description: data.description ?? "",
    files: { ...files },
  };
}

export function instantiateTemplate(template: TemplateDefinition, projectName: string): Map<string, string> {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(projectName)) throw new RegistryError(`invalid project name ${projectName}`);
  const files = new Map<string, string>();
  for (const [path, content] of Object.entries(template.files)) {
    files.set(path.replaceAll("{name}", projectName), content.replaceAll("{name}", projectName));
  }
  return files;
}

export const REGISTRY_VERSION = "1.0.0";
