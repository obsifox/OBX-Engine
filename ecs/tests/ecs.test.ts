import { describe, expect, it } from "vitest";
import {
  Children,
  Name,
  Parent,
  World,
  defineComponent,
  defineSystem,
  defineWorldResource,
  entityGeneration,
  entityIndex,
  formatEntity,
  isEntity,
  makeEntity,
} from "@obx/ecs";

const Position = defineComponent<{ x: number; y: number }>("Test.Position", {
  defaults: () => ({ x: 0, y: 0 }),
});
const Velocity = defineComponent<{ x: number; y: number }>("Test.Velocity", {
  defaults: () => ({ x: 0, y: 0 }),
});
const Health = defineComponent<{ hp: number }>("Test.Health", {
  defaults: () => ({ hp: 100 }),
});
const Tag = defineComponent<{ label: string }>("Test.Tag", {
  defaults: () => ({ label: "" }),
});

describe("Entity ids (§4)", () => {
  it("packs and unpacks index/generation", () => {
    const entity = makeEntity(42, 7);
    expect(entityIndex(entity)).toBe(42);
    expect(entityGeneration(entity)).toBe(7);
    expect(isEntity(entity)).toBe(true);
    expect(isEntity(-1)).toBe(false);
    expect(isEntity(1.5)).toBe(false);
    expect(formatEntity(entity)).toBe("E(42:g7)");
  });
});

describe("World entities & components (§4)", () => {
  it("creates entities with initial components", () => {
    const world = new World();
    const entity = world.createEntity([Position, { x: 1, y: 2 }], Velocity);

    expect(world.isAlive(entity)).toBe(true);
    expect(world.getComponent(entity, Position)).toEqual({ x: 1, y: 2 });
    expect(world.getComponent(entity, Velocity)).toEqual({ x: 0, y: 0 });
    expect(world.getComponent(entity, Health)).toBeUndefined();
    expect(world.entityCount).toBe(1);
  });

  it("rejects duplicate components at creation", () => {
    const world = new World();
    expect(() => world.createEntity(Position, Position)).toThrowError("Duplicate component");
  });

  it("adds and removes components with archetype migration", () => {
    const world = new World();
    const entity = world.createEntity(Position);
    expect(world.stats().archetypes).toBe(1);

    world.addComponent(entity, Health, { hp: 50 });
    expect(world.hasComponent(entity, Health)).toBe(true);
    expect(world.getComponent(entity, Health)?.hp).toBe(50);
    expect(world.stats().archetypes).toBe(2);

    expect(() => world.addComponent(entity, Health)).toThrowError("already has component");
    expect(world.removeComponent(entity, Health)).toBe(true);
    expect(world.removeComponent(entity, Health)).toBe(false);
    expect(world.getComponent(entity, Position)).toEqual({ x: 0, y: 0 });
  });

  it("migrates many entities between archetypes without losing data", () => {
    const world = new World();
    const entities = world.createEntities(5, Position, Velocity);
    entities.forEach((entity, index) => {
      world.getComponentOrThrow(entity, Position).x = index * 10;
    });

    for (const entity of entities) {
      world.addComponent(entity, Health);
    }
    for (const entity of entities.slice(0, 3)) {
      world.removeComponent(entity, Health);
    }

    entities.forEach((entity, index) => {
      expect(world.getComponent(entity, Position)?.x).toBe(index * 10);
      expect(world.hasComponent(entity, Health)).toBe(index >= 3);
    });
  });

  it("destroys entities and invalidates stale handles", () => {
    const world = new World();
    const first = world.createEntity(Position);
    expect(world.destroyEntity(first)).toBe(true);
    expect(world.isAlive(first)).toBe(false);
    expect(world.destroyEntity(first)).toBe(false);
    expect(() => world.getComponent(first, Position)).toThrowError("not alive");

    const second = world.createEntity(Position);
    expect(second).not.toBe(first);
    expect(entityIndex(second)).toBe(entityIndex(first));
    expect(entityGeneration(second)).toBe(entityGeneration(first) + 1);
    expect(world.isAlive(first)).toBe(false);
    expect(world.isAlive(second)).toBe(true);
    expect(world.getComponent(second, Position)).toEqual({ x: 0, y: 0 });
  });

  it("swap-remove keeps other rows consistent", () => {
    const world = new World();
    const a = world.createEntity([Position, { x: 1 }]);
    const b = world.createEntity([Position, { x: 2 }]);
    const c = world.createEntity([Position, { x: 3 }]);
    world.destroyEntity(a);
    expect(world.getComponent(b, Position)?.x).toBe(2);
    expect(world.getComponent(c, Position)?.x).toBe(3);
    world.destroyEntity(c);
    expect(world.getComponent(b, Position)?.x).toBe(2);
  });

  it("getComponentOrThrow throws when missing", () => {
    const world = new World();
    const entity = world.createEntity(Position);
    expect(() => world.getComponentOrThrow(entity, Health)).toThrowError('missing component "Test.Health"');
  });
});

