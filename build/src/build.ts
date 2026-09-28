import { fnv1a, packBitsEncode, packBitsDecode, toBase64, fromBase64 } from "@obx/save";

export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildError";
  }
}

export function hashContent(...parts: string[]): string {
  let hash = "";
  for (const part of parts) hash = fnv1a(part + hash);
  return hash.padStart(8, "0");
}

export interface BuildNodeSpec {
  id: string;
  inputs: string[];
  outputs: string[];
  run: (files: Map<string, string>) => void;
}

export class BuildGraph {
  private readonly nodes = new Map<string, BuildNodeSpec>();
  private readonly edges = new Map<string, string[]>();
  private readonly dirtyNodes = new Set<string>();

  addNode(spec: BuildNodeSpec): void {
    if (this.nodes.has(spec.id)) throw new BuildError(`duplicate node ${spec.id}`);
    this.nodes.set(spec.id, spec);
    this.edges.set(spec.id, []);
    this.dirtyNodes.add(spec.id);
  }

  addEdge(from: string, to: string): void {
    if (!this.nodes.has(from) || !this.nodes.has(to)) throw new BuildError("unknown node in edge");
    this.edges.get(from)!.push(to);
    this.dirtyNodes.add(to);
  }

  order(): string[] {
    const state = new Map<string, number>();
    const result: string[] = [];
    const visit = (id: string, path: string[]): void => {
      const current = state.get(id) ?? 0;
      if (current === 2) return;
      if (current === 1) throw new BuildError(`cycle detected: ${[...path, id].join(" -> ")}`);
      state.set(id, 1);
      for (const next of this.edges.get(id) ?? []) visit(next, [...path, id]);
      state.set(id, 2);
      result.push(id);
    };
    for (const id of this.nodes.keys()) visit(id, []);
    return result.reverse();
  }

  markDirty(id: string): void {
    if (!this.nodes.has(id)) throw new BuildError(`unknown node ${id}`);
    this.dirtyNodes.add(id);
    for (const next of this.edges.get(id) ?? []) this.markDirty(next);
  }

  build(files: Map<string, string>): { ran: string[]; skipped: string[] } {
    const ran: string[] = [];
    const skipped: string[] = [];
    for (const id of this.order()) {
      if (!this.dirtyNodes.has(id)) {
        skipped.push(id);
        continue;
      }
      this.nodes.get(id)!.run(files);
      this.dirtyNodes.delete(id);
      ran.push(id);
    }
    return { ran, skipped };
  }

  get dirty(): string[] {
    return [...this.dirtyNodes];
  }

  get size(): number {
    return this.nodes.size;
  }
}

export class BuildCache {
  private readonly store = new Map<string, string>();
  hits = 0;
  misses = 0;

  get(key: string): string | null {
    const value = this.store.get(key) ?? null;
    if (value === null) this.misses += 1;
    else this.hits += 1;
    return value;
  }

