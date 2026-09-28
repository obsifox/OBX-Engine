import { Color, Vec3, type AABB } from "@obx/math";
import type { Fog, LightingEnvironment, Material } from "../material.js";
import { Texture } from "../texture.js";

export interface RasterVertex {
  sx: number;
  sy: number;
  depth: number;
  invW: number;
  wx: number;
  wy: number;
  wz: number;
  nx: number;
  ny: number;
  nz: number;
  u: number;
  v: number;
}

export interface ShadingContext {
  material: Material;
  lighting: LightingEnvironment;
  fog: Fog | null;
  cameraPosition: Vec3;
}

export interface Render3DBackend {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  clear(color: Color): void;
  drawTriangle(a: RasterVertex, b: RasterVertex, c: RasterVertex, context: ShadingContext): void;
}

const EPSILON = 1e-9;
const FILL_NUDGE = 1e-4;

export class Software3DBackend implements Render3DBackend {
  readonly name = "software3d";
  readonly pixels: Uint8ClampedArray;
  readonly depth: Float64Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.depth = new Float64Array(width * height).fill(Infinity);
  }

  clear(color: Color): void {
    const [r, g, b, a] = color.toRgba8();
    for (let i = 0; i < this.pixels.length; i += 4) {
      this.pixels[i] = r;
      this.pixels[i + 1] = g;
      this.pixels[i + 2] = b;
      this.pixels[i + 3] = a;
    }
    this.depth.fill(Infinity);
  }

  readPixel(x: number, y: number, out = new Color()): Color {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) {
      return out.set(0, 0, 0, 0);
    }
    const i = (py * this.width + px) * 4;
    return out.set(
      (this.pixels[i] ?? 0) / 255,
      (this.pixels[i + 1] ?? 0) / 255,
      (this.pixels[i + 2] ?? 0) / 255,
      (this.pixels[i + 3] ?? 0) / 255,
    );
  }

  readDepth(x: number, y: number): number {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return Infinity;
    return this.depth[py * this.width + px] ?? Infinity;
  }

  toTexture(name = "framebuffer3d"): Texture {
    return new Texture(this.width, this.height, new Uint8ClampedArray(this.pixels), name);
  }

  drawTriangle(a: RasterVertex, b: RasterVertex, c: RasterVertex, context: ShadingContext): void {
    let v0 = a;
    let v1 = b;
    let v2 = c;

    const area = (v1.sx - v0.sx) * (v2.sy - v0.sy) - (v2.sx - v0.sx) * (v1.sy - v0.sy);
    if (Math.abs(area) < EPSILON) return;
    if (area < 0) {
      const swap = v1;
      v1 = v2;
      v2 = swap;
    }

    const minX = Math.max(0, Math.floor(Math.min(v0.sx, v1.sx, v2.sx)));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(v0.sx, v1.sx, v2.sx)));
    const minY = Math.max(0, Math.floor(Math.min(v0.sy, v1.sy, v2.sy)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(v0.sy, v1.sy, v2.sy)));
    if (minX > maxX || minY > maxY) return;

    const areaInv = 1 / Math.abs(area);

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5 + FILL_NUDGE;
        const py = y + 0.5 + FILL_NUDGE;

        const w0 = ((v1.sx - px) * (v2.sy - py) - (v2.sx - px) * (v1.sy - py)) * areaInv;
        const w1 = ((v2.sx - px) * (v0.sy - py) - (v0.sx - px) * (v2.sy - py)) * areaInv;
        const w2 = 1 - w0 - w1;
        if (w0 < -EPSILON || w1 < -EPSILON || w2 < -EPSILON) continue;

        const depth = w0 * v0.depth + w1 * v1.depth + w2 * v2.depth;
        const index = y * this.width + x;
        if (depth >= (this.depth[index] ?? Infinity)) continue;

        const invW = w0 * v0.invW + w1 * v1.invW + w2 * v2.invW;
        const correct = 1 / (Math.abs(invW) < EPSILON ? EPSILON : invW);
        const wx = (w0 * v0.wx + w1 * v1.wx + w2 * v2.wx) * correct;
        const wy = (w0 * v0.wy + w1 * v1.wy + w2 * v2.wy) * correct;
        const wz = (w0 * v0.wz + w1 * v1.wz + w2 * v2.wz) * correct;
        let nx = (w0 * v0.nx + w1 * v1.nx + w2 * v2.nx) * correct;
        let ny = (w0 * v0.ny + w1 * v1.ny + w2 * v2.ny) * correct;
        let nz = (w0 * v0.nz + w1 * v1.nz + w2 * v2.nz) * correct;
        const u = (w0 * v0.u + w1 * v1.u + w2 * v2.u) * correct;
        const v = (w0 * v0.v + w1 * v1.v + w2 * v2.v) * correct;

        const normalLength = Math.hypot(nx, ny, nz);
        if (normalLength > EPSILON) {
          nx /= normalLength;
          ny /= normalLength;
          nz /= normalLength;
        }

        const color = shadePixel(wx, wy, wz, nx, ny, nz, u, v, context);
        const alpha = color.a;
        if (alpha <= 0) continue;

        const pixelIndex = index * 4;
        if (alpha >= 1) {
          const [r, g, b] = color.toRgba8();
          this.pixels[pixelIndex] = r;
          this.pixels[pixelIndex + 1] = g;
          this.pixels[pixelIndex + 2] = b;
          this.pixels[pixelIndex + 3] = 255;
          this.depth[index] = depth;
        } else {
          const inv = 1 - alpha;
          this.pixels[pixelIndex] = color.r * 255 * alpha + (this.pixels[pixelIndex] ?? 0) * inv;
          this.pixels[pixelIndex + 1] =
            color.g * 255 * alpha + (this.pixels[pixelIndex + 1] ?? 0) * inv;
          this.pixels[pixelIndex + 2] =
            color.b * 255 * alpha + (this.pixels[pixelIndex + 2] ?? 0) * inv;
          this.pixels[pixelIndex + 3] = Math.max(
            this.pixels[pixelIndex + 3] ?? 0,
            alpha * 255,
          );
          this.depth[index] = depth;
        }
      }
    }
  }
}

