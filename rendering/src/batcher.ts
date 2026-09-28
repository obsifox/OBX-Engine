import { FLOATS_PER_QUAD, createQuadBuffer, type RenderCommand } from "./commands.js";
import type { Texture } from "./texture.js";

export interface SpriteQuadInput {
  texture: Texture;
  layer: number;
  vertexData: Float64Array;
}

interface BatchEntry {
  order: number;
  layer: number;
  textureId: number;
  texture: Texture;
  vertexData: Float64Array;
}

export class SpriteBatcher {
  private entries: BatchEntry[] = [];
  private counter = 0;

  add(input: SpriteQuadInput): void {
    if (input.vertexData.length !== FLOATS_PER_QUAD) {
      throw new RangeError("SpriteQuadInput vertex data must hold exactly one quad");
    }
    this.entries.push({
      order: this.counter++,
      layer: input.layer,
      textureId: input.texture.id,
      texture: input.texture,
      vertexData: input.vertexData,
    });
  }

  build(): RenderCommand[] {
    const sorted = [...this.entries].sort(
      (a, b) => a.layer - b.layer || a.textureId - b.textureId || a.order - b.order,
    );
    const commands: RenderCommand[] = [];
    let group: BatchEntry[] = [];
    let groupLayer = 0;
    let groupTexture: Texture | null = null;

    const flushGroup = (): void => {
      if (group.length === 0) return;
      const vertexData = createQuadBuffer(group.length);
      group.forEach((entry, index) => {
        vertexData.set(entry.vertexData, index * FLOATS_PER_QUAD);
      });
      commands.push({
        type: "drawQuads",
        texture: groupTexture as Texture,
        vertexData,
        quadCount: group.length,
        layer: groupLayer,
      });
      group = [];
    };

    for (const entry of sorted) {
      const sameGroup =
        group.length > 0 && entry.layer === groupLayer && entry.textureId === groupTexture?.id;
      if (!sameGroup) {
        flushGroup();
        groupLayer = entry.layer;
        groupTexture = entry.texture;
      }
      group.push(entry);
    }
    flushGroup();
    return commands;
  }

  reset(): void {
    this.entries = [];
    this.counter = 0;
  }

  get stats(): { sprites: number } {
    return { sprites: this.entries.length };
  }
}