describe("Queries (§4)", () => {
  it("matches all/any/none", () => {
    const world = new World();
    const a = world.createEntity(Position, Velocity);
    const b = world.createEntity(Position);
    const c = world.createEntity(Position, Health);

    const moving = world.query(Position, Velocity).entities();
    expect(moving).toEqual([a]);

    const dynamicOrHealthy = world.queryWith({ all: [Position], any: [Velocity, Health] }).entities();
    expect(dynamicOrHealthy.sort()).toEqual([a, c].sort());

    const statics = world.queryWith({ all: [Position], none: [Velocity, Health] }).entities();
    expect(statics).toEqual([b]);
  });

  it("iterates tuples with component data", () => {
    const world = new World();
    const entity = world.createEntity([Position, { x: 5, y: 0 }], [Velocity, { x: 2, y: 0 }]);
    world.createEntity(Position);

    const seen: number[] = [];
    for (const [e, pos, vel] of world.query(Position, Velocity)) {
      expect(e).toBe(entity);
      pos.x += vel.x;
      seen.push(pos.x);
    }
    expect(seen).toEqual([7]);
    expect(world.query(Position, Velocity).count()).toBe(1);
    expect(world.query(Position).first()?.[0]).toBe(entity);
    expect(world.query(Tag).isEmpty()).toBe(true);
  });

  it("caches queries and refreshes on new archetypes", () => {
    const world = new World();
    world.createEntity(Position);
    const q1 = world.query(Position);
    const q2 = world.query(Position);
    expect(q1).toBe(q2);
    expect(q1.count()).toBe(1);

    world.createEntity(Position, Tag);
    expect(q1.count()).toBe(2);
    expect(world.stats().cachedQueries).toBe(1);
  });

  it("forEach delivers every entity", () => {
    const world = new World();
    world.createEntities(3, [Position, { x: 1 }]);
    let sum = 0;
    world.query(Position).forEach((_e, pos) => { sum += pos.x; });
    expect(sum).toBe(3);
  });
});

