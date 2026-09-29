import {
  GraphicsError,
  type BufferDescriptor,
  type BufferUsage,
  type ClearOptions,
  type CommandList,
  type CompiledShader,
  type DeviceStats,
  type Fence,
  type GpuBuffer,
  type GpuTexture,
  type GraphicsAdapterInfo,
  type GraphicsDevice,
  type Pipeline,
  type PipelineDescriptor,
  type RenderTargetDescriptor,
  type Sampler,
  type SamplerDescriptor,
  type ShaderSource,
  type TextureDescriptor,
  type TextureFormat,
  type VertexLayoutDescriptor,
} from "./device.js";
import { ShaderCompiler, isCompiledShader } from "./shaders.js";

export interface GpuDeviceLike {
  createBuffer(descriptor: { size: number; usage: number; mappedAtCreation?: boolean }): GpuBufferLike;
  createTexture(descriptor: unknown): GpuTextureLike;
  createSampler(descriptor?: unknown): GpuSamplerLike;
  createShaderModule(descriptor: { code: string }): GpuShaderModuleLike;
  createRenderPipeline(descriptor: unknown): GpuPipelineLike;
  createCommandEncoder(): GpuCommandEncoderLike;
  queue: {
    writeBuffer(buffer: GpuBufferLike, offset: number, data: ArrayBufferView): void;
    writeTexture(destination: unknown, data: ArrayBufferView, layout: unknown, size: unknown): void;
    submit(commandBuffers: unknown[]): void;
    onSubmittedWorkDone(): Promise<void>;
  };
  destroy?(): void;
}

export interface GpuBufferLike {
  size: number;
  destroy(): void;
}
export interface GpuTextureLike {
  createView(): unknown;
  destroy(): void;
}
export interface GpuSamplerLike {
  destroy?(): void;
}
export interface GpuShaderModuleLike {
  label?: string;
}
export interface GpuPipelineLike {
  getBindGroupLayout(index: number): unknown;
  destroy?(): void;
}
export interface GpuCommandEncoderLike {
  beginRenderPass(descriptor: unknown): GpuRenderPassLike;
  finish(): unknown;
}
export interface GpuRenderPassLike {
  setPipeline(pipeline: GpuPipelineLike): void;
  setVertexBuffer(slot: number, buffer: GpuBufferLike): void;
  setIndexBuffer(buffer: GpuBufferLike, format: string): void;
  setBindGroup(index: number, group: unknown): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number): void;
  end(): void;
}

const USAGE_BITS: Record<BufferUsage, number> = { vertex: 1, index: 2, uniform: 4 };

class WebGpuBuffer implements GpuBuffer {
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

class WebGpuTexture implements GpuTexture {
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

class WebGpuSampler implements Sampler {
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

class WebGpuShader implements CompiledShader {
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

class WebGpuPipeline implements Pipeline {
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

class WebGpuFence implements Fence {
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

type BindingState = {
  pipeline: WebGpuPipeline;
  vertex: WebGpuBuffer | null;
  instance: WebGpuBuffer | null;
  index: WebGpuBuffer | null;
  uniforms: Map<string, ArrayBufferView>;
  textures: Map<string, { texture: WebGpuTexture; sampler: WebGpuSampler }>;
};

class WebGpuCommandList implements CommandList {
  readonly label: string;
  encoder: GpuCommandEncoderLike | null = null;
  pass: GpuRenderPassLike | null = null;
  state: BindingState | null = null;
  target: RenderTargetDescriptor | null = null;
  recorded: unknown[] = [];
  consumed = false;
  #open = false;
  #ended = false;

  constructor(label: string) {
    this.label = label;
  }

  get ended(): boolean {
    return this.#ended;
  }

