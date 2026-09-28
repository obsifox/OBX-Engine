/**
 * Entity identity — §4 ECS / Entity IDs.
 *
 * An {@link Entity} is a packed 32-bit-safe number:
 * `entity = generation * INDEX_CAPACITY + index`.
 *
 * - `index` selects the entity slot (reused after destruction).
 * - `generation` increments on every destruction, so stale handles
 *   from before a destroy/recreate cycle are detectable via {@link World.isAlive}.
 */

export type Entity = number;

/** Bits reserved for the entity index (1,048,576 slots). */
export const INDEX_BITS = 20;
/** Number of reusable entity slots. */
export const INDEX_CAPACITY = 1 << INDEX_BITS;
/** Bits reserved for the generation counter (4,096 generations per slot). */
export const GENERATION_BITS = 12;
/** Number of generations per slot before wrap-around. */
export const GENERATION_CAPACITY = 1 << GENERATION_BITS;

/** Pack an index/generation pair into an {@link Entity} handle. */
export function makeEntity(index: number, generation: number): Entity {
  return generation * INDEX_CAPACITY + index;
}

/** Extract the slot index from an entity handle. */
export function entityIndex(entity: Entity): number {
  return entity % INDEX_CAPACITY;
}

/** Extract the generation counter from an entity handle. */
export function entityGeneration(entity: Entity): number {
  return Math.floor(entity / INDEX_CAPACITY);
}

/** Narrow unknown values to {@link Entity}. */
export function isEntity(value: unknown): value is Entity {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    entityIndex(value) < INDEX_CAPACITY &&
    entityGeneration(value) < GENERATION_CAPACITY
  );
}

/** Debug-friendly representation, e.g. `E(42:g3)`. */
export function formatEntity(entity: Entity): string {
  return `E(${entityIndex(entity)}:g${entityGeneration(entity)})`;
}
