import type { PixelSurface } from "./types.js";
import { PlatformError } from "./errors.js";
export class Surface implements PixelSurface {
  width: number;
  height: number;
  data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new PlatformError("Surface dimensions must be positive");
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new PlatformError("Surface dimensions must be positive");
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

