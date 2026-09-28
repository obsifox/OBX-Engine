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

export { Mesh, createCube, createPlane, createUvSphere, computeNormals } from "./mesh.js";
export {
  Material,
  createLighting,
  type ShadingModel,
  type MaterialOptions,
  type AmbientLight,
  type DirectionalLight,
  type PointLight,
  type LightingEnvironment,
  type Fog,
} from "./material.js";
export { Camera3D, aabbVisible, type Plane4 } from "./camera3d.js";
export {
  Software3DBackend,
  type RasterVertex,
  type ShadingContext,
  type Render3DBackend,
} from "./backends/software3d.js";
export { Recording3DBackend, type RecordedDraw3D } from "./backends/recording3d.js";
export {
  Renderer3D,
  transformAabb,
  composeWorldMatrix,
  type Renderer3DOptions,
  type Renderer3DStats,
} from "./renderer3d.js";
export {
  parseGltf,
  flattenGltf,
  type GltfModel,
  type GltfNode,
} from "./gltf.js";

export {
  DecalProjector,
  FoliageInstancer,
  HeightFog,
  WaterSurface,
  RENDERING_ADVANCED_VERSION,
  type Decal,
  type FogOptions,
  type FoliageInstance,
  type Wave,
} from "./advanced.js";

export const RENDERING_VERSION = "0.4.0";
