import type { BufferUsage } from "../device.js";

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

export const USAGE_BITS: Record<BufferUsage, number> = { vertex: 1, index: 2, uniform: 4 };