  begin(target: RenderTargetDescriptor, clear: ClearOptions = {}): void {
    if (this.#open || this.#ended) throw new GraphicsError(`Command list state invalid: ${this.label}`);
    this.#open = true;
    this.target = target;
    this.recorded.push({ op: "begin", clear });
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    this.#assertOpen();
    this.recorded.push({ op: "viewport", x, y, width, height });
  }

  setPipeline(pipeline: Pipeline): void {
    this.#assertOpen();
    this.state = {
      pipeline: pipeline as WebGpuPipeline,
      vertex: null,
      instance: null,
      index: null,
      uniforms: new Map(),
      textures: new Map(),
    };
    this.recorded.push({ op: "pipeline" });
  }

  setVertexBuffer(slot: number, buffer: GpuBuffer): void {
    this.#assertOpen();
    if (!this.state) throw new GraphicsError("Missing pipeline");
    if (slot === 0) this.state.vertex = buffer as WebGpuBuffer;
    else this.state.instance = buffer as WebGpuBuffer;
  }

  setIndexBuffer(buffer: GpuBuffer): void {
    this.#assertOpen();
    if (!this.state) throw new GraphicsError("Missing pipeline");
    this.state.index = buffer as WebGpuBuffer;
  }

  setUniform(name: string, data: ArrayBufferView): void {
    this.#assertOpen();
    if (!this.state) throw new GraphicsError("Missing pipeline");
    this.state.uniforms.set(name, data);
  }

  setTexture(name: string, texture: GpuTexture, sampler?: Sampler): void {
    this.#assertOpen();
    if (!this.state) throw new GraphicsError("Missing pipeline");
    this.state.textures.set(name, {
      texture: texture as WebGpuTexture,
      sampler: (sampler ?? new WebGpuSampler({}, { createSampler: () => ({}) } as unknown as GpuDeviceLike)) as WebGpuSampler,
    });
  }

  draw(vertexCount: number, options: { firstVertex?: number; instanceCount?: number } = {}): void {
    this.#assertOpen();
    this.recorded.push({ op: "draw", vertexCount, firstVertex: options.firstVertex ?? 0, instanceCount: options.instanceCount ?? 1 });
  }

  drawIndexed(indexCount: number, options: { firstIndex?: number; baseVertex?: number; instanceCount?: number } = {}): void {
    this.#assertOpen();
    this.recorded.push({
      op: "drawIndexed",
      indexCount,
      firstIndex: options.firstIndex ?? 0,
      baseVertex: options.baseVertex ?? 0,
      instanceCount: options.instanceCount ?? 1,
    });
  }

  end(): void {
    this.#assertOpen();
    this.#open = false;
    this.#ended = true;
    this.recorded.push({ op: "end" });
  }

  #assertOpen(): void {
    if (!this.#open || this.#ended) throw new GraphicsError(`Command list not open: ${this.label}`);
  }
}

export class WebGpuGraphicsDevice implements GraphicsDevice {
  readonly adapter: GraphicsAdapterInfo;
  #device: GpuDeviceLike;
  #compiler = new ShaderCompiler();
  #stats: DeviceStats = {
    buffers: 0,
    textures: 0,
    pipelines: 0,
    shaders: 0,
    draws: 0,
    triangles: 0,
    instances: 0,
    bufferWrites: 0,
    textureWrites: 0,
    submits: 0,
  };
  #destroyed = false;

  constructor(device: GpuDeviceLike, adapterName = "WebGPU Adapter") {
    this.#device = device;
    this.adapter = {
      id: "webgpu-0",
      name: adapterName,
      kind: "webgpu",
      software: false,
      limits: {
        maxTextureSize: 8192,
        maxVertexBuffers: 4,
        maxUniformBytes: 65536,
        maxInstances: 65536,
      },
    };
  }

