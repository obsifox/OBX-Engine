# `@obx/graphics` — API Reference (v1.2.0)

Backend-independent GPU rendering: one `GraphicsDevice` API with WebGPU, WebGL2 and
software rasterizer implementations, a shader compiler/cache, and explicit GPU resource
lifetime management.

```ts
import {
  SoftwareGraphicsDevice, WebGpuGraphicsDevice, WebGL2GraphicsDevice,
  ShaderCompiler, ShaderCache, ShaderCompileError, GraphicsError, isCompiledShader,
} from "@obx/graphics";
```

## Types

| Name | Values |
|---|---|
| `BackendKind` | `"software" \| "webgpu" \| "webgl2"` |
| `BufferUsage` | `"vertex" \| "index" \| "uniform"` |
| `TextureFormat` | `"rgba8" \| "r8" \| "depth32"` |
| `VertexFormat` | `"float32x2" \| "float32x3" \| "float32x4"` |
| `CullMode` | `"back" \| "front" \| "none"` |
| `PrimitiveTopology` | `"triangle-list"` |
| `ShaderStage` | `"vertex" \| "fragment"` |
| `ShaderLanguage` | `"obx" \| "wgsl" \| "glsl"` |

`GraphicsError` — thrown for every invalid handle, state transition and use-after-destroy.
`GRAPHICS_VERSION` — package version constant.

## GraphicsDevice

```ts
interface GraphicsDevice {
  readonly adapter: GraphicsAdapterInfo;
  createBuffer(descriptor: BufferDescriptor): GpuBuffer;
  createTexture(descriptor: TextureDescriptor): GpuTexture;
  createSampler(descriptor?: SamplerDescriptor): Sampler;
  createShader(source: ShaderSource): CompiledShader;
  createPipeline(descriptor: PipelineDescriptor): Pipeline;
  createCommandList(label?: string): CommandList;
  createFence(): Fence;
  submit(commandList: CommandList): Fence;
  stats(): DeviceStats;
  destroy(): void;
}
```

- `GraphicsAdapterInfo` — `{ id, name, kind, software, limits }` with
  `GraphicsLimits` = `maxTextureSize`, `maxVertexBuffers`, `maxUniformBytes`, `maxInstances`
- `BufferDescriptor` — `{ usage, size, data?, label? }`
- `TextureDescriptor` — `{ width, height, format, data?, label? }`
- `SamplerDescriptor` — `{ magFilter?: "nearest" | "linear", addressMode?: "clamp" | "repeat", label? }`
- `DeviceStats` — `{ buffers, textures, pipelines, shaders, draws, triangles, instances, bufferWrites, textureWrites, submits }`

### GpuBuffer

`{ label, usage, size, destroyed, write(data, offsetBytes?), read(), destroy() }`
`write` range-checked; `read()` returns a copy.

### GpuTexture

`{ label, width, height, format, destroyed, write(data), read(), destroy() }`
`read()` returns an RGBA byte copy (WebGPU keeps a shadow CPU copy — GPU readback is
synchronous from the shadow).

### Sampler

`{ label, magFilter, addressMode, destroyed, destroy() }`

### Pipeline

```ts
interface PipelineDescriptor {
  vertex: CompiledShader;
  fragment: CompiledShader;
  vertexLayout: VertexLayoutDescriptor;
  instanceLayout?: VertexLayoutDescriptor;
  cullMode?: CullMode;        // default "back"
  depthTest?: boolean;        // default true
  depthWrite?: boolean;       // default true
  topology?: PrimitiveTopology;
  label?: string;
}
```

`VertexLayoutDescriptor` — `{ arrayStride, stepMode?: "vertex" | "instance", attributes: VertexAttributeDescriptor[] }`;
`VertexAttributeDescriptor` — `{ name, format, offset, location }`. Stride/offsets must be
4-byte aligned. Instance attributes are read from a non-zero vertex buffer slot.

### CommandList

```ts
begin(target: RenderTargetDescriptor, clear?: ClearOptions): void;
setViewport(x, y, width, height): void;
setPipeline(pipeline: Pipeline): void;
setVertexBuffer(slot: number, buffer: GpuBuffer): void;
setIndexBuffer(buffer: GpuBuffer): void;
setUniform(name: string, data: ArrayBufferView): void;
setTexture(name: string, texture: GpuTexture, sampler?: Sampler): void;
draw(vertexCount: number, options?: { firstVertex?: number; instanceCount?: number }): void;
drawIndexed(indexCount: number, options?: { firstIndex?: number; baseVertex?: number; instanceCount?: number }): void;
end(): void;
```

