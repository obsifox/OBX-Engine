import type { CompiledShader, ShaderSource } from "../device.js";
import { ShaderCompiler } from "../shaders/compiler.js";
import { applyDefines, variantKeyOf } from "../shaders/grammar.js";

export function isCompiledShader(value: unknown): value is CompiledShader {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CompiledShader>;
  return (
    typeof candidate.name === "string" &&
    (candidate.stage === "vertex" || candidate.stage === "fragment") &&
    typeof candidate.variantKey === "string" &&
    typeof candidate.destroyed === "boolean" &&
    typeof candidate.destroy === "function" &&
    typeof candidate.reflection === "object" &&
    candidate.reflection !== null &&
    Array.isArray(candidate.reflection.uniforms) &&
    Array.isArray(candidate.reflection.attributes) &&
    Array.isArray(candidate.reflection.samplers)
  );
}

export interface ShaderCacheStats {
  hits: number;
  misses: number;
  size: number;
  evictions: number;
}

export class ShaderCache {
  #compiler: ShaderCompiler;
  #entries = new Map<string, CompiledShader>();
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(compiler: ShaderCompiler = new ShaderCompiler()) {
    this.#compiler = compiler;
  }

  acquire(source: ShaderSource): CompiledShader {
    const previewKey = variantKeyOf(source, applyDefines(source.code, source.defines ?? {}));
    const existing = this.#entries.get(previewKey);
    if (existing && !existing.destroyed) {
      this.#hits += 1;
      return existing;
    }
    this.#misses += 1;
    const compiled = this.#compiler.compile(source);
    this.#entries.set(compiled.variantKey, compiled);
    return compiled;
  }

  has(source: ShaderSource): boolean {
    const key = variantKeyOf(source, applyDefines(source.code, source.defines ?? {}));
    const entry = this.#entries.get(key);
    return Boolean(entry && !entry.destroyed);
  }

  evict(variantKey: string): boolean {
    const removed = this.#entries.delete(variantKey);
    if (removed) this.#evictions += 1;
    return removed;
  }

  clear(): void {
    this.#evictions += this.#entries.size;
    this.#entries.clear();
  }

  size(): number {
    return [...this.#entries.values()].filter((entry) => !entry.destroyed).length;
  }

  stats(): ShaderCacheStats {
    return { hits: this.#hits, misses: this.#misses, size: this.size(), evictions: this.#evictions };
  }
}
