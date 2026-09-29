import { describe, expect, it } from "vitest";
import { Children, Parent, Name, World, defineComponent, type Entity } from "@obx/ecs";
import {
  SCENE_FORMAT_VERSION,
  SceneError,
  applyOverride,
  clearSceneMigrations,
  createPrefab,
  instantiatePrefab,
  loadScene,
  parseScene,
  prefabFromWorld,
  registerSceneMigration,
  serializeScene,
  stringifyScene,
  validateScene,
  type SceneFile,
} from "../src/index.js";

const Position = defineComponent<{ x: number; y: number }>("test.Position", {
  defaults: () => ({ x: 0, y: 0 }),
});

function buildWorld(): { world: World; root: Entity; child: Entity } {
  const world = new World();
  const root = world.createEntity([Name, { value: "root" }], [Position, { x: 1, y: 2 }]);
  const child = world.createEntity([Name, { value: "child" }], [Position, { x: 3, y: 4 }], [Parent, { entity: root }]);
  return { world, root, child };
}

describe("scene files", () => {
  it("serializes and loads scenes with parent references", () => {
    const { world, root, child } = buildWorld();
    const scene = serializeScene(world, {
      name: "level-1",
      metadata: { author: "obx" },
      guidReferences: { sky: "guid-sky" },
    });
    expect(scene.format).toBe("scene");
    expect(scene.version).toBe(SCENE_FORMAT_VERSION);
    expect(scene.entities).toHaveLength(2);
    expect(scene.guidReferences.sky).toBe("guid-sky");
    const text = stringifyScene(scene);
    const target = new World();
    const loaded = loadScene(target, text);
    expect(loaded.name).toBe("level-1");
    expect(target.getComponent(root, Position)).toEqual({ x: 1, y: 2 });
    expect(target.getComponent(child, Parent)).toEqual({ entity: root });
    expect(target.getComponent(child, Name)).toEqual({ value: "child" });
  });

  it("validates scenes and reports issues", () => {
    const good: SceneFile = {
      format: "scene",
      version: 1,
      name: "ok",
      metadata: {},
      guidReferences: { a: "guid-a" },
      entities: [{ id: 1, components: {} }, { id: 2, parent: 1, components: {} }],
      resources: {},
    };
    expect(validateScene(good)).toEqual([]);
    const bad = {
      format: "alien",
      version: 0,
      name: "",
      metadata: {},
      guidReferences: { a: "" },
      entities: [{ id: 1, parent: 9, components: {} }, { id: 1, components: null }],
      resources: {},
    } as unknown as SceneFile;
    const errors = validateScene(bad);
    expect(errors.length).toBeGreaterThanOrEqual(5);
    expect(() => parseScene(JSON.stringify(bad))).toThrow(SceneError);
  });

  it("migrates older scene versions", () => {
    clearSceneMigrations();
    registerSceneMigration({
      from: 1,
      to: 2,
      migrate: (file) => ({ ...file, metadata: { ...(file.metadata as object), migrated: true } }),
    });
    const legacy = JSON.stringify({
      format: "scene",
      version: 1,
      name: "legacy",
      entities: [{ id: 1, components: {} }],
      resources: {},
    });
    const parsed = parseScene(legacy);
    expect(parsed.version).toBe(2);
    expect(parsed.metadata).toMatchObject({ migrated: true });
    expect(() => registerSceneMigration({ from: 1, to: 2, migrate: (file) => file })).toThrow(SceneError);
    clearSceneMigrations();
    const upgraded = parseScene(legacy);
    expect(upgraded.version).toBe(2);
    expect(upgraded.guidReferences).toEqual({});
  });

  it("tolerates unknown future versions and empty upgrades", () => {
    clearSceneMigrations();
    expect(() =>
      parseScene(
        JSON.stringify({
          format: "scene",
          version: 1,
          name: "stuck",
          entities: [],
          resources: {},
          unknownFlag: true,
        }),
      ),
    ).not.toThrow();
    expect(() =>
      parseScene(
        JSON.stringify({
          format: "scene",
          version: 5,
          name: "future",
          entities: [],
          resources: {},
        }),
      ),
    ).not.toThrow();
  });
});

describe("prefabs", () => {
  it("creates prefabs from worlds", () => {
    const { world } = buildWorld();
    const prefab = prefabFromWorld(world, "enemy");
    expect(prefab.format).toBe("prefab");
    expect(prefab.entities).toHaveLength(2);
    expect(prefab.prefabRoot).toBe(prefab.entities[0]!.id);
    expect(validateScene(prefab)).toEqual([]);
  });

  it("instantiates prefabs with remapped entity ids", () => {
    const source = buildWorld();
    const prefab = prefabFromWorld(source.world, "enemy");
    const target = new World();
    const blocker = target.createEntity([Name, { value: "existing" }]);
    const result = instantiatePrefab(target, prefab);
    expect(result.entities).toHaveLength(2);
    expect(result.root).not.toBeNull();
    expect(result.entities).not.toContain(source.root);
    expect(target.getComponent(blocker, Name)).toEqual({ value: "existing" });
    const names = result.entities.map((entity) => target.getComponent(entity, Name)?.value);
    expect(names).toContain("root");
    expect(names).toContain("child");
    const createdRoot = result.idMap[String(source.root)];
    const createdChild = result.idMap[String(source.child)];
    expect(target.getComponent(createdChild!, Parent)).toEqual({ entity: createdRoot });
  });

  it("applies prefab and call-site overrides", () => {
    const source = buildWorld();
    const prefab = createPrefab({
      name: "tower",
      entities: prefabFromWorld(source.world, "tower").entities,
      overrides: [{ entityId: source.root, component: "test.Position", values: { x: 10 } }],
    });
    const target = new World();
    const result = instantiatePrefab(target, prefab, [
      { entityId: source.child, component: "test.Position", values: { y: 99 } },
    ]);
    const root = result.idMap[String(source.root)]!;
    const child = result.idMap[String(source.child)]!;
    expect(target.getComponent(root, Position)).toEqual({ x: 10, y: 2 });
    expect(target.getComponent(child, Position)).toEqual({ x: 3, y: 99 });
    applyOverride(target, root, "test.Position", { y: 7 });
    expect(target.getComponent(root, Position)).toEqual({ x: 10, y: 7 });
    expect(() => applyOverride(target, root, "test.Missing", {})).toThrow(SceneError);
  });

  it("rejects invalid prefabs and scene formats", () => {
    expect(() => createPrefab({ name: "bad", entities: [{ id: 1, parent: 5, components: {} }] })).toThrow(SceneError);
    const scene = serializeScene(new World(), { name: "empty" });
    const target = new World();
    expect(() => instantiatePrefab(target, scene)).toThrow(SceneError);
  });

  it("remaps nested entity references in component data", () => {
    const world = new World();
    const group = world.createEntity([Name, { value: "group" }]);
    const member = world.createEntity([Name, { value: "member" }], [Children, { entities: [group] }]);
    void member;
    const prefab = prefabFromWorld(world, "group");
    const target = new World();
    const result = instantiatePrefab(target, prefab);
    const mappedGroup = result.idMap[String(group)]!;
    for (const entity of result.entities) {
      const children = target.getComponent(entity, Children);
      if (children) {
        expect(children.entities).toEqual([mappedGroup]);
      }
    }
  });
});
