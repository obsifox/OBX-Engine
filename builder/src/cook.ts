export type PixelFormat = "rgba8" | "rgb565" | "la8" | "r8";

export interface PixelBuffer {
  width: number;
  height: number;
  format: PixelFormat;
  data: Uint8Array;
}

export interface TextureCookInput {
  name: string;
  pixels: PixelBuffer;
  targetFormat: PixelFormat;
  generateMipmaps: boolean;
  compress: boolean;
}

export interface CookedMip {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface CookedTexture {
  name: string;
  format: PixelFormat;
  width: number;
  height: number;
  mips: CookedMip[];
  compressed: boolean;
  originalBytes: number;
  cookedBytes: number;
}

export function bytesPerPixel(format: PixelFormat): number {
  switch (format) {
    case "rgba8":
      return 4;
    case "rgb565":
      return 2;
    case "la8":
      return 2;
    default:
      return 1;
  }
}

export function convertPixelFormat(pixels: PixelBuffer, target: PixelFormat): PixelBuffer {
  if (pixels.format === target) return { ...pixels, data: new Uint8Array(pixels.data) };
  const out = new Uint8Array(pixels.width * pixels.height * bytesPerPixel(target));
  for (let i = 0; i < pixels.width * pixels.height; i += 1) {
    const [r, g, b, a] = sampleRgba(pixels, i);
    writePixel(out, i, target, r, g, b, a);
  }
  return { width: pixels.width, height: pixels.height, format: target, data: out };
}

function sampleRgba(pixels: PixelBuffer, index: number): [number, number, number, number] {
  const bpp = bytesPerPixel(pixels.format);
  const offset = index * bpp;
  switch (pixels.format) {
    case "rgba8":
      return [pixels.data[offset]!, pixels.data[offset + 1]!, pixels.data[offset + 2]!, pixels.data[offset + 3]!];
    case "rgb565": {
      const value = (pixels.data[offset]! << 8) | pixels.data[offset + 1]!;
      const r = ((value >> 11) & 31) * 255 / 31;
      const g = ((value >> 5) & 63) * 255 / 63;
      const b = (value & 31) * 255 / 31;
      return [Math.round(r), Math.round(g), Math.round(b), 255];
    }
    case "la8":
      return [pixels.data[offset]!, pixels.data[offset]!, pixels.data[offset]!, pixels.data[offset + 1]!];
    default:
      return [pixels.data[offset]!, pixels.data[offset]!, pixels.data[offset]!, 255];
  }
}

function writePixel(out: Uint8Array, index: number, format: PixelFormat, r: number, g: number, b: number, a: number): void {
  const offset = index * bytesPerPixel(format);
  switch (format) {
    case "rgba8":
      out[offset] = r;
      out[offset + 1] = g;
      out[offset + 2] = b;
      out[offset + 3] = a;
      return;
    case "rgb565": {
      const value = ((r * 31 / 255) << 11) | ((g * 63 / 255) << 5) | (b * 31 / 255);
      out[offset] = (value >> 8) & 255;
      out[offset + 1] = value & 255;
      return;
    }
    case "la8": {
      const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      out[offset] = luminance;
      out[offset + 1] = a;
      return;
    }
    default:
      out[offset] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      return;
  }
}

export function resizePixels(pixels: PixelBuffer, width: number, height: number): PixelBuffer {
  const out = new Uint8Array(width * height * bytesPerPixel(pixels.format));
  const result: PixelBuffer = { width, height, format: pixels.format, data: out };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      const x0 = Math.floor(x * pixels.width / width);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * pixels.width / width));
      const y0 = Math.floor(y * pixels.height / height);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * pixels.height / height));
      for (let sy = y0; sy < y1 && sy < pixels.height; sy += 1) {
        for (let sx = x0; sx < x1 && sx < pixels.width; sx += 1) {
          const [sr, sg, sb, sa] = sampleRgba(pixels, sy * pixels.width + sx);
          r += sr;
          g += sg;
          b += sb;
          a += sa;
          count += 1;
        }
      }
      writePixel(out, y * width + x, pixels.format, Math.round(r / count), Math.round(g / count), Math.round(b / count), Math.round(a / count));
    }
  }
  return result;
}

export function generateMipmaps(pixels: PixelBuffer, levels = 0): CookedMip[] {
  const mips: CookedMip[] = [{ width: pixels.width, height: pixels.height, data: new Uint8Array(pixels.data) }];
  let current = pixels;
  const maxLevels = levels > 0 ? levels : Math.floor(Math.log2(Math.max(pixels.width, pixels.height))) + 1;
  while (mips.length < maxLevels && (current.width > 1 || current.height > 1)) {
    const next = resizePixels(current, Math.max(1, current.width >> 1), Math.max(1, current.height >> 1));
    mips.push({ width: next.width, height: next.height, data: next.data });
    current = next;
  }
  return mips;
}

