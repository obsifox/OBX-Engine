import { World, type LoadOptions } from "@obx/ecs";
import { parseScene } from "../scenes/serialize.js";
import { type SceneFile } from "../scenes/types.js";

export interface LoadSceneOptions extends LoadOptions {
  clearWorld?: boolean;
}

export function loadScene(world: World, input: string | SceneFile, options: LoadSceneOptions = {}): SceneFile {
  const file = typeof input === "string" ? parseScene(input) : input;
  if (options.clearWorld) {
    for (const entity of world.serialize().entities) world.destroyEntity(entity.entity);
  }
  world.loadSerialized(
    {
      version: 1,
      time: 0,
      entities: file.entities.map((entity) => ({ entity: entity.id, components: entity.components })),
      resources: file.resources,
    },
    options,
  );
  return file;
}

export function deepRemap(value: unknown, idMap: Map<number, number>): unknown {
  if (Array.isArray(value)) return value.map((entry) => deepRemap(entry, idMap));
  if (typeof value !== "object" || value === null) return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (key === "entity" && typeof entry === "number" && idMap.has(entry)) {
      out[key] = idMap.get(entry);
    } else if (key === "entities" && Array.isArray(entry)) {
      out[key] = entry.map((item) => (typeof item === "number" && idMap.has(item) ? idMap.get(item) : item));
    } else {
      out[key] = deepRemap(entry, idMap);
    }
  }
  return out;
}

