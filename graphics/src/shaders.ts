import {
  GraphicsError,
  type AttributeReflection,
  type CompiledShader,
  type SamplerReflection,
  type ShaderLanguage,
  type ShaderReflection,
  type ShaderSource,
  type ShaderStage,
  type UniformReflection,
} from "./device.js";

export class ShaderCompileError extends GraphicsError {
  readonly line: number;
  readonly sourceName: string;

  constructor(message: string, sourceName: string, line: number) {
    super(`${sourceName}:${line}: ${message}`);
    this.name = "ShaderCompileError";
    this.sourceName = sourceName;
    this.line = line;
  }
}

const UNIFORM_SIZES: Record<string, number> = {
  float: 4,
  int: 4,
  vec2: 8,
  vec3: 12,
  vec4: 16,
  mat4: 64,
};

const WGSL_TYPE_MAP: Record<string, string> = {
  f32: "float",
  i32: "int",
  "vec2<f32>": "vec2",
  "vec3<f32>": "vec3",
  "vec4<f32>": "vec4",
  "mat4x4<f32>": "mat4",
};

export interface ParsedShader {
  uniforms: UniformReflection[];
  attributes: AttributeReflection[];
  samplers: SamplerReflection[];
  entryPoint: string;
  code: string;
}

function applyDefines(code: string, defines: Record<string, string | number | boolean>): string {
  let result = code;
  for (const [name, value] of Object.entries(defines)) {
    const pattern = new RegExp(`\\b${name}\\b`, "g");
    result = result.replace(pattern, String(value));
  }
  return result;
}