describe("Systems (§4)", () => {
  it("runs systems in order with before/after constraints", () => {
    const world = new World();
    const order: string[] = [];
    world.addSystem(defineSystem({ name: "render", execute: () => order.push("render"), after: ["physics"] }));
    world.addSystem(defineSystem({ name: "physics", execute: () => order.push("physics"), after: ["input"] }));
    world.addSystem(defineSystem({ name: "input", execute: () => order.push("input") }));
    world.update(0.016);
    expect(order).toEqual(["input", "physics", "render"]);
  });

  it("order field breaks ties (ascending)", () => {
    const world = new World();
    const order: string[] = [];
    world.addSystem(defineSystem({ name: "late", order: 10, execute: () => order.push("late") }));
    world.addSystem(defineSystem({ name: "early", order: -10, execute: () => order.push("early") }));
    world.addSystem(defineSystem({ name: "mid", execute: () => order.push("mid") }));
    world.update(0);
    expect(order).toEqual(["early", "mid", "late"]);
  });

  it("detects ordering cycles", () => {
    const world = new World();
    world.addSystem(defineSystem({ name: "a", after: ["b"], execute: () => {} }));
    world.addSystem(defineSystem({ name: "b", after: ["a"], execute: () => {} }));
    expect(() => world.update(0)).toThrowError("Cycle detected");
  });

  it("ignores unknown constraint names (plugin-friendly)", () => {
    const world = new World();
    const order: string[] = [];
    world.addSystem(defineSystem({ name: "solo", after: ["not-registered"], execute: () => order.push("solo") }));
    world.update(0);
    expect(order).toEqual(["solo"]);
  });

  it("supports phases and world time", () => {
    const world = new World();
    const times: Array<{ delta: number; time: number }> = [];
    world.addSystem(defineSystem({
      name: "fixed",
      phase: "fixedUpdate",
      execute: (ctx) => times.push({ delta: ctx.delta, time: ctx.time }),
    }));
    world.update(0.5);
    world.runPhase("fixedUpdate", 0.02);
    expect(times).toEqual([{ delta: 0.02, time: 0.5 }]);
    expect(world.time).toBe(0.5);
  });

  it("removes and lists systems", () => {
    const world = new World();
    world.addSystem(defineSystem({ name: "a", execute: () => {} }));
    world.addSystem(defineSystem({ name: "b", execute: () => {} }));
    expect(world.systems.names()).toEqual(["a", "b"]);
    expect(world.removeSystem("a")).toBe(true);
    expect(world.removeSystem("a")).toBe(false);
  });
});

describe("Resources (§4)", () => {
  it("stores singleton state", () => {
    const Gravity = defineWorldResource<{ g: number }>("Test.Gravity");
    const world = new World();
    world.addResource(Gravity, { g: 9.81 });
    expect(world.getResource(Gravity)?.g).toBe(9.81);
    expect(() => world.addResource(Gravity, { g: 1 })).toThrowError("already exists");
    world.setResource(Gravity, { g: 1.62 });
    expect(world.getResourceOrThrow(Gravity).g).toBe(1.62);
    expect(world.removeResource(Gravity)).toBe(true);
    expect(world.getResource(Gravity)).toBeUndefined();
    expect(() => world.getResourceOrThrow(Gravity)).toThrowError("not found");
  });
});

describe("Hierarchy (§5 foundation)", () => {
  it("parents and children stay consistent", () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    const grandchild = world.createEntity();

    world.setParent(child, parent);
    world.setParent(grandchild, child);

    expect(world.getParent(child)).toBe(parent);
    expect(world.getChildren(parent)).toEqual([child]);
    expect(world.getChildren(child)).toEqual([grandchild]);

    world.setParent(child, null);
    expect(world.getParent(child)).toBeUndefined();
    expect(world.getChildren(parent)).toEqual([]);
    expect(world.getParent(grandchild)).toBe(child);
  });

  it("rejects cycles", () => {
    const world = new World();
    const a = world.createEntity();
    const b = world.createEntity();
    world.setParent(b, a);
    expect(() => world.setParent(a, b)).toThrowError("cycle");
    expect(() => world.setParent(a, a)).toThrowError("cycle");
  });

  it("destroying a parent orphans children; recursive destroys subtree", () => {
    const world = new World();
    const parent = world.createEntity();
    const child = world.createEntity();
    world.setParent(child, parent);
    world.destroyEntity(parent);
    expect(world.isAlive(child)).toBe(true);
    expect(world.getParent(child)).toBeUndefined();

    const root = world.createEntity();
    const kid = world.createEntity();
    world.setParent(kid, root);
    world.destroyEntity(root, { recursive: true });
    expect(world.isAlive(kid)).toBe(false);
  });

  it("name helpers use the Name component", () => {
    const world = new World();
    const entity = world.createEntity();
    expect(world.getName(entity)).toBeNull();
    world.setName(entity, "player");
    expect(world.getName(entity)).toBe("player");
    world.setName(entity, "hero");
    expect(world.getName(entity)).toBe("hero");
    expect(world.hasComponent(entity, Name)).toBe(true);
    expect(world.hasComponent(entity, Parent)).toBe(false);
    expect(world.hasComponent(entity, Children)).toBe(false);
  });
});

