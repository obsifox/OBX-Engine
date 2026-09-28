/**
 * @obsifox/ecs — ObsiFox Engine Entity Component System.
 *
 * Roadmap coverage: §4 ECS Architecture (entities, components, systems,
 * queries, archetypes, resources), §5 Scene (entity hierarchy foundation),
 * entity serialization and ECS debugging/stats.
 */

export * from "./entity.js";
export * from "./component.js";
export * from "./resource.js";
export * from "./archetype.js";
export * from "./query.js";
export * from "./system.js";
export * from "./world.js";

export const ECS_VERSION = "0.2.0";
