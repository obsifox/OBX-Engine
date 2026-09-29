import { describe, expect, it } from "vitest";
import {
  GraphicsError,
  SoftwareGraphicsDevice,
  type Pipeline,
  type ShaderSource,
  type VertexLayoutDescriptor,
} from "../src/index.js";

const vertexShader: ShaderSource = {
  name: "tri.vert",
  stage: "vertex",
  language: "obx",
  code: "attribute float32x2 aPosition\nattribute float32x2 aUv\nentry vertex main",
};
const vertexShader3: ShaderSource = {
  name: "tri3.vert",
  stage: "vertex",
  language: "obx",
  code: "attribute float32x3 aPosition\nattribute float32x3 aNormal\nattribute float32x2 aUv\nentry vertex main",
};
const fragmentShader: ShaderSource = {
  name: "tri.frag",
  stage: "fragment",
  language: "obx",
  code: "uniform vec3 uColor\nuniform sampler2D uTexture\nuniform vec3 uLightDir\nentry fragment main",
};

const layout2: VertexLayoutDescriptor = {
  arrayStride: 16,
  attributes: [
    { name: "aPosition", format: "float32x2", offset: 0, location: 0 },
    { name: "aUv", format: "float32x2", offset: 8, location: 1 },
  ],
};
const layout3: VertexLayoutDescriptor = {
  arrayStride: 32,
  attributes: [
    { name: "aPosition", format: "float32x3", offset: 0, location: 0 },
    { name: "aNormal", format: "float32x3", offset: 12, location: 1 },
    { name: "aUv", format: "float32x2", offset: 24, location: 2 },
  ],
};

function makeDevice(): SoftwareGraphicsDevice {
  return new SoftwareGraphicsDevice();
}

function makePipeline(device: SoftwareGraphicsDevice, options: { cull?: "back" | "front" | "none"; depth?: boolean; layout?: VertexLayoutDescriptor; instance?: VertexLayoutDescriptor } = {}): Pipeline {
  return device.createPipeline({
    vertex: device.createShader(options.layout === layout3 ? vertexShader3 : vertexShader),
    fragment: device.createShader(fragmentShader),
    cullMode: options.cull ?? "none",
    depthTest: options.depth ?? false,
    depthWrite: options.depth ?? false,
    vertexLayout: options.layout ?? layout2,
    instanceLayout: options.instance,
  });
}

function pixelAt(device: SoftwareGraphicsDevice, texture: ReturnType<SoftwareGraphicsDevice["createTexture"]>, x: number, y: number): number[] {
  const data = texture.read();
  const index = (y * texture.width + x) * 4;
  return [data[index]!, data[index + 1]!, data[index + 2]!, data[index + 3]!];
}

