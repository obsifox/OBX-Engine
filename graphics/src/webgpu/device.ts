import { GraphicsError } from "../device.js";
import type { BufferDescriptor, ClearOptions, CommandList, CompiledShader, DeviceStats, Fence, GpuBuffer, GpuTexture, GraphicsAdapterInfo, GraphicsDevice, Pipeline, PipelineDescriptor, Sampler, SamplerDescriptor, ShaderSource, TextureDescriptor, VertexLayoutDescriptor } from "../device.js";
import { isCompiledShader } from "../shaders/cache.js";
import { ShaderCompiler } from "../shaders/compiler.js";
import { WebGpuCommandList } from "../webgpu/command-list.js";
import { WebGpuBuffer, WebGpuFence, WebGpuPipeline, WebGpuSampler, WebGpuShader, WebGpuTexture } from "../webgpu/resources.js";
import { type GpuBufferLike, type GpuDeviceLike } from "../webgpu/types.js";

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

export function toGpuLayout(layout: VertexLayoutDescriptor): unknown {
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
