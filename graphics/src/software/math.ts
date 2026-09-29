import type { VertexFormat, VertexLayoutDescriptor } from "../device.js";
import { SoftwareSampler, SoftwareTexture } from "../software/resources.js";

export function formatComponents(format: VertexFormat): number {
  if (format === "float32x2") return 2;
  if (format === "float32x3") return 3;
  return 4;
}

export function readAttribute(
  buffer: Uint8Array,
  layout: VertexLayoutDescriptor,
  name: string,
  index: number,
): number[] | null {
  const attribute = layout.attributes.find((candidate) => candidate.name === name);
  if (!attribute) return null;
  const components = formatComponents(attribute.format);
  const base = index * layout.arrayStride + attribute.offset;
  const view = new Float32Array(buffer.buffer, buffer.byteOffset + base, components);
  return [...view];
}

export function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row]! * b[column * 4 + k]!;
      }
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

export function transformPoint(matrix: Float32Array, x: number, y: number, z: number): [number, number, number, number] {
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
    matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!,
  ];
}

export function sampleTexture(binding: { texture: SoftwareTexture; sampler: SoftwareSampler }, u: number, v: number): [number, number, number, number] {
  const { texture, sampler } = binding;
  if (texture.format !== "rgba8") return [1, 1, 1, 1];
  let tu = u;
  let tv = v;
  if (sampler.addressMode === "repeat") {
    tu = tu - Math.floor(tu);
    tv = tv - Math.floor(tv);
  } else {
    tu = Math.min(1, Math.max(0, tu));
    tv = Math.min(1, Math.max(0, tv));
  }
  const x = Math.min(texture.width - 1, Math.floor(tu * texture.width));
  const y = Math.min(texture.height - 1, Math.floor(tv * texture.height));
  const index = (y * texture.width + x) * 4;
  const data = texture.colorBuffer();
  return [data[index]! / 255, data[index + 1]! / 255, data[index + 2]! / 255, data[index + 3]! / 255];
}
