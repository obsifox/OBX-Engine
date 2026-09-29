import { GraphicsError } from "../device.js";
import type { ClearOptions, CommandList, GpuBuffer, GpuTexture, Pipeline, RenderTargetDescriptor, Sampler } from "../device.js";

export class GlCommandList implements CommandList {
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

