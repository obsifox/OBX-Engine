import { describe, expect, it } from "vitest";
import {
  GraphicsError,
  ShaderCompiler,
  SoftwareGraphicsDevice,
  WebGL2GraphicsDevice,
  WebGpuGraphicsDevice,
  isCompiledShader,
  type GpuDeviceLike,
  type GraphicsDevice,
  type Pipeline,
  type ShaderSource,
  type WebGL2ContextLike,
  type VertexLayoutDescriptor,
} from "../src/index.js";

class MockGpuDevice implements GpuDeviceLike {
  calls: string[] = [];
  createBuffer(descriptor: { size: number; usage: number }): { size: number; usage: number; destroy(): void } {
    this.calls.push(`createBuffer:${descriptor.size}:${descriptor.usage}`);
    return { size: descriptor.size, usage: descriptor.usage, destroy: () => this.calls.push("buffer.destroy") };
  }
  createTexture(descriptor: { size: [number, number]; format: string }): { createView(): unknown; destroy(): void } {
    this.calls.push(`createTexture:${descriptor.size[0]}x${descriptor.size[1]}:${descriptor.format}`);
    return { createView: () => ({}), destroy: () => this.calls.push("texture.destroy") };
  }
  createSampler(): { destroy(): void } {
    this.calls.push("createSampler");
    return { destroy: () => this.calls.push("sampler.destroy") };
  }
  createShaderModule(descriptor: { code: string }): { code: string } {
    this.calls.push(`createShaderModule:${descriptor.code.length > 0}`);
    return { code: descriptor.code };
  }
  createRenderPipeline(descriptor: unknown): { descriptor: unknown } {
    this.calls.push("createRenderPipeline");
    return { descriptor };
  }
  queue: {
    writeBuffer(buffer: unknown, offset: number, data: ArrayBufferView): void;
    writeTexture(...args: unknown[]): void;
    copyTextureToBuffer(...args: unknown[]): void;
    submit(commandBuffers: unknown[]): void;
    onSubmittedWorkDone(): Promise<void>;
  } = {
    writeBuffer: (buffer, offset, data) => this.calls.push(`writeBuffer:${offset}:${data.byteLength}`),
    writeTexture: () => this.calls.push("writeTexture"),
    copyTextureToBuffer: () => this.calls.push("copyTextureToBuffer"),
    submit: (commandBuffers) => this.calls.push(`queue.submit:${(commandBuffers as unknown[]).length}`),
    onSubmittedWorkDone: () => {
      this.calls.push("onSubmittedWorkDone");
      return Promise.resolve();
    },
  };
  createCommandEncoder(): {
    beginRenderPass(descriptor: unknown): Record<string, unknown>;
    copyBufferToBuffer(...args: unknown[]): void;
    finish(): { done: true };
  } {
    this.calls.push("createCommandEncoder");
    const pass: Record<string, unknown> = {};
    for (const method of ["setPipeline", "setVertexBuffer", "setIndexBuffer", "draw", "drawIndexed", "end"]) {
      pass[method] = (...args: unknown[]) => this.calls.push(`pass.${method}:${args.length > 0 ? 1 : 0}`);
    }
    return {
      beginRenderPass: (descriptor) => {
        this.calls.push("beginRenderPass");
        return pass;
      },
      copyBufferToBuffer: () => this.calls.push("copyBufferToBuffer"),
      finish: () => {
        this.calls.push("encoder.finish");
        return { done: true };
      },
    };
  }
  createCommandBuffer(): { done: true } {
    return { done: true };
  }
  destroy(): void {
    this.calls.push("device.destroy");
  }
}