  createBuffer(descriptor: BufferDescriptor): GpuBuffer {
    this.#assertAlive();
    this.#stats.buffers += 1;
    if (descriptor.data) this.#stats.bufferWrites += 1;
    return new WebGpuBuffer(descriptor, this.#device);
  }

  createTexture(descriptor: TextureDescriptor): GpuTexture {
    this.#assertAlive();
    this.#stats.textures += 1;
    if (descriptor.data) this.#stats.textureWrites += 1;
    return new WebGpuTexture(descriptor, this.#device);
  }

  createSampler(descriptor: SamplerDescriptor = {}): Sampler {
    this.#assertAlive();
    return new WebGpuSampler(descriptor, this.#device);
  }

  createShader(source: ShaderSource): CompiledShader {
    this.#assertAlive();
    this.#stats.shaders += 1;
    const compiled = this.#compiler.compile(source);
    const module = this.#device.createShaderModule({ code: source.code });
    return new WebGpuShader(source, compiled, module);
  }

  createPipeline(descriptor: PipelineDescriptor): Pipeline {
    this.#assertAlive();
    this.#stats.pipelines += 1;
    const vertexShader = descriptor.vertex as WebGpuShader;
    const fragmentShader = descriptor.fragment as WebGpuShader;
    const handle = this.#device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: vertexShader.module,
        entryPoint: vertexShader.reflection.entryPoint,
        buffers: [toGpuLayout(descriptor.vertexLayout), descriptor.instanceLayout ? toGpuLayout(descriptor.instanceLayout) : null].filter(Boolean),
      },
      fragment: { module: fragmentShader.module, entryPoint: fragmentShader.reflection.entryPoint, targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-list", cullMode: descriptor.cullMode === "none" ? "none" : descriptor.cullMode ?? "back" },
      depthStencil: descriptor.depthTest === false ? undefined : { format: "depth32float", depthWriteEnabled: descriptor.depthWrite ?? true, depthCompare: "less" },
    });
    return new WebGpuPipeline(descriptor, handle);
  }

  createCommandList(label = "commands"): CommandList {
    this.#assertAlive();
    return new WebGpuCommandList(label);
  }

  createFence(): Fence {
    this.#assertAlive();
    return new WebGpuFence(this.#device.queue.onSubmittedWorkDone());
  }

  submit(commandList: CommandList): Fence {
    this.#assertAlive();
    const list = commandList as WebGpuCommandList;
    if (!list.ended) throw new GraphicsError(`Command list not ended: ${list.label}`);
    if (list.consumed) throw new GraphicsError(`Command list already submitted: ${list.label}`);
    list.consumed = true;
    const encoder = this.#device.createCommandEncoder();
    const first = list.recorded[0] as { op: string; clear?: ClearOptions } | undefined;
    const target = list.target;
    if (!target) throw new GraphicsError("Command list missing render target");
    const colorView = (target.color as WebGpuTexture).view();
    const depthView = target.depth ? (target.depth as unknown as WebGpuTexture).view?.() ?? null : null;
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: first?.clear?.color ? { r: first.clear.color[0], g: first.clear.color[1], b: first.clear.color[2], a: first.clear.color[3] } : { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: depthView ? { view: depthView, depthClearValue: first?.clear?.depth ?? 1, depthLoadOp: "clear", depthStoreOp: "store" } : undefined,
    });
    let bindIndex = 0;
    for (const entry of list.recorded) {
      const record = entry as { op: string } & Record<string, unknown>;
      if (record.op === "draw" || record.op === "drawIndexed") {
        const state = list.state;
        if (!state) throw new GraphicsError("Draw without pipeline");
        for (const [name, data] of state.uniforms) {
          this.#device.queue.writeBuffer({ size: data.byteLength, destroy: () => undefined } as GpuBufferLike, 0, data);
          void name;
        }
        if (record.op === "draw") {
          pass.draw(record.vertexCount as number, record.instanceCount as number, record.firstVertex as number);
          this.#stats.draws += 1;
          this.#stats.instances += record.instanceCount as number;
        } else {
          if (state.index) pass.setIndexBuffer(state.index.handle, "uint16");
          pass.drawIndexed(record.indexCount as number, record.instanceCount as number, record.firstIndex as number, record.baseVertex as number);
          this.#stats.draws += 1;
          this.#stats.instances += record.instanceCount as number;
        }
        bindIndex += 1;
        continue;
      }
      if (record.op === "pipeline" && list.state) {
        pass.setPipeline(list.state.pipeline.handle);
        if (list.state.vertex) pass.setVertexBuffer(0, list.state.vertex.handle);
        if (list.state.instance) pass.setVertexBuffer(1, list.state.instance.handle);
        continue;
      }
    }
    void bindIndex;
    pass.end();
    this.#device.queue.submit([encoder.finish()]);
    this.#stats.submits += 1;
    return new WebGpuFence(this.#device.queue.onSubmittedWorkDone());
  }

  stats(): DeviceStats {
    return { ...this.#stats };
  }

  destroy(): void {
    this.#destroyed = true;
    this.#device.destroy?.();
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new GraphicsError("Device destroyed");
  }
}

function toGpuLayout(layout: VertexLayoutDescriptor): unknown {
  return {
    arrayStride: layout.arrayStride,
    stepMode: layout.stepMode ?? "vertex",
    attributes: layout.attributes.map((attribute) => ({
      format: attribute.format === "float32x2" ? "float32x2" : attribute.format === "float32x3" ? "float32x3" : "float32x4",
      offset: attribute.offset,
      shaderLocation: attribute.location,
    })),
  };
}

export function isCompiledWebGpuShader(shader: CompiledShader): shader is WebGpuShader {
  return shader instanceof WebGpuShader;
}

export { isCompiledShader };
