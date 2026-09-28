import { AABB, Color, Mat4, Vec3, type Quat } from "@obx/math";
import type { Render3DBackend, RasterVertex, ShadingContext } from "./backends/software3d.js";
import { Camera3D, aabbVisible, type Plane4 } from "./camera3d.js";
import { createLighting, type Fog, type LightingEnvironment } from "./material.js";
import type { Material } from "./material.js";
import type { Mesh } from "./mesh.js";

export interface Renderer3DOptions {
  clearColor?: Color;
  lighting?: Partial<LightingEnvironment>;
  fog?: Fog | null;
  cullMode?: "back" | "front" | "none";
}

export interface Renderer3DStats {
  meshes: number;
  trianglesIn: number;
  trianglesDrawn: number;
  culled: number;
}

interface WorldVertex {
  wx: number;
  wy: number;
  wz: number;
  vx: number;
  vy: number;
  vz: number;
  nx: number;
  ny: number;
  nz: number;
  u: number;
  v: number;
}

export class Renderer3D {
  private camera: Camera3D | null = null;
  private viewMatrix = new Mat4();
  private projectionMatrix = new Mat4();
  private planes: Plane4[] = [];
  private lighting: LightingEnvironment = createLighting();
  private fog: Fog | null = null;
  private cullMode: "back" | "front" | "none" = "back";
  private stats: Renderer3DStats = { meshes: 0, trianglesIn: 0, trianglesDrawn: 0, culled: 0 };

  constructor(readonly backend: Render3DBackend) {}

  begin(camera: Camera3D, options: Renderer3DOptions = {}): void {
    this.camera = camera;
    this.viewMatrix = camera.viewMatrix();
    this.projectionMatrix = camera.projectionMatrix();
    this.planes = camera.frustumPlanes();
    this.lighting = createLighting(options.lighting);
    this.fog = options.fog ?? null;
    this.cullMode = options.cullMode ?? "back";
    this.stats = { meshes: 0, trianglesIn: 0, trianglesDrawn: 0, culled: 0 };
    this.backend.clear(options.clearColor ?? new Color(0, 0, 0, 1));
  }

  drawMesh(mesh: Mesh, material: Material, world: Mat4, options: { skipFrustumCull?: boolean } = {}): void {
    const camera = this.camera;
    if (!camera) {
      throw new Error("Renderer3D.drawMesh called outside begin()/end()");
    }
    this.stats.meshes += 1;

    if (!options.skipFrustumCull && !this.isBoundsVisible(mesh, world)) {
      this.stats.culled += 1;
      return;
    }

    const vertices: WorldVertex[] = [];
    const normalMatrix = world.clone().invert().transpose();
    const count = mesh.vertexCount;
    for (let i = 0; i < count; i += 1) {
      const pi = i * 3;
      const li = i * 2;
      const lx = mesh.positions[pi]!;
      const ly = mesh.positions[pi + 1]!;
      const lz = mesh.positions[pi + 2]!;
      const wx = world.elements[0]! * lx + world.elements[4]! * ly + world.elements[8]! * lz + world.elements[12]!;
      const wy = world.elements[1]! * lx + world.elements[5]! * ly + world.elements[9]! * lz + world.elements[13]!;
      const wz = world.elements[2]! * lx + world.elements[6]! * ly + world.elements[10]! * lz + world.elements[14]!;
      const inx = mesh.normals[pi]!;
      const iny = mesh.normals[pi + 1]!;
      const inz = mesh.normals[pi + 2]!;
      const nnx = normalMatrix.elements[0]! * inx + normalMatrix.elements[4]! * iny + normalMatrix.elements[8]! * inz;
      const nny = normalMatrix.elements[1]! * inx + normalMatrix.elements[5]! * iny + normalMatrix.elements[9]! * inz;
      const nnz = normalMatrix.elements[2]! * inx + normalMatrix.elements[6]! * iny + normalMatrix.elements[10]! * inz;
      const nLength = Math.hypot(nnx, nny, nnz) || 1;
      const vm = this.viewMatrix.elements;
      const vx = vm[0]! * wx + vm[4]! * wy + vm[8]! * wz + vm[12]!;
      const vy = vm[1]! * wx + vm[5]! * wy + vm[9]! * wz + vm[13]!;
      const vz = vm[2]! * wx + vm[6]! * wy + vm[10]! * wz + vm[14]!;
      vertices.push({
        wx,
        wy,
        wz,
        vx,
        vy,
        vz,
        nx: nnx / nLength,
        ny: nny / nLength,
        nz: nnz / nLength,
        u: mesh.uvs[li]!,
        v: mesh.uvs[li + 1]!,
      });
    }

    const context: ShadingContext = {
      material,
      lighting: this.lighting,
      fog: this.fog,
      cameraPosition: camera.position,
    };

    for (let i = 0; i < mesh.indices.length; i += 3) {
      this.stats.trianglesIn += 1;
      const a = vertices[mesh.indices[i]!]!;
      const b = vertices[mesh.indices[i + 1]!]!;
      const c = vertices[mesh.indices[i + 2]!]!;
      const clipped = clipNearPlane([a, b, c], camera.near);
      for (let fan = 1; fan + 1 < clipped.length; fan += 1) {
        this.rasterTriangle(clipped[0]!, clipped[fan]!, clipped[fan + 1]!, context);
      }
    }
  }

