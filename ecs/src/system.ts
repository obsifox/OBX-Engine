/**
 * Systems — §4 ECS / Systems, System scheduling.
 *
 * Systems are ordered per phase by `order` (ascending) with `before`/`after`
 * name constraints resolved via topological sort. Unknown constraint names
 * are ignored so optional plugins can defer registration.
 */

import { InvalidArgumentError, ensure } from "@obsifox/core";
import type { World } from "./world.js";

/** The default system phase run by {@link World.update}. */
export const DEFAULT_PHASE = "update";

export interface SystemContext {
  world: World;
  /** Frame delta in seconds (fixed delta during fixed phases). */
  delta: number;
  /** Accumulated world time in seconds. */
  time: number;
}

export interface SystemDefinition {
  readonly name: string;
  /** Execution phase/group (default `"update"`). */
  readonly phase: string;
  /** Lower runs earlier within the phase (default 0). */
  readonly order: number;
  /** Run before these system names. */
  readonly before: readonly string[];
  /** Run after these system names. */
  readonly after: readonly string[];
  execute(ctx: SystemContext): void;
}

export interface SystemOptions {
  name: string;
  execute: (ctx: SystemContext) => void;
  phase?: string;
  order?: number;
  before?: readonly string[];
  after?: readonly string[];
}

/** Create a system definition with defaults applied. */
export function defineSystem(options: SystemOptions): SystemDefinition {
  ensure(options.name.length > 0, "System name must be a non-empty string");
  ensure(typeof options.execute === "function", "System requires an execute() function");
  return Object.freeze({
    name: options.name,
    phase: options.phase ?? DEFAULT_PHASE,
    order: options.order ?? 0,
    before: Object.freeze([...(options.before ?? [])]),
    after: Object.freeze([...(options.after ?? [])]),
    execute: options.execute,
  });
}

/**
 * Ordered system registry. Rebuilds execution order lazily whenever the set
 * of systems changes.
 */
export class SystemScheduler {
  #systems = new Map<string, SystemDefinition>();
  #orderCache = new Map<string, SystemDefinition[]>();

  get count(): number {
    return this.#systems.size;
  }

  add(system: SystemDefinition): void {
    if (this.#systems.has(system.name)) {
      throw new InvalidArgumentError(`System "${system.name}" is already registered`, {
        context: { name: system.name },
      });
    }
    this.#systems.set(system.name, system);
    this.#orderCache.clear();
  }

  remove(name: string): boolean {
    const removed = this.#systems.delete(name);
    if (removed) this.#orderCache.clear();
    return removed;
  }

  has(name: string): boolean {
    return this.#systems.has(name);
  }

  get(name: string): SystemDefinition | undefined {
    return this.#systems.get(name);
  }

  /** Registered system names (registration order). */
  names(): string[] {
    return [...this.#systems.keys()];
  }

  /** Systems in execution order for a phase. */
  ordered(phase: string = DEFAULT_PHASE): readonly SystemDefinition[] {
    const cached = this.#orderCache.get(phase);
    if (cached) return cached;

    const phaseSystems = [...this.#systems.values()].filter((system) => system.phase === phase);
    const sorted = topologicalSort(phaseSystems);
    this.#orderCache.set(phase, sorted);
    return sorted;
  }

  /** Execute every system in a phase in order. */
  run(world: World, delta: number, time: number, phase: string = DEFAULT_PHASE): void {
    const ctx: SystemContext = { world, delta, time };
    for (const system of this.ordered(phase)) {
      system.execute(ctx);
    }
  }

  clear(): void {
    this.#systems.clear();
    this.#orderCache.clear();
  }
}

function topologicalSort(systems: SystemDefinition[]): SystemDefinition[] {
  // Stable base order: ascending `order`, then registration order.
  const baseOrder = [...systems].sort((a, b) => a.order - b.order);
  const baseIndex = new Map(baseOrder.map((system, index) => [system.name, index]));
  return kahnSort(systems, baseIndex);
}

function kahnSort(systems: SystemDefinition[], baseIndex: Map<string, number>): SystemDefinition[] {
  const byName = new Map(systems.map((system) => [system.name, system]));

  // Edge meaning: dependency -> dependent (dependency runs first).
  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const system of systems) {
    outgoing.set(system.name, new Set());
    indegree.set(system.name, 0);
  }

  const addEdge = (from: string, to: string): void => {
    if (!byName.has(from) || !byName.has(to) || from === to) return;
    const set = outgoing.get(from) as Set<string>;
    if (!set.has(to)) {
      set.add(to);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  };

  for (const system of systems) {
    for (const dep of system.after) addEdge(dep, system.name);
    for (const succ of system.before) addEdge(system.name, succ);
  }

  const ready = systems
    .filter((system) => (indegree.get(system.name) ?? 0) === 0)
    .sort((a, b) => (baseIndex.get(a.name) ?? 0) - (baseIndex.get(b.name) ?? 0));

  const sorted: SystemDefinition[] = [];
  while (ready.length > 0) {
    const system = ready.shift() as SystemDefinition;
    sorted.push(system);
    for (const next of outgoing.get(system.name) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        const nextSystem = byName.get(next) as SystemDefinition;
        // Insert keeping base order.
        const insertAt = ready.findIndex((s) => (baseIndex.get(s.name) ?? 0) > (baseIndex.get(next) ?? 0));
        if (insertAt === -1) ready.push(nextSystem);
        else ready.splice(insertAt, 0, nextSystem);
      }
    }
  }

  if (sorted.length !== systems.length) {
    const remaining = systems.filter((s) => !sorted.includes(s)).map((s) => s.name);
    throw new InvalidArgumentError(`Cycle detected in system ordering: ${remaining.join(", ")}`, {
      context: { remaining },
    });
  }
  return sorted;
}
