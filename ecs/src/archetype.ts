/**
 * Archetype storage — §4 ECS / Archetype, Component storage.
 *
 * Entities sharing an exact component set live together in one archetype,
 * with one column (dense array) per component type. Adding/removing a
 * component migrates the entity to another archetype (classic ECS move).
 */

import type { AnyComponentDefinition } from "./component.js";
import type { Entity } from "./entity.js";

/** Stable key for a component set (sorted type ids). */
export function archetypeKey(typeIds: readonly number[]): string {
  return [...typeIds].sort((a, b) => a - b).join(",");
}

export class Archetype {
  readonly key: string;
  /** Component types in this archetype, sorted by id. */
  readonly types: readonly AnyComponentDefinition[];
  /** Entities packed densely, indexed by row. */
  readonly entities: Entity[] = [];

  #columns: Map<number, unknown[]>;

  constructor(types: readonly AnyComponentDefinition[]) {
    this.types = [...types].sort((a, b) => a.id - b.id);
    this.key = archetypeKey(this.types.map((type) => type.id));
    this.#columns = new Map();
    for (const type of this.types) {
      this.#columns.set(type.id, []);
    }
  }

  get size(): number {
    return this.entities.length;
  }

  /** Whether this archetype contains the given component type. */
  has(typeId: number): boolean {
    return this.#columns.has(typeId);
  }

  get(row: number, typeId: number): unknown {
    return this.#columns.get(typeId)?.[row];
  }

  set(row: number, typeId: number, value: unknown): void {
    const column = this.#columns.get(typeId);
    if (!column) {
      throw new Error(`Archetype ${this.key} has no component type ${typeId}`);
    }
    column[row] = value;
  }

  /**
   * Append an entity with pre-built component values keyed by type id.
   * Returns the row assigned.
   */
  add(entity: Entity, values: ReadonlyMap<number, unknown>): number {
    const row = this.entities.length;
    this.entities.push(entity);
    for (const type of this.types) {
      const column = this.#columns.get(type.id) as unknown[];
      column[row] = values.get(type.id);
    }
    return row;
  }

  /**
   * Swap-remove the entity at `row`.
   * Returns the entity that was moved into `row` (so the caller can fix its
   * location), or undefined when the removed row was the last one.
   */
  removeAt(row: number): Entity | undefined {
    const lastRow = this.entities.length - 1;
    if (row < 0 || row > lastRow) {
      throw new Error(`Archetype ${this.key}: row ${row} out of range`);
    }

    if (row === lastRow) {
      this.entities.pop();
      for (const column of this.#columns.values()) {
        column.pop();
      }
      return undefined;
    }

    const movedEntity = this.entities[lastRow] as Entity;
    this.entities[row] = movedEntity;
    this.entities.pop();
    for (const column of this.#columns.values()) {
      column[row] = column[lastRow];
      column.pop();
    }
    return movedEntity;
  }

  /** Collect all component values of a row keyed by type id. */
  collectValues(row: number): Map<number, unknown> {
    const values = new Map<number, unknown>();
    for (const type of this.types) {
      values.set(type.id, this.get(row, type.id));
    }
    return values;
  }
}
