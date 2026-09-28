export {
  Transform2DComponent,
  WorldTransform2DComponent,
  type WorldTransform2DData,
  addTransform2D,
  computeWorldTransform2D,
  createTransformSystem2D,
  getInterpolatedTransform2D,
} from "./transform2d.js";
export {
  Transform3DComponent,
  WorldTransform3DComponent,
  type WorldTransform3DData,
  addTransform3D,
  computeWorldTransform3D,
  createTransformSystem3D,
} from "./transform3d.js";

export {
  MeshRenderer3D,
  addMeshRenderer3D,
  collectRenderables3D,
  type MeshRenderer3DData,
  type Renderable3D,
} from "./mesh-renderer.js";

export const SCENE_VERSION = "0.4.0";
