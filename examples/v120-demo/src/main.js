import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SoftwareGraphicsDevice, ShaderCache } from "@obx/graphics";
import { Mat4, Vec3 } from "@obx/math";
import { Texture, encodePng } from "@obx/rendering";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "output");
mkdirSync(outDir, { recursive: true });

const WIDTH = 640;
const HEIGHT = 360;
const HALF = WIDTH / 2;
const FRAMES = 8;

const device = new SoftwareGraphicsDevice("software-demo");
const cache = new ShaderCache();

const spriteVertex = cache.acquire({
  name: "sprite.vert",
  stage: "vertex",
  language: "obx",
  code: [
    "attribute float32x2 aPosition",
    "attribute float32x2 aUv",
    "attribute float32x2 aInstancePos",
    "attribute float32x2 aInstanceSize",
    "attribute float32x4 aInstanceUv",
    "attribute float32x4 aInstanceColor",
    "entry vertex main",
  ].join("\n"),
});
const spriteFragment = cache.acquire({
  name: "sprite.frag",
  stage: "fragment",
  language: "obx",
  code: ["uniform vec3 uColor", "uniform sampler2D uTexture", "entry fragment main"].join("\n"),
});
const spriteFragmentTinted = cache.acquire({
  name: "sprite.frag",
  stage: "fragment",
  language: "obx",
  defines: { TINT: 1 },
  code: ["uniform vec3 uColor", "uniform sampler2D uTexture", "entry fragment main"].join("\n"),
});
const spriteFragmentHit = cache.acquire({
  name: "sprite.frag",
  stage: "fragment",
  language: "obx",
  code: ["uniform vec3 uColor", "uniform sampler2D uTexture", "entry fragment main"].join("\n"),
});
const meshVertex = cache.acquire({
  name: "mesh.vert",
  stage: "vertex",
  language: "obx",
  code: [
    "attribute float32x3 aPosition",
    "attribute float32x3 aNormal",
    "attribute float32x2 aUv",
    "uniform mat4 uMvp",
    "entry vertex main",
  ].join("\n"),
});
const meshFragment = cache.acquire({
  name: "mesh.frag",
  stage: "fragment",
  language: "obx",
  code: ["uniform vec3 uColor", "uniform vec3 uLightDir", "uniform sampler2D uTexture", "entry fragment main"].join("\n"),
});

const spritePipeline = device.createPipeline({
  vertex: spriteVertex,
  fragment: spriteFragment,
  cullMode: "none",
  depthTest: false,
  depthWrite: false,
  vertexLayout: {
    arrayStride: 16,
    attributes: [
      { name: "aPosition", format: "float32x2", offset: 0, location: 0 },
      { name: "aUv", format: "float32x2", offset: 8, location: 1 },
    ],
  },
  instanceLayout: {
    arrayStride: 48,
    stepMode: "instance",
    attributes: [
      { name: "aInstancePos", format: "float32x2", offset: 0, location: 2 },
      { name: "aInstanceSize", format: "float32x2", offset: 8, location: 3 },
      { name: "aInstanceUv", format: "float32x4", offset: 16, location: 4 },
      { name: "aInstanceColor", format: "float32x4", offset: 32, location: 5 },
    ],
  },
});
const meshPipeline = device.createPipeline({
  vertex: meshVertex,
  fragment: meshFragment,
  cullMode: "back",
  depthTest: true,
  depthWrite: true,
  vertexLayout: {
    arrayStride: 32,
    attributes: [
      { name: "aPosition", format: "float32x3", offset: 0, location: 0 },
      { name: "aNormal", format: "float32x3", offset: 12, location: 1 },
      { name: "aUv", format: "float32x2", offset: 24, location: 2 },
    ],
  },
});

