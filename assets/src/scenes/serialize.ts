import { World, type Entity } from "@obx/ecs";
import { type AssetGUID } from "../guid.js";
import { SCENE_FORMAT_VERSION, SceneError, migrations, type PrefabOverride, type SceneEntityRecord, type SceneFile } from "../scenes/types.js";

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

