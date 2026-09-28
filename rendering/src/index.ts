export { Texture, type TextureFilter, type TextureWrap } from "./texture.js";
export {
  SpriteSheet,
  uvRect,
  fullUv,
  type UvRect,
  type AnimationClip,
  type SpriteSheetOptions,
} from "./spritesheet.js";
export { SpriteAnimator } from "./animation.js";
export { Camera2D } from "./camera.js";
export {
  createQuadBuffer,
  VERTEX_STRIDE,
  VERTICES_PER_QUAD,
  FLOATS_PER_QUAD,
  type RenderCommand,
} from "./commands.js";
export { SpriteBatcher, type SpriteQuadInput } from "./batcher.js";
export type { RenderBackend } from "./backend.js";
export { RecordingBackend } from "./backends/recording.js";
export { SoftwareBackend } from "./backends/software.js";
export {
  Canvas2DBackend,
  type Canvas2DLike,
  type CanvasRenderingContext2DLike,
  type CanvasImageSourceLike,
} from "./backends/canvas2d.js";
export {
  Renderer2D,
  type SpriteDrawOptions,
  type RectDrawOptions,
  type RendererStats,
} from "./renderer2d.js";
export { encodePng } from "./png.js";

export const RENDERING_VERSION = "0.3.0";
