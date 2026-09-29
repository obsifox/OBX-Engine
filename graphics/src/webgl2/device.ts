import { GraphicsError } from "../device.js";
import type { BufferDescriptor, ClearOptions, CommandList, CompiledShader, DeviceStats, Fence, GpuBuffer, GpuTexture, GraphicsAdapterInfo, GraphicsDevice, Pipeline, PipelineDescriptor, Sampler, SamplerDescriptor, ShaderSource, TextureDescriptor } from "../device.js";
import { ShaderCompiler } from "../shaders/compiler.js";
import { GlCommandList } from "../webgl2/command-list.js";
import { GlBuffer, GlFence, GlPipeline, GlSampler, GlShader, GlTexture } from "../webgl2/resources.js";
import { GL, type WebGL2ContextLike } from "../webgl2/types.js";

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
