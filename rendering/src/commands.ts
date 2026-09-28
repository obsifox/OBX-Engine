import type { Color } from "@obx/math";
import type { Texture } from "./texture.js";

export const VERTEX_STRIDE = 8;
export const VERTICES_PER_QUAD = 4;
export const FLOATS_PER_QUAD = VERTEX_STRIDE * VERTICES_PER_QUAD;

export type RenderCommand =
  | { type: "clear"; color: Color }
  | {
      type: "drawQuads";
      texture: Texture;
      vertexData: Float64Array;
      quadCount: number;
      layer: number;
    };

export function createQuadBuffer(quadCount: number): Float64Array {
  return new Float64Array(quadCount * FLOATS_PER_QUAD);
}