class MockGl {
  calls: string[] = [];
  buffers = new Map<number, Uint8Array>();
  textures = new Map<number, { width: number; height: number; data: Uint8Array }>();
  #id = 0;
  ARRAY_BUFFER = 34962;
  ELEMENT_ARRAY_BUFFER = 34963;
  STATIC_DRAW = 35044;
  FLOAT = 5126;
  TRIANGLES = 4;
  UNSIGNED_SHORT = 5123;
  TEXTURE_2D = 3553;
  TEXTURE0 = 33984;
  RGBA = 6408;
  UNSIGNED_BYTE = 5121;
  TEXTURE_MIN_FILTER = 10241;
  TEXTURE_MAG_FILTER = 10240;
  TEXTURE_WRAP_S = 10242;
  TEXTURE_WRAP_T = 10243;
  NEAREST = 9728;
  CLAMP_TO_EDGE = 33071;
  REPEAT = 10497;
  COLOR_BUFFER_BIT = 16384;
  DEPTH_BUFFER_BIT = 256;
  DEPTH_TEST = 2929;
  CULL_FACE = 2884;
  BACK = 1029;
  FRAGMENT_SHADER = 35632;
  VERTEX_SHADER = 35633;
  COMPILE_STATUS = 35713;
  LINK_STATUS = 35714;
  FRAMEBUFFER = 36160;
  COLOR_ATTACHMENT0 = 36064;
  DEPTH_ATTACHMENT = 36096;
  TEXTURE_2D_MULTISAMPLE = 37120;
  SYNC_GPU_COMMANDS_COMPLETE = 37143;
  ALREADY_SIGNALED = 37146;
  CONDITION_SATISFIED = 37148;
  TIMEOUT_EXPIRED = 37147;
  FAIL = 0;
  createBuffer(): number {
    this.calls.push("createBuffer");
    this.#id += 1;
    return this.#id;
  }
  bindBuffer(target: number, id: number | null): void {
    this.calls.push(`bindBuffer:${target}:${id ?? 0}`);
  }
  bufferData(target: number, data: ArrayBufferView | number): void {
    if (typeof data === "number") this.calls.push(`bufferData:${target}:${data}`);
    else {
      this.calls.push(`bufferData:${target}:${data.byteLength}`);
      const bound = this.calls.filter((call) => call.startsWith(`bindBuffer:${target}:`)).at(-1);
      const id = bound ? Number(bound.split(":")[2]) : 0;
      this.buffers.set(id, new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
    }
  }
  bufferSubData(target: number, offset: number, data: ArrayBufferView): void {
    this.calls.push(`bufferSubData:${target}:${offset}:${data.byteLength}`);
  }
  createTexture(): number {
    this.calls.push("createTexture");
    this.#id += 1;
    return this.#id;
  }
  bindTexture(target: number, id: number | null): void {
    this.calls.push(`bindTexture:${target}:${id ?? 0}`);
  }
  texImage2D(...args: unknown[]): void {
    const [, , , width, height, , , , pixels] = args;
    this.calls.push(`texImage2D:${width}x${height}`);
    const bound = this.calls.filter((call) => call.startsWith("bindTexture:3553:")).at(-1);
    const id = bound ? Number(bound.split(":")[2]) : 0;
    this.textures.set(id, {
      width: width as number,
      height: height as number,
      data: pixels
        ? new Uint8Array(
            (pixels as ArrayBufferView).buffer.slice(
              (pixels as ArrayBufferView).byteOffset,
              (pixels as ArrayBufferView).byteOffset + (pixels as ArrayBufferView).byteLength,
            ),
          )
        : new Uint8Array((width as number) * (height as number) * 4),
    });
  }
  texParameteri(...args: unknown[]): void {
    this.calls.push(`texParameteri:${args[1]}:${args[2]}`);
  }
  activeTexture(): void {
    this.calls.push("activeTexture");
  }
  createShader(type: number): number {
    this.calls.push(`createShader:${type}`);
    this.#id += 1;
    return this.#id;
  }
  shaderSource(id: number, source: string): void {
    this.calls.push(`shaderSource:${source.startsWith("#version 300 es")}`);
  }
  compileShader(): void {
    this.calls.push("compileShader");
  }
  getShaderParameter(): boolean {
    return true;
  }
  getShaderInfoLog(): string {
    return "";
  }
  deleteShader(): void {
    this.calls.push("deleteShader");
  }
  createProgram(): number {
    this.calls.push("createProgram");
    this.#id += 1;
    return this.#id;
  }
  attachShader(): void {
    this.calls.push("attachShader");
  }
  linkProgram(): void {
    this.calls.push("linkProgram");
  }
  getProgramParameter(): boolean {
    return true;
  }
  getProgramInfoLog(): string {
    return "";
  }
  useProgram(): void {
    this.calls.push("useProgram");
  }
  deleteProgram(): void {
    this.calls.push("deleteProgram");
  }
  getUniformLocation(program: number, name: string): number {
    this.calls.push(`getUniformLocation:${name}`);
    return this.calls.length;
  }
  getAttribLocation(program: number, name: string): number {
    this.calls.push(`getAttribLocation:${name}`);
    return this.calls.length - 1;
  }
  uniformMatrix4fv(location: number, transpose: boolean, value: Float32Array): void {
    this.calls.push(`uniformMatrix4fv:${value.length}`);
  }
  uniform3f(location: number, x: number, y: number, z: number): void {
    this.calls.push(`uniform3f:${x},${y},${z}`);
  }
  uniform4f(location: number, ...rest: number[]): void {
    this.calls.push(`uniform4f:${rest.length}`);
  }
  uniform1i(): void {
    this.calls.push("uniform1i");
  }
  enableVertexAttribArray(): void {
    this.calls.push("enableVertexAttribArray");
  }
  vertexAttribPointer(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void {
    this.calls.push(`vertexAttribPointer:${index}:${size}:${stride}:${offset}`);
  }
  vertexAttribDivisor(): void {
    this.calls.push("vertexAttribDivisor");
  }
  viewport(): void {
    this.calls.push("viewport");
  }
  clearColor(): void {
    this.calls.push("clearColor");
  }
  clearDepth(): void {
    this.calls.push("clearDepth");
  }
  clear(mask: number): void {
    this.calls.push(`clear:${mask}`);
  }
  enable(cap: number): void {
    this.calls.push(`enable:${cap}`);
  }
  disable(cap: number): void {
    this.calls.push(`disable:${cap}`);
  }
  depthFunc(): void {
    this.calls.push("depthFunc");
  }
  depthMask(): void {
    this.calls.push("depthMask");
  }
  cullFace(mode: number): void {
    this.calls.push(`cullFace:${mode}`);
  }
  drawArrays(mode: number, first: number, count: number): void {
    this.calls.push(`drawArrays:${first}:${count}`);
  }
  drawElements(mode: number, count: number, type: number, offset: number): void {
    this.calls.push(`drawElements:${count}:${offset}`);
  }
  bindFramebuffer(target: number, id: number | null): void {
    this.calls.push(`bindFramebuffer:${id ?? 0}`);
  }
  createFramebuffer(): number {
    this.calls.push("createFramebuffer");
    this.#id += 1;
    return this.#id;
  }
  framebufferTexture2D(...args: unknown[]): void {
    this.calls.push(`framebufferTexture2D:${args[2]}`);
  }
  deleteFramebuffer(): void {
    this.calls.push("deleteFramebuffer");
  }
  deleteTexture(): void {
    this.calls.push("deleteTexture");
  }
  deleteBuffer(): void {
    this.calls.push("deleteBuffer");
  }
  fenceSync(condition: number, flags: number): number {
    this.calls.push("fenceSync");
    this.#id += 1;
    return this.#id;
  }
  clientWaitSync(sync: number, flags: number, timeout: number): number {
    this.calls.push("clientWaitSync");
    return this.ALREADY_SIGNALED;
  }
  deleteSync(): void {
    this.calls.push("deleteSync");
  }
  readPixels(x: number, y: number, width: number, height: number, format: number, type: number, pixels: Uint8Array): void {
    this.calls.push(`readPixels:${width}x${height}`);
    pixels.fill(255);
  }
}

const obxVertex: ShaderSource = {
  name: "quad.vert",
  stage: "vertex",
  language: "obx",
  code: "attribute float32x2 aPosition\nentry vertex main",
};
const obxFragment: ShaderSource = {
  name: "quad.frag",
  stage: "fragment",
  language: "obx",
  code: "uniform vec3 uColor\nentry fragment main",
};
const wgslVertex: ShaderSource = {
  name: "quad.wgsl",
  stage: "vertex",
  language: "wgsl",
  code: "@vertex\nfn vs_main(@location(0) aPosition: vec2<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(aPosition, 0.0, 1.0); }",
};
const wgslFragment: ShaderSource = {
  name: "quad.frag.wgsl",
  stage: "fragment",
  language: "wgsl",
  code: "@group(0) @binding(0) var<uniform> uColor: vec3<f32>;\n@fragment\nfn fs_main() -> @location(0) vec4<f32> { return vec4<f32>(uColor, 1.0); }",
};
const glslVertex: ShaderSource = {
  name: "quad.vert.glsl",
  stage: "vertex",
  language: "glsl",
  code: "in vec2 aPosition;\nvoid main() { gl_Position = vec4(aPosition, 0.0, 1.0); }",
};
const glslFragment: ShaderSource = {
  name: "quad.frag",
  stage: "fragment",
  language: "glsl",
  code: "uniform vec3 uColor;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(uColor, 1.0); }",
};
const layout: VertexLayoutDescriptor = {
  arrayStride: 8,
  attributes: [{ name: "aPosition", format: "float32x2", offset: 0, location: 0 }],
};

function deviceSuite(
  name: string,
  create: () => GraphicsDevice,
  vertex: ShaderSource,
  fragment: ShaderSource,
): void {
  describe(name, () => {
    it("supports the shared backend-independent workflow", async () => {
      const device = create();
      expect(device.adapter.kind === "software" || device.adapter.kind === "webgpu" || device.adapter.kind === "webgl2").toBe(true);
      const target = device.createTexture({ width: 8, height: 8, format: "rgba8", label: "color" });
      const vertexBuffer = device.createBuffer({
        usage: "vertex",
        size: 24,
        data: new Float32Array([-1, -1, 1, -1, 0, 1]),
      });
      const pipeline: Pipeline = device.createPipeline({
        vertex: device.createShader(vertex),
        fragment: device.createShader(fragment),
        vertexLayout: layout,
        cullMode: "none",
      });
      const list = device.createCommandList();
      list.begin({ color: target }, { color: [0, 0, 0, 1] });
      list.setPipeline(pipeline);
      list.setVertexBuffer(0, vertexBuffer);
      list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
      list.draw(3);
      list.end();
      const fence = device.submit(list);
      await fence.wait();
      expect(fence.isSignaled()).toBe(true);
      expect(device.stats().draws).toBe(1);
      expect(device.stats().submits).toBe(1);
      pipeline.destroy();
      expect(pipeline.destroyed).toBe(true);
      device.destroy();
    });
  });
}

deviceSuite("software backend", () => new SoftwareGraphicsDevice(), obxVertex, obxFragment);
deviceSuite("webgpu backend", () => new WebGpuGraphicsDevice(new MockGpuDevice()), wgslVertex, wgslFragment);
deviceSuite("webgl2 backend", () => new WebGL2GraphicsDevice(new MockGl() as unknown as WebGL2ContextLike), glslVertex, glslFragment);

describe("webgpu device mapping", () => {
  it("maps resources and shaders onto the gpu device", () => {
    const mock = new MockGpuDevice();
    const device = new WebGpuGraphicsDevice(mock, "test-gpu");
    expect(device.adapter.kind).toBe("webgpu");
    const buffer = device.createBuffer({ usage: "uniform", size: 16, data: new Float32Array([1, 2, 3, 4]) });
    buffer.write(new Float32Array([5, 6, 7, 8]));
    expect(mock.calls.some((call) => call.startsWith("createBuffer:16"))).toBe(true);
    expect(mock.calls.some((call) => call.startsWith("writeBuffer:0:16"))).toBe(true);
    const shader = device.createShader(wgslVertex);
    expect(isCompiledShader(shader)).toBe(true);
    expect(shader.reflection.entryPoint).toBe("vs_main");
    expect(mock.calls.some((call) => call === "createShaderModule:true")).toBe(true);
    const texture = device.createTexture({ width: 2, height: 2, format: "rgba8", data: new Uint8Array(16) });
    expect(mock.calls.some((call) => call.startsWith("createTexture:2x2:"))).toBe(true);
    texture.write(new Uint8Array(16));
    expect(mock.calls.filter((call) => call === "writeTexture").length).toBeGreaterThan(0);
    const readback = texture.read();
    expect(readback.length).toBe(16);
    buffer.destroy();
    expect(mock.calls).toContain("buffer.destroy");
  });

  it("issues draw commands through an encoder", async () => {
    const mock = new MockGpuDevice();
    const device = new WebGpuGraphicsDevice(mock);
    const target = device.createTexture({ width: 4, height: 4, format: "rgba8" });
    const vertices = device.createBuffer({ usage: "vertex", size: 24, data: new Float32Array([-1, -1, 1, -1, 0, 1]) });
    const pipeline = device.createPipeline({
      vertex: device.createShader(wgslVertex),
      fragment: device.createShader(wgslFragment),
      vertexLayout: layout,
    });
    const list = device.createCommandList();
    list.begin({ color: target }, { color: [0, 0, 0, 1] });
    list.setPipeline(pipeline);
    list.setVertexBuffer(0, vertices);
    list.draw(3);
    list.end();
    const fence = device.submit(list);
    await fence.wait();
    expect(mock.calls).toContain("beginRenderPass");
    expect(mock.calls.some((call) => call.startsWith("pass.draw:1"))).toBe(true);
    expect(mock.calls.some((call) => call.startsWith("queue.submit:1"))).toBe(true);
    expect(mock.calls).toContain("onSubmittedWorkDone");
    expect(() => device.submit(list)).toThrow(GraphicsError);
  });

  it("rejects non-wgsl shader sources", () => {
    const device = new WebGpuGraphicsDevice(new MockGpuDevice());
    expect(() => device.createShader(obxVertex)).toThrow(GraphicsError);
  });
});

describe("webgl2 device mapping", () => {
  it("compiles shaders and links pipelines with gl calls", () => {
    const gl = new MockGl();
    const device = new WebGL2GraphicsDevice(gl as unknown as WebGL2ContextLike);
    expect(device.adapter.kind).toBe("webgl2");
    const shader = device.createShader(glslFragment);
    expect(isCompiledShader(shader)).toBe(true);
    expect(gl.calls.some((call) => call === "shaderSource:true")).toBe(true);
    const pipeline = device.createPipeline({
      vertex: device.createShader(glslVertex),
      fragment: shader,
      vertexLayout: layout,
    });
    expect(gl.calls).toContain("linkProgram");
    pipeline.destroy();
    expect(gl.calls).toContain("deleteProgram");
  });

  it("issues draw calls and fences", async () => {
    const gl = new MockGl();
    const device = new WebGL2GraphicsDevice(gl as unknown as WebGL2ContextLike);
    const target = device.createTexture({ width: 4, height: 4, format: "rgba8" });
    const vertices = device.createBuffer({ usage: "vertex", size: 24, data: new Float32Array([-1, -1, 1, -1, 0, 1]) });
    const pipeline = device.createPipeline({
      vertex: device.createShader(glslVertex),
      fragment: device.createShader(glslFragment),
      vertexLayout: layout,
      cullMode: "none",
    });
    const list = device.createCommandList();
    list.begin({ color: target }, { color: [0, 0, 0, 1] });
    list.setPipeline(pipeline);
    list.setVertexBuffer(0, vertices);
    list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
    list.draw(3);
    list.end();
    const fence = device.submit(list);
    await fence.wait();
    expect(gl.calls.some((call) => call.startsWith("drawArrays:0:3"))).toBe(true);
    expect(gl.calls).toContain("fenceSync");
    expect(gl.calls).toContain("clientWaitSync");
    expect(device.stats().draws).toBe(1);
  });

  it("surfaces shader compile failures", () => {
    const gl = new MockGl();
    gl.getShaderParameter = () => false;
    const device = new WebGL2GraphicsDevice(gl as unknown as WebGL2ContextLike);
    expect(() => device.createShader(glslFragment)).toThrow(GraphicsError);
  });

  it("verifies shader reflection through the shared compiler", () => {
    const compiled = new ShaderCompiler().compile({
      name: "shared.frag",
      stage: "fragment",
      language: "obx",
      code: "uniform vec4 uColor\nuniform sampler2D uTexture\nentry fragment main",
    });
    expect(compiled.reflection.uniforms[0]).toMatchObject({ name: "uColor", type: "vec4", sizeBytes: 16 });
    expect(compiled.reflection.samplers).toHaveLength(1);
    expect(compiled.variantKey).toContain("shared.frag");
    expect(compiled.variantKey).toMatch(/[0-9a-f]{8}$/);
    expect(isCompiledShader(compiled)).toBe(true);
  });
});
