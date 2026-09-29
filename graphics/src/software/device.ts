import { GraphicsError } from "../device.js";
import type { BufferDescriptor, ClearOptions, CommandList, CompiledShader, DeviceStats, Fence, GpuBuffer, GpuTexture, GraphicsAdapterInfo, GraphicsDevice, Pipeline, PipelineDescriptor, Sampler, SamplerDescriptor, ShaderSource, TextureDescriptor } from "../device.js";
import { ShaderCompiler } from "../shaders/compiler.js";
import { SoftwareCommandList } from "../software/command-list.js";
import { mat4Multiply, readAttribute, sampleTexture, transformPoint } from "../software/math.js";
import { SoftwareBuffer, SoftwareFence, SoftwarePipeline, SoftwareSampler, SoftwareTexture, type Op } from "../software/resources.js";

export interface DrawContext {
  pipeline: SoftwarePipeline;
  vertexBuffer: SoftwareBuffer | null;
  instanceBuffer: SoftwareBuffer | null;
  indexBuffer: SoftwareBuffer | null;
  uniforms: Map<string, Float32Array | Int32Array>;
  textures: Map<string, { texture: SoftwareTexture; sampler: SoftwareSampler }>;
}

export class SoftwareGraphicsDevice implements GraphicsDevice {
  readonly adapter: GraphicsAdapterInfo;
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

