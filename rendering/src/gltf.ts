import { Color, Mat4, Quat, Vec3 } from "@obx/math";
import { Material } from "./material.js";
import { Mesh } from "./mesh.js";

export interface GltfNode {
  name: string;
  matrix: Mat4;
  meshIndex: number | null;
  children: number[];
}

export interface GltfModel {
  meshes: Mesh[];
  meshMaterials: Material[];
  materials: Material[];
  nodes: GltfNode[];
  roots: number[];
}

interface GltfJson {
  asset?: { version?: string };
  buffers?: Array<{ byteLength?: number; uri?: string }>;
  bufferViews?: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }>;
  accessors?: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    max?: number[];
    min?: number[];
  }>;
  meshes?: Array<{
    name?: string;
    primitives?: Array<{
      attributes?: Record<string, number>;
      indices?: number;
      material?: number;
      mode?: number;
    }>;
  }>;
  materials?: Array<{
    name?: string;
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
    };
    emissiveFactor?: number[];
    doubleSided?: boolean;
  }>;
  nodes?: Array<{
    name?: string;
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }>;
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
}

const COMPONENT_BYTES: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

export function parseGltf(source: string | Uint8Array): GltfModel {
  const json = parseJson(source);
  const buffers = loadBuffers(json, source);
  const materials = (json.materials ?? []).map((entry) => buildMaterial(entry));
  const meshes: Mesh[] = [];
  const meshMaterials: Material[] = [];
  (json.meshes ?? []).forEach((entry, meshIndex) => {
    const { mesh, materialIndex } = buildMesh(json, buffers, entry, meshIndex);
    meshes.push(mesh);
    meshMaterials.push(materials[materialIndex] ?? new Material({ name: `material-${meshIndex}` }));
  });
  const nodes = (json.nodes ?? []).map((entry, nodeIndex) => buildNode(entry, nodeIndex));
  const sceneIndex = json.scene ?? 0;
  const roots = json.scenes?.[sceneIndex]?.nodes ?? nodes.map((_, index) => index);
  return { meshes, meshMaterials, materials, nodes, roots };
}

function parseJson(source: string | Uint8Array): GltfJson {
  if (typeof source === "string") {
    return JSON.parse(source) as GltfJson;
  }
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const magic = view.getUint32(0, true);
  if (magic === 0x46546c67) {
    let offset = 12;
    while (offset < source.byteLength) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      if (chunkType === 0x4e4f534a) {
        const jsonBytes = source.subarray(offset + 8, offset + 8 + chunkLength);
        return JSON.parse(new TextDecoder().decode(jsonBytes)) as GltfJson;
      }
      offset += 8 + chunkLength;
    }
    throw new Error("GLB is missing a JSON chunk");
  }
  return JSON.parse(new TextDecoder().decode(source)) as GltfJson;
}

function loadBuffers(json: GltfJson, source: string | Uint8Array): Uint8Array[] {
  return (json.buffers ?? []).map((buffer) => {
    const uri = buffer.uri;
    if (!uri) {
      if (typeof source !== "string") {
        const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
        let offset = 12;
        while (offset < source.byteLength) {
          const chunkLength = view.getUint32(offset, true);
          const chunkType = view.getUint32(offset + 4, true);
          if (chunkType === 0x004e4942) {
            return source.subarray(offset + 8, offset + 8 + chunkLength);
          }
          offset += 8 + chunkLength;
        }
        throw new Error("GLB is missing a BIN chunk");
      }
      throw new Error("gltf buffer without uri is only supported in GLB");
    }
    const comma = uri.indexOf(",");
    if (uri.startsWith("data:") && comma >= 0) {
      const base64 = uri.slice(comma + 1);
      return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    }
    throw new Error("External buffer URIs are not supported; embed buffers as data URIs");
  });
}

