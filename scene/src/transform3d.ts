import { Quat, Transform3D, Vec3 } from "@obx/math";
import {
  defineComponent,
  defineSystem,
  type Entity,
  type SystemDefinition,
  type World,
} from "@obx/ecs";

export interface WorldTransform3DData {
  current: Transform3D;
  previous: Transform3D;
}

interface RawTransform3D {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

function cloneTransform3D(raw: RawTransform3D): Transform3D {
  return new Transform3D(
    new Vec3(raw.position.x, raw.position.y, raw.position.z),
    new Quat(raw.rotation.x, raw.rotation.y, raw.rotation.z, raw.rotation.w),
    new Vec3(raw.scale.x, raw.scale.y, raw.scale.z),
  );
}

function serializeTransform3D(t: Transform3D): RawTransform3D {
  return {
    position: { x: t.position.x, y: t.position.y, z: t.position.z },
    rotation: { x: t.rotation.x, y: t.rotation.y, z: t.rotation.z, w: t.rotation.w },
    scale: { x: t.scale.x, y: t.scale.y, z: t.scale.z },
  };
}

export const Transform3DComponent = defineComponent<Transform3D>("scene.Transform3D", {
  defaults: () => new Transform3D(),
  serialize: serializeTransform3D,
  deserialize: (raw) => cloneTransform3D(raw as RawTransform3D),
});

export const WorldTransform3DComponent = defineComponent<WorldTransform3DData>(
  "scene.WorldTransform3D",
  {
    defaults: () => ({ current: new Transform3D(), previous: new Transform3D() }),
    serialize: (d) => ({
      current: serializeTransform3D(d.current),
      previous: serializeTransform3D(d.previous),
    }),
    deserialize: (raw) => {
      const data = raw as { current: RawTransform3D; previous: RawTransform3D };
      return {
        current: cloneTransform3D(data.current),
        previous: cloneTransform3D(data.previous),
      };
    },
  },
);

export function addTransform3D(world: World, entity: Entity): void {
  world.addComponent(entity, Transform3DComponent);
  world.addComponent(entity, WorldTransform3DComponent);
}

export function computeWorldTransform3D(
  world: World,
  entity: Entity,
  cache: Map<Entity, Transform3D>,
): Transform3D {
  const cached = cache.get(entity);
  if (cached) return cached;

  const local = world.getComponent(entity, Transform3DComponent) ?? new Transform3D();
  const parent = world.getParent(entity);
  const result =
    parent === undefined
      ? local.clone()
      : local.combineWith(computeWorldTransform3D(world, parent, cache));
  cache.set(entity, result);
  return result;
}

export function createTransformSystem3D(name = "scene.transform3d"): SystemDefinition {
  return defineSystem({
    name,
    phase: "update",
    order: -1000,
    execute: ({ world }) => {
      const cache = new Map<Entity, Transform3D>();
      for (const [entity, , worldTransform] of world.query(
        Transform3DComponent,
        WorldTransform3DComponent,
      )) {
        worldTransform.previous.copy(worldTransform.current);
        worldTransform.current.copy(computeWorldTransform3D(world, entity, cache));
      }
    },
  });
}
