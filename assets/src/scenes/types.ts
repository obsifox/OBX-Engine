import { type AssetGUID } from "../guid.js";

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

export const migrations: SceneMigration[] = [];

export function registerSceneMigration(migration: SceneMigration): void {
  if (migrations.some((entry) => entry.from === migration.from)) {
    throw new SceneError(`migration from version ${migration.from} already registered`);
  }
  migrations.push(migration);
}

export function clearSceneMigrations(): void {
  migrations.length = 0;
}

