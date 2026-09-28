export {
  sphereShape,
  boxShape,
  planeShape,
  raySphere,
  rayBox,
  rayPlane,
  overlapSphereSphere,
  overlapSphereBox,
  overlapBoxBox,
  overlapSpherePlane,
  overlapBoxPlane,
  boundsForShape,
  type Shape,
  type SphereShape,
  type BoxShape,
  type PlaneShape,
  type RayHit,
  type ShapeOverlap,
} from "./shapes.js";
export {
  Body,
  type BodyType,
  type BodyOptions,
  type CollisionEvent,
  type ContactCallback,
} from "./body.js";
export {
  PhysicsWorld,
  type PhysicsWorldOptions,
  type RayHitResult,
} from "./world.js";
export {
  DistanceJoint,
  SpringJoint,
  type Joint,
} from "./joints.js";
export {
  CharacterController,
  characterInput,
  type CharacterInput,
  type CharacterControllerOptions,
  type LocomotionState,
} from "./character.js";

export const PHYSICS_VERSION = "0.5.0";
