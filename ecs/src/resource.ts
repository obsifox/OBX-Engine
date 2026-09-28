import { AlreadyExistsError, ensure } from "@obx/core";

export interface ResourceDefinition<T = unknown> {
  readonly id: number;
  readonly name: string;
  readonly __data?: T;
}

const resourceNames = new Set<string>();
let nextResourceId = 1;

export function defineResource<T = unknown>(name: string): ResourceDefinition<T> {
  ensure(typeof name === "string" && name.length > 0, "Resource name must be a non-empty string");
  if (resourceNames.has(name)) {
    throw new AlreadyExistsError(`Resource "${name}" is already defined`, { context: { name } });
  }
  resourceNames.add(name);
  return { id: nextResourceId++, name };
}

export type ResourceData<D> = D extends ResourceDefinition<infer T> ? T : never;