  constructor(adapterId = "software-0") {
    this.adapter = {
      id: adapterId,
      name: "OBX Software Rasterizer",
      kind: "software",
      software: true,
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
    return new SoftwareBuffer(descriptor);
  }

  createTexture(descriptor: TextureDescriptor): GpuTexture {
    this.#assertAlive();
    this.#stats.textures += 1;
    if (descriptor.data) this.#stats.textureWrites += 1;
    return new SoftwareTexture(descriptor);
  }

  createSampler(descriptor: SamplerDescriptor = {}): Sampler {
    this.#assertAlive();
    return new SoftwareSampler(descriptor);
  }

  createShader(source: ShaderSource): CompiledShader {
    this.#assertAlive();
    this.#stats.shaders += 1;
    return new ShaderCompiler().compile(source);
  }

  createPipeline(descriptor: PipelineDescriptor): Pipeline {
    this.#assertAlive();
    this.#stats.pipelines += 1;
    return new SoftwarePipeline(descriptor);
  }

  createCommandList(label = "commands"): CommandList {
    this.#assertAlive();
    return new SoftwareCommandList(label);
  }

  createFence(): Fence {
    this.#assertAlive();
    return new SoftwareFence();
  }

  submit(commandList: CommandList): Fence {
    this.#assertAlive();
    const list = commandList as SoftwareCommandList;
    if (!list.ended) throw new GraphicsError(`Command list not ended: ${list.label}`);
    const fence = new SoftwareFence();
    this.playback(list);
    this.#stats.submits += 1;
    fence.signal();
    return fence;
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

  playback(list: SoftwareCommandList): void {
    let context: DrawContext | null = null;
    let target: { color: SoftwareTexture; depth: Float32Array | null; width: number; height: number } | null = null;
    let viewport = { x: 0, y: 0, width: 0, height: 0 };
    for (const op of list.ops) {
      if (op.kind === "begin") {
        const color = op.target.color as SoftwareTexture;
        const depth = op.target.depth ? (op.target.depth as SoftwareTexture) : null;
        if (depth && depth.format !== "depth32") throw new GraphicsError("Depth target must use depth32 format");
        target = { color, depth: depth ? depth.depthBuffer() : null, width: color.width, height: color.height };
        viewport = { x: 0, y: 0, width: color.width, height: color.height };
        this.#clearTarget(target, op.clear);
        continue;
      }
      if (op.kind === "viewport") {
        viewport = { x: op.x, y: op.y, width: op.width, height: op.height };
        continue;
      }
      if (op.kind === "pipeline") {
        context = { pipeline: op.pipeline, vertexBuffer: null, instanceBuffer: null, indexBuffer: null, uniforms: new Map(), textures: new Map() };
        continue;
      }
      if (!context) throw new GraphicsError("Draw state missing pipeline");
      if (op.kind === "vertex") {
        if (op.slot === 0) context.vertexBuffer = op.buffer;
        else context.instanceBuffer = op.buffer;
        continue;
      }
      if (op.kind === "index") {
        context.indexBuffer = op.buffer;
        continue;
      }
      if (op.kind === "uniform") {
        context.uniforms.set(op.name, op.data);
        continue;
      }
      if (op.kind === "texture") {
        context.textures.set(op.name, { texture: op.texture, sampler: op.sampler });
        continue;
      }
      if (!target) throw new GraphicsError("Draw outside of a render pass");
      this.#stats.draws += 1;
      this.#stats.instances += op.instanceCount;
      this.#draw(context, target, viewport, op);
    }
  }

  #clearTarget(target: { color: SoftwareTexture; depth: Float32Array | null }, clear: ClearOptions): void {
    const color = target.color.colorBuffer();
    const [r, g, b, a] = clear.color ?? [0, 0, 0, 0];
    const bytes = target.color.format === "rgba8" ? 4 : 1;
    for (let index = 0; index < color.length; index += bytes) {
      color[index] = Math.round(r * 255);
      if (bytes === 4) {
        color[index + 1] = Math.round(g * 255);
        color[index + 2] = Math.round(b * 255);
        color[index + 3] = Math.round(a * 255);
      }
    }
    if (target.depth) target.depth.fill(clear.depth ?? 1);
  }

  #draw(
    context: DrawContext,
    target: { color: SoftwareTexture; depth: Float32Array | null; width: number; height: number },
    viewport: { x: number; y: number; width: number; height: number },
    op: Extract<Op, { indexed: boolean }>,
  ): void {
    const pipeline = context.pipeline;
    const vertexLayout = pipeline.vertexLayout;
    const vertexBuffer = context.vertexBuffer;
    if (!vertexBuffer) throw new GraphicsError("Draw missing vertex buffer");
    const vertexBytes = vertexBuffer.read();
    const instanceBytes = context.instanceBuffer?.read() ?? null;
    const instanceLayout = pipeline.instanceLayout;
    const instanceCount = op.instanceCount;
    const indexBytes = context.indexBuffer?.read() ?? null;

    const mvp = this.#resolveMvp(context);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    const fetchVertex = (index: number, instance: number): {
      clip: [number, number, number, number];
      uv: [number, number];
      color: [number, number, number, number];
      normal: [number, number, number] | null;
    } | null => {
      const position = readAttribute(vertexBytes, vertexLayout, "aPosition", index);
      if (!position) throw new GraphicsError("Vertex layout missing aPosition");
      let x = position[0]!;
      let y = position[1]!;
      let z = position[2] ?? 0;
      let u = 0;
      let v = 0;
      const uvAttr = readAttribute(vertexBytes, vertexLayout, "aUv", index);
      if (uvAttr) {
        u = uvAttr[0]!;
        v = uvAttr[1]!;
      }
      let color: [number, number, number, number] = [1, 1, 1, 1];
      const uniformColor = context.uniforms.get("uColor");
      if (uniformColor && uniformColor.length >= 3) {
        color = [uniformColor[0]!, uniformColor[1]!, uniformColor[2]!, uniformColor[3] ?? 1];
      }
      const normalAttr = readAttribute(vertexBytes, vertexLayout, "aNormal", index);
      let normal: [number, number, number] | null = normalAttr ? [normalAttr[0]!, normalAttr[1]!, normalAttr[2]!] : null;
      if (instanceBytes && instanceLayout) {
        const iSize = readAttribute(instanceBytes, instanceLayout, "aInstanceSize", instance);
        if (iSize) {
          x *= iSize[0]!;
          y *= iSize[1]!;
        }
        const iPos = readAttribute(instanceBytes, instanceLayout, "aInstancePos", instance);
        if (iPos) {
          x += iPos[0]!;
          y += iPos[1]!;
          z += iPos[2] ?? 0;
        }
        const iUv = readAttribute(instanceBytes, instanceLayout, "aInstanceUv", instance);
        if (iUv) {
          u = iUv[0]! + u * iUv[2]!;
          v = iUv[1]! + v * iUv[3]!;
        }
        const iColor = readAttribute(instanceBytes, instanceLayout, "aInstanceColor", instance);
        if (iColor) {
          color = [iColor[0]!, iColor[1]!, iColor[2]!, iColor[3] ?? 1];
        }
      }
      const clip = transformPoint(mvp, x, y, z);
      return { clip, uv: [u, v], color, normal };
    };