function readAccessor(json: GltfJson, buffers: Uint8Array[], accessorIndex: number): Float64Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`Missing accessor ${accessorIndex}`);
  }
  const componentCount = TYPE_COMPONENTS[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  if (!componentCount || !componentBytes) {
    throw new Error("Unsupported accessor format");
  }
  const bufferView = json.bufferViews?.[accessor.bufferView ?? -1];
  const buffer = buffers[bufferView?.buffer ?? -1];
  if (!bufferView || !buffer) {
    throw new Error("Accessor references a missing buffer view");
  }
  const start =
    (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? componentCount * componentBytes;
  const out = new Float64Array(accessor.count * componentCount);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  for (let i = 0; i < accessor.count; i += 1) {
    for (let c = 0; c < componentCount; c += 1) {
      const at = start + i * stride + c * componentBytes;
      let value = 0;
      switch (accessor.componentType) {
        case 5120:
          value = view.getInt8(at);
          break;
        case 5121:
          value = view.getUint8(at);
          break;
        case 5122:
          value = view.getInt16(at, true);
          break;
        case 5123:
          value = view.getUint16(at, true);
          break;
        case 5125:
          value = view.getUint32(at, true);
          break;
        case 5126:
          value = view.getFloat32(at, true);
          break;
      }
      out[i * componentCount + c] = value;
    }
  }
  return out;
}

function buildMesh(
  json: GltfJson,
  buffers: Uint8Array[],
  entry: NonNullable<GltfJson["meshes"]>[number],
  meshIndex: number,
): { mesh: Mesh; materialIndex: number } {
  const primitive = entry.primitives?.[0];
  if (!primitive || (primitive.mode ?? 4) !== 4) {
    throw new Error("Only triangle primitives are supported");
  }
  const positionAccessor = primitive.attributes?.POSITION;
  if (positionAccessor === undefined) {
    throw new Error("Primitive is missing POSITION");
  }
  const positions = readAccessor(json, buffers, positionAccessor);
  const normals = primitive.attributes?.NORMAL !== undefined
    ? readAccessor(json, buffers, primitive.attributes.NORMAL)
    : undefined;
  const uvs = primitive.attributes?.TEXCOORD_0 !== undefined
    ? readAccessor(json, buffers, primitive.attributes.TEXCOORD_0)
    : undefined;
  const indices = primitive.indices !== undefined
    ? toIndices(readAccessor(json, buffers, primitive.indices))
    : Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
  return {
    mesh: new Mesh(
      positions,
      indices,
      normals ? Float64Array.from(normals) : undefined,
      uvs ? Float64Array.from(uvs) : undefined,
      entry.name ?? `mesh-${meshIndex}`,
    ),
    materialIndex: primitive.material ?? 0,
  };
}

function toIndices(values: Float64Array): Uint32Array {
  const out = new Uint32Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    out[i] = values[i]!;
  }
  return out;
}

function buildMaterial(entry: NonNullable<GltfJson["materials"]>[number]): Material {
  const pbr = entry.pbrMetallicRoughness ?? {};
  const base = pbr.baseColorFactor ?? [1, 1, 1, 1];
  const emissive = entry.emissiveFactor ?? [0, 0, 0];
  return new Material({
    name: entry.name ?? "material",
    shading: "standard",
    baseColor: new Color(base[0] ?? 1, base[1] ?? 1, base[2] ?? 1, base[3] ?? 1),
    metallic: pbr.metallicFactor ?? 1,
    roughness: pbr.roughnessFactor ?? 1,
    emissive: new Color(emissive[0] ?? 0, emissive[1] ?? 0, emissive[2] ?? 0, 1),
    doubleSided: entry.doubleSided ?? false,
  });
}

function buildNode(entry: NonNullable<GltfJson["nodes"]>[number], nodeIndex: number): GltfNode {
  const matrix = new Mat4();
  if (entry.matrix && entry.matrix.length === 16) {
    matrix.elements.set(entry.matrix);
  } else {
    const t = entry.translation ?? [0, 0, 0];
    const r = entry.rotation ?? [0, 0, 0, 1];
    const s = entry.scale ?? [1, 1, 1];
    matrix.compose(
      new Vec3(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0),
      new Quat(r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 1),
      new Vec3(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1),
    );
  }
  return {
    name: entry.name ?? `node-${nodeIndex}`,
    matrix,
    meshIndex: entry.mesh ?? null,
    children: entry.children ?? [],
  };
}

export function flattenGltf(model: GltfModel): Array<{ mesh: Mesh; material: Material; matrix: Mat4 }> {
  const output: Array<{ mesh: Mesh; material: Material; matrix: Mat4 }> = [];
  const walk = (index: number, parent: Mat4): void => {
    const node = model.nodes[index];
    if (!node) return;
    const world = Mat4.multiply(parent, node.matrix);
    if (node.meshIndex !== null) {
      const mesh = model.meshes[node.meshIndex];
      if (mesh) {
        const material = model.meshMaterials[node.meshIndex] ?? new Material();
        output.push({ mesh, material, matrix: world });
      }
    }
    for (const child of node.children) {
      walk(child, world);
    }
  };
  for (const root of model.roots) {
    walk(root, Mat4.identity());
  }
  return output;
}
