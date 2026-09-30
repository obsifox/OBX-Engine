import { World, entityIndex, getComponentDefinition, makeEntity, type Entity } from "@obx/ecs";
import { type AssetGUID } from "../guid.js";
import { deepRemap } from "../scenes/load.js";
import { validateScene } from "../scenes/serialize.js";
import { SCENE_FORMAT_VERSION, SceneError, type PrefabOverride, type SceneEntityRecord, type SceneFile } from "../scenes/types.js";

export function createPrefab(input: { name: string; entities: SceneEntityRecord[]; resources?: Record<string, unknown>; metadata?: Record<string, unknown>; guidReferences?: Record<string, AssetGUID>; overrides?: PrefabOverride[] }): SceneFile {
  const file: SceneFile = {
    format: "prefab",
    version: SCENE_FORMAT_VERSION,
    name: input.name,
    metadata: { ...(input.metadata ?? {}) },
    guidReferences: { ...(input.guidReferences ?? {}) },
    entities: input.entities,
    resources: input.resources ?? {},
    overrides: input.overrides ?? [],
    prefabRoot: input.entities[0]?.id ?? null,
  };
  const errors = validateScene(file);
  if (errors.length > 0) throw new SceneError(`invalid prefab: ${errors.join("; ")}`);
  return file;
}

export function prefabFromWorld(world: World, name: string): SceneFile {
  const serialized = world.serialize();
  return createPrefab({
    name,
    entities: serialized.entities.map((entry) => ({
      id: entry.entity,
      components: entry.components,
      name: (entry.components["core.Name"] as { value?: string } | undefined)?.value,
      parent: (entry.components["core.Parent"] as { entity?: Entity | null } | undefined)?.entity ?? null,
    })),
    resources: serialized.resources,
  });
}

export interface InstantiateResult {
  root: number | null;
  entities: number[];
  idMap: Record<string, number>;
}

export function instantiatePrefab(world: World, prefab: SceneFile, overrides: PrefabOverride[] = []): InstantiateResult {
  if (prefab.format !== "prefab") throw new SceneError(`not a prefab: ${prefab.name}`);
  const used = new Set<number>();
  for (const entry of world.serialize().entities) used.add(entityIndex(entry.entity));
  const idMap = new Map<number, number>();
  let nextIndex = 0;
  const pick = (): number => {
    while (used.has(nextIndex)) nextIndex += 1;
    used.add(nextIndex);
    return nextIndex;
  };
  for (const entity of prefab.entities) idMap.set(entity.id, makeEntity(pick(), 0));
  const merged = new Map<string, PrefabOverride>();
  for (const override of [...(prefab.overrides ?? []), ...overrides]) {
    merged.set(`${override.entityId}|${override.component}`, override);
  }
  const entities = prefab.entities.map((entity) => {
    const components = deepRemap(entity.components, idMap) as Record<string, unknown>;
    for (const [key, override] of merged) {
      if (key === `${entity.id}|${override.component}`) {
        const existing = (components[override.component] as Record<string, unknown>) ?? {};
        components[override.component] = { ...existing, ...(deepRemap(override.values, idMap) as Record<string, unknown>) };
      }
    }
    return {
      entity: idMap.get(entity.id)!,
      components,
    };
  });
  world.loadSerialized({ version: 1, time: 0, entities, resources: prefab.resources }, {});
  return {
    root: prefab.prefabRoot !== undefined && prefab.prefabRoot !== null ? idMap.get(prefab.prefabRoot)! : (idMap.values().next().value ?? null),
    entities: entities.map((entry) => entry.entity),
    idMap: Object.fromEntries(idMap),
  };
}


export function applyOverride(world: World, entity: Entity, component: string, values: Record<string, unknown>): void {
  const definition = getComponentDefinition(component);
  if (!definition) throw new SceneError(`unknown component: ${component}`);
  const existing = world.hasComponent(entity, definition) ? (world.getComponent(entity, definition) as Record<string, unknown>) : {};
  if (world.hasComponent(entity, definition)) world.removeComponent(entity, definition);
  world.addComponent(entity, definition, { ...existing, ...values });
}
