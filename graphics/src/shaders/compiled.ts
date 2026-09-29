import type { CompiledShader, ShaderLanguage, ShaderReflection, ShaderSource, ShaderStage } from "../device.js";
import { type ParsedShader } from "../shaders/grammar.js";

export class CompiledShaderImpl implements CompiledShader {
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

