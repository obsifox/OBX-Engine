export const GRAPHICS_VERSION = "1.2.0";

export type BackendKind = "software" | "webgpu" | "webgl2";

export type BufferUsage = "vertex" | "index" | "uniform";

export type TextureFormat = "rgba8" | "r8" | "depth32";

export type VertexFormat = "float32x2" | "float32x3" | "float32x4";

export type CullMode = "back" | "front" | "none";

export type PrimitiveTopology = "triangle-list";

export type ShaderStage = "vertex" | "fragment";

export type ShaderLanguage = "obx" | "wgsl" | "glsl";

export class GraphicsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphicsError";
  }
}

export interface GraphicsLimits {
  maxTextureSize: number;
  maxVertexBuffers: number;
  maxUniformBytes: number;
  maxInstances: number;
}

export interface GraphicsAdapterInfo {
  id: string;
  name: string;
  kind: BackendKind;
  limits: GraphicsLimits;
  software: boolean;
}

export interface BufferDescriptor {
  label?: string;
  usage: BufferUsage;
  size: number;
  data?: ArrayBufferView;
}

export interface GpuBuffer {
  readonly label: string;
  readonly usage: BufferUsage;
  readonly size: number;
  readonly destroyed: boolean;
  write(data: ArrayBufferView, offsetBytes?: number): void;
  read(): Uint8Array;
  destroy(): void;
}

export interface TextureDescriptor {
  label?: string;
  width: number;
  height: number;
  format: TextureFormat;
  data?: ArrayBufferView;
}

export interface GpuTexture {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  readonly destroyed: boolean;
  write(data: ArrayBufferView): void;
  read(): Uint8Array;
  destroy(): void;
}

export interface SamplerDescriptor {
  label?: string;
  magFilter?: "nearest" | "linear";
  addressMode?: "clamp" | "repeat";
}

export interface Sampler {
  readonly label: string;
  readonly magFilter: "nearest" | "linear";
  readonly addressMode: "clamp" | "repeat";
  readonly destroyed: boolean;
  destroy(): void;
}

export interface ShaderSource {
  name: string;
  stage: ShaderStage;
  language: ShaderLanguage;
  code: string;
  defines?: Record<string, string | number | boolean>;
}

export interface UniformReflection {
  name: string;
  type: string;
  sizeBytes: number;
}

export interface AttributeReflection {
  name: string;
  type: string;
  location: number;
}

export interface SamplerReflection {
  name: string;
  binding: number;
}

export interface ShaderReflection {
  uniforms: UniformReflection[];
  attributes: AttributeReflection[];
  samplers: SamplerReflection[];
  entryPoint: string;
}

export interface CompiledShader {
  readonly name: string;
  readonly stage: ShaderStage;
  readonly language: ShaderLanguage;
  readonly variantKey: string;
  readonly reflection: ShaderReflection;
  readonly destroyed: boolean;
  destroy(): void;
}

export interface VertexAttributeDescriptor {
  name: string;
  format: VertexFormat;
  offset: number;
  location: number;
}

export interface VertexLayoutDescriptor {
  arrayStride: number;
  attributes: VertexAttributeDescriptor[];
  stepMode?: "vertex" | "instance";
}

export interface PipelineDescriptor {
  label?: string;
  vertex: CompiledShader;
  fragment: CompiledShader;
  topology?: PrimitiveTopology;
  cullMode?: CullMode;
  depthTest?: boolean;
  depthWrite?: boolean;
  vertexLayout: VertexLayoutDescriptor;
  instanceLayout?: VertexLayoutDescriptor;
}

export interface Pipeline {
  readonly label: string;
  readonly topology: PrimitiveTopology;
  readonly cullMode: CullMode;
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly vertexLayout: VertexLayoutDescriptor;
  readonly instanceLayout: VertexLayoutDescriptor | null;
  readonly destroyed: boolean;
  destroy(): void;
}

export interface RenderTargetDescriptor {
  color: GpuTexture;
  depth?: GpuTexture | null;
}

export interface Fence {
  readonly destroyed: boolean;
  isSignaled(): boolean;
  wait(): Promise<void>;
  destroy(): void;
}

export interface ClearOptions {
  color?: [number, number, number, number];
  depth?: number;
}

export interface CommandList {
  readonly label: string;
  begin(target: RenderTargetDescriptor, clear?: ClearOptions): void;
  setViewport(x: number, y: number, width: number, height: number): void;
  setPipeline(pipeline: Pipeline): void;
  setVertexBuffer(slot: number, buffer: GpuBuffer): void;
  setIndexBuffer(buffer: GpuBuffer): void;
  setUniform(name: string, data: ArrayBufferView): void;
  setTexture(name: string, texture: GpuTexture, sampler?: Sampler): void;
  draw(vertexCount: number, options?: { firstVertex?: number; instanceCount?: number }): void;
  drawIndexed(indexCount: number, options?: { firstIndex?: number; baseVertex?: number; instanceCount?: number }): void;
  end(): void;
}

export interface DeviceStats {
  buffers: number;
  textures: number;
  pipelines: number;
  shaders: number;
  draws: number;
  triangles: number;
  instances: number;
  bufferWrites: number;
  textureWrites: number;
  submits: number;
}

export interface GraphicsDevice {
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
