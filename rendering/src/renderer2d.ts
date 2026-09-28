import { Color, Vec2 } from "@obx/math";
import type { RenderBackend } from "./backend.js";
import { SpriteBatcher } from "./batcher.js";
import type { Camera2D } from "./camera.js";
import { FLOATS_PER_QUAD, type RenderCommand } from "./commands.js";
import { fullUv, type UvRect } from "./spritesheet.js";
import { Texture } from "./texture.js";

export interface SpriteDrawOptions {
  texture: Texture;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  pivotX?: number;
  pivotY?: number;
  tint?: Color;
  uv?: UvRect;
  layer?: number;
}

export interface RectDrawOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  color: Color;
  rotation?: number;
  layer?: number;
}

export interface RendererStats {
  sprites: number;
  drawCalls: number;
  commands: number;
}

const White = new Color(1, 1, 1, 1);

export class Renderer2D {
  private batcher = new SpriteBatcher();
  private camera: Camera2D | null = null;
  private frameCommands: RenderCommand[] = [];
  private spriteCount = 0;
  private scratch = new Vec2();
  private whiteTexture: Texture | null = null;

  constructor(readonly backend: RenderBackend) {}

  begin(camera: Camera2D, clearColor?: Color): void {
    this.camera = camera;
    this.batcher.reset();
    this.frameCommands = [];
    this.spriteCount = 0;
    this.backend.begin();
    if (clearColor) {
      this.frameCommands.push({ type: "clear", color: clearColor.clone() });
    }
  }

  drawSprite(options: SpriteDrawOptions): void {
    const camera = this.camera;
    if (!camera) {
      throw new Error("Renderer2D.drawSprite called outside begin()/end()");
    }
    const rotation = options.rotation ?? 0;
    const pivotX = options.pivotX ?? 0.5;
    const pivotY = options.pivotY ?? 0.5;
    const tint = options.tint ?? White;
    const uv = options.uv ?? fullUv();
    const layer = options.layer ?? 0;

    const left = -pivotX * options.width;
    const right = (1 - pivotX) * options.width;
    const top = -pivotY * options.height;
    const bottom = (1 - pivotY) * options.height;

    const corners: Array<[number, number, number, number]> = [
      [left, top, uv.u0, uv.v0],
      [right, top, uv.u1, uv.v0],
      [right, bottom, uv.u1, uv.v1],
      [left, bottom, uv.u0, uv.v1],
    ];

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const vertexData = new Float64Array(FLOATS_PER_QUAD);
    corners.forEach(([lx, ly, u, v], index) => {
      const wx = options.x + lx * cos - ly * sin;
      const wy = options.y + lx * sin + ly * cos;
      this.scratch.set(wx, wy);
      camera.worldToScreen(this.scratch, this.scratch);
      const base = index * 8;
      vertexData[base] = this.scratch.x;
      vertexData[base + 1] = this.scratch.y;
      vertexData[base + 2] = u;
      vertexData[base + 3] = v;
      vertexData[base + 4] = tint.r;
      vertexData[base + 5] = tint.g;
      vertexData[base + 6] = tint.b;
      vertexData[base + 7] = tint.a;
    });

    this.batcher.add({ texture: options.texture, layer, vertexData });
    this.spriteCount += 1;
  }

  drawRect(options: RectDrawOptions): void {
    this.drawSprite({
      texture: this.getWhiteTexture(),
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      rotation: options.rotation,
      tint: options.color,
      layer: options.layer,
    });
  }

  end(): RendererStats {
    this.frameCommands.push(...this.batcher.build());
    this.backend.submit(this.frameCommands);
    this.backend.end();
    const drawCalls = this.frameCommands.filter((command) => command.type === "drawQuads").length;
    this.camera = null;
    return { sprites: this.spriteCount, drawCalls, commands: this.frameCommands.length };
  }

  private getWhiteTexture(): Texture {
    this.whiteTexture ??= Texture.solid(White, 1, 1, "white");
    return this.whiteTexture;
  }
}
