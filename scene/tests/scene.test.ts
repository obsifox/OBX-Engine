import { describe, expect, it } from "vitest";
import { World } from "@obx/ecs";
import { Quat, Transform2D, Transform3D, Vec2, Vec3 } from "@obx/math";
import {
  Transform2DComponent,
  Transform3DComponent,
  WorldTransform2DComponent,
  WorldTransform3DComponent,
  addTransform2D,
  addTransform3D,
  computeWorldTransform2D,
  createTransformSystem2D,
  createTransformSystem3D,
  getInterpolatedTransform2D,
} from "@obx/scene";

describe("Transform2D system", () => {
  it("propagates parent transforms to children", () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    world.setParent(child, parent);

    addTransform2D(world, parent, { x: 10, y: 0, rotation: Math.PI / 2, scaleX: 2, scaleY: 2 });
    addTransform2D(world, child, { x: 1, y: 0 });
    world.addSystem(createTransformSystem2D());
    world.update(0);

    const worldTransform = world.getComponentOrThrow(child, WorldTransform2DComponent);
    expect(worldTransform.current.position.equals(new Vec2(10, 2), 1e-9)).toBe(true);
    expect(worldTransform.current.rotation).toBeCloseTo(Math.PI / 2);
    expect(worldTransform.current.scale.equals(new Vec2(2, 2), 1e-9)).toBe(true);
  });

  it("updates previous/current for interpolation", () => {
    const world = new World();
    const entity = world.createEntity();
    addTransform2D(world, entity, { x: 0, y: 0 });
    world.addSystem(createTransformSystem2D());

    world.update(0);
    world.getComponentOrThrow(entity, Transform2DComponent).position.set(10, 5);
    world.update(0);

    const data = world.getComponentOrThrow(entity, WorldTransform2DComponent);
    expect(data.previous.position.equals(new Vec2(0, 0))).toBe(true);
    expect(data.current.position.equals(new Vec2(10, 5))).toBe(true);

    const mid = getInterpolatedTransform2D(world, entity, 0.5);
    expect(mid.position.equals(new Vec2(5, 2.5), 1e-9)).toBe(true);
    const snapped = getInterpolatedTransform2D(world, entity, 1);
    expect(snapped.position.equals(new Vec2(10, 5), 1e-9)).toBe(true);
  });

  it("handles deep hierarchies with caching", () => {
    const world = new World();
    const root = world.createEntity();
    const mid = world.createEntity();
    const leaf = world.createEntity();
    world.setParent(mid, root);
    world.setParent(leaf, mid);

    addTransform2D(world, root, { x: 1, y: 0 });
    addTransform2D(world, mid, { x: 1, y: 0 });
    addTransform2D(world, leaf, { x: 1, y: 0 });

    const cache = new Map();
    const leafWorld = computeWorldTransform2D(world, leaf, cache);
    expect(leafWorld.position.equals(new Vec2(3, 0), 1e-9)).toBe(true);
    expect(cache.size).toBe(3);
  });

  it("falls back to local transform without world component", () => {
    const world = new World();
    const entity = world.createEntity();
    addTransform2D(world, entity, { x: 4, y: 7 });
    world.removeComponent(entity, WorldTransform2DComponent);
    const interpolated = getInterpolatedTransform2D(world, entity, 0.5);
    expect(interpolated.position.equals(new Vec2(4, 7))).toBe(true);
  });

  it("round-trips through world serialization", () => {
    const world = new World();
    const entity = world.createEntity();
    addTransform2D(world, entity, { x: 3, y: -2, rotation: 0.5, scaleX: 2, scaleY: 3 });
    world.addSystem(createTransformSystem2D());
    world.update(0);

    const restored = World.fromSerialized(JSON.parse(JSON.stringify(world.serialize())) as never);
    const restoredEntity = restored.listEntities()[0]!;
    const transform = restored.getComponentOrThrow(restoredEntity, Transform2DComponent);
    expect(transform).toBeInstanceOf(Transform2D);
    expect(transform.position.equals(new Vec2(3, -2), 1e-9)).toBe(true);
    expect(transform.rotation).toBeCloseTo(0.5, 9);
    expect(transform.scale.equals(new Vec2(2, 3), 1e-9)).toBe(true);
  });
});

describe("Transform3D system", () => {
  it("propagates and interpolates 3D transforms", () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    world.setParent(child, parent);

    addTransform3D(world, parent);
    addTransform3D(world, child);

    const parentLocal = world.getComponentOrThrow(parent, Transform3DComponent);
    parentLocal.position.set(0, 5, 0);
    parentLocal.rotation = Quat.fromAxisAngle(new Vec3(1, 0, 0), Math.PI / 2);

    const childLocal = world.getComponentOrThrow(child, Transform3DComponent);
    childLocal.position.set(1, 0, 0);

    world.addSystem(createTransformSystem3D());
    world.update(0);

    const data = world.getComponentOrThrow(child, WorldTransform3DComponent);
    const expected = parentLocal.applyPoint(childLocal.applyPoint(new Vec3(0, 0, 0)));
    expect(data.current.position.equals(expected, 1e-9)).toBe(true);

    childLocal.position.set(3, 0, 0);
    world.update(0);
    const mid = Transform3D.lerp(data.previous, data.current, 0.5);
    expect(mid.position.x).toBeCloseTo(2, 9);
    expect(mid.position.y).toBeCloseTo(5, 9);
    expect(data.previous.position.equals(expected, 1e-9)).toBe(true);
  });

  it("serializes 3D transforms with quaternions", () => {
    const world = new World();
    const entity = world.createEntity();
    addTransform3D(world, entity);
    const transform = world.getComponentOrThrow(entity, Transform3DComponent);
    transform.position.set(1, 2, 3);
    transform.rotation = Quat.fromAxisAngle(new Vec3(0, 1, 0), 0.75);
    transform.scale.set(2, 2, 2);

    const restored = World.fromSerialized(JSON.parse(JSON.stringify(world.serialize())) as never);
    const restoredEntity = restored.listEntities()[0]!;
    const data = restored.getComponentOrThrow(restoredEntity, Transform3DComponent);
    expect(data.position.equals(new Vec3(1, 2, 3), 1e-9)).toBe(true);
    expect(data.rotation.equals(transform.rotation, 1e-9)).toBe(true);
    expect(data.scale.equals(new Vec3(2, 2, 2), 1e-9)).toBe(true);
    expect(restored.getComponent(restoredEntity, WorldTransform3DComponent)).toBeDefined();
  });
});
