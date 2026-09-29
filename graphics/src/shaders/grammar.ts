import type { AttributeReflection, SamplerReflection, ShaderSource, UniformReflection } from "../device.js";

export const UNIFORM_SIZES: Record<string, number> = {
  float: 4,
  int: 4,
  vec2: 8,
  vec3: 12,
  vec4: 16,
  mat4: 64,
};

export const WGSL_TYPE_MAP: Record<string, string> = {
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

export function applyDefines(code: string, defines: Record<string, string | number | boolean>): string {
  let result = code;
  for (const [name, value] of Object.entries(defines)) {
    const pattern = new RegExp(`\\b${name}\\b`, "g");
    result = result.replace(pattern, String(value));
  }
  return result;
}

export function variantKeyOf(source: ShaderSource, code: string): string {
  const defines = Object.entries(source.defines ?? {})
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort()
    .join(",");
  return `${source.name}|${source.stage}|${source.language}|${defines}|${fnv(code)}`;
}

export function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

