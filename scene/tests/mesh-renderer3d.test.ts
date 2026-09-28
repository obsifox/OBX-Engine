import { describe, expect, it } from "vitest";
import { Quat, Transform3D, Vec3 } from "@obx/math";
import { Material, createCube } from "@obx/rendering";
import { World } from "@obx/ecs";
import {
  MeshRenderer3D,
  Transform3DComponent,
  addMeshRenderer3D,
  addTransform3D,
  collectRenderables3D,
  createTransformSystem3D,
} from "../src/index.js";

describe("MeshRenderer3D", () => {
  it("collects renderables with world matrices", () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    world.setParent(child, parent);
    addTransform3D(world, parent);
    addTransform3D(world, child);
    const parentLocal = world.getComponentOrThrow(parent, Transform3DComponent);
    parentLocal.position.set(10, 0, 0);
    const childLocal = world.getComponentOrThrow(child, Transform3DComponent);
    childLocal.position.set(5, 0, 0);
    addMeshRenderer3D(world, child, createCube(), new Material({ name: "red" }));
    world.addSystem(createTransformSystem3D());
    world.update(0);
    const items = collectRenderables3D(world);
    expect(items).toHaveLength(1);
    expect(items[0]!.mesh.name).toBe("cube");
    expect(items[0]!.material.name).toBe("red");
    expect(items[0]!.matrix.elements[12]).toBeCloseTo(15, 12);
  });

  it("skips invisible or incomplete renderers", () => {
    const world = new World();
    const entity = world.createEntity();
    world.addComponent(entity, MeshRenderer3D, { mesh: null, material: null, visible: true });
    addTransform3D(world, entity);
    world.addSystem(createTransformSystem3D());
    world.update(0);
    expect(collectRenderables3D(world)).toHaveLength(0);
    const entity2 = world.createEntity();
    addTransform3D(world, entity2);
    addMeshRenderer3D(world, entity2, createCube(), new Material());
    world.getComponentOrThrow(entity2, MeshRenderer3D).visible = false;
    world.update(0);
    expect(collectRenderables3D(world)).toHaveLength(0);
    expect(world.hasComponent(entity2, MeshRenderer3D)).toBe(true);
  });

  it("follows transform3d motion", () => {
    const world = new World();
    const entity = world.createEntity();
    addTransform3D(world, entity);
    addMeshRenderer3D(world, entity, createCube(), new Material());
    const transform = world.getComponentOrThrow(entity, Transform3DComponent);
    transform.position.set(0, 4, 0);
    transform.rotation = Quat.fromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
    world.addSystem(createTransformSystem3D());
    world.update(0);
    const items = collectRenderables3D(world);
    expect(items).toHaveLength(1);
    expect(items[0]!.matrix.elements[13]).toBeCloseTo(4, 12);
  });

  it("uses the math transform for matrices", () => {
    const local = new Transform3D();
    local.position.set(3, 0, 0);
    local.scale.set(2, 2, 2);
    const matrix = local.toMat4();
    expect(matrix.elements[0]).toBeCloseTo(2, 12);
    expect(matrix.elements[12]).toBeCloseTo(3, 12);
  });
});
