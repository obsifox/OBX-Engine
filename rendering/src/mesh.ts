import { AABB, Sphere, Vec3 } from "@obx/math";

export class Mesh {
  readonly positions: Float64Array;
  readonly normals: Float64Array;
  readonly uvs: Float64Array;
  readonly indices: Uint32Array;
  readonly aabb: AABB;
  readonly sphere: Sphere;

  constructor(
    positions: Float64Array,
    indices: Uint32Array,
    normals?: Float64Array,
    uvs?: Float64Array,
    readonly name = "mesh",
  ) {
    if (positions.length % 3 !== 0) {
      throw new RangeError("Mesh positions must be a multiple of 3");
    }
    this.positions = positions;
    this.indices = indices;
    this.normals = normals ?? computeNormals(positions, indices);
    this.uvs = uvs ?? new Float64Array((positions.length / 3) * 2);
    if (this.normals.length !== positions.length) {
      throw new RangeError("Mesh normals length mismatch");
    }
    if (this.uvs.length !== (positions.length / 3) * 2) {
      throw new RangeError("Mesh uvs length mismatch");
    }
    for (let i = 0; i < indices.length; i += 1) {
      if (indices[i]! >= positions.length / 3) {
        throw new RangeError("Mesh index out of range");
      }
    }
    this.aabb = computeAabb(positions);
    this.sphere = computeSphere(positions, this.aabb);
  }

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  vertexPosition(index: number, out = new Vec3()): Vec3 {
    const i = index * 3;
    return out.set(this.positions[i]!, this.positions[i + 1]!, this.positions[i + 2]!);
  }

  vertexNormal(index: number, out = new Vec3()): Vec3 {
    const i = index * 3;
    return out.set(this.normals[i]!, this.normals[i + 1]!, this.normals[i + 2]!);
  }

  vertexUv(index: number): { u: number; v: number } {
    const i = index * 2;
    return { u: this.uvs[i]!, v: this.uvs[i + 1]! };
  }
}

export function computeNormals(positions: Float64Array, indices: Uint32Array): Float64Array {
  const normals = new Float64Array(positions.length);
  const a = new Vec3();
  const b = new Vec3();
  const c = new Vec3();
  const ab = new Vec3();
  const ac = new Vec3();
  const faceNormal = new Vec3();

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i]! * 3;
    const i1 = indices[i + 1]! * 3;
    const i2 = indices[i + 2]! * 3;
    a.set(positions[i0]!, positions[i0 + 1]!, positions[i0 + 2]!);
    b.set(positions[i1]!, positions[i1 + 1]!, positions[i1 + 2]!);
    c.set(positions[i2]!, positions[i2 + 1]!, positions[i2 + 2]!);
    ab.copy(b).sub(a);
    ac.copy(c).sub(a);
    faceNormal.copy(ab).cross(ac);
    for (const base of [i0, i1, i2]) {
      normals[base] = (normals[base] ?? 0) + faceNormal.x;
      normals[base + 1] = (normals[base + 1] ?? 0) + faceNormal.y;
      normals[base + 2] = (normals[base + 2] ?? 0) + faceNormal.z;
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0);
    if (length > 1e-12) {
      normals[i] = (normals[i] ?? 0) / length;
      normals[i + 1] = (normals[i + 1] ?? 0) / length;
      normals[i + 2] = (normals[i + 2] ?? 0) / length;
    } else {
      normals[i + 2] = 1;
    }
  }
  return normals;
}

function computeAabb(positions: Float64Array): AABB {
  const box = new AABB();
  const p = new Vec3();
  for (let i = 0; i < positions.length; i += 3) {
    p.set(positions[i]!, positions[i + 1]!, positions[i + 2]!);
    box.expandByPoint(p);
  }
  return box;
}

function computeSphere(positions: Float64Array, aabb: AABB): Sphere {
  const center = aabb.center();
  let radiusSq = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i]! - center.x;
    const dy = positions[i + 1]! - center.y;
    const dz = positions[i + 2]! - center.z;
    radiusSq = Math.max(radiusSq, dx * dx + dy * dy + dz * dz);
  }
  return new Sphere(center, Math.sqrt(radiusSq));
}

export function createCube(size = 1, name = "cube"): Mesh {
  const h = size / 2;
  const positions = new Float64Array([
    -h, -h, h, h, -h, h, h, h, h, -h, h, h,
    h, -h, -h, -h, -h, -h, -h, h, -h, h, h, -h,
    -h, h, h, h, h, h, h, h, -h, -h, h, -h,
    -h, -h, -h, h, -h, -h, h, -h, h, -h, -h, h,
    h, -h, h, h, -h, -h, h, h, -h, h, h, h,
    -h, -h, -h, -h, -h, h, -h, h, h, -h, h, -h,
  ]);
  const normals = new Float64Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);
  const uvs = new Float64Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);
  return new Mesh(positions, indices, normals, uvs, name);
}

export function createPlane(width = 1, height = 1, name = "plane"): Mesh {
  const hw = width / 2;
  const hh = height / 2;
  const positions = new Float64Array([
    -hw, 0, hh, hw, 0, hh, hw, 0, -hh, -hw, 0, -hh,
  ]);
  const normals = new Float64Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]);
  const uvs = new Float64Array([0, 1, 1, 1, 1, 0, 0, 0]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  return new Mesh(positions, indices, normals, uvs, name);
}

export function createUvSphere(radius = 0.5, segments = 16, rings = 12, name = "sphere"): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring += 1) {
    const phi = (ring / rings) * Math.PI;
    for (let segment = 0; segment <= segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
      uvs.push(segment / segments, 1 - ring / rings);
    }
  }

  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * (segments + 1) + segment;
      const b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  return new Mesh(
    Float64Array.from(positions),
    Uint32Array.from(indices),
    Float64Array.from(normals),
    Float64Array.from(uvs),
    name,
  );
}
