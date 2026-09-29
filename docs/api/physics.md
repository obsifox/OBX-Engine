# Physics API

`@obx/physics` — deterministic 2D/3D physics simulation.

## Shapes and bodies

`planeShape`, `sphereShape`, `boxShape`. `Body` with position, velocity, mass,
restitution, friction, damping, layers and trigger flag; static/kinematic/dynamic
motion types.

## World

`PhysicsWorld.step(dt)` integrates, resolves contacts with sequential impulses and
emits trigger events. Queries: `raycast`, `sphereCast`, `overlapAabb`.

## Joints and characters

`DistanceJoint`, `SpringJoint`. `CharacterController` capsule with slope limits and
step height; `KinematicCharacter` for scripted movers.

```ts
import { PhysicsWorld, sphereShape, Body } from "@obx/physics";
```
