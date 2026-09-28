import { describe, expect, it } from "vitest";
import { AABB, Color, Mat4, Quat, Vec3 } from "@obx/math";
import {
  Camera3D,
  Material,
  Mesh,
  Recording3DBackend,
  Renderer3D,
  Software3DBackend,
  Texture,
  aabbVisible,
  composeWorldMatrix,
  createCube,
  createLighting,
  createPlane,
  createUvSphere,
  computeNormals,
  encodePng,
  parseGltf,
  flattenGltf,
  transformAabb,
  type RasterVertex,
  type ShadingContext,
} from "../src/index.js";

const white = new Color(1, 1, 1, 1);
const red = new Color(1, 0, 0, 1);

function vertex(sx: number, sy: number, depth: number, over: Partial<RasterVertex> = {}): RasterVertex {
  return {
    sx,
    sy,
    depth,
    invW: 1,
    wx: 0,
    wy: 0,
    wz: 0,
    nx: 0,
    ny: 0,
    nz: 1,
    u: 0,
    v: 0,
    ...over,
  };
}

function context(over: Partial<ShadingContext> = {}): ShadingContext {
  return {
    material: new Material({ shading: "unlit", baseColor: red.clone() }),
    lighting: createLighting(),
    fog: null,
    cameraPosition: new Vec3(0, 0, 10),
    ...over,
  };
}

function makeGlb(): Uint8Array {
  const bin = new Uint8Array(42);
  const dv = new DataView(bin.buffer);
  const values = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  values.forEach((value, i) => dv.setFloat32(i * 4, value, true));
  dv.setUint16(36, 0, true);
  dv.setUint16(38, 1, true);
  dv.setUint16(40, 2, true);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [1, 2, 3] }],
    meshes: [{ name: "tri", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [
      {
        name: "mat",
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.4, 0.6, 1],
          metallicFactor: 0.25,
          roughnessFactor: 0.75,
        },
      },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [{ byteLength: 42 }],
  });
  const jsonBytes = new TextEncoder().encode(json);
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + bin.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length + jsonPad, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i += 1) out[20 + jsonBytes.length + i] = 0x20;
  const binOffset = 20 + jsonBytes.length + jsonPad;
  view.setUint32(binOffset, bin.length, true);
  view.setUint32(binOffset + 4, 0x004e4942, true);
  out.set(bin, binOffset + 8);
  return out;
}

function makeGlbDataUri(): string {
  const glb = makeGlb();
  const bin = glb.slice(glb.length - 42);
  return JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [1, 2, 3] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [
      {
        byteLength: 42,
        uri: `data:application/octet-stream;base64,${Buffer.from(bin).toString("base64")}`,
      },
    ],
  });
}

