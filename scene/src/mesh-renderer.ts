import { Mat4 } from "@obx/math";
import type { Material, Mesh } from "@obx/rendering";
import { defineComponent, type Entity, type World } from "@obx/ecs";
import { WorldTransform3DComponent } from "./transform3d.js";

export interface MeshRenderer3DData {
  mesh: Mesh | null;
  material: Material | null;
  visible: boolean;
}

export const MeshRenderer3D = defineComponent<MeshRenderer3DData>("scene.MeshRenderer3D", {
  defaults: () => ({ mesh: null, material: null, visible: true }),
  serialize: () => ({ skipped: true }),
  deserialize: () => ({ mesh: null, material: null, visible: true }),
});

export interface Renderable3D {
  entity: Entity;
  mesh: Mesh;
  material: Material;
  matrix: Mat4;
}

export function addMeshRenderer3D(
  world: World,
  entity: Entity,
  mesh: Mesh,
  material: Material,
): void {
  world.addComponent(entity, MeshRenderer3D, { mesh, material, visible: true });
}

export function collectRenderables3D(world: World): Renderable3D[] {
  const output: Renderable3D[] = [];
  for (const [entity, renderer, worldTransform] of world.query(
    MeshRenderer3D,
    WorldTransform3DComponent,
  )) {
    if (!renderer.visible || !renderer.mesh || !renderer.material) continue;
    output.push({
      entity,
      mesh: renderer.mesh,
      material: renderer.material,
      matrix: worldTransform.current.toMat4(new Mat4()),
    });
  }
  return output;
}