describe("Serialization (§36 foundation)", () => {
  it("round-trips entities, components, hierarchy and resources", () => {
    const Score = defineWorldResource<{ value: number }>("Test.Score");
    const world = new World();
    world.addResource(Score, { value: 9000 });
    world.update(1.25);

    const parent = world.createEntity([Position, { x: 1, y: 2 }]);
    world.setName(parent, "root");
    const child = world.createEntity([Velocity, { x: 9, y: 9 }], Health);
    world.setParent(child, parent);

    const data = JSON.parse(JSON.stringify(world.serialize())) as ReturnType<World["serialize"]>;
    const restored = World.fromSerialized(data);

    expect(restored.time).toBeCloseTo(1.25);
    expect(restored.entityCount).toBe(2);
    expect(restored.getResourceOrThrow(Score).value).toBe(9000);

    const entities = restored.listEntities();
    expect(entities).toHaveLength(2);
    const restoredParent = entities.find((e) => restored.getName(e) === "root") as number;
    expect(restoredParent).toBeDefined();
    expect(restored.getComponent(restoredParent, Position)).toEqual({ x: 1, y: 2 });

    const restoredChild = restored.getChildren(restoredParent)[0];
    expect(restoredChild).toBeDefined();
    expect(restored.getComponent(restoredChild!, Velocity)).toEqual({ x: 9, y: 9 });
    expect(restored.getComponent(restoredChild!, Health)).toEqual({ hp: 100 });
    expect(restored.getParent(restoredChild!)).toBe(restoredParent);
  });

  it("uses custom serialize hooks", () => {
    const SetTag = defineComponent<{ values: Set<string> }>("Test.SetTag", {
      defaults: () => ({ values: new Set() }),
      serialize: (data) => ({ values: [...data.values] }),
      deserialize: (raw) => ({ values: new Set((raw as { values: string[] }).values) }),
    });
    const world = new World();
    const entity = world.createEntity(SetTag);
    world.getComponentOrThrow(entity, SetTag).values.add("alpha");

    const data = world.serialize();
    const restored = World.fromSerialized(JSON.parse(JSON.stringify(data)) as never);
    const restoredEntity = restored.listEntities()[0] as number;
    expect(restored.getComponent(restoredEntity, SetTag)?.values).toEqual(new Set(["alpha"]));
  });

  it("skips unknown components when allowed", () => {
    const world = new World();
    const entity = world.createEntity(Position);
    const data = world.serialize();
    data.entities[0]!.components["Ghost.Component"] = { boo: true };
    expect(() => World.fromSerialized(data, { allowUnknownComponents: false })).toThrowError("Unknown component");
    const tolerant = World.fromSerialized(data, { allowUnknownComponents: true });
    expect(tolerant.isAlive(entity)).toBe(true);
    expect(tolerant.listEntities()).toHaveLength(1);
  });
});

describe("Debugging (§4 ECS debugging)", () => {
  it("stats and inspect expose world internals", () => {
    const world = new World("test-world");
    const entity = world.createEntity([Position, { x: 3, y: 4 }]);
    world.setName(entity, "p1");
    world.addSystem(defineSystem({ name: "noop", execute: () => {} }));

    const stats = world.stats();
    expect(stats.entities).toBe(1);

    expect(stats.archetypes).toBe(2);
    expect(stats.systems).toBe(1);
    expect(stats.componentsByType["Test.Position"]).toBe(1);
    expect(stats.componentsByType["core.Name"]).toBe(1);

    const info = world.inspect(entity);
    expect(info.alive).toBe(true);
    expect(info.name).toBe("p1");
    expect(info.components["Test.Position"]).toEqual({ x: 3, y: 4 });
    expect(world.inspect(makeEntity(999, 0)).alive).toBe(false);
  });
});
