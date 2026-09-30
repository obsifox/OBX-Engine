import { type AssetCacheStats, type CacheEntry } from "../database/types.js";
import { type AssetGUID } from "../guid.js";
import { type ImportedAsset } from "../importers/types.js";

export class AssetCache {
  readonly #entries = new Map<AssetGUID, CacheEntry>();
  #hits = 0;
  #misses = 0;
  #invalidations = 0;

  get(guid: AssetGUID, sourceHash: string): ImportedAsset | null {
    const entry = this.#entries.get(guid);
    if (!entry || entry.sourceHash !== sourceHash) {
      this.#misses += 1;
      return null;
    }
    this.#hits += 1;
    return entry.result;
  }

  put(guid: AssetGUID, sourceHash: string, version: number, result: ImportedAsset): void {
    this.#entries.set(guid, { sourceHash, version, result });
  }

  invalidate(guid: AssetGUID): boolean {
    const removed = this.#entries.delete(guid);
    if (removed) this.#invalidations += 1;
    return removed;
  }

  clear(): void {
    this.#entries.clear();
  }

  size(): number {
    return this.#entries.size;
  }

  stats(): AssetCacheStats {
    return { hits: this.#hits, misses: this.#misses, size: this.#entries.size, invalidations: this.#invalidations };
  }
}