describe("Mesh", () => {
  it("stores geometry and computes bounds", () => {
    const mesh = new Mesh(
      new Float64Array([0, 0, 0, 2, 0, 0, 0, 3, 0]),
      new Uint32Array([0, 1, 2]),
      undefined,
      undefined,
      "tri",
    );
    expect(mesh.name).toBe("tri");
    expect(mesh.vertexCount).toBe(3);
    expect(mesh.triangleCount).toBe(1);
    expect(mesh.aabb.min.x).toBe(0);
    expect(mesh.aabb.max.x).toBe(2);
    expect(mesh.aabb.max.y).toBe(3);
    expect(mesh.sphere.center.x).toBe(1);
    expect(mesh.sphere.radius).toBeCloseTo(Math.hypot(1, 1.5), 12);
  });

  it("computes normals from winding", () => {
    const normals = computeNormals(
      new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Uint32Array([0, 1, 2]),
    );
    expect(normals[2]).toBe(1);
    expect(normals[0]).toBe(0);
  });

  it("creates cube with outward faces", () => {
    const cube = createCube(2);
    expect(cube.vertexCount).toBe(24);
    expect(cube.triangleCount).toBe(12);
    expect(cube.aabb.min.x).toBe(-1);
    expect(cube.aabb.max.z).toBe(1);
    expect(cube.uvs.length).toBe(48);
  });

  it("creates plane facing +y", () => {
    const plane = createPlane(4, 4);
    expect(plane.vertexCount).toBe(4);
    for (let i = 1; i < plane.normals.length; i += 3) {
      expect(plane.normals[i]).toBeCloseTo(1, 12);
    }
    const p = plane.positions;
    for (let t = 0; t < plane.indices.length; t += 3) {
      const i0 = plane.indices[t]!;
      const i1 = plane.indices[t + 1]!;
      const i2 = plane.indices[t + 2]!;
      const ux = p[i1 * 3]! - p[i0 * 3]!;
      const uy = p[i1 * 3 + 1]! - p[i0 * 3 + 1]!;
      const uz = p[i1 * 3 + 2]! - p[i0 * 3 + 2]!;
      const vx = p[i2 * 3]! - p[i0 * 3]!;
      const vy = p[i2 * 3 + 1]! - p[i0 * 3 + 1]!;
      const vz = p[i2 * 3 + 2]! - p[i0 * 3 + 2]!;
      const ny = uz * vx - ux * vz;
      expect(ny).toBeGreaterThan(0);
    }
  });

  it("creates uv sphere with outward triangles", () => {
    const sphere = createUvSphere(1, 8, 6);
    expect(sphere.aabb.min.x).toBeCloseTo(-1, 6);
    expect(sphere.aabb.max.y).toBeCloseTo(1, 6);
    const p = sphere.positions;
    let outward = 0;
    for (let t = 0; t < sphere.indices.length; t += 3) {
      const i0 = sphere.indices[t]!;
      const i1 = sphere.indices[t + 1]!;
      const i2 = sphere.indices[t + 2]!;
      const ux = p[i1 * 3]! - p[i0 * 3]!;
      const uy = p[i1 * 3 + 1]! - p[i0 * 3 + 1]!;
      const uz = p[i1 * 3 + 2]! - p[i0 * 3 + 2]!;
      const vx = p[i2 * 3]! - p[i0 * 3]!;
      const vy = p[i2 * 3 + 1]! - p[i0 * 3 + 1]!;
      const vz = p[i2 * 3 + 2]! - p[i0 * 3 + 2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (Math.hypot(nx, ny, nz) < 1e-12) continue;
      const gx = (p[i0 * 3]! + p[i1 * 3]! + p[i2 * 3]!) / 3;
      const gy = (p[i0 * 3 + 1]! + p[i1 * 3 + 1]! + p[i2 * 3 + 1]!) / 3;
      const gz = (p[i0 * 3 + 2]! + p[i1 * 3 + 2]! + p[i2 * 3 + 2]!) / 3;
      if (nx * gx + ny * gy + nz * gz > 0) outward += 1;
    }
    expect(outward).toBe(8 * 6 * 2 - 16);
  });
});

describe("Material and lighting", () => {
  it("has documented defaults", () => {
    const material = new Material();
    expect(material.shading).toBe("standard");
    expect(material.baseColor.r).toBe(1);
    expect(material.metallic).toBe(0);
    expect(material.roughness).toBe(0.8);
    expect(material.emissive.a).toBe(0);
    expect(material.albedoTexture).toBeNull();
    expect(material.doubleSided).toBe(false);
  });

  it("clones without sharing colors", () => {
    const material = new Material({ metallic: 0.3 });
    const clone = material.clone();
    clone.baseColor.r = 0;
    expect(material.baseColor.r).toBe(1);
    expect(clone.metallic).toBe(0.3);
  });

  it("creates lighting defaults", () => {
    const lighting = createLighting();
    expect(lighting.ambient.intensity).toBe(0.15);
    expect(lighting.ambient.color.r).toBe(1);
    expect(lighting.directional).toHaveLength(0);
    expect(lighting.point).toHaveLength(0);
    const custom = createLighting({
      directional: [{ direction: { x: -0.5, y: 0.5, z: -0.5 }, color: white.clone(), intensity: 0.5 }],
    });
    expect(custom.directional[0]!.direction.x).toBe(-0.5);
    expect(custom.ambient.intensity).toBe(0.15);
  });
});

describe("Camera3D", () => {
  it("builds view and projection matrices", () => {
    const camera = new Camera3D();
    camera.position.set(0, 0, 0);
    expect(camera.viewMatrix().elements[14]).toBe(0);
    camera.position.set(0, 0, 5);
    expect(camera.viewMatrix().elements[14]).toBeCloseTo(-5, 12);
    expect(camera.projectionMatrix().elements[0]).toBeGreaterThan(0);
  });

  it("looks at a target", () => {
    const camera = new Camera3D();
    camera.setLookAt(new Vec3(0, 0, 5), new Vec3(0, 0, 0));
    const forward = camera.forward();
    expect(forward.x).toBeCloseTo(0, 12);
    expect(forward.z).toBeCloseTo(-1, 12);
    expect(camera.viewMatrix().elements[14]).toBeCloseTo(-5, 12);
  });

  it("projects points to normalized screen space", () => {
    const camera = new Camera3D({ aspect: 1 });
    camera.setLookAt(new Vec3(0, 0, 5), new Vec3(0, 0, 0));
    const center = camera.worldToScreen(new Vec3(0, 0, 0));
    expect(center.x).toBeCloseTo(0.5, 6);
    expect(center.y).toBeCloseTo(0.5, 6);
    const right = camera.worldToScreen(new Vec3(1, 0, 0));
    expect(right.x).toBeGreaterThan(0.5);
  });

  it("builds frustum planes and tests visibility", () => {
    const camera = new Camera3D({ aspect: 1 });
    const planes = camera.frustumPlanes();
    expect(planes).toHaveLength(6);
    for (const [a, b, c] of planes) {
      expect(Math.hypot(a!, b!, c!)).toBeCloseTo(1, 6);
    }
    expect(aabbVisible(planes, new AABB(new Vec3(-1, -1, -1), new Vec3(1, 1, 1)))).toBe(true);
    expect(aabbVisible(planes, new AABB(new Vec3(-1, -1, 50), new Vec3(1, 1, 52)))).toBe(false);
    expect(aabbVisible(planes, new AABB(new Vec3(8, -1, -1), new Vec3(10, 1, 1)))).toBe(false);
  });
});

describe("Software3DBackend rasterization", () => {
  it("clears color and depth", () => {
    const backend = new Software3DBackend(4, 4);
    backend.clear(new Color(1, 0, 0, 1));
    expect(backend.readPixel(0, 0).toRgba8()).toEqual([255, 0, 0, 255]);
    expect(backend.readDepth(0, 0)).toBe(Infinity);
  });

  it("fills only pixels whose centers are covered", () => {
    const backend = new Software3DBackend(4, 4);
    backend.clear(new Color(0, 0, 0, 1));
    backend.drawTriangle(vertex(0, 0, 0.5), vertex(4, 0, 0.5), vertex(0, 2, 0.5), context());
    expect(backend.readPixel(0, 0).toRgba8()).toEqual([255, 0, 0, 255]);
    expect(backend.readPixel(1, 0).toRgba8()).toEqual([255, 0, 0, 255]);
    expect(backend.readPixel(2, 0).toRgba8()).toEqual([255, 0, 0, 255]);
    expect(backend.readPixel(0, 1).toRgba8()).toEqual([255, 0, 0, 255]);
    expect(backend.readPixel(3, 0).toRgba8()).toEqual([0, 0, 0, 255]);
    expect(backend.readPixel(1, 1).toRgba8()).toEqual([0, 0, 0, 255]);
    expect(backend.readPixel(2, 1).toRgba8()).toEqual([0, 0, 0, 255]);
    expect(backend.readPixel(0, 2).toRgba8()).toEqual([0, 0, 0, 255]);
  });

  it("keeps the nearest depth and rejects farther draws", () => {
    const backend = new Software3DBackend(4, 4);
    backend.clear(new Color(0, 0, 0, 1));
    backend.drawTriangle(vertex(0, 0, 0.5), vertex(4, 0, 0.5), vertex(0, 2, 0.5), context());
    expect(backend.readDepth(0, 0)).toBeCloseTo(0.5, 12);
    backend.drawTriangle(vertex(0, 0, 0.3), vertex(4, 0, 0.3), vertex(0, 2, 0.3), context());
    expect(backend.readDepth(0, 0)).toBeCloseTo(0.3, 12);
    backend.drawTriangle(vertex(0, 0, 0.7), vertex(4, 0, 0.7), vertex(0, 2, 0.7), context());
    expect(backend.readDepth(0, 0)).toBeCloseTo(0.3, 12);
    expect(backend.readPixel(0, 0).r).toBe(1);
  });

  it("interpolates depth linearly in screen space", () => {
    const backend = new Software3DBackend(4, 4);
    backend.clear(new Color(0, 0, 0, 1));
    backend.drawTriangle(vertex(0, 0, 0.2), vertex(4, 0, 0.2), vertex(0, 2, 0.8), context());
    const at = (x: number, y: number) => 0.2 + 0.3 * (y + 0.5);
    expect(backend.readDepth(1, 0)).toBeCloseTo(at(1, 0), 4);
    expect(backend.readDepth(2, 0)).toBeCloseTo(at(2, 0), 4);
    expect(backend.readDepth(0, 1)).toBeCloseTo(at(0, 1), 4);
  });

  it("interpolates attributes perspective-correct", () => {
    const backend = new Software3DBackend(4, 4);
    backend.clear(new Color(0, 0, 0, 1));
    const ramp = new Uint8ClampedArray(10 * 4);
    for (let i = 0; i < 10; i += 1) {
      ramp[i * 4] = Math.round((i * 255) / 9);
      ramp[i * 4 + 3] = 255;
    }
    const ctx = context({
      material: new Material({
        shading: "unlit",
        baseColor: new Color(1, 1, 1, 1),
        albedoTexture: new Texture(10, 1, ramp, "ramp"),
      }),
    });
    backend.drawTriangle(
      vertex(0, 0, 0, { invW: 1, u: 0 }),
      vertex(4, 0, 0, { invW: 1, u: 1 }),
      vertex(0, 4, 0, { invW: 0.25, u: 0 }),
      ctx,
    );
    const value = backend.readPixel(1, 1).r;
    const expectedPerspective = Math.round((5 * 255) / 9) / 255;
    const expectedNaive = Math.round((3 * 255) / 9) / 255;
    expect(value).toBeCloseTo(expectedPerspective, 3);
    expect(Math.abs(value - expectedNaive)).toBeGreaterThan(0.1);
  });

  it("assigns shared edges to exactly one triangle", () => {
    const drawFirst = new Software3DBackend(4, 4);
    const drawSecond = new Software3DBackend(4, 4);
    const first = context({ material: new Material({ shading: "unlit", baseColor: red.clone() }) });
    const second = context({
      material: new Material({ shading: "unlit", baseColor: new Color(0, 1, 0, 1) }),
    });
    drawFirst.clear(new Color(0, 0, 0, 1));
    drawSecond.clear(new Color(0, 0, 0, 1));
    drawFirst.drawTriangle(vertex(0, 0, 0), vertex(4, 0, 0), vertex(0, 4, 0), first);
    drawSecond.drawTriangle(vertex(4, 0, 0), vertex(4, 4, 0), vertex(0, 4, 0), second);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const inFirst = drawFirst.readPixel(x, y).r > 0;
        const inSecond = drawSecond.readPixel(x, y).g > 0;
        expect(inFirst || inSecond).toBe(true);
        expect(inFirst && inSecond).toBe(false);
      }
    }
  });

  it("blends alpha over the background", () => {
    const backend = new Software3DBackend(4, 4);
    backend.clear(new Color(0, 0, 1, 1));
    const half = context({
      material: new Material({ shading: "unlit", baseColor: new Color(1, 0, 0, 0.5) }),
    });
    backend.drawTriangle(vertex(0, 0, 0.5), vertex(4, 0, 0.5), vertex(0, 2, 0.5), half);
    const [r, g, b] = backend.readPixel(0, 0).toRgba8();
    expect(r).toBe(128);
    expect(g).toBe(0);
    expect(b).toBe(128);
  });

  it("exports pixels as a texture and png", () => {
    const backend = new Software3DBackend(2, 2);
    backend.clear(new Color(1, 0, 0, 1));
    const texture = backend.toTexture();
    expect(texture.width).toBe(2);
    expect(texture.height).toBe(2);
    const png = encodePng({ width: 2, height: 2, data: backend.pixels } as never);
    expect(png[0]).toBe(0x89);
  });
});