const scratchColor = new Color();

function shadePixel(
  wx: number,
  wy: number,
  wz: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number,
  context: ShadingContext,
): Color {
  const { material, lighting, fog, cameraPosition } = context;
  const texel = material.albedoTexture
    ? material.albedoTexture.sampleNearest(u, v, scratchColor)
    : White;

  const out = scratchOut;
  if (material.shading === "unlit") {
    out.set(
      material.baseColor.r * texel.r,
      material.baseColor.g * texel.g,
      material.baseColor.b * texel.b,
      material.baseColor.a * texel.a,
    );
  } else {
    const albedoR = material.baseColor.r * texel.r;
    const albedoG = material.baseColor.g * texel.g;
    const albedoB = material.baseColor.b * texel.b;
    const metallic = clamp01(material.metallic);
    const roughness = clamp01(material.roughness);
    const diffuseScale = 1 - metallic;
    const specR = lerp(0.04, albedoR, metallic) * (1 - roughness);
    const specG = lerp(0.04, albedoG, metallic) * (1 - roughness);
    const specB = lerp(0.04, albedoB, metallic) * (1 - roughness);
    const shininess = Math.max(1, 2 / Math.max(roughness * roughness, 1e-3) - 2);

    let r = material.emissive.r + albedoR * lighting.ambient.color.r * lighting.ambient.intensity;
    let g = material.emissive.g + albedoG * lighting.ambient.color.g * lighting.ambient.intensity;
    let b = material.emissive.b + albedoB * lighting.ambient.color.b * lighting.ambient.intensity;

    let vx = cameraPosition.x - wx;
    let vy = cameraPosition.y - wy;
    let vz = cameraPosition.z - wz;
    const viewLength = Math.hypot(vx, vy, vz) || 1;
    vx /= viewLength;
    vy /= viewLength;
    vz /= viewLength;

    for (const light of lighting.directional) {
      const lx = -light.direction.x;
      const ly = -light.direction.y;
      const lz = -light.direction.z;
      const lightLength = Math.hypot(lx, ly, lz) || 1;
      const nlx = lx / lightLength;
      const nly = ly / lightLength;
      const nlz = lz / lightLength;
      const ndotl = nx * nlx + ny * nly + nz * nlz;
      if (ndotl <= 0) continue;
      const hx = nlx + vx;
      const hy = nly + vy;
      const hz = nlz + vz;
      const hLength = Math.hypot(hx, hy, hz) || 1;
      const ndoth = Math.max(0, (nx * hx + ny * hy + nz * hz) / hLength);
      const specFactor = Math.pow(ndoth, shininess) * ndotl;
      r += (albedoR * diffuseScale + specR * specFactor) * light.color.r * light.intensity * ndotl;
      g += (albedoG * diffuseScale + specG * specFactor) * light.color.g * light.intensity * ndotl;
      b += (albedoB * diffuseScale + specB * specFactor) * light.color.b * light.intensity * ndotl;
    }

    for (const light of lighting.point) {
      const toX = light.position.x - wx;
      const toY = light.position.y - wy;
      const toZ = light.position.z - wz;
      const distance = Math.hypot(toX, toY, toZ);
      const range = light.range > EPSILON ? light.range : EPSILON;
      const attenuation = clamp01(1 - distance / range);
      if (attenuation <= 0) continue;
      const nlx = toX / (distance || 1);
      const nly = toY / (distance || 1);
      const nlz = toZ / (distance || 1);
      const ndotl = nx * nlx + ny * nly + nz * nlz;
      if (ndotl <= 0) continue;
      const hx = nlx + vx;
      const hy = nly + vy;
      const hz = nlz + vz;
      const hLength = Math.hypot(hx, hy, hz) || 1;
      const ndoth = Math.max(0, (nx * hx + ny * hy + nz * hz) / hLength);
      const specFactor = Math.pow(ndoth, shininess) * ndotl;
      const strength = light.intensity * attenuation;
      r += (albedoR * diffuseScale + specR * specFactor) * light.color.r * strength * ndotl;
      g += (albedoG * diffuseScale + specG * specFactor) * light.color.g * strength * ndotl;
      b += (albedoB * diffuseScale + specB * specFactor) * light.color.b * strength * ndotl;
    }

    out.set(r, g, b, material.baseColor.a * texel.a);
  }

  if (fog && fog.density > 0) {
    const distance = Math.hypot(wx - cameraPosition.x, wy - cameraPosition.y, wz - cameraPosition.z);
    const factor = 1 - Math.exp(-fog.density * distance);
    const f = clamp01(factor);
    out.set(
      out.r + (fog.color.r - out.r) * f,
      out.g + (fog.color.g - out.g) * f,
      out.b + (fog.color.b - out.b) * f,
      out.a,
    );
  }

  return out;
}

const White = new Color(1, 1, 1, 1);
const scratchOut = new Color();

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
