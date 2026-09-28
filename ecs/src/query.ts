import { Archetype } from "./archetype.js";
import type { AnyComponentDefinition, ComponentDataOf } from "./component.js";
import type { Entity } from "./entity.js";

export interface QueryHost {
  readonly archetypes: readonly Archetype[];

  readonly archetypesVersion: number;
}

export interface QuerySpec {
  all: readonly AnyComponentDefinition[];
  any: readonly AnyComponentDefinition[];
  none: readonly AnyComponentDefinition[];
}

export function queryKey(spec: QuerySpec): string {
  const ids = (list: readonly AnyComponentDefinition[]): string => list.map((d) => d.id).join("+");
  return `A:${ids(spec.all)}|Y:${ids(spec.any)}|N:${ids(spec.none)}`;
}

export class Query<T extends readonly AnyComponentDefinition[] = AnyComponentDefinition[]> {
  readonly spec: QuerySpec;
  readonly key: string;

  #host: QueryHost;
  #cachedArchetypes: Archetype[] | null = null;
  #cachedVersion = -1;

  constructor(host: QueryHost, spec: QuerySpec) {
    this.#host = host;
    this.spec = spec;
    this.key = queryKey(spec);
  }

  matchedArchetypes(): readonly Archetype[] {
    if (this.#cachedArchetypes === null || this.#cachedVersion !== this.#host.archetypesVersion) {
      this.#cachedArchetypes = this.#host.archetypes.filter((archetype) => this.matches(archetype));
      this.#cachedVersion = this.#host.archetypesVersion;
    }
    return this.#cachedArchetypes;
  }

  matches(archetype: Archetype): boolean {
    for (const type of this.spec.all) {
      if (!archetype.has(type.id)) return false;
    }
    for (const type of this.spec.none) {
      if (archetype.has(type.id)) return false;
    }
    if (this.spec.any.length > 0) {
      const anyMatch = this.spec.any.some((type) => archetype.has(type.id));
      if (!anyMatch) return false;
    }
    return true;
  }

  entities(): Entity[] {
    const result: Entity[] = [];
    for (const archetype of this.matchedArchetypes()) {
      for (const entity of archetype.entities) {
        result.push(entity);
      }
    }
    return result;
  }

  count(): number {
    let total = 0;
    for (const archetype of this.matchedArchetypes()) {
      total += archetype.size;
    }
    return total;
  }

  *tuples(): IterableIterator<[Entity, ...ComponentDataOf<T>]> {
    const all = this.spec.all;
    for (const archetype of this.matchedArchetypes()) {
      for (let row = 0; row < archetype.size; row += 1) {
        const entity = archetype.entities[row] as Entity;
        const components = all.map((type) => archetype.get(row, type.id)) as ComponentDataOf<T>;
        yield [entity, ...components] as [Entity, ...ComponentDataOf<T>];
      }
    }
  }

  [Symbol.iterator](): IterableIterator<[Entity, ...ComponentDataOf<T>]> {
    return this.tuples();
  }

  forEach(fn: (entity: Entity, ...components: ComponentDataOf<T>) => void): void {
    for (const tuple of this.tuples()) {
      fn(...(tuple as [Entity, ...ComponentDataOf<T>]));
    }
  }

  first(): [Entity, ...ComponentDataOf<T>] | undefined {
    for (const tuple of this.tuples()) {
      return tuple;
    }
    return undefined;
  }

  isEmpty(): boolean {
    return this.count() === 0;
  }
}
