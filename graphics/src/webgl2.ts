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
import { ShaderCompiler } from "./shaders.js";

export interface WebGL2ContextLike {
  createBuffer(): unknown;
  bindBuffer(target: number, buffer: unknown): void;
  bufferData(target: number, data: ArrayBufferView, usage: number): void;
  createTexture(): unknown;
  bindTexture(target: number, texture: unknown): void;
  texImage2D(target: number, level: number, internalFormat: number, width: number, height: number, border: number, format: number, type: number, pixels: ArrayBufferView | null): void;
  createShader(type: number): unknown;
  shaderSource(shader: unknown, source: string): void;
  compileShader(shader: unknown): void;
  getShaderParameter(shader: unknown, pname: number): unknown;
  createProgram(): unknown;
  attachShader(program: unknown, shader: unknown): void;
  linkProgram(program: unknown): void;
  getProgramParameter(program: unknown, pname: number): unknown;
  useProgram(program: unknown): void;
  deleteProgram(program: unknown): void;
  getUniformLocation(program: unknown, name: string): unknown;
  uniformMatrix4fv(location: unknown, transpose: boolean, data: ArrayBufferView): void;
  uniform1i(location: unknown, value: number): void;
  vertexAttribPointer(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void;
  enableVertexAttribArray(index: number): void;
  drawArrays(mode: number, first: number, count: number): void;
  drawElements(mode: number, count: number, type: number, offset: number): void;
  clear(mask: number): void;
  clearColor(r: number, g: number, b: number, a: number): void;
  createVertexArray(): unknown;
  bindVertexArray(vao: unknown): void;
  fenceSync(condition: number, flags: number): unknown;
  clientWaitSync(sync: unknown, flags: number, timeout: number): number;
  deleteSync(sync: unknown): void;
}

const GL = {
  ARRAY_BUFFER: 34962,
  ELEMENT_ARRAY_BUFFER: 34963,
  STATIC_DRAW: 35044,
  TEXTURE_2D: 3553,
  RGBA: 6408,
  UNSIGNED_BYTE: 5121,
  VERTEX_SHADER: 35633,
  FRAGMENT_SHADER: 35632,
  COMPILE_STATUS: 35713,
  LINK_STATUS: 35714,
  TRIANGLES: 4,
  UNSIGNED_SHORT: 5123,
  COLOR_BUFFER_BIT: 16384,
  TEXTURE0: 33984,
  ALREADY_SIGNALED: 37146,
  CONDITION_SATISFIED: 37148,
} as const;

class GlBuffer implements GpuBuffer {
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

class GlTexture implements GpuTexture {
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

class GlSampler implements Sampler {
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

class GlShader implements CompiledShader {
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

class GlPipeline implements Pipeline {
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

class GlFence implements Fence {
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

class GlCommandList implements CommandList {
  readonly label: string;
  ops: Array<Record<string, unknown> & { op: string }> = [];
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
    this.ops.push({ op: "begin", target, clear });
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    this.#assertOpen();
    this.ops.push({ op: "viewport", x, y, width, height });
  }

  setPipeline(pipeline: Pipeline): void {
    this.#assertOpen();
    this.ops.push({ op: "pipeline", pipeline });
  }

  setVertexBuffer(slot: number, buffer: GpuBuffer): void {
    this.#assertOpen();
    this.ops.push({ op: "vertex", slot, buffer });
  }

  setIndexBuffer(buffer: GpuBuffer): void {
    this.#assertOpen();
    this.ops.push({ op: "index", buffer });
  }

  setUniform(name: string, data: ArrayBufferView): void {
    this.#assertOpen();
    this.ops.push({ op: "uniform", name, data });
  }

  setTexture(name: string, texture: GpuTexture, sampler?: Sampler): void {
    this.#assertOpen();
    this.ops.push({ op: "texture", name, texture, sampler });
  }

  draw(vertexCount: number, options: { firstVertex?: number; instanceCount?: number } = {}): void {
    this.#assertOpen();
    this.ops.push({ op: "draw", vertexCount, firstVertex: options.firstVertex ?? 0, instanceCount: options.instanceCount ?? 1 });
  }