export function compressBytes(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let index = 0;
  while (index < data.length) {
    let run = 1;
    while (run < 255 && index + run < data.length && data[index + run] === data[index]) run += 1;
    if (run >= 3 || data[index]! >= 192) {
      out.push(192 | run, data[index]!);
      index += run;
      continue;
    }
    const literalStart = index;
    let literalLength = 0;
    while (literalLength < 63 && index < data.length) {
      if (index + 2 < data.length && data[index] === data[index + 1] && data[index] === data[index + 2]) break;
      if (data[index]! >= 192 && literalLength > 0) break;
      literalLength += 1;
      index += 1;
    }
    out.push(literalLength);
    for (let i = 0; i < literalLength; i += 1) out.push(data[literalStart + i]!);
    if (literalLength === 0) {
      out.push(193, data[index]!);
      index += 1;
    }
  }
  return Uint8Array.from(out);
}

export function decompressBytes(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let index = 0;
  while (index < data.length) {
    const header = data[index]!;
    index += 1;
    if (header >= 192) {
      const run = header & 63;
      const value = data[index]!;
      index += 1;
      for (let i = 0; i < run; i += 1) out.push(value);
    } else {
      for (let i = 0; i < header; i += 1) {
        out.push(data[index]!);
        index += 1;
      }
    }
  }
  return Uint8Array.from(out);
}

export function cookTexture(input: TextureCookInput): CookedTexture {
  const converted = convertPixelFormat(input.pixels, input.targetFormat);
  const mipChain = input.generateMipmaps ? generateMipmaps(converted) : [{ width: converted.width, height: converted.height, data: converted.data }];
  const mips = input.compress
    ? mipChain.map((mip) => ({ width: mip.width, height: mip.height, data: compressBytes(mip.data) }))
    : mipChain;
  const cookedBytes = mips.reduce((total, mip) => total + mip.data.length, 0);
  return {
    name: input.name,
    format: input.targetFormat,
    width: converted.width,
    height: converted.height,
    mips,
    compressed: input.compress,
    originalBytes: input.pixels.data.length,
    cookedBytes,
  };
}

export interface MeshVertex {
  position: [number, number, number];
  normal: [number, number, number];
  uv: [number, number];
}

export interface MeshCookInput {
  name: string;
  vertices: MeshVertex[];
  indices: number[];
  quantizeBits: number;
  weldEpsilon: number;
}

export interface CookedMesh {
  name: string;
  vertexCount: number;
  indexCount: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  originalBytes: number;
  cookedBytes: number;
}

export function weldVertices(vertices: readonly MeshVertex[], indices: readonly number[], epsilon: number): { vertices: MeshVertex[]; indices: number[] } {
  const unique: MeshVertex[] = [];
  const remap: number[] = [];
  for (const vertex of vertices) {
    const found = unique.findIndex(
      (existing) =>
        Math.abs(existing.position[0] - vertex.position[0]) <= epsilon &&
        Math.abs(existing.position[1] - vertex.position[1]) <= epsilon &&
        Math.abs(existing.position[2] - vertex.position[2]) <= epsilon &&
        Math.abs(existing.uv[0] - vertex.uv[0]) <= epsilon &&
        Math.abs(existing.uv[1] - vertex.uv[1]) <= epsilon,
    );
    if (found >= 0) {
      remap.push(found);
    } else {
      remap.push(unique.length);
      unique.push({ position: [...vertex.position], normal: [...vertex.normal], uv: [...vertex.uv] });
    }
  }
  return { vertices: unique, indices: indices.map((index) => remap[index] ?? 0) };
}

export function quantizeValue(value: number, bits: number): number {
  const steps = Math.pow(2, bits - 1) - 1;
  return Math.round(value * steps) / steps;
}

export function optimizeVertexOrder(vertices: readonly MeshVertex[], indices: readonly number[]): { vertices: MeshVertex[]; indices: number[] } {
  const order = new Map<number, number>();
  const nextIndices: number[] = [];
  for (const index of indices) {
    if (!order.has(index)) order.set(index, order.size);
    nextIndices.push(order.get(index)!);
  }
  const nextVertices: MeshVertex[] = new Array(vertices.length);
  for (const [oldIndex, newIndex] of order) {
    nextVertices[newIndex] = vertices[oldIndex]!;
  }
  for (let i = 0; i < vertices.length; i += 1) {
    if (!nextVertices[i]) {
      nextVertices[i] = vertices[i]!;
    }
  }
  return { vertices: nextVertices, indices: nextIndices };
}

