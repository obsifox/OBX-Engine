import type { Color } from "@obx/math";
import type { RenderBackend } from "../backend.js";
import type { RenderCommand } from "../commands.js";
import type { Texture } from "../texture.js";

export interface Canvas2DLike {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2DLike | null;
}

export interface CanvasRenderingContext2DLike {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: CanvasImageSourceLike, dx: number, dy: number, dw: number, dh: number): void;
  save(): void;
  restore(): void;
  globalAlpha: number;
  fillStyle: string;
}

export interface CanvasImageSourceLike {
  width: number;
  height: number;
}

export class Canvas2DBackend implements RenderBackend {
  readonly name = "canvas2d";
  readonly width: number;
  readonly height: number;
  private context: CanvasRenderingContext2DLike;
  private textureCanvases = new Map<number, CanvasImageSourceLike>();

  constructor(private canvas: Canvas2DLike, private createImageSource: (texture: Texture) => CanvasImageSourceLike) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas2DBackend requires a 2d canvas context");
    }
    this.context = context;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  begin(): void {
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.globalAlpha = 1;
    this.context.clearRect(0, 0, this.width, this.height);
  }

  end(): void {}

  submit(commands: readonly RenderCommand[]): void {
    for (const command of commands) {
      if (command.type === "clear") {
        this.fillColor(command.color);
      } else {
        this.drawQuads(command.vertexData, command.quadCount, command.texture);
      }
    }
  }

  private fillColor(color: Color): void {
    this.context.fillStyle = color.toCss();
    this.context.fillRect(0, 0, this.width, this.height);
  }

  private drawQuads(vertexData: Float64Array, quadCount: number, texture: Texture): void {
    let source = this.textureCanvases.get(texture.id);
    if (!source) {
      source = this.createImageSource(texture);
      this.textureCanvases.set(texture.id, source);
    }
    for (let quad = 0; quad < quadCount; quad += 1) {
      const base = quad * 32;
      const xs = [
        vertexData[base]!,
        vertexData[base + 8]!,
        vertexData[base + 16]!,
        vertexData[base + 24]!,
      ];
      const ys = [
        vertexData[base + 1]!,
        vertexData[base + 9]!,
        vertexData[base + 17]!,
        vertexData[base + 25]!,
      ];
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const alpha = vertexData[base + 7]!;
      this.context.save();
      this.context.globalAlpha = Math.min(Math.max(alpha, 0), 1);
      this.context.drawImage(source, minX, minY, maxX - minX, maxY - minY);
      this.context.restore();
    }
  }
}
