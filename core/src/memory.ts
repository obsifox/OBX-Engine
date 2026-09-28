/**
 * ObsiFox Memory — §2 Core / Memory + §63 Memory Architecture (foundation).
 *
 * Lightweight allocation tracking by tag. Later phases (asset cache, pools,
 * streaming) build on top of this. Full GC introspection is out of scope here.
 */

export interface MemorySnapshot {
  /** Total tracked bytes. */
  totalBytes: number;
  /** Bytes per tag. */
  byTag: Record<string, number>;
  /** Number of tracked allocations. */
  entries: number;
  /** Optional budget in bytes (null when unset). */
  budgetBytes: number | null;
  /** True when a budget is set and exceeded. */
  overBudget: boolean;
}

interface MemoryEntry {
  tag: string;
  bytes: number;
}

/**
 * Tag-based memory usage tracker.
 *
 * ```ts
 * const mem = new MemoryTracker({ budgetBytes: 64 * 1024 * 1024 });
 * const handle = mem.track("textures", 2_000_000);
 * mem.untrack(handle);
 * ```
 */
export class MemoryTracker {
  #entries = new Map<number, MemoryEntry>();
  #nextId = 1;
  #budgetBytes: number | null;

  constructor(options: { budgetBytes?: number | null } = {}) {
    this.#budgetBytes = options.budgetBytes ?? null;
  }

  get budgetBytes(): number | null {
    return this.#budgetBytes;
  }

  set budgetBytes(value: number | null) {
    this.#budgetBytes = value;
  }

  /** Total tracked bytes. */
  get totalBytes(): number {
    let total = 0;
    for (const entry of this.#entries.values()) total += entry.bytes;
    return total;
  }

  /**
   * Track an allocation. Returns a handle usable with {@link untrack}
   * or {@link update}.
   */
  track(tag: string, bytes: number): number {
    if (bytes < 0) {
      throw new RangeError("bytes must be >= 0");
    }
    const id = this.#nextId++;
    this.#entries.set(id, { tag, bytes });
    return id;
  }

  /** Change the size of a tracked allocation. */
  update(handle: number, bytes: number): void {
    const entry = this.#entries.get(handle);
    if (!entry) {
      throw new Error(`Unknown memory handle: ${handle}`);
    }
    if (bytes < 0) {
      throw new RangeError("bytes must be >= 0");
    }
    entry.bytes = bytes;
  }

  /** Stop tracking an allocation. */
  untrack(handle: number): void {
    this.#entries.delete(handle);
  }

  /** Drop everything (e.g. on level unload). */
  clear(): void {
    this.#entries.clear();
  }

  /** Aggregate snapshot by tag. */
  snapshot(): MemorySnapshot {
    const byTag: Record<string, number> = {};
    let totalBytes = 0;
    for (const entry of this.#entries.values()) {
      byTag[entry.tag] = (byTag[entry.tag] ?? 0) + entry.bytes;
      totalBytes += entry.bytes;
    }
    return {
      totalBytes,
      byTag,
      entries: this.#entries.size,
      budgetBytes: this.#budgetBytes,
      overBudget: this.#budgetBytes !== null && totalBytes > this.#budgetBytes,
    };
  }
}
