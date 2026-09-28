export interface MemorySnapshot {

  totalBytes: number;

  byTag: Record<string, number>;

  entries: number;

  budgetBytes: number | null;

  overBudget: boolean;
}

interface MemoryEntry {
  tag: string;
  bytes: number;
}

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

  get totalBytes(): number {
    let total = 0;
    for (const entry of this.#entries.values()) total += entry.bytes;
    return total;
  }

  track(tag: string, bytes: number): number {
    if (bytes < 0) {
      throw new RangeError("bytes must be >= 0");
    }
    const id = this.#nextId++;
    this.#entries.set(id, { tag, bytes });
    return id;
  }

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

  untrack(handle: number): void {
    this.#entries.delete(handle);
  }

  clear(): void {
    this.#entries.clear();
  }

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