describe("shading", () => {
  function shade(
    over: Partial<ShadingContext>,
    shared: Partial<RasterVertex> = { wx: 0, wy: 0, wz: 0, nx: 0, ny: 0, nz: 1 },
  ): number[] {
    const backend = new Software3DBackend(8, 8);
    backend.clear(new Color(0, 0, 0, 1));
    const ctx = context(over);
    backend.drawTriangle(
      vertex(-2, -2, 0, shared),
      vertex(12, -2, 0, shared),
      vertex(-2, 12, 0, shared),
      ctx,
    );
    const color = backend.readPixel(4, 4);
    return [color.r, color.g, color.b];
  }

  it("computes exact lambert with zero specular", () => {
    const lighting = createLighting({
      ambient: { color: white.clone(), intensity: 0.1 },
      directional: [{ direction: { x: 0, y: 0, z: -1 }, color: white.clone(), intensity: 0.5 }],
    });
    const lit = shade({
      material: new Material({ shading: "standard", baseColor: red.clone(), roughness: 1, metallic: 0 }),
      lighting,
    });
    expect(lit[0]).toBeCloseTo(0.6, 2);
    expect(lit[1]).toBeCloseTo(0, 2);
    const away = shade(
      {
        material: new Material({ shading: "standard", baseColor: red.clone(), roughness: 1, metallic: 0 }),
        lighting,
      },
      { wx: 0, wy: 0, wz: 0, nx: 0, ny: 0, nz: -1 },
    );
    expect(away[0]).toBeCloseTo(0.1, 2);
  });

  it("kills diffuse for fully metallic surfaces", () => {
    const lit = shade({
      material: new Material({ shading: "standard", baseColor: red.clone(), roughness: 1, metallic: 1 }),
      lighting: createLighting({
        ambient: { color: white.clone(), intensity: 0.1 },
        directional: [{ direction: { x: 0, y: 0, z: -1 }, color: white.clone(), intensity: 0.5 }],
      }),
    });
    expect(lit[0]).toBeCloseTo(0.1, 2);
  });

  it("computes exact mirror-like specular", () => {
    const lit = shade({
      material: new Material({ shading: "standard", baseColor: red.clone(), roughness: 0.5, metallic: 1 }),
      lighting: createLighting({
        ambient: { color: white.clone(), intensity: 0 },
        directional: [{ direction: { x: 0, y: 0, z: -1 }, color: white.clone(), intensity: 1 }],
      }),
    });
    expect(lit[0]).toBeCloseTo(0.5, 2);
    expect(lit[1]).toBeCloseTo(0, 2);
  });

  it("attenuates point lights by range", () => {
    const material = () =>
      new Material({ shading: "standard", baseColor: red.clone(), roughness: 1, metallic: 0 });
    const lighting = createLighting({
      ambient: { color: white.clone(), intensity: 0 },
      point: [{ position: { x: 0, y: 0, z: 5 }, color: white.clone(), intensity: 1, range: 10 }],
    });
    const near = shade({ material: material(), lighting });
    expect(near[0]).toBeCloseTo(0.5, 2);
    const far = shade(
      { material: material(), lighting },
      { wx: 0, wy: 0, wz: -5, nx: 0, ny: 0, nz: 1 },
    );
    expect(far[0]).toBeCloseTo(0, 2);
  });

  it("applies exponential distance fog", () => {
    const lit = shade(
      {
        material: new Material({ shading: "unlit", baseColor: red.clone() }),
        fog: { color: new Color(0, 0, 1, 1), density: Math.LN2 / 1000 },
        cameraPosition: new Vec3(0, 0, 0),
      },
      { wx: 0, wy: 0, wz: 1000, nx: 0, ny: 0, nz: 1 },
    );
    expect(lit[0]).toBeCloseTo(0.5, 2);
    expect(lit[2]).toBeCloseTo(0.5, 2);
  });

  it("multiplies base color by texture in unlit mode", () => {
    const lit = shade({
      material: new Material({
        shading: "unlit",
        baseColor: new Color(0.5, 0.5, 0.5, 1),
        albedoTexture: new Texture(1, 1, new Uint8ClampedArray([255, 0, 0, 255]), "red"),
      }),
    });
    expect(lit[0]).toBeCloseTo(0.5, 2);
  });
});