const atlasPixels = new Uint8Array(128 * 32 * 4);
const cellColors = [
  [255, 106, 26],
  [255, 176, 32],
  [65, 224, 255],
  [232, 236, 242],
];
for (let y = 0; y < 32; y += 1) {
  for (let x = 0; x < 128; x += 1) {
    const cell = Math.floor(x / 32);
    const base = cellColors[cell];
    const edge = Math.floor((x % 32) / 8) === 0 || Math.floor(y / 8) === 0 ? 0.55 : 1;
    const index = (y * 128 + x) * 4;
    atlasPixels[index] = Math.round(base[0] * edge);
    atlasPixels[index + 1] = Math.round(base[1] * edge);
    atlasPixels[index + 2] = Math.round(base[2] * edge);
    atlasPixels[index + 3] = 255;
  }
}
const atlas = device.createTexture({ width: 128, height: 32, format: "rgba8", data: atlasPixels, label: "atlas" });
const sampler = device.createSampler({ magFilter: "nearest", addressMode: "clamp" });
const target = device.createTexture({ width: WIDTH, height: HEIGHT, format: "rgba8", label: "frame" });
const depth = device.createTexture({ width: WIDTH, height: HEIGHT, format: "depth32", label: "depth" });

const quadVertices = new Float32Array([
  -1, -1, 0, 0,
  1, -1, 1, 0,
  1, 1, 1, 1,
  -1, -1, 0, 0,
  1, 1, 1, 1,
  -1, 1, 0, 1,
]);
const quadBuffer = device.createBuffer({ usage: "vertex", size: quadVertices.byteLength, data: quadVertices });

function uvRect(cell) {
  return [cell * 0.25, 0, 0.25, 1];
}

function spriteBuffer(x, y, w, h, cell) {
  const [u0, v0, uw, vh] = uvRect(cell);
  const data = new Float32Array([
    x, y, u0, v0,
    x + w, y, u0 + uw, v0,
    x + w, y + h, u0 + uw, v0 + vh,
    x, y, u0, v0,
    x + w, y + h, u0 + uw, v0 + vh,
    x, y + h, u0, v0 + vh,
  ]);
  return device.createBuffer({ usage: "vertex", size: data.byteLength, data });
}

const characters = [
  { id: "hero-back", x: -0.62, y: -0.55, size: 0.34, cell: 1, layer: 1 },
  { id: "hero-mid", x: -0.18, y: -0.12, size: 0.38, cell: 2, layer: 1 },
  { id: "hero-front", x: 0.28, y: 0.22, size: 0.42, cell: 3, layer: 1 },
];
const sortedCharacters = [...characters].sort((a, b) => a.y - b.y);

const particleCount = 20;
const particleData = new Float32Array(particleCount * 12);
for (let i = 0; i < particleCount; i += 1) {
  const angle = i * 2.399963;
  const radius = 0.18 + (i % 5) * 0.13;
  const offset = i * 12;
  particleData[offset] = Math.cos(angle) * radius * 1.35;
  particleData[offset + 1] = Math.sin(angle) * radius;
  const size = 0.055 + (i % 4) * 0.022;
  particleData[offset + 2] = size;
  particleData[offset + 3] = size;
  particleData[offset + 4] = 0.5;
  particleData[offset + 5] = 0;
  particleData[offset + 6] = 0.25;
  particleData[offset + 7] = 1;
  const tint = 0.45 + (i % 6) * 0.11;
  particleData[offset + 8] = tint * 0.45;
  particleData[offset + 9] = tint * 0.85;
  particleData[offset + 10] = tint;
  particleData[offset + 11] = 1;
}
const particleBuffer = device.createBuffer({ usage: "vertex", size: particleData.byteLength, data: particleData });

