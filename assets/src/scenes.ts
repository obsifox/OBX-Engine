import {
  World,
  getComponentDefinition,
  makeEntity,
  entityIndex,
  type Entity,
  type SerializedWorld,
  type LoadOptions,
} from "@obx/ecs";
import type { AssetGUID } from "./guid.js";

export const SCENE_FORMAT_VERSION = 2;

export interface SceneEntityRecord {
  id: number;
  name?: string;
  parent?: number | null;
  components: Record<string, unknown>;
}

export interface PrefabOverride {
  entityId: number;
  component: string;
  values: Record<string, unknown>;
}

export interface SceneFile {
  format: "scene" | "prefab";
  version: number;
  name: string;
  metadata: Record<string, unknown>;
  guidReferences: Record<string, AssetGUID>;
  entities: SceneEntityRecord[];
  resources: Record<string, unknown>;
  overrides?: PrefabOverride[];
  prefabRoot?: number | null;
}

export interface SceneMigration {
  from: number;
  to: number;
  migrate(file: Record<string, unknown>): Record<string, unknown>;
}

export class SceneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SceneError";
  }
}

const migrations: SceneMigration[] = [];

export function registerSceneMigration(migration: SceneMigration): void {
  if (migrations.some((entry) => entry.from === migration.from)) {
    throw new SceneError(`migration from version ${migration.from} already registered`);
  }
  migrations.push(migration);
}

export function clearSceneMigrations(): void {
  migrations.length = 0;
}

export interface SerializeSceneOptions {
  name: string;
  format?: "scene" | "prefab";
  metadata?: Record<string, unknown>;
  guidReferences?: Record<string, AssetGUID>;
  overrides?: PrefabOverride[];
  prefabRoot?: number | null;
  entities?: SceneEntityRecord[];
}

export function serializeScene(world: World, options: SerializeSceneOptions): SceneFile {
  const serialized = world.serialize();
  const entities: SceneEntityRecord[] =
    options.entities ??
    serialized.entities.map((entry) => {
      const record: SceneEntityRecord = {
        id: entry.entity,
        components: entry.components,
      };
      const name = entry.components["core.Name"] as { value?: string } | undefined;
      if (name && typeof name.value === "string") record.name = name.value;
      const parent = entry.components["core.Parent"] as { entity?: Entity | null } | undefined;
      if (parent) record.parent = parent.entity ?? null;
      return record;
    });
  const file: SceneFile = {
    format: options.format ?? "scene",
    version: SCENE_FORMAT_VERSION,
    name: options.name,
    metadata: { ...(options.metadata ?? {}) },
    guidReferences: { ...(options.guidReferences ?? {}) },
    entities,
    resources: serialized.resources,
  };
  if (options.overrides) file.overrides = options.overrides;
  if (options.prefabRoot !== undefined) file.prefabRoot = options.prefabRoot;
  return file;
}

export function stringifyScene(file: SceneFile): string {
  return JSON.stringify(file, null, 2);
}

export function parseScene(input: string | Record<string, unknown>): SceneFile {
  const raw = typeof input === "string" ? (JSON.parse(input) as Record<string, unknown>) : input;
  const migrated = migrateScene(raw);
  const file = migrated as unknown as SceneFile;
  const errors = validateScene(file);
  if (errors.length > 0) throw new SceneError(`invalid scene: ${errors.join("; ")}`);
  return file;
}

function migrateScene(raw: Record<string, unknown>): Record<string, unknown> {
  let current = raw;
  let version = typeof current.version === "number" ? current.version : 1;
  while (version < SCENE_FORMAT_VERSION) {
    const migration = migrations.find((entry) => entry.from === version);
    if (!migration) {
      if (version === 1) {
        current = { ...current, version: 2, guidReferences: current.guidReferences ?? {}, metadata: current.metadata ?? {} };
        version = 2;
        continue;
      }
      throw new SceneError(`no migration from scene version ${version}`);
    }
    current = migration.migrate(current);
    version = migration.to;
    current.version = version;
  }
  return current;
}

export function validateScene(file: SceneFile): string[] {
  const errors: string[] = [];
  if (file.format !== "scene" && file.format !== "prefab") errors.push(`unknown format: ${String(file.format)}`);
  if (typeof file.version !== "number" || file.version < 1) errors.push("missing version");
  if (typeof file.name !== "string" || file.name.length === 0) errors.push("missing name");
  if (!Array.isArray(file.entities)) {
    errors.push("missing entities");
    return errors;
  }
  const ids = new Set<number>();
  for (const entity of file.entities) {
    if (typeof entity.id !== "number") errors.push("entity without id");
    else if (ids.has(entity.id)) errors.push(`duplicate entity id ${entity.id}`);
    else ids.add(entity.id);
    if (typeof entity.components !== "object" || entity.components === null) errors.push(`entity ${String(entity.id)} without components`);
    if (entity.parent !== undefined && entity.parent !== null && !ids.has(entity.parent) && !file.entities.some((other) => other.id === entity.parent)) {
      errors.push(`entity ${String(entity.id)} has missing parent ${String(entity.parent)}`);
    }
  }
  if (file.format === "prefab") {
    if (file.prefabRoot !== undefined && file.prefabRoot !== null && !ids.has(file.prefabRoot)) {
      errors.push(`prefab root ${String(file.prefabRoot)} not found`);
    }
    for (const override of file.overrides ?? []) {
      if (!ids.has(override.entityId)) errors.push(`override references missing entity ${override.entityId}`);
    }
  }
  for (const [key, guid] of Object.entries(file.guidReferences ?? {})) {
    if (typeof guid !== "string" || guid.length === 0) errors.push(`invalid guid reference: ${key}`);
  }
  return errors;
}

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

function deepRemap(value: unknown, idMap: Map<number, number>): unknown {
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