describe("Renderer3D", () => {
  const setup = () => {
    const backend = new Software3DBackend(64, 64);
    const renderer = new Renderer3D(backend);
    const camera = new Camera3D({ fovY: Math.PI / 3, aspect: 1, near: 0.1, far: 100 });
    return { backend, renderer, camera };
  };

  it("renders a cube with back-face culling stats", () => {
    const { backend, renderer, camera } = setup();
    const mesh = createCube(2);
    const material = new Material({ shading: "unlit", baseColor: red.clone() });
    camera.setLookAt(new Vec3(2, 2, 2), new Vec3(0, 0, 0));
    renderer.begin(camera, { clearColor: new Color(0, 0, 0, 1) });
    renderer.drawMesh(mesh, material, Mat4.identity());
    const stats = renderer.end();
    expect(stats.meshes).toBe(1);
    expect(stats.trianglesIn).toBe(12);
    expect(stats.trianglesDrawn).toBe(6);
    expect(stats.culled).toBe(6);
    const pixel = backend.readPixel(32, 32);
    expect(pixel.r).toBe(1);
    expect(pixel.g).toBe(0);
  });

  it("draws everything with cull mode none", () => {
    const { renderer, camera } = setup();
    camera.setLookAt(new Vec3(2, 2, 2), new Vec3(0, 0, 0));
    renderer.begin(camera, { cullMode: "none" });
    renderer.drawMesh(createCube(2), new Material({ shading: "unlit" }), Mat4.identity());
    const stats = renderer.end();
    expect(stats.trianglesDrawn).toBe(12);
  });

  it("frustum-culls meshes outside the view", () => {
    const { renderer, camera } = setup();
    camera.setLookAt(new Vec3(0, 0, 5), new Vec3(0, 0, 10));
    renderer.begin(camera);
    renderer.drawMesh(createCube(2), new Material({ shading: "unlit" }), Mat4.identity());
    const stats = renderer.end();
    expect(stats.meshes).toBe(1);
    expect(stats.trianglesIn).toBe(0);
    expect(stats.culled).toBe(1);
  });

  it("clips triangles against the near plane", () => {
    const { backend, renderer, camera } = setup();
    camera.position.set(0, 0, 0);
    camera.fovY = Math.PI / 2;
    const mesh = new Mesh(
      new Float64Array([-1, -1, -2, 1, -1, -2, 0, 1, -0.05]),
      new Uint32Array([0, 1, 2]),
    );
    const material = new Material({ shading: "unlit", baseColor: new Color(0, 1, 0, 1) });
    renderer.begin(camera, { clearColor: new Color(0, 0, 0, 1) });
    renderer.drawMesh(mesh, material, Mat4.identity(), { skipFrustumCull: true });
    const stats = renderer.end();
    expect(stats.trianglesDrawn).toBe(2);
    let lit = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        if (backend.readPixel(x, y).g > 0) lit += 1;
      }
    }
    expect(lit).toBeGreaterThan(10);
  });

  it("transforms bounds and world matrices", () => {
    const box = new AABB(new Vec3(-1, -1, -1), new Vec3(1, 1, 1));
    const moved = transformAabb(box, Mat4.fromTranslation(3, 0, 0));
    expect(moved.min.x).toBe(2);
    expect(moved.max.x).toBe(4);
    const world = composeWorldMatrix(new Vec3(1, 0, 0), Quat.identity(), new Vec3(2, 2, 2));
    const point = world.transformPoint(new Vec3(1, 0, 0));
    expect(point.x).toBe(3);
    expect(point.y).toBe(0);
  });
});

