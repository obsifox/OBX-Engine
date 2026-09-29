import { GraphicsError } from "../device.js";
import type { ClearOptions, CommandList, GpuBuffer, GpuTexture, Pipeline, RenderTargetDescriptor, Sampler } from "../device.js";
import { WebGpuBuffer, WebGpuPipeline, WebGpuSampler, WebGpuTexture, type BindingState } from "../webgpu/resources.js";
import { type GpuCommandEncoderLike, type GpuDeviceLike, type GpuRenderPassLike } from "../webgpu/types.js";

export class WebGpuCommandList implements CommandList {
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

