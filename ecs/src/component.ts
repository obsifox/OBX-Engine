import { AlreadyExistsError, ensure } from "@obx/core";

export interface ComponentOptions<T> {

  defaults?: () => T;

  serialize?: (data: T) => unknown;

  deserialize?: (raw: unknown) => T;
}

export interface ComponentDefinition<T extends object = Record<string, unknown>> {
  readonly id: number;
  readonly name: string;
  readonly defaults: () => T;
  readonly serialize: (data: T) => unknown;
  readonly deserialize: (raw: unknown) => T;

  readonly __data?: T;
}

export type AnyComponentDefinition = ComponentDefinition<any>;

export type ComponentData<D> = D extends ComponentDefinition<infer T> ? T : never;

export type ComponentDataOf<T extends readonly AnyComponentDefinition[]> = {
  [K in keyof T]: ComponentData<T[K]>;
};

const registryById = new Map<number, AnyComponentDefinition>();
const registryByName = new Map<string, AnyComponentDefinition>();
let nextComponentId = 1;

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

export function getComponentDefinition(name: string): AnyComponentDefinition | undefined {
  return registryByName.get(name);
}

export function listComponentDefinitions(): readonly AnyComponentDefinition[] {
  return [...registryById.values()];
}
