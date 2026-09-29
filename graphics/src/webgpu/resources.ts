import { GraphicsError } from "../device.js";
import type { BufferDescriptor, BufferUsage, CompiledShader, Fence, GpuBuffer, GpuTexture, Pipeline, PipelineDescriptor, Sampler, SamplerDescriptor, ShaderSource, TextureDescriptor, TextureFormat, VertexLayoutDescriptor } from "../device.js";
import { USAGE_BITS, type GpuBufferLike, type GpuDeviceLike, type GpuPipelineLike, type GpuSamplerLike, type GpuShaderModuleLike, type GpuTextureLike } from "../webgpu/types.js";

export class WebGpuBuffer implements GpuBuffer {
  readonly label: string;
  readonly usage: BufferUsage;
  readonly size: number;
  readonly handle: GpuBufferLike;
  #shadow: Uint8Array;
  #queue: GpuDeviceLike["queue"];
  #destroyed = false;

  constructor(descriptor: BufferDescriptor, device: GpuDeviceLike) {
    if (descriptor.size <= 0) throw new GraphicsError("Buffer size must be positive");
    this.label = descriptor.label ?? "buffer";
    this.usage = descriptor.usage;
    this.size = descriptor.size;
    this.#queue = device.queue;
    this.handle = device.createBuffer({ size: descriptor.size, usage: USAGE_BITS[descriptor.usage] });
    this.#shadow = new Uint8Array(descriptor.size);
    if (descriptor.data) this.write(descriptor.data);
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  write(data: ArrayBufferView, offsetBytes = 0): void {
    if (this.#destroyed) throw new GraphicsError(`Buffer destroyed: ${this.label}`);
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (offsetBytes + bytes.length > this.size) throw new GraphicsError(`Buffer write out of range: ${this.label}`);
    this.#shadow.set(bytes, offsetBytes);
    this.#queue.writeBuffer(this.handle, offsetBytes, data);
  }

  read(): Uint8Array {
    return new Uint8Array(this.#shadow);
  }

  destroy(): void {
    this.#destroyed = true;
    this.handle.destroy();
  }
}

export class WebGpuTexture implements GpuTexture {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  readonly handle: GpuTextureLike;
  #shadow: Uint8Array;
  #queue: GpuDeviceLike["queue"];
  #destroyed = false;

  constructor(descriptor: TextureDescriptor, device: GpuDeviceLike) {
    if (descriptor.width <= 0 || descriptor.height <= 0) throw new GraphicsError("Texture dimensions must be positive");
    this.label = descriptor.label ?? "texture";
    this.width = descriptor.width;
    this.height = descriptor.height;
    this.format = descriptor.format;
    this.#queue = device.queue;
    this.handle = device.createTexture({
      size: [descriptor.width, descriptor.height],
      format: descriptor.format === "rgba8" ? "rgba8unorm" : descriptor.format === "r8" ? "r8unorm" : "depth32float",
      usage: 3,
    });
    this.#shadow = new Uint8Array(descriptor.width * descriptor.height * (descriptor.format === "rgba8" ? 4 : 1));
    if (descriptor.data) this.write(descriptor.data);
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  write(data: ArrayBufferView): void {
    if (this.#destroyed) throw new GraphicsError(`Texture destroyed: ${this.label}`);
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.length > this.#shadow.length) throw new GraphicsError(`Texture write too large: ${this.label}`);
    this.#shadow.set(bytes);
    this.#queue.writeTexture({ texture: this.handle }, data, { bytesPerRow: this.width * 4 }, [this.width, this.height]);
  }

  read(): Uint8Array {
    return new Uint8Array(this.#shadow);
  }

  view(): unknown {
    return this.handle.createView();
  }

  destroy(): void {
    this.#destroyed = true;
    this.handle.destroy();
  }
}

export class WebGpuSampler implements Sampler {
  readonly label: string;
  readonly magFilter: "nearest" | "linear";
  readonly addressMode: "clamp" | "repeat";
  readonly handle: GpuSamplerLike;
  #destroyed = false;

  constructor(descriptor: SamplerDescriptor, device: GpuDeviceLike) {
    this.label = descriptor.label ?? "sampler";
    this.magFilter = descriptor.magFilter ?? "nearest";
    this.addressMode = descriptor.addressMode ?? "clamp";
    this.handle = device.createSampler({ magFilter: this.magFilter, addressModeU: this.addressMode });
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    this.#destroyed = true;
    this.handle.destroy?.();
  }
}

export class WebGpuShader implements CompiledShader {
  readonly name: string;
  readonly stage: "vertex" | "fragment";
  readonly language = "wgsl" as const;
  readonly variantKey: string;
  readonly reflection: CompiledShader["reflection"];
  readonly module: GpuShaderModuleLike;
  readonly code: string;
  #destroyed = false;

  constructor(source: ShaderSource, compiled: CompiledShader, module: GpuShaderModuleLike) {
    if (source.language !== "wgsl") {
      throw new GraphicsError("WebGPU backend requires shaders in wgsl language");
    }
    this.name = source.name;
    this.stage = source.stage;
    this.variantKey = compiled.variantKey;
    this.reflection = compiled.reflection;
    this.module = module;
    this.code = source.code;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

export class WebGpuPipeline implements Pipeline {
  readonly label: string;
  readonly topology = "triangle-list" as const;
  readonly cullMode: "back" | "front" | "none";
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly vertexLayout: VertexLayoutDescriptor;
  readonly instanceLayout: VertexLayoutDescriptor | null;
  readonly handle: GpuPipelineLike;
  #destroyed = false;

  constructor(descriptor: PipelineDescriptor, handle: GpuPipelineLike) {
    this.label = descriptor.label ?? "pipeline";
    this.cullMode = descriptor.cullMode ?? "back";
    this.depthTest = descriptor.depthTest ?? true;
    this.depthWrite = descriptor.depthWrite ?? true;
    this.vertexLayout = descriptor.vertexLayout;
    this.instanceLayout = descriptor.instanceLayout ?? null;
    this.handle = handle;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.handle.destroy?.();
  }
}

export class WebGpuFence implements Fence {
  #promise: Promise<void>;
  #signaled = false;
  #destroyed = false;

  constructor(promise: Promise<void>) {
    this.#promise = promise.then(() => {
      this.#signaled = true;
    });
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  isSignaled(): boolean {
    return this.#signaled;
  }

  async wait(): Promise<void> {
    await this.#promise;
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

export type BindingState = {
  pipeline: WebGpuPipeline;
  vertex: WebGpuBuffer | null;
  instance: WebGpuBuffer | null;
  index: WebGpuBuffer | null;
  uniforms: Map<string, ArrayBufferView>;
  textures: Map<string, { texture: WebGpuTexture; sampler: WebGpuSampler }>;
};

