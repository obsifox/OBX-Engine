import { Transform2D, Vec2 } from "@obx/math";
import {
  defineComponent,
  defineSystem,
  type Entity,
  type SystemDefinition,
  type World,
} from "@obx/ecs";

export interface WorldTransform2DData {
  current: Transform2D;
  previous: Transform2D;
}

function cloneTransform(t: {
  position: { x: number; y: number };
  rotation: number;
  scale: { x: number; y: number };
}): Transform2D {
  return new Transform2D(
    new Vec2(t.position.x, t.position.y),
    t.rotation,
    new Vec2(t.scale.x, t.scale.y),
  );
}

export const Transform2DComponent = defineComponent<Transform2D>("scene.Transform2D", {
  defaults: () => new Transform2D(),
  serialize: (t) => ({
    position: { x: t.position.x, y: t.position.y },
    rotation: t.rotation,
    scale: { x: t.scale.x, y: t.scale.y },
  }),
  deserialize: (raw) => cloneTransform(raw as never),
});

export const WorldTransform2DComponent = defineComponent<WorldTransform2DData>(
  "scene.WorldTransform2D",
  {
    defaults: () => ({ current: new Transform2D(), previous: new Transform2D() }),
    serialize: (d) => ({
      current: {
        position: { x: d.current.position.x, y: d.current.position.y },
        rotation: d.current.rotation,
        scale: { x: d.current.scale.x, y: d.current.scale.y },
      },
      previous: {
        position: { x: d.previous.position.x, y: d.previous.position.y },
        rotation: d.previous.rotation,
        scale: { x: d.previous.scale.x, y: d.previous.scale.y },
      },
    }),
    deserialize: (raw) => {
      const data = raw as { current: never; previous: never };
      return { current: cloneTransform(data.current), previous: cloneTransform(data.previous) };
    },
  },
);

export function addTransform2D(
  world: World,
  entity: Entity,
  init: Partial<{ x: number; y: number; rotation: number; scaleX: number; scaleY: number }> = {},
): void {
  world.addComponent(entity, Transform2DComponent, {
    position: new Vec2(init.x ?? 0, init.y ?? 0),
    rotation: init.rotation ?? 0,
    scale: new Vec2(init.scaleX ?? 1, init.scaleY ?? 1),
  });
  world.addComponent(entity, WorldTransform2DComponent);
}

export function computeWorldTransform2D(
  world: World,
  entity: Entity,
  cache: Map<Entity, Transform2D>,
): Transform2D {
  const cached = cache.get(entity);
  if (cached) return cached;

  const local = world.getComponent(entity, Transform2DComponent) ?? new Transform2D();
  const parent = world.getParent(entity);
  const result =
    parent === undefined
      ? local.clone()
      : local.combineWith(computeWorldTransform2D(world, parent, cache));
  cache.set(entity, result);
  return result;
}

export function createTransformSystem2D(name = "scene.transform2d"): SystemDefinition {
  return defineSystem({
    name,
    phase: "update",
    order: -1000,
    execute: ({ world }) => {
      const cache = new Map<Entity, Transform2D>();
      for (const [entity, , worldTransform] of world.query(
        Transform2DComponent,
        WorldTransform2DComponent,
      )) {
        worldTransform.previous.copy(worldTransform.current);
        worldTransform.current.copy(computeWorldTransform2D(world, entity, cache));
      }
    },
  });
}

export function getInterpolatedTransform2D(
  world: World,
  entity: Entity,
  alpha: number,
  out = new Transform2D(),
): Transform2D {
  const data = world.getComponent(entity, WorldTransform2DComponent);
  if (!data) {
    return out.copy(world.getComponent(entity, Transform2DComponent) ?? new Transform2D());
  }
  return Transform2D.lerp(data.previous, data.current, alpha, out);
}