describe("software graphics device", () => {
  it("manages buffer lifetime and validates writes", () => {
    const device = makeDevice();
    const buffer = device.createBuffer({ usage: "vertex", size: 16, data: new Float32Array([1, 2, 3, 4]) });
    expect(buffer.destroyed).toBe(false);
    expect(new Float32Array(buffer.read().buffer)[2]).toBe(3);
    buffer.write(new Float32Array([9]), 8);
    expect(new Float32Array(buffer.read().buffer)[2]).toBe(9);
    expect(() => buffer.write(new Float32Array([0]), 16)).toThrow(GraphicsError);
    buffer.destroy();
    expect(buffer.destroyed).toBe(true);
    expect(() => buffer.write(new Float32Array([0]))).toThrow(GraphicsError);
  });

  it("manages textures with formats and writes", () => {
    const device = makeDevice();
    const texture = device.createTexture({ width: 2, height: 2, format: "rgba8" });
    texture.write(new Uint8Array(16).fill(200));
    expect(texture.read()[0]).toBe(200);
    const depth = device.createTexture({ width: 2, height: 2, format: "depth32" });
    expect(depth.read().length).toBe(16);
    expect(() => device.createTexture({ width: 0, height: 2, format: "rgba8" })).toThrow(GraphicsError);
    expect(() => texture.write(new Uint8Array(64))).toThrow(GraphicsError);
  });

  it("validates command list state transitions", () => {
    const device = makeDevice();
    const target = device.createTexture({ width: 4, height: 4, format: "rgba8" });
    const list = device.createCommandList();
    expect(() => list.end()).toThrow(GraphicsError);
    list.begin({ color: target });
    expect(() => list.begin({ color: target })).toThrow(GraphicsError);
    list.end();
    expect(() => list.draw(3)).toThrow(GraphicsError);
    expect(() => device.submit(list)).not.toThrow();
    expect(() => device.submit(device.createCommandList())).toThrow(GraphicsError);
  });

  it("clears targets and rasterizes a filled triangle", () => {
    const device = makeDevice();
    const target = device.createTexture({ width: 32, height: 32, format: "rgba8" });
    const pipeline = makePipeline(device);
    const vertices = new Float32Array([-0.9, -0.9, 0, 0, 0.9, -0.9, 1, 0, 0, 0.9, 0.5, 1]);
    const buffer = device.createBuffer({ usage: "vertex", size: vertices.byteLength, data: vertices });
    const list = device.createCommandList();
    list.begin({ color: target }, { color: [0, 0, 0, 1] });
    list.setPipeline(pipeline);
    list.setVertexBuffer(0, buffer);
    list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
    list.draw(3);
    list.end();
    const fence = device.submit(list);
    expect(fence.isSignaled()).toBe(true);
    expect(pixelAt(device, target, 16, 22)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(device, target, 1, 1)).toEqual([0, 0, 0, 255]);
    const stats = device.stats();
    expect(stats.draws).toBe(1);
    expect(stats.triangles).toBe(1);
    expect(stats.submits).toBe(1);
  });

  it("applies depth testing so nearer surfaces win", () => {
    const device = makeDevice();
    const target = device.createTexture({ width: 16, height: 16, format: "rgba8" });
    const depth = device.createTexture({ width: 16, height: 16, format: "depth32" });
    const pipeline = makePipeline(device, { depth: true, layout: layout3 });
    const far = new Float32Array([-1, -1, 0.8, 0, 0, 1, 0, 0, 1, -1, 0.8, 0, 0, 1, 1, 0, 0, 1, 0.8, 0, 0, 1, 0.5, 1]);
    const near = new Float32Array([-1, -1, 0.1, 0, 0, 1, 0, 0, 1, -1, 0.1, 0, 0, 1, 1, 0, 0, 1, 0.1, 0, 0, 1, 0.5, 1]);
    const farBuffer = device.createBuffer({ usage: "vertex", size: far.byteLength, data: far });
    const nearBuffer = device.createBuffer({ usage: "vertex", size: near.byteLength, data: near });
    const list = device.createCommandList();
    list.begin({ color: target, depth });
    list.setPipeline(pipeline);
    list.setVertexBuffer(0, farBuffer);
    list.setUniform("uColor", new Float32Array([1, 0, 0, 1]));
    list.draw(3);
    list.setVertexBuffer(0, nearBuffer);
    list.setUniform("uColor", new Float32Array([0, 1, 0, 1]));
    list.draw(3);
    list.end();
    device.submit(list);
    expect(pixelAt(device, target, 8, 8)).toEqual([0, 255, 0, 255]);
  });

  it("culls back faces by default convention", () => {
    const device = makeDevice();
    const target = device.createTexture({ width: 16, height: 16, format: "rgba8" });
    const ccw = new Float32Array([-0.8, -0.8, 0, 0, 0.8, -0.8, 1, 0, 0, 0.8, 0.5, 1]);
    const cw = new Float32Array([0, 0.8, 0.5, 1, 0.8, -0.8, 1, 0, -0.8, -0.8, 0, 0]);
    const buffer = device.createBuffer({ usage: "vertex", size: ccw.byteLength, data: ccw });
    const bufferCw = device.createBuffer({ usage: "vertex", size: cw.byteLength, data: cw });

    const backPipeline = makePipeline(device, { cull: "back" });
    const list1 = device.createCommandList();
    list1.begin({ color: target }, { color: [0, 0, 0, 1] });
    list1.setPipeline(backPipeline);
    list1.setVertexBuffer(0, buffer);
    list1.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
    list1.draw(3);
    list1.setVertexBuffer(0, bufferCw);
    list1.draw(3);
    list1.end();
    device.submit(list1);
    expect(pixelAt(device, target, 8, 10)).toEqual([255, 255, 255, 255]);

    const nonePipeline = makePipeline(device, { cull: "none" });
    const target2 = device.createTexture({ width: 16, height: 16, format: "rgba8" });
    const list2 = device.createCommandList();
    list2.begin({ color: target2 }, { color: [0, 0, 0, 1] });
    list2.setPipeline(nonePipeline);
    list2.setVertexBuffer(0, bufferCw);
    list2.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
    list2.draw(3);
    list2.end();
    device.submit(list2);
    expect(pixelAt(device, target2, 8, 10)).toEqual([255, 255, 255, 255]);
  });

  it("samples textures through uv regions with clamped addressing", () => {
    const device = makeDevice();
    const target = device.createTexture({ width: 8, height: 8, format: "rgba8" });
    const texture = device.createTexture({
      width: 2,
      height: 1,
      format: "rgba8",
      data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
    });
    const pipeline = makePipeline(device);
    const vertices = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, 1, 1, 1, 1, -1, -1, 0, 0, 1, 1, 1, 1, -1, 1, 0, 1]);
    const buffer = device.createBuffer({ usage: "vertex", size: vertices.byteLength, data: vertices });
    const list = device.createCommandList();
    list.begin({ color: target }, { color: [0, 0, 0, 1] });
    list.setPipeline(pipeline);
    list.setVertexBuffer(0, buffer);
    list.setTexture("uTexture", texture, device.createSampler({ addressMode: "clamp" }));
    list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
    list.draw(6);
    list.end();
    device.submit(list);
    expect(pixelAt(device, target, 1, 4)[2]).toBe(0);
    expect(pixelAt(device, target, 1, 4)[0]).toBe(255);
    expect(pixelAt(device, target, 6, 4)[0]).toBe(0);
    expect(pixelAt(device, target, 6, 4)[2]).toBe(255);
  });

  it("renders instanced sprites with atlas regions and colors", () => {
    const device = makeDevice();
    const target = device.createTexture({ width: 16, height: 16, format: "rgba8" });
    const texture = device.createTexture({
      width: 2,
      height: 1,
      format: "rgba8",
      data: new Uint8Array([255, 255, 255, 255, 128, 128, 128, 255]),
    });
    const instLayout: VertexLayoutDescriptor = {
      arrayStride: 32,
      stepMode: "instance",
      attributes: [
        { name: "aInstancePos", format: "float32x2", offset: 0, location: 2 },
        { name: "aInstanceSize", format: "float32x2", offset: 8, location: 3 },
        { name: "aInstanceUv", format: "float32x4", offset: 16, location: 4 },
      ],
    };
    const pipeline = makePipeline(device, { instance: instLayout });
    const quad = new Float32Array([-0.5, -0.5, 0, 0, 0.5, -0.5, 1, 0, 0.5, 0.5, 1, 1, -0.5, -0.5, 0, 0, 0.5, 0.5, 1, 1, -0.5, 0.5, 0, 1]);
    const quadBuffer = device.createBuffer({ usage: "vertex", size: quad.byteLength, data: quad });
    const instances = new Float32Array([
      -0.5, -0.5, 0.8, 0.8, 0, 0, 0.5, 1,
      0.5, 0.5, 0.8, 0.8, 0.5, 0, 0.5, 1,
    ]);
    const instanceBuffer = device.createBuffer({ usage: "vertex", size: instances.byteLength, data: instances });
    const list = device.createCommandList();
    list.begin({ color: target }, { color: [0, 0, 0, 1] });
    list.setPipeline(pipeline);
    list.setVertexBuffer(0, quadBuffer);
    list.setVertexBuffer(1, instanceBuffer);
    list.setTexture("uTexture", texture, device.createSampler());
    list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
    list.draw(6, { instanceCount: 2 });
    list.end();
    device.submit(list);
    expect(pixelAt(device, target, 2, 12)[0]).toBe(255);
    expect(pixelAt(device, target, 13, 3)[0]).toBe(128);
    const stats = device.stats();
    expect(stats.instances).toBe(2);
  });

  it("shades with light direction and normals", () => {
    const device = makeDevice();
    const target = device.createTexture({ width: 16, height: 16, format: "rgba8" });
    const pipeline = makePipeline(device, { layout: layout3 });
    const vertices = new Float32Array([
      -1, -1, 0, 0, 0, 1, 0, 0,
      1, -1, 0, 0, 0, 1, 1, 0,
      0, 1, 0, 0, 0, 1, 0.5, 1,
    ]);
    const buffer = device.createBuffer({ usage: "vertex", size: vertices.byteLength, data: vertices });
    const list = device.createCommandList();
    list.begin({ color: target }, { color: [0, 0, 0, 1] });
    list.setPipeline(pipeline);
    list.setVertexBuffer(0, buffer);
    list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
    list.setUniform("uLightDir", new Float32Array([0, 0, 1]));
    list.draw(3);
    list.end();
    device.submit(list);
    const lit = pixelAt(device, target, 8, 10);
    expect(lit[0]).toBe(255);
    expect(lit).toEqual([255, 255, 255, 255]);

    const list2 = device.createCommandList();
    list2.begin({ color: target }, { color: [0, 0, 0, 1] });
    list2.setPipeline(pipeline);
    list2.setVertexBuffer(0, buffer);
    list2.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
    list2.setUniform("uLightDir", new Float32Array([0, 0, -1]));
    list2.draw(3);
    list2.end();
    device.submit(list2);
    const dark = pixelAt(device, target, 8, 10);
    expect(dark[0]).toBe(77);
  });

  it("tracks resource counts and rejects use after destroy", () => {
    const device = makeDevice();
    const buffer = device.createBuffer({ usage: "uniform", size: 16 });
    const pipeline = makePipeline(device);
    device.createTexture({ width: 2, height: 2, format: "rgba8" });
    device.createShader(vertexShader);
    const stats = device.stats();
    expect(stats.buffers).toBe(1);
    expect(stats.pipelines).toBe(1);
    expect(stats.textures).toBe(1);
    expect(stats.shaders).toBe(3);
    buffer.destroy();
    expect(() => buffer.read()).toThrow(GraphicsError);
    pipeline.destroy();
    expect(pipeline.destroyed).toBe(true);
    device.destroy();
    expect(() => device.createBuffer({ usage: "vertex", size: 4 })).toThrow(GraphicsError);
  });

  it("rejects invalid pipelines and renders indexed geometry", () => {
    const device = makeDevice();
    expect(() =>
      device.createPipeline({
        vertex: device.createShader(fragmentShader),
        fragment: device.createShader(fragmentShader),
        vertexLayout: layout2,
      }),
    ).toThrow(GraphicsError);

    const target = device.createTexture({ width: 16, height: 16, format: "rgba8" });
    const pipeline = makePipeline(device);
    const vertices = new Float32Array([-0.8, -0.8, 0, 0, 0.8, -0.8, 1, 0, 0.8, 0.8, 1, 1, -0.8, 0.8, 0, 1]);
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const vertexBuffer = device.createBuffer({ usage: "vertex", size: vertices.byteLength, data: vertices });
    const indexBuffer = device.createBuffer({ usage: "index", size: indices.byteLength, data: indices });
    const list = device.createCommandList();
    list.begin({ color: target }, { color: [0, 0, 0, 1] });
    list.setPipeline(pipeline);
    list.setVertexBuffer(0, vertexBuffer);
    list.setIndexBuffer(indexBuffer);
    list.setUniform("uColor", new Float32Array([0, 1, 1, 1]));
    list.drawIndexed(6);
    list.end();
    device.submit(list);
    expect(pixelAt(device, target, 8, 8)).toEqual([0, 255, 255, 255]);
    expect(device.stats().triangles).toBe(2);
  });
});
