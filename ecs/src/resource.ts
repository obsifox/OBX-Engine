/**
 * Resource definitions — §4 ECS / Resource.
 *
 * Resources are singletons stored on a {@link World} (input state, time,
 * config, physics world handles, ...).
 */

import { AlreadyExistsError, ensure } from "@obsifox/core";

export interface ResourceDefinition<T = unknown> {
  readonly id: number;
  readonly name: string;
  readonly __data?: T;
}

const resourceNames = new Set<string>();
let nextResourceId = 1;

/**
 * Register a resource type.
 *
 * ```ts
 * const TimeResource = defineResource<{ elapsed: number }>("Time");
 * world.addResource(TimeResource, { elapsed: 0 });
 * ```
 */
export function defineResource<T = unknown>(name: string): ResourceDefinition<T> {
  ensure(typeof name === "string" && name.length > 0, "Resource name must be a non-empty string");
  if (resourceNames.has(name)) {
    throw new AlreadyExistsError(`Resource "${name}" is already defined`, { context: { name } });
  }
  resourceNames.add(name);
  return { id: nextResourceId++, name };
}

/** Extract the data type from a resource definition. */
export type ResourceData<D> = D extends ResourceDefinition<infer T> ? T : never;