describe("Recording3DBackend", () => {
  it("records draw calls", () => {
    const backend = new Recording3DBackend();
    backend.clear(new Color(0, 0, 0, 1));
    backend.recordMesh(createCube(), "mat", Mat4.identity());
    backend.drawTriangle(vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0), context());
    backend.drawTriangle(vertex(0, 0, 0), vertex(1, 0, 0), vertex(0, 1, 0), context());
    expect(backend.clears).toBe(1);
    expect(backend.drawCount).toBe(1);
    expect(backend.draws[0]!.mesh).toBe("cube");
    expect(backend.draws[0]!.triangles).toBe(2);
  });
});

describe("glTF loading", () => {
  it("parses a GLB file", () => {
    const model = parseGltf(makeGlb());
    expect(model.meshes).toHaveLength(1);
    const mesh = model.meshes[0]!;
    expect(mesh.name).toBe("tri");
    expect(Array.from(mesh.positions.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
    const material = model.meshMaterials[0]!;
    expect(material.name).toBe("mat");
    expect(material.baseColor.r).toBeCloseTo(0.2, 6);
    expect(material.baseColor.g).toBeCloseTo(0.4, 6);
    expect(material.baseColor.b).toBeCloseTo(0.6, 6);
    expect(material.metallic).toBeCloseTo(0.25, 6);
    expect(material.roughness).toBeCloseTo(0.75, 6);
  });

  it("parses data-URI buffers and flattens the hierarchy", () => {
    const model = parseGltf(makeGlbDataUri());
    expect(model.meshes).toHaveLength(1);
    const items = flattenGltf(model);
    expect(items).toHaveLength(1);
    expect(items[0]!.matrix.elements[12]).toBeCloseTo(1, 12);
    expect(items[0]!.matrix.elements[13]).toBeCloseTo(2, 12);
    expect(items[0]!.matrix.elements[14]).toBeCloseTo(3, 12);
    expect(items[0]!.mesh.name).toBe("mesh-0");
  });
});