function variantKeyOf(source: ShaderSource, code: string): string {
  const defines = Object.entries(source.defines ?? {})
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join(",");
  return `${source.name}|${source.stage}|${source.language}|${defines}|${fnv(code)}`;
}

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class ShaderCompiler {
  compile(source: ShaderSource): CompiledShader {
    const code = applyDefines(source.code, source.defines ?? {});
    const parsed = this.#parse(source, code);
    const compiled = new CompiledShaderImpl(source, code, parsed, variantKeyOf(source, code));
    return compiled;
  }

  #parse(source: ShaderSource, code: string): ParsedShader {
    if (source.language === "obx") return this.#parseObx(source, code);
    if (source.language === "wgsl") return this.#parseWgsl(source, code);
    return this.#parseGlsl(source, code);
  }

  #parseObx(source: ShaderSource, code: string): ParsedShader {
    const uniforms: UniformReflection[] = [];
    const attributes: AttributeReflection[] = [];
    const samplers: SamplerReflection[] = [];
    let entryPoint = "main";
    const lines = code.split("\n");
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("//")) return;
      if (/^entry\s+(vertex|fragment)\s+\w+$/.test(line)) {
        const parts = line.split(/\s+/);
        if (parts[1] === source.stage) entryPoint = parts[2]!;
        return;
      }
      if (/^(entry|export)/.test(line)) return;
      const declaration = /^(\w+)\s+(\w+)\s+([\w[\]]+)$/.exec(line);
      if (!declaration) {
        throw new ShaderCompileError(`Unrecognized declaration: ${line}`, source.name, index + 1);
      }
      const [, keyword, type, name] = declaration as unknown as [string, string, string, string];
      if (keyword === "uniform") {
        if (type === "sampler2D") {
          samplers.push({ name, binding: samplers.length });
          return;
        }
        const size = UNIFORM_SIZES[type];
        if (size === undefined) {
          throw new ShaderCompileError(`Unknown uniform type: ${type}`, source.name, index + 1);
        }
        uniforms.push({ name, type, sizeBytes: size });
        return;
      }
      if (keyword === "attribute") {
        if (!type.startsWith("float32x")) {
          throw new ShaderCompileError(`Unknown attribute type: ${type}`, source.name, index + 1);
        }
        attributes.push({ name, type, location: attributes.length });
        return;
      }
      if (keyword === "varying") {
        if (!type.startsWith("float32x")) {
          throw new ShaderCompileError(`Unknown varying type: ${type}`, source.name, index + 1);
        }
        return;
      }
      throw new ShaderCompileError(`Unknown declaration keyword: ${keyword}`, source.name, index + 1);
    });
    if (uniforms.length + attributes.length + samplers.length === 0 && lines.every((line) => line.trim().length === 0)) {
      throw new ShaderCompileError("Empty shader source", source.name, 1);
    }
    return { uniforms, attributes, samplers, entryPoint, code };
  }

  #parseWgsl(source: ShaderSource, code: string): ParsedShader {
    const uniforms: UniformReflection[] = [];
    const attributes: AttributeReflection[] = [];
    const samplers: SamplerReflection[] = [];
    const lines = code.split("\n");
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      const uniformMatch = /var<uniform>\s+(\w+)\s*:\s*([\w<>\w]+)\s*;/.exec(line);
      if (uniformMatch) {
        const type = WGSL_TYPE_MAP[uniformMatch[2]!];
        if (!type) throw new ShaderCompileError(`Unknown wgsl uniform type: ${uniformMatch[2]}`, source.name, index + 1);
        uniforms.push({ name: uniformMatch[1]!, type, sizeBytes: UNIFORM_SIZES[type]! });
        return;
      }
      const textureMatch = /var\s+(\w+)\s*:\s*texture_2d<f32>\s*;/.exec(line);
      if (textureMatch) {
        samplers.push({ name: textureMatch[1]!, binding: samplers.length });
        return;
      }
      for (const location of line.matchAll(/@location\((\d+)\)\s+(\w+)\s*:\s*([\w<>]+)/g)) {
        const type = WGSL_TYPE_MAP[location[3]!];
        if (!type) throw new ShaderCompileError(`Unknown wgsl attribute type: ${location[3]}`, source.name, index + 1);
        attributes.push({ name: location[2]!, type, location: Number(location[1]) });
      }
    });
    const entryMatch = /@vertex|@fragment/.exec(code);
    const fnMatch = /fn\s+(\w+)\s*\(/.exec(code);
    if (!entryMatch || !fnMatch) {
      throw new ShaderCompileError("Missing entry point annotation", source.name, 1);
    }
    return { uniforms, attributes, samplers, entryPoint: fnMatch[1]!, code };
  }

  #parseGlsl(source: ShaderSource, code: string): ParsedShader {
    const uniforms: UniformReflection[] = [];
    const attributes: AttributeReflection[] = [];
    const samplers: SamplerReflection[] = [];
    const lines = code.split("\n");
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      const uniformMatch = /^uniform\s+(\w+)\s+(\w+)\s*;/.exec(line);
      if (uniformMatch) {
        const [, type, name] = uniformMatch as unknown as [string, string, string];
        if (type === "sampler2D") {
          samplers.push({ name, binding: samplers.length });
          return;
        }
        const size = UNIFORM_SIZES[type];
        if (size === undefined) throw new ShaderCompileError(`Unknown glsl uniform type: ${type}`, source.name, index + 1);
        uniforms.push({ name, type, sizeBytes: size });
        return;
      }
      const inMatch = /^(in|attribute)\s+(\w+)\s+(\w+)\s*;/.exec(line);
      if (inMatch && source.stage === "vertex") {
        const type = glslTypeToObx(inMatch[2]!);
        if (!type) throw new ShaderCompileError(`Unknown glsl attribute type: ${inMatch[2]}`, source.name, index + 1);
        attributes.push({ name: inMatch[3]!, type, location: attributes.length });
      }
    });
    if (!/void\s+main\s*\(/.test(code)) {
      throw new ShaderCompileError("Missing glsl entry point void main()", source.name, 1);
    }
    return { uniforms, attributes, samplers, entryPoint: "main", code };
  }
}

function glslTypeToObx(type: string): string | null {
  if (type === "vec2") return "float32x2";
  if (type === "vec3") return "float32x3";
  if (type === "vec4") return "float32x4";
  return null;
}

class CompiledShaderImpl implements CompiledShader {
  readonly name: string;
  readonly stage: ShaderStage;
  readonly language: ShaderLanguage;
  readonly variantKey: string;
  readonly reflection: ShaderReflection;
  readonly code: string;
  readonly defines: Record<string, string | number | boolean>;
  #destroyed = false;

  constructor(source: ShaderSource, code: string, parsed: ParsedShader, variantKey: string) {
    this.name = source.name;
    this.stage = source.stage;
    this.language = source.language;
    this.variantKey = variantKey;
    this.code = code;
    this.defines = { ...(source.defines ?? {}) };
    this.reflection = {
      uniforms: [...parsed.uniforms],
      attributes: [...parsed.attributes],
      samplers: [...parsed.samplers],
      entryPoint: parsed.entryPoint,
    };
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

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