  set(key: string, value: string): void {
    this.store.set(key, value);
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get size(): number {
    return this.store.size;
  }
}

export function parseImports(code: string): string[] {
  const imports: string[] = [];
  const pattern = /(?:import|export)\s+[^"']*?from\s+"([^"]+)"|import\s+"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    const spec = match[1] ?? match[2];
    if (spec) imports.push(spec);
  }
  return [...new Set(imports)];
}

export interface DependencyReport {
  order: string[];
  cycles: string[][];
}

export function analyzeDependencies(modules: Record<string, string>): DependencyReport {
  const graph = new Map<string, string[]>();
  for (const [name, code] of Object.entries(modules)) {
    graph.set(name, parseImports(code).filter((spec) => spec in modules));
  }
  const state = new Map<string, number>();
  const order: string[] = [];
  const cycles: string[][] = [];
  const path: string[] = [];
  const visit = (name: string): void => {
    const current = state.get(name) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const start = path.indexOf(name);
      cycles.push([...path.slice(start >= 0 ? start : 0), name]);
      return;
    }
    state.set(name, 1);
    path.push(name);
    for (const next of graph.get(name) ?? []) visit(next);
    path.pop();
    state.set(name, 2);
    order.push(name);
  };
  for (const name of Object.keys(modules)) visit(name);
  return { order, cycles };
}

export function bundleModules(modules: Record<string, string>): string {
  const { order, cycles } = analyzeDependencies(modules);
  if (cycles.length > 0) throw new BuildError(`module cycle: ${cycles[0]!.join(" -> ")}`);
  const parts = order.map((name) => {
    const body = modules[name]!;
    return `__obx.register(${JSON.stringify(name)}, function (exports, module) {\n${body}\n});`;
  });
  return `var __obx = (function () {
var registry = {};
var cache = {};
function register(name, factory) { registry[name] = factory; }
function require(name) {
  if (cache[name]) return cache[name].exports;
  var module = { exports: {} };
  cache[name] = module;
  registry[name](module.exports, module);
  return module.exports;
}
return { register: register, require: require };
})();
${parts.join("\n")}
`;
}

export interface AssetRecord {
  path: string;
  type: string;
  size: number;
  compressedSize: number;
  data: string;
}

export function processAssets(files: Record<string, string>): AssetRecord[] {
  return Object.entries(files)
    .map(([path, content]) => {
      const packed = packBitsEncode(content);
      return {
        path,
        type: path.split(".").pop() ?? "bin",
        size: content.length,
        compressedSize: packed.length,
        data: toBase64(packed),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

export function extractAsset(record: AssetRecord): string {
  return packBitsDecode(fromBase64(record.data));
}

export function optimizeCode(code: string): string {
  return code
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export type ExportTargetName = "windows" | "linux" | "android" | "web" | "server";

export interface ExportTarget {
  name: ExportTargetName;
  platform: string;
  entryFile: string;
  runtimeFiles: string[];
  config: Record<string, string | number | boolean>;
  artifactExtension: string;
}

const runtimeStub = "globalThis.OBX_RUNTIME = { start: function () { return true; } };";

export const exportTargets: Record<ExportTargetName, ExportTarget> = {
  windows: {
    name: "windows",
    platform: "win32",
    entryFile: "bin/game.exe",
    runtimeFiles: ["runtime/obx-runtime.js", "runtime/win32-glue.js"],
    config: { windowed: true, arch: "x64" },
    artifactExtension: ".exe",
  },
  linux: {
    name: "linux",
    platform: "linux",
    entryFile: "bin/game",
    runtimeFiles: ["runtime/obx-runtime.js", "runtime/linux-glue.js"],
    config: { windowed: true, arch: "x64" },
    artifactExtension: "",
  },
  android: {
    name: "android",
    platform: "android",
    entryFile: "bin/game.apk",
    runtimeFiles: ["runtime/obx-runtime.js", "runtime/android-glue.js"],
    config: { minSdk: 24, orientation: "landscape" },
    artifactExtension: ".apk",
  },
  web: {
    name: "web",
    platform: "browser",
    entryFile: "index.html",
    runtimeFiles: ["runtime/obx-runtime.js", "runtime/web-glue.js"],
    config: { wasm: true, serviceWorker: false },
    artifactExtension: ".html",
  },
  server: {
    name: "server",
    platform: "headless",
    entryFile: "bin/game-server",
    runtimeFiles: ["runtime/obx-runtime.js", "runtime/headless-glue.js"],
    config: { headless: true, port: 7777 },
    artifactExtension: "",
  },
};

export function exportTarget(name: ExportTargetName): ExportTarget {
  const target = exportTargets[name];
  if (!target) throw new BuildError(`unknown export target ${name}`);
  return target;
}

export interface BuildInput {
  name: string;
  version: string;
  entry: string;
  files: Map<string, string>;
  assets?: string[];
}

export interface BuildResult {
  target: ExportTargetName;
  steps: string[];
  files: Map<string, string>;
  manifest: string;
  checksums: Record<string, string>;
  cacheHits: number;
  totalBytes: number;
}

export interface BuildPipelineOptions {
  cache?: BuildCache;
  sign?: boolean;
}

export class BuildPipeline {
  readonly cache: BuildCache;

  constructor(readonly options: BuildPipelineOptions = {}) {
    this.cache = options.cache ?? new BuildCache();
  }

  run(input: BuildInput, targetName: ExportTargetName): BuildResult {
    const target = exportTarget(targetName);
    const steps: string[] = [];
    const files = new Map<string, string>();

    const moduleNames: string[] = [];
    for (const [path, content] of input.files) {
      if (!path.endsWith(".js")) continue;
      moduleNames.push(path);
      files.set(path, content);
    }
    steps.push(`analyze(${moduleNames.length})`);

    for (const path of moduleNames) files.set(path, files.get(path)!);
    steps.push(`compile(${moduleNames.length})`);

    const modules: Record<string, string> = {};
    for (const path of moduleNames) modules[path] = input.files.get(path)!;
    const bundled = bundleModules(modules);
    steps.push(`bundle(${bundled.length})`);

    const assetPaths = input.assets ?? [...input.files.keys()].filter((path) => path.startsWith("assets/"));
    const assetRecords = processAssets(
      Object.fromEntries(assetPaths.map((path) => [path, input.files.get(path) ?? ""])),
    );
    steps.push(`assets(${assetRecords.length})`);

    const cacheKey = hashContent(input.name, input.version, targetName, bundled);
    let finalBundle = this.cache.get(cacheKey);
    const cacheHits = this.cache.hits;
    if (finalBundle === null) {
      finalBundle = optimizeCode(bundled);
      this.cache.set(cacheKey, finalBundle);
    }
    steps.push(`optimize(${finalBundle.length})`);

    for (const runtimeFile of target.runtimeFiles) {
      files.set(runtimeFile, runtimeStub);
    }
    files.set("bundle.js", finalBundle);
    steps.push(`runtime(${target.runtimeFiles.length})`);

    const manifest = JSON.stringify({
      name: input.name,
      version: input.version,
      target: target.name,
      platform: target.platform,
      entry: target.entryFile,
      config: target.config,
      modules: moduleNames.length,
      assets: assetRecords.length,
    }, null, 2);
    files.set("manifest.json", manifest);
    steps.push("package");

    const checksums: Record<string, string> = {};
    for (const [path, content] of files) checksums[path] = hashContent(content);
    if (this.options.sign !== false) {
      files.set("checksums.json", JSON.stringify(checksums, null, 2));
      steps.push("sign");
    }

    files.set(
      "build-info.json",
      JSON.stringify({ name: input.name, version: input.version, target: target.name, steps }, null, 2),
    );
    steps.push("release");

    let totalBytes = 0;
    for (const content of files.values()) totalBytes += content.length;

    return {
      target: targetName,
      steps,
      files,
      manifest,
      checksums,
      cacheHits: Math.max(0, cacheHits),
      totalBytes,
    };
  }
}

export function packageProject(input: BuildInput, result: BuildResult): string {
  return JSON.stringify({
    name: input.name,
    version: input.version,
    target: result.target,
    files: [...result.files.keys()].sort(),
    totalBytes: result.totalBytes,
  }, null, 2);
}

export const BUILD_VERSION = "0.95.0";
