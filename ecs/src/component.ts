/**
 * Component definitions — §4 ECS / Component registration, storage.
 *
 * Components are pure data bags. `defineComponent` registers a reusable
 * descriptor with defaults and optional (de)serialization hooks.
 */

import { AlreadyExistsError, ensure } from "@obsifox/core";

export interface ComponentOptions<T> {
  /** Factory returning a fresh default data object. */
  defaults?: () => T;
  /** Custom serializer (default: pass-through, assumes JSON-safe data). */
  serialize?: (data: T) => unknown;
  /** Custom deserializer (default: cast as-is). */
  deserialize?: (raw: unknown) => T;
}

export interface ComponentDefinition<T extends object = Record<string, unknown>> {
  readonly id: number;
  readonly name: string;
  readonly defaults: () => T;
  readonly serialize: (data: T) => unknown;
  readonly deserialize: (raw: unknown) => T;
  /** Phantom field carrying the component data type for inference. */
  readonly __data?: T;
}

/**
 * Type-erased component definition for structural APIs (archetypes, queries,
 * storage). Data types still infer correctly through {@link ComponentData}.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponentDefinition = ComponentDefinition<any>;

/** Extract the data type from a component definition. */
export type ComponentData<D> = D extends ComponentDefinition<infer T> ? T : never;

/** Map a tuple of definitions to a tuple of data types. */
export type ComponentDataOf<T extends readonly AnyComponentDefinition[]> = {
  [K in keyof T]: ComponentData<T[K]>;
};

const registryById = new Map<number, AnyComponentDefinition>();
const registryByName = new Map<string, AnyComponentDefinition>();
let nextComponentId = 1;

/**
 * Register a component type.
 *
 * ```ts
 * const Position = defineComponent<{ x: number; y: number }>("Position", {
 *   defaults: () => ({ x: 0, y: 0 }),
 * });
 * world.addComponent(entity, Position, { x: 10 });
 * ```
 */
export function defineComponent<T extends object>(
  name: string,
  options: ComponentOptions<T> = {},
): ComponentDefinition<T> {
  ensure(typeof name === "string" && name.length > 0, "Component name must be a non-empty string");
  if (registryByName.has(name)) {
    throw new AlreadyExistsError(`Component "${name}" is already defined`, { context: { name } });
  }

  const defaults = options.defaults ?? (() => ({}) as T);
  const definition: ComponentDefinition<T> = {
    id: nextComponentId++,
    name,
    defaults,
    serialize: options.serialize ?? ((data) => data as unknown),
    deserialize: options.deserialize ?? ((raw) => raw as T),
  };

  registryById.set(definition.id, definition as ComponentDefinition);
  registryByName.set(name, definition as ComponentDefinition);
  return definition;
}

/** Look up a registered component by name. */
export function getComponentDefinition(name: string): AnyComponentDefinition | undefined {
  return registryByName.get(name);
}

/** All registered component definitions. */
export function listComponentDefinitions(): readonly AnyComponentDefinition[] {
  return [...registryById.values()];
}
