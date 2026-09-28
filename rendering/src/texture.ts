import { Color } from "@obx/math";

export type TextureFilter = "nearest" | "linear";
export type TextureWrap = "clamp" | "repeat";

let nextTextureId = 1;

export class Texture {
  readonly id = nextTextureId++;
  readonly data: Uint8ClampedArray;
  filter: TextureFilter = "nearest";
  wrap: TextureWrap = "clamp";

  constructor(
    readonly width: number,
    readonly height: number,
    data?: Uint8ClampedArray,
    readonly name = "texture",
  ) {
    if (width <= 0 || height <= 0) {
      throw new RangeError("Texture dimensions must be positive");
    }
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
    if (this.data.length !== width * height * 4) {
      throw new RangeError("Texture data length mismatch");
    }
  }

  static solid(color: Color, width = 1, height = 1, name = "solid"): Texture {
    const texture = new Texture(width, height, undefined, name);
    const [r, g, b, a] = color.toRgba8();
    for (let i = 0; i < texture.data.length; i += 4) {
      texture.data[i] = r;
      texture.data[i + 1] = g;
      texture.data[i + 2] = b;
      texture.data[i + 3] = a;
    }
    return texture;
  }

  static checker(
    colorA: Color,
    colorB: Color,
    cellSize = 8,
    width = 64,
    height = 64,
    name = "checker",
  ): Texture {
    const texture = new Texture(width, height, undefined, name);
    const a = colorA.toRgba8();
    const b = colorB.toRgba8();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const useA = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
        const [r, g, bl, al] = useA ? a : b;
        const i = (y * width + x) * 4;
        texture.data[i] = r;
        texture.data[i + 1] = g;
        texture.data[i + 2] = bl;
        texture.data[i + 3] = al;
      }
    }
    return texture;
  }

  setPixel(x: number, y: number, color: Color): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const [r, g, b, a] = color.toRgba8();
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  getPixel(x: number, y: number, out = new Color()): Color {
    const px = Math.min(Math.max(0, Math.floor(x)), this.width - 1);
    const py = Math.min(Math.max(0, Math.floor(y)), this.height - 1);
    const i = (py * this.width + px) * 4;
    return out.set(
      (this.data[i] ?? 0) / 255,
      (this.data[i + 1] ?? 0) / 255,
      (this.data[i + 2] ?? 0) / 255,
      (this.data[i + 3] ?? 0) / 255,
    );
  }

  sampleNearest(u: number, v: number, out = new Color()): Color {
    const uu = this.wrap === "repeat" ? u - Math.floor(u) : Math.min(Math.max(u, 0), 1);
    const vv = this.wrap === "repeat" ? v - Math.floor(v) : Math.min(Math.max(v, 0), 1);
    const x = Math.min(this.width - 1, Math.floor(uu * this.width));
    const y = Math.min(this.height - 1, Math.floor(vv * this.height));
    return this.getPixel(x, y, out);
  }

  clone(): Texture {
    return new Texture(this.width, this.height, new Uint8ClampedArray(this.data), this.name);
  }
}