  end(): Renderer3DStats {
    this.camera = null;
    return { ...this.stats };
  }

  private isBoundsVisible(mesh: Mesh, world: Mat4): boolean {
    const box = transformAabb(mesh.aabb, world);
    return aabbVisible(this.planes, box);
  }

  private rasterTriangle(a: WorldVertex, b: WorldVertex, c: WorldVertex, context: ShadingContext): void {
    const pa = projectVertex(a, this.projectionMatrix, this.backend.width, this.backend.height);
    const pb = projectVertex(b, this.projectionMatrix, this.backend.width, this.backend.height);
    const pc = projectVertex(c, this.projectionMatrix, this.backend.width, this.backend.height);
    if (!pa || !pb || !pc) return;

    const area = (pb.sx - pa.sx) * (pc.sy - pa.sy) - (pc.sx - pa.sx) * (pb.sy - pa.sy);
    if (Math.abs(area) < 1e-12) return;
    const frontFacing = area < 0;
    if (this.cullMode === "back" && !frontFacing) {
      this.stats.culled += 1;
      return;
    }
    if (this.cullMode === "front" && frontFacing) {
      this.stats.culled += 1;
      return;
    }

    this.backend.drawTriangle(pa, pb, pc, context);
    this.stats.trianglesDrawn += 1;
  }
}

function projectVertex(v: WorldVertex, projection: Mat4, width: number, height: number): RasterVertex | null {
  const e = projection.elements;
  const cx = e[0]! * v.vx + e[4]! * v.vy + e[8]! * v.vz + e[12]!;
  const cy = e[1]! * v.vx + e[5]! * v.vy + e[9]! * v.vz + e[13]!;
  const cz = e[2]! * v.vx + e[6]! * v.vy + e[10]! * v.vz + e[14]!;
  const cw = e[3]! * v.vx + e[7]! * v.vy + e[11]! * v.vz + e[15]!;
  if (Math.abs(cw) < 1e-12) return null;
  const invW = 1 / cw;
  return {
    sx: ((cx * invW + 1) / 2) * width,
    sy: ((1 - cy * invW) / 2) * height,
    depth: (cz * invW + 1) / 2,
    invW,
    wx: v.wx,
    wy: v.wy,
    wz: v.wz,
    nx: v.nx,
    ny: v.ny,
    nz: v.nz,
    u: v.u,
    v: v.v,
  };
}

function clipNearPlane(vertices: WorldVertex[], near: number): WorldVertex[] {
  const output: WorldVertex[] = [];
  const planeZ = -near;
  for (let i = 0; i < vertices.length; i += 1) {
    const current = vertices[i]!;
    const next = vertices[(i + 1) % vertices.length]!;
    const currentInside = current.vz <= planeZ;
    const nextInside = next.vz <= planeZ;
    if (currentInside) {
      output.push(current);
    }
    if (currentInside !== nextInside) {
      const t = (planeZ - current.vz) / (next.vz - current.vz);
      output.push(lerpVertex(current, next, t));
    }
  }
  return output;
}

function lerpVertex(a: WorldVertex, b: WorldVertex, t: number): WorldVertex {
  return {
    wx: a.wx + (b.wx - a.wx) * t,
    wy: a.wy + (b.wy - a.wy) * t,
    wz: a.wz + (b.wz - a.wz) * t,
    vx: a.vx + (b.vx - a.vx) * t,
    vy: a.vy + (b.vy - a.vy) * t,
    vz: a.vz + (b.vz - a.vz) * t,
    nx: a.nx + (b.nx - a.nx) * t,
    ny: a.ny + (b.ny - a.ny) * t,
    nz: a.nz + (b.nz - a.nz) * t,
    u: a.u + (b.u - a.u) * t,
    v: a.v + (b.v - a.v) * t,
  };
}

export function transformAabb(box: AABB, matrix: Mat4): AABB {
  const out = new AABB();
  const corner = new Vec3();
  for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
    corner.set(
      cornerIndex & 1 ? box.max.x : box.min.x,
      cornerIndex & 2 ? box.max.y : box.min.y,
      cornerIndex & 4 ? box.max.z : box.min.z,
    );
    matrix.transformPoint(corner, corner);
    out.expandByPoint(corner);
  }
  return out;
}

export function composeWorldMatrix(position: Vec3, rotation: Quat, scale: Vec3): Mat4 {
  return new Mat4().compose(position, rotation, scale);
}
