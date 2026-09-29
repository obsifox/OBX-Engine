import { GraphicsError } from "../device.js";
import type { BufferDescriptor, BufferUsage, CompiledShader, Fence, GpuBuffer, GpuTexture, Pipeline, PipelineDescriptor, Sampler, SamplerDescriptor, ShaderSource, TextureDescriptor, TextureFormat, VertexLayoutDescriptor } from "../device.js";
import { GL, type WebGL2ContextLike } from "../webgl2/types.js";

export class GlBuffer implements GpuBuffer {
  readonly label: string;
  readonly usage: BufferUsage;
  readonly size: number;
  readonly handle: unknown;
  #gl: WebGL2ContextLike;
  #target: number;
  #shadow: Uint8Array;
  #destroyed = false;

  constructor(descriptor: BufferDescriptor, gl: WebGL2ContextLike) {
    if (descriptor.size <= 0) throw new GraphicsError("Buffer size must be positive");
    this.label = descriptor.label ?? "buffer";
    this.usage = descriptor.usage;
    this.size = descriptor.size;
    this.#gl = gl;
    this.#target = descriptor.usage === "index" ? GL.ELEMENT_ARRAY_BUFFER : GL.ARRAY_BUFFER;
    this.handle = gl.createBuffer();
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
    this.#gl.bindBuffer(this.#target, this.handle);
    this.#gl.bufferData(this.#target, data, GL.STATIC_DRAW);
  }

  read(): Uint8Array {
    return new Uint8Array(this.#shadow);
  }

  bind(): void {
    this.#gl.bindBuffer(this.#target, this.handle);
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

export class GlTexture implements GpuTexture {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  readonly handle: unknown;
  #gl: WebGL2ContextLike;
  #shadow: Uint8Array;
  #destroyed = false;

  constructor(descriptor: TextureDescriptor, gl: WebGL2ContextLike) {
    if (descriptor.width <= 0 || descriptor.height <= 0) throw new GraphicsError("Texture dimensions must be positive");
    this.label = descriptor.label ?? "texture";
    this.width = descriptor.width;
    this.height = descriptor.height;
    this.format = descriptor.format;
    this.#gl = gl;
    this.handle = gl.createTexture();
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
    this.#gl.bindTexture(GL.TEXTURE_2D, this.handle);
    this.#gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, this.width, this.height, 0, GL.RGBA, GL.UNSIGNED_BYTE, data);
  }

  read(): Uint8Array {
    return new Uint8Array(this.#shadow);
  }

  bind(): void {
    this.#gl.bindTexture(GL.TEXTURE_2D, this.handle);
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

export class GlSampler implements Sampler {
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

export class GlShader implements CompiledShader {
  readonly name: string;
  readonly stage: "vertex" | "fragment";
  readonly language = "glsl" as const;
  readonly variantKey: string;
  readonly reflection: CompiledShader["reflection"];
  readonly handle: unknown;
  readonly code: string;
  #destroyed = false;

  constructor(source: ShaderSource, compiled: CompiledShader, handle: unknown) {
    if (source.language !== "glsl") {
      throw new GraphicsError("WebGL2 backend requires shaders in glsl language");
    }
    this.name = source.name;
    this.stage = source.stage;
    this.variantKey = compiled.variantKey;
    this.reflection = compiled.reflection;
    this.handle = handle;
    this.code = source.code;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    this.#destroyed = true;
  }
}

export class GlPipeline implements Pipeline {
  readonly label: string;
  readonly topology = "triangle-list" as const;
  readonly cullMode: "back" | "front" | "none";
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly vertexLayout: VertexLayoutDescriptor;
  readonly instanceLayout: VertexLayoutDescriptor | null;
  readonly program: unknown;
  #gl: WebGL2ContextLike;
  #destroyed = false;

  constructor(descriptor: PipelineDescriptor, program: unknown, gl: WebGL2ContextLike) {
    this.label = descriptor.label ?? "pipeline";
    this.cullMode = descriptor.cullMode ?? "back";
    this.depthTest = descriptor.depthTest ?? true;
    this.depthWrite = descriptor.depthWrite ?? true;
    this.vertexLayout = descriptor.vertexLayout;
    this.instanceLayout = descriptor.instanceLayout ?? null;
    this.program = program;
    this.#gl = gl;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#gl.deleteProgram(this.program);
  }
}

export class GlFence implements Fence {
  #sync: unknown;
  #gl: WebGL2ContextLike;
  #destroyed = false;

  constructor(gl: WebGL2ContextLike) {
    this.#gl = gl;
    this.#sync = gl.fenceSync(37143, 0);
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  isSignaled(): boolean {
    const result = this.#gl.clientWaitSync(this.#sync, 0, 0);
    return result === GL.ALREADY_SIGNALED || result === GL.CONDITION_SATISFIED;
  }

  async wait(): Promise<void> {
    while (!this.isSignaled()) {
      await Promise.resolve();
    }
  }

  destroy(): void {
    if (!this.#destroyed) {
      this.#destroyed = true;
      this.#gl.deleteSync(this.#sync);
    }
  }
}

