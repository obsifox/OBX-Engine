import { GraphicsError } from "../device.js";
import type { ClearOptions, CommandList, GpuBuffer, GpuTexture, Pipeline, RenderTargetDescriptor, Sampler } from "../device.js";
import { SoftwareBuffer, SoftwarePipeline, SoftwareSampler, SoftwareTexture, type Op } from "../software/resources.js";

export class SoftwareCommandList implements CommandList {
  readonly label: string;
  ops: Op[] = [];
  #open = false;
  #ended = false;

  constructor(label: string) {
    this.label = label;
  }

  get ended(): boolean {
    return this.#ended;
  }

  begin(target: RenderTargetDescriptor, clear: ClearOptions = {}): void {
    this.#assertOpen(false);
    this.#open = true;
    this.ops.push({ kind: "begin", target, clear });
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    this.#assertOpen(true);
    this.ops.push({ kind: "viewport", x, y, width, height });
  }

  setPipeline(pipeline: Pipeline): void {
    this.#assertOpen(true);
    this.ops.push({ kind: "pipeline", pipeline: pipeline as SoftwarePipeline });
  }

  setVertexBuffer(slot: number, buffer: GpuBuffer): void {
    this.#assertOpen(true);
    this.ops.push({ kind: "vertex", slot, buffer: buffer as SoftwareBuffer });
  }

  setIndexBuffer(buffer: GpuBuffer): void {
    this.#assertOpen(true);
    this.ops.push({ kind: "index", buffer: buffer as SoftwareBuffer });
  }

  setUniform(name: string, data: ArrayBufferView): void {
    this.#assertOpen(true);
    const copy = data instanceof Int32Array ? new Int32Array(data) : new Float32Array(data as Float32Array);
    this.ops.push({ kind: "uniform", name, data: copy });
  }

  setTexture(name: string, texture: GpuTexture, sampler?: Sampler): void {
    this.#assertOpen(true);
    this.ops.push({ kind: "texture", name, texture: texture as SoftwareTexture, sampler: (sampler ?? new SoftwareSampler()) as SoftwareSampler });
  }

  draw(vertexCount: number, options: { firstVertex?: number; instanceCount?: number } = {}): void {
    this.#assertOpen(true);
    this.ops.push({
      kind: "draw",
      vertexCount,
      firstVertex: options.firstVertex ?? 0,
      instanceCount: options.instanceCount ?? 1,
      indexed: false,
    });
  }

  drawIndexed(indexCount: number, options: { firstIndex?: number; baseVertex?: number; instanceCount?: number } = {}): void {
    this.#assertOpen(true);
    this.ops.push({
      kind: "drawIndexed",
      indexCount,
      firstIndex: options.firstIndex ?? 0,
      baseVertex: options.baseVertex ?? 0,
      instanceCount: options.instanceCount ?? 1,
      indexed: true,
    });
  }

  end(): void {
    this.#assertOpen(true);
    this.#open = false;
    this.#ended = true;
  }

  #assertOpen(expected: boolean): void {
    if (this.#ended) throw new GraphicsError(`Command list already ended: ${this.label}`);
    if (this.#open !== expected) {
      throw new GraphicsError(expected ? `Command list not begun: ${this.label}` : `Command list already begun: ${this.label}`);
    }
  }
}