  drawIndexed(indexCount: number, options: { firstIndex?: number; baseVertex?: number; instanceCount?: number } = {}): void {
    this.#assertOpen();
    this.ops.push({
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
    this.ops.push({ op: "end" });
  }

  #assertOpen(): void {
    if (!this.#open || this.#ended) throw new GraphicsError(`Command list not open: ${this.label}`);
  }
}

export class WebGL2GraphicsDevice implements GraphicsDevice {
  readonly adapter: GraphicsAdapterInfo;
  #gl: WebGL2ContextLike;
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

  constructor(gl: WebGL2ContextLike, adapterName = "WebGL2 Context") {
    this.#gl = gl;
    this.adapter = {
      id: "webgl2-0",
      name: adapterName,
      kind: "webgl2",
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
    return new GlBuffer(descriptor, this.#gl);
  }

  createTexture(descriptor: TextureDescriptor): GpuTexture {
    this.#assertAlive();
    this.#stats.textures += 1;
    if (descriptor.data) this.#stats.textureWrites += 1;
    return new GlTexture(descriptor, this.#gl);
  }

  createSampler(descriptor: SamplerDescriptor = {}): Sampler {
    this.#assertAlive();
    return new GlSampler(descriptor);
  }

  createShader(source: ShaderSource): CompiledShader {
    this.#assertAlive();
    this.#stats.shaders += 1;
    const compiled = this.#compiler.compile(source);
    const handle = this.#gl.createShader(source.stage === "vertex" ? GL.VERTEX_SHADER : GL.FRAGMENT_SHADER);
    const code = source.code.includes("#version") ? source.code : `#version 300 es\n${source.code}`;
    this.#gl.shaderSource(handle, code);
    this.#gl.compileShader(handle);
    if (!this.#gl.getShaderParameter(handle, GL.COMPILE_STATUS)) {
      throw new GraphicsError(`Shader compilation failed: ${source.name}`);
    }
    return new GlShader(source, compiled, handle);
  }

  createPipeline(descriptor: PipelineDescriptor): Pipeline {
    this.#assertAlive();
    this.#stats.pipelines += 1;
    const vertex = descriptor.vertex as GlShader;
    const fragment = descriptor.fragment as GlShader;
    const program = this.#gl.createProgram();
    this.#gl.attachShader(program, vertex.handle);
    this.#gl.attachShader(program, fragment.handle);
    this.#gl.linkProgram(program);
    if (!this.#gl.getProgramParameter(program, GL.LINK_STATUS)) {
      throw new GraphicsError(`Program link failed: ${descriptor.label ?? "pipeline"}`);
    }
    return new GlPipeline(descriptor, program, this.#gl);
  }

  createCommandList(label = "commands"): CommandList {
    this.#assertAlive();
    return new GlCommandList(label);
  }

  createFence(): Fence {
    this.#assertAlive();
    return new GlFence(this.#gl);
  }

  submit(commandList: CommandList): Fence {
    this.#assertAlive();
    const list = commandList as GlCommandList;
    if (!list.ended) throw new GraphicsError(`Command list not ended: ${list.label}`);
    let program: unknown = null;
    let uniformLocations = new Map<string, unknown>();
    let textureUnit = 0;
    for (const op of list.ops) {
      if (op.op === "begin") {
        const clear = op.clear as ClearOptions | undefined;
        const [r, g, b, a] = clear?.color ?? [0, 0, 0, 0];
        this.#gl.clearColor(r, g, b, a);
        this.#gl.clear(GL.COLOR_BUFFER_BIT);
        continue;
      }
      if (op.op === "pipeline") {
        const pipeline = op.pipeline as GlPipeline;
        program = pipeline.program;
        uniformLocations = new Map();
        this.#gl.useProgram(program);
        continue;
      }
      if (op.op === "vertex") {
        const buffer = op.buffer as GlBuffer;
        buffer.bind();
        continue;
      }
      if (op.op === "index") {
        (op.buffer as GlBuffer).bind();
        continue;
      }
      if (op.op === "uniform") {
        const name = op.name as string;
        const data = op.data as Float32Array;
        let location = uniformLocations.get(name);
        if (location === undefined) {
          location = this.#gl.getUniformLocation(program, name);
          uniformLocations.set(name, location);
        }
        if (data.length === 16) this.#gl.uniformMatrix4fv(location, false, data);
        else this.#gl.uniform1i(location, data[0] ?? 0);
        continue;
      }
      if (op.op === "texture") {
        (op.texture as GlTexture).bind();
        textureUnit += 1;
        continue;
      }
      if (op.op === "draw") {
        this.#gl.drawArrays(GL.TRIANGLES, (op.firstVertex as number) ?? 0, (op.vertexCount as number) * ((op.instanceCount as number) || 1));
        this.#stats.draws += 1;
        this.#stats.instances += (op.instanceCount as number) || 1;
        continue;
      }
      if (op.op === "drawIndexed") {
        this.#gl.drawElements(GL.TRIANGLES, (op.indexCount as number) * ((op.instanceCount as number) || 1), GL.UNSIGNED_SHORT, ((op.firstIndex as number) ?? 0) * 2);
        this.#stats.draws += 1;
        this.#stats.instances += (op.instanceCount as number) || 1;
      }
    }
    void textureUnit;
    this.#stats.submits += 1;
    return new GlFence(this.#gl);
  }

  stats(): DeviceStats {
    return { ...this.#stats };
  }

  destroy(): void {
    this.#destroyed = true;
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new GraphicsError("Device destroyed");
  }
}
