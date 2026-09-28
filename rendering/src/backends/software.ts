import { Color } from "@obx/math";
import type { RenderBackend } from "../backend.js";
import { VERTEX_STRIDE, type RenderCommand } from "../commands.js";
import { Texture } from "../texture.js";

export class SoftwareBackend implements RenderBackend {
  readonly name = "software";
  readonly pixels: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }

  begin(): void {}

  end(): void {}

  submit(commands: readonly RenderCommand[]): void {
    for (const command of commands) {
      if (command.type === "clear") {
        this.clear(command.color);
      } else if (command.type === "drawQuads") {
        this.drawQuads(command.vertexData, command.quadCount, command.texture);
      }
    }
  }

  clear(color: Color): void {
    const [r, g, b, a] = color.toRgba8();
    for (let i = 0; i < this.pixels.length; i += 4) {
      this.pixels[i] = r;
      this.pixels[i + 1] = g;
      this.pixels[i + 2] = b;
      this.pixels[i + 3] = a;
    }
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

  toTexture(name = "framebuffer"): Texture {
    return new Texture(this.width, this.height, new Uint8ClampedArray(this.pixels), name);
  }

  private drawQuads(vertexData: Float64Array, quadCount: number, texture: Texture): void {
    for (let quad = 0; quad < quadCount; quad += 1) {
      const base = quad * VERTEX_STRIDE * 4;
      this.rasterTriangle(vertexData, base, base + VERTEX_STRIDE, base + VERTEX_STRIDE * 2, texture, false);
      this.rasterTriangle(vertexData, base, base + VERTEX_STRIDE * 2, base + VERTEX_STRIDE * 3, texture, true);
    }
  }

  private rasterTriangle(
    data: Float64Array,
    i0: number,
    i1: number,
    i2: number,
    texture: Texture,
    excludeSharedEdge: boolean,
  ): void {
    const x0 = data[i0]!;
    const y0 = data[i0 + 1]!;
    const x1 = data[i1]!;
    const y1 = data[i1 + 1]!;
    const x2 = data[i2]!;
    const y2 = data[i2 + 1]!;

    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;

    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) return;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
        const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        if (excludeSharedEdge && w2 <= 1e-9) continue;

        const u = w0 * data[i0 + 2]! + w1 * data[i1 + 2]! + w2 * data[i2 + 2]!;
        const v = w0 * data[i0 + 3]! + w1 * data[i1 + 3]! + w2 * data[i2 + 3]!;
        const tr = w0 * data[i0 + 4]! + w1 * data[i1 + 4]! + w2 * data[i2 + 4]!;
        const tg = w0 * data[i0 + 5]! + w1 * data[i1 + 5]! + w2 * data[i2 + 5]!;
        const tb = w0 * data[i0 + 6]! + w1 * data[i1 + 6]! + w2 * data[i2 + 6]!;
        const ta = w0 * data[i0 + 7]! + w1 * data[i1 + 7]! + w2 * data[i2 + 7]!;

        const tex = texture.sampleNearest(u, v, scratchColor);
        const alpha = tex.a * ta;
        if (alpha <= 0) continue;

        const dst = (y * this.width + x) * 4;
        const inv = 1 - alpha;
        const sr = tex.r * tr;
        const sg = tex.g * tg;
        const sb = tex.b * tb;
        this.pixels[dst] = sr * alpha * 255 + (this.pixels[dst] ?? 0) * inv;
        this.pixels[dst + 1] = sg * alpha * 255 + (this.pixels[dst + 1] ?? 0) * inv;
        this.pixels[dst + 2] = sb * alpha * 255 + (this.pixels[dst + 2] ?? 0) * inv;
        this.pixels[dst + 3] = alpha * 255 + (this.pixels[dst + 3] ?? 0) * inv;
      }
    }
  }
}

const scratchColor = new Color();
