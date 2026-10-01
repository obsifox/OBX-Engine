import { analyzeDependencies, bundleModules, parseImports } from "./build.js";
import {
  compileShaderPackage,
  cookMesh,
  cookTexture,
  packageRuntimeAssets,
  stripDependencies,
  type CompiledShaderPackage,
  type CookedMesh,
  type CookedTexture,
  type DependencyNode,
  type MeshCookInput,
  type RuntimePackage,
  type RuntimePackageEntry,
  type TextureCookInput,
} from "./cook.js";
import { signBuild, type BuildFileEntry, type SignedBuildManifest } from "./signing.js";

export type BuildStageName =
  | "source"
  | "dependencies"
  | "cooking"
  | "compilation"
  | "linking"
  | "packaging"
  | "signing"
  | "final";

export interface ProductionBuildInput {
  version: string;
  sources: Record<string, string>;
  textures: TextureCookInput[];
  meshes: MeshCookInput[];
  shaders: { name: string; stage: "vertex" | "fragment"; source: string }[];
  roots: string[];
  target: string;
  secret: string;
  epochStartUnix: number;
}

export interface StageRecord {
  stage: BuildStageName;
  ok: boolean;
  durationMs: number;
  detail: string;
}

export interface ProductionBuildResult {
  ok: boolean;
  stages: StageRecord[];
  manifest: SignedBuildManifest;
  runtimePackage: RuntimePackage;
  bundle: string;
  textures: CookedTexture[];
  meshes: CookedMesh[];
  shaders: CompiledShaderPackage[];
  stripped: string[];
  reproducibilityHash: string;
}

const STAGE_ORDER: BuildStageName[] = ["source", "dependencies", "cooking", "compilation", "linking", "packaging", "signing", "final"];

export class ProductionBuildPipeline {
  readonly history: ProductionBuildResult[] = [];

  run(input: ProductionBuildInput): ProductionBuildResult {
    const stages: StageRecord[] = [];
    let clock = 0;
    const record = (stage: BuildStageName, ok: boolean, detail: string, duration = 1): void => {
      clock += duration;
      stages.push({ stage, ok, durationMs: duration, detail });
    };

    const sourceEntries = Object.keys(input.sources).sort();
    record("source", sourceEntries.length > 0, `${sourceEntries.length} modules`);

    const dependencyReport = analyzeDependencies(input.sources);
    const parsedImports = sourceEntries.flatMap((name) => parseImports(input.sources[name]!).map((spec) => ({ id: name, dependencies: [spec] })));
    const nodes: DependencyNode[] = sourceEntries.map((name) => ({
      id: name,
      dependencies: parsedImports.filter((entry) => entry.id === name).flatMap((entry) => entry.dependencies),
    }));
    const missing = parsedImports.flatMap((entry) => entry.dependencies).filter((spec) => !(spec in input.sources));
    const stripped = stripDependencies(nodes, input.roots);
    record("dependencies", missing.length === 0, `cycles=${dependencyReport.cycles.length} missing=${missing.length} stripped=${stripped.stripped.length}`);

    const textures = input.textures.map(cookTexture);
    const meshes = input.meshes.map(cookMesh);
    record("cooking", true, `${textures.length} textures ${meshes.length} meshes cooked`);

    const shaders = input.shaders.map((shader) => compileShaderPackage(shader.name, shader.stage, shader.source));
    record("compilation", true, `${shaders.length} shader packages`);

    const keptSources: Record<string, string> = {};
    for (const id of stripped.kept) {
      if (input.sources[id] !== undefined) keptSources[id] = input.sources[id]!;
    }
    const bundle = bundleModules(keptSources);
    record("linking", bundle.length > 0, `bundle ${bundle.length} bytes`);

    const packageEntries: RuntimePackageEntry[] = [
      ...textures.map((texture) => ({
        name: texture.name,
        kind: "texture" as const,
        bytes: Uint8Array.from(texture.mips.flatMap((mip) => [...mip.data])),
      })),
      ...meshes.map((mesh) => ({
        name: mesh.name,
        kind: "mesh" as const,
        bytes: Uint8Array.from([...mesh.positions, ...mesh.normals, ...mesh.uvs, ...mesh.indices].map((value) => Math.round(value))),
      })),
      ...shaders.map((shader) => ({
        name: shader.name,
        kind: "shader" as const,
        bytes: Uint8Array.from(shader.tokens.join(" ").split("").map((char) => char.charCodeAt(0) & 255)),
      })),
      { name: "bundle.js", kind: "data" as const, bytes: Uint8Array.from(bundle.split("").map((char) => char.charCodeAt(0) & 255)) },
    ];
    const runtimePackage = packageRuntimeAssets(packageEntries);
    record("packaging", true, `${packageEntries.length} entries ${runtimePackage.totalCookedBytes} bytes`);

    const files: BuildFileEntry[] = [
      ...sourceEntries.filter((id) => stripped.kept.includes(id)).map((path) => ({ path, content: input.sources[path]! })),
      { path: "bundle.js", content: bundle },
      { path: "package.bin", content: runtimePackage.blob },
    ];
    const manifest = signBuild(input.version, files, input.secret, input.epochStartUnix);
    record("signing", manifest.signature.length === 64, `tree ${manifest.treeHash.slice(0, 12)}`);

    const reproducibilityHash = manifest.treeHash;
    record("final", true, `target=${input.target} hash=${reproducibilityHash.slice(0, 12)}`);

    const ok = stages.length === STAGE_ORDER.length && stages.every((stage, index) => stage.stage === STAGE_ORDER[index] && stage.ok);
    const result: ProductionBuildResult = {
      ok,
      stages,
      manifest,
      runtimePackage,
      bundle,
      textures,
      meshes,
      shaders,
      stripped: stripped.stripped,
      reproducibilityHash,
    };
    this.history.push(result);
    return result;
  }

  isReproducible(a: ProductionBuildResult, b: ProductionBuildResult): boolean {
    return a.reproducibilityHash === b.reproducibilityHash;
  }
}
