/**
 * ECS World — §4 ECS (entity/component/system/query/archetype/resource),
 * §5 Scene (entity hierarchy foundation), entity serialization & debugging.
 */

import { AlreadyExistsError, InvalidArgumentError, NotFoundError } from "@obsifox/core";
import { Archetype } from "./archetype.js";
import type { AnyComponentDefinition, ComponentDefinition } from "./component.js";
import { defineComponent, getComponentDefinition } from "./component.js";
import {
  GENERATION_CAPACITY,
  entityGeneration,
  entityIndex,
  makeEntity,
  type Entity,
} from "./entity.js";
import { Query, queryKey, type QueryHost, type QuerySpec } from "./query.js";
import { defineResource, type ResourceDefinition } from "./resource.js";
import {
  DEFAULT_PHASE,
  SystemScheduler,
  defineSystem,
  type SystemDefinition,
  type SystemOptions,
} from "./system.js";

/* ------------------------------------------------------------------ */
/* Built-in components                                                 */
/* ------------------------------------------------------------------ */

/** Parent link for entity hierarchy (§5 Scene tree foundation). */
export const Parent = defineComponent<{ entity: Entity | null }>("core.Parent", {
  defaults: () => ({ entity: null }),
});

/** Children list for entity hierarchy. */
export const Children = defineComponent<{ entities: Entity[] }>("core.Children", {
  defaults: () => ({ entities: [] }),
});