- `RenderTargetDescriptor` — `{ color: GpuTexture, depth?: GpuTexture }` (depth must be `depth32`)
- `ClearOptions` — `{ color?: [r, g, b, a], depth?: number }` (defaults `[0,0,0,0]`, `1`)
- Strict transitions: `begin` twice, `end` twice, draw before begin / after end, submit
  before `end()` all throw `GraphicsError`
- Indexed draws use `Uint16` index buffers

### Fence

`{ destroyed, isSignaled(), wait(), destroy() }` — `submit()` returns a fence; the
software backend plays back synchronously and returns an already-signaled fence.

## Shader System

### ShaderSource

```ts
{ name: string; stage: ShaderStage; language: ShaderLanguage; code: string;
  defines?: Record<string, string | number | boolean>; }
```

- `obx` grammar (per line): `uniform|attribute|varying <type> <name>`,
  `entry vertex|fragment <name>`. Uniform types: `float int vec2 vec3 vec4 mat4 sampler2D`;
  attribute/varying types: `float32x2 float32x3 float32x4`
- `wgsl`: `var<uniform> name: mat4x4<f32> | vec2/3/4<f32> | f32 | i32;`,
  `var name: texture_2d<f32>;`, `@location(n) name: vecN<f32>`, `@vertex`/`@fragment`
- `glsl`: `uniform <type> name;`, `in|attribute <type> name;` (vertex stage), `void main()`

### ShaderCompiler

`compile(source): CompiledShader` — applies `defines` (textual substitution), parses
reflection, computes a stable `variantKey` (name|stage|language|defines|FNV hash).
Throws `ShaderCompileError` with `sourceName` and `line`.

### CompiledShader

`{ name, stage, language, variantKey, reflection, destroyed, destroy() }` with
`ShaderReflection` = `{ uniforms: UniformReflection[], attributes: AttributeReflection[], samplers: SamplerReflection[], entryPoint }`
(`UniformReflection` = `{ name, type, sizeBytes }`, `AttributeReflection` =
`{ name, type, location }`, `SamplerReflection` = `{ name, binding }`).

`isCompiledShader(value)` — structural type guard; `true` for any backend's compiled shader.

### ShaderCache

`acquire(source)`, `has(variantKey)`, `evict(variantKey)`, `clear()`, `size()`,
`stats(): ShaderCacheStats` = `{ hits, misses, size, evictions }`. Destroyed entries are
recompiled transparently on the next `acquire`.

## Backends

| Class | Constructor | Shader language | Notes |
|---|---|---|---|
| `SoftwareGraphicsDevice` | `(adapterId?)` | `obx` / `wgsl` / `glsl` | deterministic CPU rasterizer; `submit()` synchronous |
| `WebGpuGraphicsDevice` | `(device: GpuDeviceLike, adapterName?)` | `wgsl` only | one-shot command lists; fences via `onSubmittedWorkDone` |
| `WebGL2GraphicsDevice` | `(gl: WebGL2ContextLike)` | `glsl` only | `#version 300 es` compile/link; `fenceSync` fences |

Both GPU backends are written against mockable seams (`GpuDeviceLike`, `WebGL2ContextLike`)
so their command mapping is fully unit-tested headlessly; real contexts plug in unchanged.

## Conventions

- Front faces: counter-clockwise in NDC; `cullMode: "back"` culls screen-space area > 0
- Depth: compare `less`, clear `1.0`; `depth32` textures hold float depth
- Matrix uniforms: column-major `Float32Array(16)`; `uMvp` or `uModel`+`uView`+`uProj`
- Standard attribute names: `aPosition` (`float32x2` padded or `float32x3`), `aUv`,
  `aNormal`; instance: `aInstancePos`, `aInstanceSize`, `aInstanceUv`, `aInstanceColor`
- Standard uniforms: `uColor` (`vec3`/`vec4`), `uLightDir` (`vec3`, lambert `0.3 + 0.7·dot`)
- Triangles with any clip `w ≤ 1e-5` are skipped (no near-plane clipping)
