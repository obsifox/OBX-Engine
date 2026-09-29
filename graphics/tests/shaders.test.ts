import { describe, expect, it } from "vitest";
import {
  ShaderCache,
  ShaderCompiler,
  ShaderCompileError,
  isCompiledShader,
  type ShaderSource,
} from "../src/index.js";

const vertexSource: ShaderSource = {
  name: "sprite.vert",
  stage: "vertex",
  language: "obx",
  code: `
attribute float32x3 aPosition
attribute float32x2 aUv
varying float32x2 vUv
uniform mat4 uMvp
uniform vec3 uColor
uniform sampler2D uTexture
entry vertex main
`,
};

describe("shader system", () => {
  it("compiles obx shaders with reflection", () => {
    const compiled = new ShaderCompiler().compile(vertexSource);
    expect(isCompiledShader(compiled)).toBe(true);
    expect(compiled.stage).toBe("vertex");
    expect(compiled.reflection.uniforms.map((uniform) => uniform.name)).toEqual(["uMvp", "uColor"]);
    expect(compiled.reflection.uniforms[0]!.sizeBytes).toBe(64);
    expect(compiled.reflection.attributes.map((attribute) => attribute.name)).toEqual(["aPosition", "aUv"]);
    expect(compiled.reflection.samplers.map((sampler) => sampler.name)).toEqual(["uTexture"]);
    expect(compiled.reflection.entryPoint).toBe("main");
  });

  it("applies defines into variants with distinct keys", () => {
    const compiler = new ShaderCompiler();
    const base = compiler.compile(vertexSource);
    const tinted = compiler.compile({ ...vertexSource, defines: { TINT: 2 } });
    expect(base.variantKey).not.toBe(tinted.variantKey);
    const substituted = compiler.compile({
      ...vertexSource,
      code: "uniform float uScale\nentry vertex main",
      defines: { uScale: "uScaleTint" },
    });
    expect(substituted.reflection.uniforms[0]!.name).toBe("uScaleTint");
  });

  it("caches compiled variants", () => {
    const cache = new ShaderCache();
    const first = cache.acquire(vertexSource);
    const second = cache.acquire(vertexSource);
    expect(second).toBe(first);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, size: 1 });
    cache.acquire({ ...vertexSource, defines: { A: 1 } });
    expect(cache.stats().misses).toBe(2);
    expect(cache.size()).toBe(2);
    expect(cache.evict(first.variantKey)).toBe(true);
    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("recompiles destroyed entries", () => {
    const cache = new ShaderCache();
    const first = cache.acquire(vertexSource);
    first.destroy();
    const second = cache.acquire(vertexSource);
    expect(second).not.toBe(first);
  });

  it("reports declaration errors with line numbers", () => {
    const compiler = new ShaderCompiler();
    try {
      compiler.compile({ name: "bad", stage: "vertex", language: "obx", code: "uniform nope uThing\nentry vertex main" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ShaderCompileError);
      expect((error as ShaderCompileError).line).toBe(1);
      expect((error as ShaderCompileError).sourceName).toBe("bad");
    }
  });

  it("rejects unknown declaration keywords and empty sources", () => {
    const compiler = new ShaderCompiler();
    expect(() => compiler.compile({ name: "k", stage: "vertex", language: "obx", code: "bogus float32x2 x" })).toThrow(ShaderCompileError);
    expect(() => compiler.compile({ name: "e", stage: "vertex", language: "obx", code: "" })).toThrow(ShaderCompileError);
  });

  it("parses wgsl declarations", () => {
    const compiler = new ShaderCompiler();
    const compiled = compiler.compile({
      name: "mesh.wgsl",
      stage: "vertex",
      language: "wgsl",
      code: `
@group(0) @binding(0) var<uniform> uMvp: mat4x4<f32>;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@vertex
fn vs_main(@location(0) aPosition: vec3<f32>, @location(1) aUv: vec2<f32>) -> @builtin(position) vec4<f32> {
  return uMvp * vec4<f32>(aPosition, 1.0);
}
`,
    });
    expect(compiled.reflection.uniforms[0]).toMatchObject({ name: "uMvp", type: "mat4", sizeBytes: 64 });
    expect(compiled.reflection.samplers[0]!.name).toBe("uTexture");
    expect(compiled.reflection.attributes.map((attribute) => attribute.name)).toEqual(["aPosition", "aUv"]);
    expect(compiled.reflection.entryPoint).toBe("vs_main");
  });

  it("parses glsl declarations and requires an entry point", () => {
    const compiler = new ShaderCompiler();
    const compiled = compiler.compile({
      name: "mesh.frag",
      stage: "fragment",
      language: "glsl",
      code: `
uniform mat4 uMvp;
uniform vec3 uColor;
uniform sampler2D uTexture;
in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = vec4(uColor, 1.0); }
`,
    });
    expect(compiled.reflection.uniforms.map((uniform) => uniform.name)).toEqual(["uMvp", "uColor"]);
    expect(compiled.reflection.samplers).toHaveLength(1);
    expect(() =>
      compiler.compile({ name: "noentry", stage: "vertex", language: "glsl", code: "uniform float x;" }),
    ).toThrow(ShaderCompileError);
  });

  it("rejects unknown uniform types in wgsl", () => {
    const compiler = new ShaderCompiler();
    expect(() =>
      compiler.compile({
        name: "bad.wgsl",
        stage: "vertex",
        language: "wgsl",
        code: "@group(0) @binding(0) var<uniform> uThing: f16;\n@vertex\nfn vs_main() {}",
      }),
    ).toThrow(ShaderCompileError);
  });
});