export function cookMesh(input: MeshCookInput): CookedMesh {
  const welded = weldVertices(input.vertices, input.indices, input.weldEpsilon);
  const optimized = optimizeVertexOrder(welded.vertices, welded.indices);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const vertex of optimized.vertices) {
    for (const axis of vertex.position) positions.push(quantizeValue(axis, input.quantizeBits));
    for (const axis of vertex.normal) normals.push(quantizeValue(axis, input.quantizeBits));
    for (const axis of vertex.uv) uvs.push(quantizeValue(axis, input.quantizeBits));
  }
  const cookedBytes = (positions.length + normals.length + uvs.length) * 4 + optimized.indices.length * 4;
  const originalBytes = input.vertices.length * 8 * 4 + input.indices.length * 4;
  return {
    name: input.name,
    vertexCount: optimized.vertices.length,
    indexCount: optimized.indices.length,
    positions,
    normals,
    uvs,
    indices: optimized.indices,
    originalBytes,
    cookedBytes,
  };
}

export interface ShaderUniform {
  name: string;
  type: "float" | "vec2" | "vec3" | "vec4" | "mat4" | "sampler2d";
}

export interface CompiledShaderPackage {
  name: string;
  stage: "vertex" | "fragment";
  uniforms: ShaderUniform[];
  tokens: string[];
  sourceBytes: number;
  packageBytes: number;
}

const UNIFORM_TYPES = new Set(["float", "vec2", "vec3", "vec4", "mat4", "sampler2d"]);

export function compileShaderPackage(name: string, stage: "vertex" | "fragment", source: string): CompiledShaderPackage {
  const uniforms: ShaderUniform[] = [];
  const tokens = source.split(/\s+/).filter((token) => token.length > 0);
  const uniformPattern = /uniform\s+(float|vec2|vec3|vec4|mat4|sampler2d)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = uniformPattern.exec(source)) !== null) {
    const type = match[1]!.toLowerCase() as ShaderUniform["type"];
    if (UNIFORM_TYPES.has(type)) uniforms.push({ name: match[2]!, type });
  }
  const packageBytes = tokens.reduce((total, token) => total + token.length + 1, 0) + uniforms.length * 16;
  return { name, stage, uniforms, tokens, sourceBytes: source.length, packageBytes };
}

export interface DependencyNode {
  id: string;
  dependencies: string[];
}

export function stripDependencies(nodes: readonly DependencyNode[], roots: readonly string[]): { kept: string[]; stripped: string[] } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const kept = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (kept.has(id)) continue;
    if (!byId.has(id)) continue;
    kept.add(id);
    for (const dependency of byId.get(id)!.dependencies) stack.push(dependency);
  }
  const stripped = nodes.map((node) => node.id).filter((id) => !kept.has(id));
  return { kept: [...kept].sort(), stripped: stripped.sort() };
}

export interface RuntimePackageEntry {
  name: string;
  kind: "texture" | "mesh" | "shader" | "data";
  bytes: Uint8Array;
}

export interface RuntimePackage {
  index: { name: string; kind: string; offset: number; compressedLength: number; rawLength: number }[];
  blob: Uint8Array;
  totalRawBytes: number;
  totalCookedBytes: number;
}

export function packageRuntimeAssets(entries: readonly RuntimePackageEntry[], compress = true): RuntimePackage {
  const index: RuntimePackage["index"] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;
  let totalRaw = 0;
  for (const entry of entries) {
    const payload = compress ? compressBytes(entry.bytes) : new Uint8Array(entry.bytes);
    index.push({ name: entry.name, kind: entry.kind, offset, compressedLength: payload.length, rawLength: entry.bytes.length });
    parts.push(payload);
    offset += payload.length;
    totalRaw += entry.bytes.length;
  }
  const blob = new Uint8Array(offset);
  let cursor = 0;
  for (const part of parts) {
    blob.set(part, cursor);
    cursor += part.length;
  }
  return { index, blob, totalRawBytes: totalRaw, totalCookedBytes: offset };
}

export function extractRuntimeEntry(pkg: RuntimePackage, name: string, compressed = true): Uint8Array | null {
  const entry = pkg.index.find((item) => item.name === name);
  if (!entry) return null;
  const slice = pkg.blob.slice(entry.offset, entry.offset + entry.compressedLength);
  return compressed ? decompressBytes(slice) : slice;
}
