import type { AttributeReflection, CompiledShader, SamplerReflection, ShaderSource, UniformReflection } from "../device.js";
import { CompiledShaderImpl } from "../shaders/compiled.js";
import { ShaderCompileError } from "../shaders/errors.js";
import { UNIFORM_SIZES, WGSL_TYPE_MAP, applyDefines, variantKeyOf, type ParsedShader } from "../shaders/grammar.js";

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

export function glslTypeToObx(type: string): string | null {
  if (type === "vec2") return "float32x2";
  if (type === "vec3") return "float32x3";
  if (type === "vec4") return "float32x4";
  return null;
}

