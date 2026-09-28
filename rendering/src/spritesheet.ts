import type { Texture } from "./texture.js";

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export function uvRect(u0: number, v0: number, u1: number, v1: number): UvRect {
  return { u0, v0, u1, v1 };
}

export function fullUv(): UvRect {
  return { u0: 0, v0: 0, u1: 1, v1: 1 };
}

export interface AnimationClip {
  name: string;
  frames: UvRect[];
  fps: number;
  loop: boolean;
}

export interface SpriteSheetOptions {
  frameWidth: number;
  frameHeight: number;
  margin?: number;
  spacing?: number;
}

export class SpriteSheet {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly margin: number;
  readonly spacing: number;
  readonly columns: number;
  readonly rows: number;
  readonly frames: UvRect[] = [];
  readonly animations = new Map<string, AnimationClip>();

  constructor(readonly texture: Texture, options: SpriteSheetOptions) {
    this.frameWidth = options.frameWidth;
    this.frameHeight = options.frameHeight;
    this.margin = options.margin ?? 0;
    this.spacing = options.spacing ?? 0;
    this.columns = Math.floor(
      (texture.width - this.margin * 2 + this.spacing) / (this.frameWidth + this.spacing),
    );
    this.rows = Math.floor(
      (texture.height - this.margin * 2 + this.spacing) / (this.frameHeight + this.spacing),
    );
    if (this.columns <= 0 || this.rows <= 0) {
      throw new RangeError("SpriteSheet frame size exceeds texture size");
    }
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.columns; col += 1) {
        const x = this.margin + col * (this.frameWidth + this.spacing);
        const y = this.margin + row * (this.frameHeight + this.spacing);
        this.frames.push({
          u0: x / texture.width,
          v0: y / texture.height,
          u1: (x + this.frameWidth) / texture.width,
          v1: (y + this.frameHeight) / texture.height,
        });
      }
    }
  }

  get frameCount(): number {
    return this.frames.length;
  }

  frameUv(index: number): UvRect {
    const frame = this.frames[index];
    if (!frame) {
      throw new RangeError(`SpriteSheet frame index out of range: ${index}`);
    }
    return frame;
  }

  defineAnimation(name: string, frames: readonly number[], fps = 12, loop = true): AnimationClip {
    const clip: AnimationClip = {
      name,
      frames: frames.map((index) => this.frameUv(index)),
      fps,
      loop,
    };
    this.animations.set(name, clip);
    return clip;
  }

  animation(name: string): AnimationClip {
    const clip = this.animations.get(name);
    if (!clip) {
      throw new Error(`Unknown animation: ${name}`);
    }
    return clip;
  }
}
