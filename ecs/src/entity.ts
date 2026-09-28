export type Entity = number;

export const INDEX_BITS = 20;

export const INDEX_CAPACITY = 1 << INDEX_BITS;

export const GENERATION_BITS = 12;

export const GENERATION_CAPACITY = 1 << GENERATION_BITS;

export function makeEntity(index: number, generation: number): Entity {
  return generation * INDEX_CAPACITY + index;
}

export function entityIndex(entity: Entity): number {
  return entity % INDEX_CAPACITY;
}

export function entityGeneration(entity: Entity): number {
  return Math.floor(entity / INDEX_CAPACITY);
}

export function isEntity(value: unknown): value is Entity {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    entityIndex(value) < INDEX_CAPACITY &&
    entityGeneration(value) < GENERATION_CAPACITY
  );
}

export function formatEntity(entity: Entity): string {
  return `E(${entityIndex(entity)}:g${entityGeneration(entity)})`;
}