    const triangles: [number, number, number][] = [];
    if (op.indexed) {
      if (!indexBytes) throw new GraphicsError("Indexed draw missing index buffer");
      const indices = new Uint16Array(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength / 2);
      for (let i = 0; i + 2 < op.indexCount; i += 3) {
        triangles.push([
          indices[op.firstIndex + i]! + op.baseVertex,
          indices[op.firstIndex + i + 1]! + op.baseVertex,
          indices[op.firstIndex + i + 2]! + op.baseVertex,
        ]);
      }
    } else {
      for (let i = 0; i + 2 < op.vertexCount; i += 3) {
        triangles.push([op.firstVertex + i, op.firstVertex + i + 1, op.firstVertex + i + 2]);
      }
    }

    for (let instance = 0; instance < instanceCount; instance += 1) {
      for (const [i0, i1, i2] of triangles) {
        const a = fetchVertex(i0, instance);
        const b = fetchVertex(i1, instance);
        const c = fetchVertex(i2, instance);
        if (!a || !b || !c) continue;
        if (a.clip[3] <= 1e-5 || b.clip[3] <= 1e-5 || c.clip[3] <= 1e-5) continue;
        this.#stats.triangles += 1;
        const sa = this.#toScreen(a.clip, viewport);
        const sb = this.#toScreen(b.clip, viewport);
        const sc = this.#toScreen(c.clip, viewport);
        const area = (sb.x - sa.x) * (sc.y - sa.y) - (sb.y - sa.y) * (sc.x - sa.x);
        if (area === 0) continue;
        if (pipeline.cullMode === "back" && area > 0) continue;
        if (pipeline.cullMode === "front" && area < 0) continue;
        this.#rasterize(context, target, viewport, pipeline, [sa, sb, sc], [a, b, c]);
      }
    }
  }

  #resolveMvp(context: DrawContext): Float32Array {
    const mvp = context.uniforms.get("uMvp");
    if (mvp && mvp.length === 16) return mvp as Float32Array;
    const model = (context.uniforms.get("uModel") as Float32Array | undefined) ?? new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const view = (context.uniforms.get("uView") as Float32Array | undefined) ?? new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const proj = (context.uniforms.get("uProj") as Float32Array | undefined) ?? new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return mat4Multiply(proj as Float32Array, mat4Multiply(view as Float32Array, model as Float32Array));
  }

  #toScreen(clip: [number, number, number, number], viewport: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    z: number;
    invW: number;
  } {
    const invW = 1 / clip[3];
    const ndcX = clip[0] * invW;
    const ndcY = clip[1] * invW;
    const ndcZ = clip[2] * invW;
    return {
      x: viewport.x + (ndcX * 0.5 + 0.5) * viewport.width,
      y: viewport.y + (1 - (ndcY * 0.5 + 0.5)) * viewport.height,
      z: ndcZ,
      invW,
    };
  }

  #rasterize(
    context: DrawContext,
    target: { color: SoftwareTexture; depth: Float32Array | null; width: number; height: number },
    viewport: { x: number; y: number; width: number; height: number },
    pipeline: SoftwarePipeline,
    points: { x: number; y: number; z: number; invW: number }[],
    vertices: { clip: [number, number, number, number]; uv: [number, number]; color: [number, number, number, number]; normal: [number, number, number] | null }[],
  ): void {
    const minX = Math.max(viewport.x, Math.floor(Math.min(points[0]!.x, points[1]!.x, points[2]!.x)));
    const maxX = Math.min(viewport.x + viewport.width - 1, Math.ceil(Math.max(points[0]!.x, points[1]!.x, points[2]!.x)));
    const minY = Math.max(viewport.y, Math.floor(Math.min(points[0]!.y, points[1]!.y, points[2]!.y)));
    const maxY = Math.min(viewport.y + viewport.height - 1, Math.ceil(Math.max(points[0]!.y, points[1]!.y, points[2]!.y)));
    const [pa, pb, pc] = points;
    const area = (pb!.x - pa!.x) * (pc!.y - pa!.y) - (pb!.y - pa!.y) * (pc!.x - pa!.x);
    if (area === 0) return;

    const colorBuffer = target.color.colorBuffer();
    const textureBinding = [...context.textures.values()][0] ?? null;
    const lightDir = context.uniforms.get("uLightDir");

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const sampleX = px + 0.5;
        const sampleY = py + 0.5;
        const w0 = ((pb!.x - sampleX) * (pc!.y - sampleY) - (pb!.y - sampleY) * (pc!.x - sampleX)) / area;
        const w1 = ((pc!.x - sampleX) * (pa!.y - sampleY) - (pc!.y - sampleY) * (pa!.x - sampleX)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = w0 * pa!.z + w1 * pb!.z + w2 * pc!.z;
        const depthIndex = py * target.width + px;
        if (target.depth) {
          if (pipeline.depthTest && depth >= target.depth[depthIndex]!) continue;
          if (pipeline.depthWrite) target.depth[depthIndex] = depth;
        }
        const invW = w0 * pa!.invW + w1 * pb!.invW + w2 * pc!.invW;
        const bary = [w0 * pa!.invW / invW, w1 * pb!.invW / invW, w2 * pc!.invW / invW];
        const uv: [number, number] = [
          bary[0]! * vertices[0]!.uv[0] + bary[1]! * vertices[1]!.uv[0] + bary[2]! * vertices[2]!.uv[0],
          bary[0]! * vertices[0]!.uv[1] + bary[1]! * vertices[1]!.uv[1] + bary[2]! * vertices[2]!.uv[1],
        ];
        const color: [number, number, number, number] = [
          bary[0]! * vertices[0]!.color[0] + bary[1]! * vertices[1]!.color[0] + bary[2]! * vertices[2]!.color[0],
          bary[0]! * vertices[0]!.color[1] + bary[1]! * vertices[1]!.color[1] + bary[2]! * vertices[2]!.color[1],
          bary[0]! * vertices[0]!.color[2] + bary[1]! * vertices[1]!.color[2] + bary[2]! * vertices[2]!.color[2],
          bary[0]! * vertices[0]!.color[3] + bary[1]! * vertices[1]!.color[3] + bary[2]! * vertices[2]!.color[3],
        ];
        let r = color[0];
        let g = color[1];
        let b = color[2];
        if (textureBinding) {
          const sampled = sampleTexture(textureBinding, uv[0], uv[1]);
          r *= sampled[0];
          g *= sampled[1];
          b *= sampled[2];
        }
        if (lightDir && vertices[0]!.normal && vertices[1]!.normal && vertices[2]!.normal) {
          const nx = bary[0]! * vertices[0]!.normal[0] + bary[1]! * vertices[1]!.normal[0] + bary[2]! * vertices[2]!.normal[0];
          const ny = bary[0]! * vertices[0]!.normal[1] + bary[1]! * vertices[1]!.normal[1] + bary[2]! * vertices[2]!.normal[1];
          const nz = bary[0]! * vertices[0]!.normal[2] + bary[1]! * vertices[1]!.normal[2] + bary[2]! * vertices[2]!.normal[2];
          const length = Math.hypot(lightDir[0]!, lightDir[1]!, lightDir[2]!) || 1;
          const dot = (nx * lightDir[0]! + ny * lightDir[1]! + nz * lightDir[2]!) / length;
          const shade = 0.3 + 0.7 * Math.max(0, dot);
          r *= shade;
          g *= shade;
          b *= shade;
        }
        const outIndex = (py * target.width + px) * 4;
        colorBuffer[outIndex] = Math.round(Math.min(1, Math.max(0, r)) * 255);
        colorBuffer[outIndex + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
        colorBuffer[outIndex + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
        colorBuffer[outIndex + 3] = Math.round(Math.min(1, Math.max(0, color[3])) * 255);
      }
    }
  }
}