/** Optional debug/display name. */
export const Name = defineComponent<{ value: string }>("core.Name", {
  defaults: () => ({ value: "" }),
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** Either a bare definition or `[definition, initialData]`. */
export type ComponentSpec =
  | AnyComponentDefinition
  | readonly [AnyComponentDefinition, Record<string, unknown>?];

export interface DestroyOptions {
  /** Also destroy all descendants (default false — children are orphaned). */
  recursive?: boolean;
}

export interface SerializedEntity {
  /** Packed entity handle (index + generation), preserved across save/load. */
  entity: Entity;
  /** Component data keyed by component name. */
  components: Record<string, unknown>;
}

export interface SerializedWorld {
  version: 1;
  time: number;
  entities: SerializedEntity[];
  resources: Record<string, unknown>;
}

export interface LoadOptions {
  /** Skip (true, default) or throw on unknown component names in the data. */
  allowUnknownComponents?: boolean;
}

export interface WorldStats {
  entities: number;
  archetypes: number;
  cachedQueries: number;
  systems: number;
  resources: number;
  componentsByType: Record<string, number>;
}

export interface EntityInspection {
  entity: Entity;
  alive: boolean;
  name: string | null;
  parent: Entity | null;
  children: Entity[];
  components: Record<string, unknown>;
}

interface EntityLocation {
  archetype: Archetype;
  row: number;
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

/**
 * The ECS container: entities, components (archetype storage), systems,
 * queries, resources and a light entity hierarchy.
 *
 * ```ts
 * const world = new World();
 * const Position = defineComponent<{ x: number; y: number }>("Position", {
 *   defaults: () => ({ x: 0, y: 0 }),
 * });
 * const e = world.createEntity([Position, { x: 1, y: 2 }]);
 * for (const [entity, pos] of world.query(Position)) pos.x += 1;
 * world.update(1 / 60);
 * ```
 */
export class World implements QueryHost {
  readonly name: string;

  #generations: number[] = [];
  #aliveFlags: boolean[] = [];
  #freeIndices: number[] = [];
  #nextIndex = 0;
  #entityCount = 0;

  #archetypeByKey = new Map<string, Archetype>();
  #archetypeList: Archetype[] = [];
  #archetypesVersion = 0;

  #locations = new Map<Entity, EntityLocation>();
  #queryCache = new Map<string, Query<readonly AnyComponentDefinition[]>>();
  #resources = new Map<number, unknown>();
  #systems = new SystemScheduler();
  #time = 0;

  constructor(name = "world") {
    this.name = name;
  }

  /* ------------------------------ QueryHost ---------------------- */

  get archetypes(): readonly Archetype[] {
    return this.#archetypeList;
  }

  get archetypesVersion(): number {
    return this.#archetypesVersion;
  }

  /* ------------------------------ Entities ----------------------- */

  /** Current entity count. */
  get entityCount(): number {
    return this.#entityCount;
  }

  /** Accumulated world time in seconds (advanced by {@link update}). */
  get time(): number {
    return this.#time;
  }

  /**
   * Create a new entity, optionally with initial components:
   * `world.createEntity(Position, [Velocity, { x: 1 }])`.
   */
  createEntity(...specs: ComponentSpec[]): Entity {
    const index = this.#freeIndices.pop() ?? this.#nextIndex++;
    const generation = this.#generations[index] ?? 0;
    this.#generations[index] = generation;
    const entity = makeEntity(index, generation);
    this.#aliveFlags[index] = true;
    this.#entityCount += 1;

    const values = new Map<number, unknown>();
    const types: AnyComponentDefinition[] = [];
    for (const spec of specs) {
      const [definition, data] = Array.isArray(spec) ? spec : [spec, undefined];
      if (types.some((type) => type.id === definition.id)) {
        throw new AlreadyExistsError(`Duplicate component "${definition.name}" in createEntity`, {
          context: { component: definition.name },
        });
      }
      types.push(definition);
      values.set(definition.id, { ...(definition.defaults() as object), ...(data ?? {}) });
    }

    const archetype = this.#getOrCreateArchetype(types);
    const row = archetype.add(entity, values);
    this.#locations.set(entity, { archetype, row });
    return entity;
  }

  /** Create `count` entities sharing the same initial specs. */
  createEntities(count: number, ...specs: ComponentSpec[]): Entity[] {
    const entities: Entity[] = [];
    for (let i = 0; i < count; i += 1) {
      entities.push(this.createEntity(...specs));
    }
    return entities;
  }

  /** Destroy an entity (and optionally its subtree). Returns false if stale. */
  destroyEntity(entity: Entity, options: DestroyOptions = {}): boolean {
    if (!this.isAlive(entity)) return false;

    const children = [...this.getChildren(entity)];
    if (options.recursive) {
      for (const child of children) {
        this.destroyEntity(child, { recursive: true });
      }
    } else {
      for (const child of children) {
        this.setParent(child, null);
      }
    }

    // Detach from parent.
    const parent = this.getParent(entity);
    if (parent !== undefined) {
      this.#removeChildFrom(parent, entity);
    }

    const location = this.#locations.get(entity);
    if (location) {
      const moved = location.archetype.removeAt(location.row);
      if (moved !== undefined) {
        const movedLocation = this.#locations.get(moved);
        if (movedLocation) movedLocation.row = location.row;
      }
      this.#locations.delete(entity);
    }

    const index = entityIndex(entity);
    this.#aliveFlags[index] = false;
    this.#generations[index] = ((this.#generations[index] ?? 0) + 1) % GENERATION_CAPACITY;
    this.#freeIndices.push(index);
    this.#entityCount -= 1;
    return true;
  }

  /** Whether the handle refers to a currently alive entity. */
  isAlive(entity: Entity): boolean {
    const index = entityIndex(entity);
    return (
      this.#aliveFlags[index] === true &&
      this.#generations[index] === entityGeneration(entity)
    );
  }

  /** All currently alive entities (snapshot). */
  listEntities(): Entity[] {
    return [...this.#locations.keys()];
  }

  /* ------------------------------ Components --------------------- */

  /** Attach a component; returns the live stored data object. */
  addComponent<T extends object>(
    entity: Entity,
    definition: ComponentDefinition<T>,
    data?: Partial<T>,
  ): T {
    const location = this.#requireLocation(entity);
    if (location.archetype.has(definition.id)) {
      throw new AlreadyExistsError(
        `Entity already has component "${definition.name}"`,
        { context: { entity, component: definition.name } },
      );
    }

    const value = { ...(definition.defaults() as object), ...(data ?? {}) } as T;
    const targetTypes = [...location.archetype.types, definition];
    const target = this.#getOrCreateArchetype(targetTypes);

    const values = location.archetype.collectValues(location.row);
    values.set(definition.id, value);
    this.#relocate(entity, location, target, values);
    return value;
  }

  /** Detach a component. Returns false when the entity lacks it. */
  removeComponent(entity: Entity, definition: AnyComponentDefinition): boolean {
    const location = this.#requireLocation(entity);
    if (!location.archetype.has(definition.id)) return false;

    const targetTypes = location.archetype.types.filter((type) => type.id !== definition.id);
    const target = this.#getOrCreateArchetype(targetTypes);
    const values = location.archetype.collectValues(location.row);
    values.delete(definition.id);
    this.#relocate(entity, location, target, values);
    return true;
  }

  /** Live component data (mutate it in place), or undefined. */
  getComponent<T extends object>(entity: Entity, definition: ComponentDefinition<T>): T | undefined {
    if (!this.isAlive(entity)) {
      throw new NotFoundError(`Entity is not alive`, { context: { entity } });
    }
    const location = this.#locations.get(entity) as EntityLocation;
    return location.archetype.get(location.row, definition.id) as T | undefined;
  }

  /** Live component data or throw. */
  getComponentOrThrow<T extends object>(entity: Entity, definition: ComponentDefinition<T>): T {
    const value = this.getComponent(entity, definition);
    if (value === undefined) {
      throw new NotFoundError(`Entity is missing component "${definition.name}"`, {
        context: { entity, component: definition.name },
      });
    }
    return value;
  }

  /** Whether the entity has the component. */
  hasComponent(entity: Entity, definition: AnyComponentDefinition): boolean {
    if (!this.isAlive(entity)) return false;
    const location = this.#locations.get(entity) as EntityLocation;
    return location.archetype.has(definition.id);
  }

  /* ------------------------------ Queries ------------------------ */

  /** Cached query over entities having ALL listed components. */
  query<T extends readonly AnyComponentDefinition[]>(...all: T): Query<T> {
    return this.#cachedQuery({ all, any: [], none: [] }) as Query<T>;
  }

  /** Cached query with `all` / `any` / `none` constraints. */
  queryWith<T extends readonly AnyComponentDefinition[] = AnyComponentDefinition[]>(
    spec: Partial<QuerySpec> & { all?: T },
  ): Query<T> {
    return this.#cachedQuery({
      all: spec.all ?? [],
      any: spec.any ?? [],
      none: spec.none ?? [],
    }) as Query<T>;
  }

  /* ------------------------------ Systems ------------------------ */

  /** Register a system definition or options object. */
  addSystem(system: SystemDefinition | SystemOptions): SystemDefinition {
    const definition = isSystemDefinition(system) ? system : defineSystem(system);
    this.#systems.add(definition);
    return definition;
  }

  removeSystem(name: string): boolean {
    return this.#systems.remove(name);
  }

  /** Execute the default `update` phase and advance world time. */
  update(delta: number): void {
    this.#time += delta;
    this.#systems.run(this, delta, this.#time, DEFAULT_PHASE);
  }

  /** Execute one named phase (e.g. `"fixedUpdate"`, `"render"`). */
  runPhase(phase: string, delta: number): void {
    this.#systems.run(this, delta, this.#time, phase);
  }

  /** Access the system scheduler (order inspection, custom runs). */
  get systems(): SystemScheduler {
    return this.#systems;
  }

  /* ------------------------------ Resources ---------------------- */

  addResource<T>(definition: ResourceDefinition<T>, value: T): void {
    if (this.#resources.has(definition.id)) {
      throw new AlreadyExistsError(`Resource "${definition.name}" already exists`, {
        context: { resource: definition.name },
      });
    }
    this.#resources.set(definition.id, value);
  }

  /** Insert or replace. */
  setResource<T>(definition: ResourceDefinition<T>, value: T): void {
    this.#resources.set(definition.id, value);
  }

  getResource<T>(definition: ResourceDefinition<T>): T | undefined {
    return this.#resources.get(definition.id) as T | undefined;
  }

  getResourceOrThrow<T>(definition: ResourceDefinition<T>): T {
    const value = this.getResource(definition);
    if (value === undefined) {
      throw new NotFoundError(`Resource "${definition.name}" not found`, {
        context: { resource: definition.name },
      });
    }
    return value;
  }

  hasResource(definition: ResourceDefinition): boolean {
    return this.#resources.has(definition.id);
  }

  removeResource(definition: ResourceDefinition): boolean {
    return this.#resources.delete(definition.id);
  }

  /* ------------------------------ Hierarchy ---------------------- */

  /** Set/clear the parent of `child` (null to orphan). Cycle-safe. */
  setParent(child: Entity, parent: Entity | null): void {
    this.#requireLocation(child);
    if (parent !== null) {
      this.#requireLocation(parent);
    }

    const currentParent = this.getParent(child) ?? null;
    if (currentParent === parent) return;

    // Cycle detection: walking up from the new parent must never reach `child`.
    let cursor = parent;
    const visited = new Set<Entity>();
    while (cursor !== null && cursor !== undefined) {
      if (cursor === child) {
        throw new InvalidArgumentError("setParent would create a hierarchy cycle", {
          context: { child, parent },
        });
      }
      if (visited.has(cursor)) break;
      visited.add(cursor);
      cursor = this.getParent(cursor) ?? null;
    }

    if (currentParent !== null) {
      this.#removeChildFrom(currentParent, child);
    }

    if (parent === null) {
      if (this.hasComponent(child, Parent)) {
        this.removeComponent(child, Parent);
      }
      return;
    }

    if (this.hasComponent(child, Parent)) {
      this.getComponentOrThrow(child, Parent).entity = parent;
    } else {
      this.addComponent(child, Parent, { entity: parent });
    }

    if (this.hasComponent(parent, Children)) {
      const list = this.getComponentOrThrow(parent, Children).entities;
      if (!list.includes(child)) list.push(child);
    } else {
      this.addComponent(parent, Children, { entities: [child] });
    }
  }

  /** Parent handle, or undefined when orphaned. */
  getParent(child: Entity): Entity | undefined {
    if (!this.isAlive(child)) return undefined;
    const parentData = this.getComponent(child, Parent);
    return parentData?.entity ?? undefined;
  }

  /** Direct children (empty when none). */
  getChildren(parent: Entity): readonly Entity[] {
    if (!this.isAlive(parent)) return [];
    return this.getComponent(parent, Children)?.entities ?? [];
  }

  /** Convenience name accessors backed by the {@link Name} component. */
  setName(entity: Entity, name: string): void {
    if (this.hasComponent(entity, Name)) {
      this.getComponentOrThrow(entity, Name).value = name;
    } else {
      this.addComponent(entity, Name, { value: name });
    }
  }

  getName(entity: Entity): string | null {
    if (!this.isAlive(entity)) return null;
    return this.getComponent(entity, Name)?.value ?? null;
  }

  /* ------------------------------ Serialization ------------------ */

  /** Serialize world state (entities + components + resources + time). */
  serialize(): SerializedWorld {
    const entities: SerializedEntity[] = [];
    for (const [entity, location] of this.#locations) {
      const components: Record<string, unknown> = {};
      for (const type of location.archetype.types) {
        const data = location.archetype.get(location.row, type.id);
        components[type.name] = type.serialize(data as never);
      }
      entities.push({ entity, components });
    }

    return {
      version: 1,
      time: this.#time,
      entities,
      resources: this.#serializeResources(),
    };
  }

  /** Load serialized state into this (typically fresh) world. */
  loadSerialized(data: SerializedWorld, options: LoadOptions = {}): void {
    const allowUnknown = options.allowUnknownComponents ?? true;
    for (const serialized of data.entities) {
      const entity = this.#reviveEntity(serialized.entity);
      for (const [componentName, raw] of Object.entries(serialized.components)) {
        const definition = getComponentDefinition(componentName);
        if (!definition) {
          if (allowUnknown) continue;
          throw new NotFoundError(`Unknown component "${componentName}" in serialized data`, {
            context: { component: componentName },
          });
        }
        this.addComponent(entity, definition, definition.deserialize(raw) as Record<string, unknown>);
      }
    }
    this.#time = data.time;
    for (const [name, raw] of Object.entries(data.resources)) {
      const definition = RESOURCE_DEFINITIONS_BY_NAME.get(name);
      if (definition) {
        this.setResource(definition as ResourceDefinition<unknown>, raw);
      }
    }
  }

  /** Convenience: deserialize into a new world. */
  static fromSerialized(data: SerializedWorld, options?: LoadOptions): World {
    const world = new World();
    world.loadSerialized(data, options);
    return world;
  }

  /* ------------------------------ Debugging ---------------------- */

  stats(): WorldStats {
    const componentsByType: Record<string, number> = {};
    for (const archetype of this.#archetypeList) {
      for (const type of archetype.types) {
        componentsByType[type.name] = (componentsByType[type.name] ?? 0) + archetype.size;
      }
    }
    return {
      entities: this.#entityCount,
      archetypes: this.#archetypeList.length,
      cachedQueries: this.#queryCache.size,
      systems: this.#systems.count,
      resources: this.#resources.size,
      componentsByType,
    };
  }

  inspect(entity: Entity): EntityInspection {
    const alive = this.isAlive(entity);
    const components: Record<string, unknown> = {};
    if (alive) {
      const location = this.#locations.get(entity) as EntityLocation;
      for (const type of location.archetype.types) {
        components[type.name] = location.archetype.get(location.row, type.id);
      }
    }
    return {
      entity,
      alive,
      name: this.getName(entity),
      parent: this.getParent(entity) ?? null,
      children: [...this.getChildren(entity)],
      components,
    };
  }

  /* ------------------------------ Internals ---------------------- */

  #requireLocation(entity: Entity): EntityLocation {
    const location = this.#locations.get(entity);
    if (!location || !this.isAlive(entity)) {
      throw new NotFoundError("Entity is not alive", { context: { entity } });
    }
    return location;
  }

  #getOrCreateArchetype(types: readonly AnyComponentDefinition[]): Archetype {
    const key = [...types].map((type) => type.id).sort((a, b) => a - b).join(",");
    let archetype = this.#archetypeByKey.get(key);
    if (!archetype) {
      archetype = new Archetype(types);
      this.#archetypeByKey.set(key, archetype);
      this.#archetypeList.push(archetype);
      this.#archetypesVersion += 1;
    }
    return archetype;
  }

  /** Move an entity between archetypes at fixed values. */
  #relocate(
    entity: Entity,
    from: EntityLocation,
    target: Archetype,
    values: Map<number, unknown>,
  ): void {
    const moved = from.archetype.removeAt(from.row);
    if (moved !== undefined) {
      const movedLocation = this.#locations.get(moved);
      if (movedLocation) movedLocation.row = from.row;
    }
    const row = target.add(entity, values);
    this.#locations.set(entity, { archetype: target, row });
  }

  #cachedQuery(spec: QuerySpec): Query<readonly AnyComponentDefinition[]> {
    const key = queryKey(spec);
    let query = this.#queryCache.get(key);
    if (!query) {
      query = new Query(this, spec);
      this.#queryCache.set(key, query);
    }
    return query;
  }

  #removeChildFrom(parent: Entity, child: Entity): void {
    if (!this.isAlive(parent) || !this.hasComponent(parent, Children)) return;
    const data = this.getComponentOrThrow(parent, Children);
    const index = data.entities.indexOf(child);
    if (index >= 0) data.entities.splice(index, 1);
    if (data.entities.length === 0) {
      this.removeComponent(parent, Children);
    }
  }

  /** Recreate an entity with an exact packed handle (save/load support). */
  #reviveEntity(packed: Entity): Entity {
    const index = entityIndex(packed);
    const generation = entityGeneration(packed);
    const freePosition = this.#freeIndices.indexOf(index);
    if (freePosition >= 0) this.#freeIndices.splice(freePosition, 1);
    if (this.#nextIndex <= index) this.#nextIndex = index + 1;
    this.#generations[index] = generation;
    this.#aliveFlags[index] = true;
    this.#entityCount += 1;
    const entity = makeEntity(index, generation);
    // Place in the empty archetype; components migrate it as they load.
    const archetype = this.#getOrCreateArchetype([]);
    const row = archetype.add(entity, new Map());
    this.#locations.set(entity, { archetype, row });
    return entity;
  }

  #serializeResources(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [id, value] of this.#resources) {
      const name = RESOURCE_DEFINITION_NAMES.get(id) ?? `#${id}`;
      out[name] = value;
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** A fully-resolved system definition (all scheduling fields present). */
function isSystemDefinition(value: SystemDefinition | SystemOptions): value is SystemDefinition {
  return (
    typeof (value as SystemDefinition).phase === "string" &&
    typeof (value as SystemDefinition).order === "number" &&
    Array.isArray((value as SystemDefinition).before) &&
    Array.isArray((value as SystemDefinition).after)
  );
}

/* ------------------------------------------------------------------ */
/* Resource name registry (serialization support)                      */
/* ------------------------------------------------------------------ */

const RESOURCE_DEFINITION_NAMES = new Map<number, string>();
const RESOURCE_DEFINITIONS_BY_NAME = new Map<string, ResourceDefinition>();

/**
 * Register a resource definition with serialization support.
 * Equivalent to {@link defineResource} but keeps a name registry so
 * resources survive world (de)serialization.
 */
export function defineWorldResource<T = unknown>(name: string): ResourceDefinition<T> {
  const definition = defineResource<T>(name);
  RESOURCE_DEFINITION_NAMES.set(definition.id, name);
  RESOURCE_DEFINITIONS_BY_NAME.set(name, definition as ResourceDefinition);
  return definition;
}