const cubeFaces = [
  { normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { normal: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { normal: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { normal: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { normal: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { normal: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];
const cubeUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
const cubeIndices = new Uint16Array(36);
for (let face = 0; face < 6; face += 1) {
  const base = face * 4;
  const offset = face * 6;
  cubeIndices[offset] = base;
  cubeIndices[offset + 1] = base + 1;
  cubeIndices[offset + 2] = base + 2;
  cubeIndices[offset + 3] = base;
  cubeIndices[offset + 4] = base + 2;
  cubeIndices[offset + 5] = base + 3;
}
const cubeIndexBuffer = device.createBuffer({ usage: "index", size: cubeIndices.byteLength, data: cubeIndices });

function rotatedCube(radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const cx = Math.cos(radians * 0.6);
  const sx = Math.sin(radians * 0.6);
  const data = new Float32Array(24 * 8);
  cubeFaces.forEach((face, faceIndex) => {
    face.corners.forEach((corner, cornerIndex) => {
      let [x, y, z] = corner;
      let [nx, ny, nz] = face.normal;
      const x1 = x * c + z * s;
      const z1 = -x * s + z * c;
      const nx1 = nx * c + nz * s;
      const nz1 = -nx * s + nz * c;
      x = x1;
      z = z1;
      nx = nx1;
      nz = nz1;
      const y1 = y * cx - z * sx;
      const z2 = y * sx + z * cx;
      const ny1 = ny * cx - nz * sx;
      const nz2 = ny * sx + nz * cx;
      y = y1;
      const offset = (faceIndex * 4 + cornerIndex) * 8;
      data[offset] = x * 0.72;
      data[offset + 1] = y * 0.72;
      data[offset + 2] = z2 * 0.72;
      data[offset + 3] = nx;
      data[offset + 4] = ny1;
      data[offset + 5] = nz2;
      data[offset + 6] = cubeUvs[cornerIndex][0];
      data[offset + 7] = cubeUvs[cornerIndex][1];
    });
  });
  return data;
}

const view = Mat4.lookAt(new Vec3(2.3, 1.8, 2.7), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
const projection = Mat4.perspective(Math.PI / 3, HALF / HEIGHT, 0.1, 20);
const viewProjection = Mat4.multiply(projection, view);
const mvpUniform = new Float32Array(viewProjection.elements);
const lightDirection = new Float32Array([0.42, 0.78, 0.46]);

const animatedUvFrames = [];
const drawOrderFrames = [];

for (let frame = 0; frame < FRAMES; frame += 1) {
  const list = device.createCommandList(`frame-${frame}`);
  list.begin({ color: target, depth }, { color: [0.043, 0.055, 0.078, 1], depth: 1 });

  list.setViewport(0, 0, HALF, HEIGHT);
  list.setPipeline(spritePipeline);

  list.setVertexBuffer(0, quadBuffer);
  list.setUniform("uColor", new Float32Array([0.106, 0.137, 0.2, 1]));
  list.draw(6);

  list.setTexture("uTexture", atlas, sampler);

  list.setVertexBuffer(0, spriteBuffer(-1, -1, 2, 0.42, 0));
  list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
  list.draw(6);

  list.setVertexBuffer(0, spriteBuffer(-1, 0.62, 2, 0.38, 2));
  list.setUniform("uColor", new Float32Array([0.85, 0.9, 1, 1]));
  list.draw(6);

  const order = [];
  for (const character of sortedCharacters) {
    order.push(character.id);
    const buffer = spriteBuffer(character.x, character.y, character.size, character.size * 1.25, character.cell);
    list.setVertexBuffer(0, buffer);
    list.draw(6);
  }
  drawOrderFrames.push(order);

  const heroCell = frame % 4;
  animatedUvFrames.push(uvRect(heroCell));
  list.setVertexBuffer(0, spriteBuffer(-0.55, 0.34, 0.42, 0.42, heroCell));
  list.draw(6);

  const bobbing = new Float32Array(particleData);
  for (let i = 0; i < particleCount; i += 1) {
    bobbing[i * 12 + 1] += Math.sin((frame + i) * 0.7) * 0.035;
    bobbing[i * 12 + 4] = 0.5 + Math.sin((frame + i) * 0.7) * 0.02;
    bobbing[i * 12 + 6] = 0.2 + Math.abs(Math.sin((frame + i) * 0.35)) * 0.06;
    bobbing[i * 12 + 7] = 1;
  }
  const particleFrameBuffer = device.createBuffer({ usage: "vertex", size: bobbing.byteLength, data: bobbing });
  list.setVertexBuffer(0, quadBuffer);
  list.setVertexBuffer(1, particleFrameBuffer);
  list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
  list.draw(6, { instanceCount: particleCount });

  list.setViewport(HALF, 0, HALF, HEIGHT);
  list.setPipeline(meshPipeline);
  list.setTexture("uTexture", atlas, sampler);
  const cubeVertices = rotatedCube(0.45 + frame * 0.12);
  const cubeBuffer = device.createBuffer({ usage: "vertex", size: cubeVertices.byteLength, data: cubeVertices });
  list.setVertexBuffer(0, cubeBuffer);
  list.setIndexBuffer(cubeIndexBuffer);
  list.setUniform("uMvp", mvpUniform);
  list.setUniform("uLightDir", lightDirection);
  list.setUniform("uColor", new Float32Array([1, 1, 1, 1]));
  list.drawIndexed(36);
  list.end();

  const fence = device.submit(list);
  await fence.wait();
}

const pixels = target.read();
const png = encodePng(new Texture(WIDTH, HEIGHT, new Uint8ClampedArray(pixels)));
writeFileSync(join(outDir, "frame.png"), png);

const deviceStats = device.stats();
const cacheStats = cache.stats();

const stats = {
  version: "1.2.0",
  demo: "v120-demo",
  errors: 0,
  frames: FRAMES,
  resolution: { width: WIDTH, height: HEIGHT },
  layout: { panel2D: [0, 0, HALF, HEIGHT], panel3D: [HALF, 0, HALF, HEIGHT] },
  sprites: {
    backgroundQuads: 3,
    layerTiles: 2,
    characters: characters.length,
    animatedHero: { frames: FRAMES, uvRects: animatedUvFrames },
    textureAtlas: { width: 128, height: 32, cells: 4, regionsUsed: [0, 1, 2, 3] },
  },
  layers: {
    count: 3,
    names: ["background", "characters", "particles"],
    characterSort: "y-ascending",
    characterDrawOrder: drawOrderFrames[FRAMES - 1],
  },
  particles: {
    count: particleCount,
    instanceDrawCalls: 1,
    attributes: ["aInstancePos", "aInstanceSize", "aInstanceUv", "aInstanceColor"],
    animation: "deterministic-sine",
  },
  mesh: {
    vertices: 24,
    indices: 36,
    depthTest: true,
    depthWrite: true,
    cullMode: "back",
    camera: { eye: [2.3, 1.8, 2.7], target: [0, 0, 0], fovYRadians: Number((Math.PI / 3).toFixed(4)) },
    light: { dir: [0.42, 0.78, 0.46], model: "lambert-ambient-0.3" },
  },
  rendering: {
    drawCallsPerFrame: 9,
    totalDraws: deviceStats.draws,
    totalTriangles: deviceStats.triangles,
    totalInstances: deviceStats.instances,
    submits: deviceStats.submits,
    depthTexture: "depth32",
  },
  shaderCache: {
    compiledShaders: 6,
    uniqueVariants: cacheStats.size,
    hitSample: spriteFragmentHit.variantKey === spriteFragment.variantKey,
    stats: cacheStats,
  },
  device: {
    adapter: device.adapter.name,
    kind: device.adapter.kind,
    buffers: deviceStats.buffers,
    textures: deviceStats.textures,
    pipelines: deviceStats.pipelines,
    shaders: deviceStats.shaders,
    bufferWrites: deviceStats.bufferWrites,
    textureWrites: deviceStats.textureWrites,
  },
  api: {
    backends: ["software", "webgpu", "webgl2"],
    renderedWith: "software",
    shaderLanguages: ["obx", "wgsl", "glsl"],
  },
};

writeFileSync(join(outDir, "stats.json"), JSON.stringify(stats, null, 2));
console.log(`frames=${FRAMES} draws=${deviceStats.draws} triangles=${deviceStats.triangles} cache=${cacheStats.hits}/${cacheStats.hits + cacheStats.misses}`);
