import { GraphicsError } from "../device.js";
import type { BufferDescriptor, BufferUsage, ClearOptions, CompiledShader, Fence, GpuBuffer, GpuTexture, Pipeline, PipelineDescriptor, RenderTargetDescriptor, Sampler, SamplerDescriptor, TextureDescriptor, TextureFormat, VertexLayoutDescriptor } from "../device.js";

export class SoftwareBuffer implements GpuBuffer {
  readonly label: string;
  readonly usage: BufferUsage;
  readonly size: number;
  #data: Uint8Array;
  #destroyed = false;

  constructor(descriptor: BufferDescriptor) {
    if (descriptor.size <= 0) throw new GraphicsError("Buffer size must be positive");
    this.label = descriptor.label ?? "buffer";
    this.usage = descriptor.usage;
    this.size = descriptor.size;
    this.#data = new Uint8Array(descriptor.size);
    if (descriptor.data) this.write(descriptor.data);
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  write(data: ArrayBufferView, offsetBytes = 0): void {
    this.#assertAlive();
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (offsetBytes + bytes.length > this.size) {
      throw new GraphicsError(`Buffer write out of range: ${this.label}`);
    }
    this.#data.set(bytes, offsetBytes);
  }

  read(): Uint8Array {
    this.#assertAlive();
    return new Uint8Array(this.#data);
  }

  destroy(): void {
    this.#destroyed = true;
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new GraphicsError(`Buffer destroyed: ${this.label}`);
  }
}

export class SoftwareTexture implements GpuTexture {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  #data: Uint8Array | Float32Array;
  #bytes: Uint8Array;
  #destroyed = false;

  constructor(descriptor: TextureDescriptor) {
    if (descriptor.width <= 0 || descriptor.height <= 0) {
      throw new GraphicsError("Texture dimensions must be positive");
    }
    this.label = descriptor.label ?? "texture";
    this.width = descriptor.width;
    this.height = descriptor.height;
    this.format = descriptor.format;
    const pixels = descriptor.width * descriptor.height;
    if (descriptor.format === "depth32") {
      this.#data = new Float32Array(pixels);
      this.#bytes = new Uint8Array(this.#data.buffer);
    } else {
      this.#data = new Uint8Array(pixels * (descriptor.format === "rgba8" ? 4 : 1));
      this.#bytes = this.#data as Uint8Array;
    }
    if (descriptor.data) this.write(descriptor.data);
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  write(data: ArrayBufferView): void {
    this.#assertAlive();
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.length > this.#bytes.length) throw new GraphicsError(`Texture write too large: ${this.label}`);
    this.#bytes.set(bytes);
  }

  read(): Uint8Array {
    this.#assertAlive();
    return new Uint8Array(this.#bytes);
  }

  destroy(): void {
    this.#destroyed = true;
  }

  depthBuffer(): Float32Array {
    return this.#data as Float32Array;
  }

  colorBuffer(): Uint8Array {
    return this.#bytes;
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new GraphicsError(`Texture destroyed: ${this.label}`);
  }
}

export class SoftwareSampler implements Sampler {
  readonly label: string;
  readonly magFilter: "nearest" | "linear";
  readonly addressMode: "clamp" | "repeat";
  #destroyed = false;

  constructor(descriptor: SamplerDescriptor = {}) {
    this.label = descriptor.label ?? "sampler";
    this.magFilter = descriptor.magFilter ?? "nearest";
    this.addressMode = descriptor.addressMode ?? "clamp";
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

export class SoftwarePipeline implements Pipeline {
  readonly label: string;
  readonly topology: "triangle-list";
  readonly cullMode: "back" | "front" | "none";
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly vertexLayout: VertexLayoutDescriptor;
  readonly instanceLayout: VertexLayoutDescriptor | null;
  readonly vertexShader: CompiledShader;
  readonly fragmentShader: CompiledShader;
  #destroyed = false;

  constructor(descriptor: PipelineDescriptor) {
    if (descriptor.vertex.stage !== "vertex") throw new GraphicsError("Pipeline requires a vertex shader");
    if (descriptor.fragment.stage !== "fragment") throw new GraphicsError("Pipeline requires a fragment shader");
    this.label = descriptor.label ?? "pipeline";
    this.topology = descriptor.topology ?? "triangle-list";
    this.cullMode = descriptor.cullMode ?? "back";
    this.depthTest = descriptor.depthTest ?? true;
    this.depthWrite = descriptor.depthWrite ?? true;
    this.vertexLayout = descriptor.vertexLayout;
    this.instanceLayout = descriptor.instanceLayout ?? null;
    this.vertexShader = descriptor.vertex;
    this.fragmentShader = descriptor.fragment;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

export type Op =
  | { kind: "begin"; target: RenderTargetDescriptor; clear: ClearOptions }
  | { kind: "viewport"; x: number; y: number; width: number; height: number }
  | { kind: "pipeline"; pipeline: SoftwarePipeline }
  | { kind: "vertex"; slot: number; buffer: SoftwareBuffer }
  | { kind: "index"; buffer: SoftwareBuffer }
  | { kind: "uniform"; name: string; data: Float32Array | Int32Array }
  | { kind: "texture"; name: string; texture: SoftwareTexture; sampler: SoftwareSampler }
  | { kind: "draw"; vertexCount: number; firstVertex: number; instanceCount: number; indexed: false }
  | { kind: "drawIndexed"; indexCount: number; firstIndex: number; baseVertex: number; instanceCount: number; indexed: true };

export class SoftwareFence implements Fence {
  #signaled = false;
  #destroyed = false;

  get destroyed(): boolean {
    return this.#destroyed;
  }

  signal(): void {
    this.#signaled = true;
  }

  isSignaled(): boolean {
    return this.#signaled;
  }

  async wait(): Promise<void> {
    while (!this.#signaled) {
      await Promise.resolve();
    }
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

