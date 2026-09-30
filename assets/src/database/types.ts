import { type AssetGUID } from "../guid.js";
import { type ImportedAsset } from "../importers/types.js";

export interface AssetMetadata {
  importer: string;
  importerVersion: number;
  sourceHash: string;
  importedAt: number;
  custom: Record<string, unknown>;
}

export interface DatabaseAsset {
  guid: AssetGUID;
  path: string;
  type: string;
  sourceHash: string;
  metadata: AssetMetadata;
  dependencies: AssetGUID[];
  data: unknown;
  version: number;
}

export interface RegisterOptions {
  type?: string;
  importer?: string;
  guid?: AssetGUID;
}

export interface ImportResult {
  asset: DatabaseAsset;
  cached: boolean;
  changed: boolean;
  dependentsInvalidated: AssetGUID[];
}

export interface AssetCacheStats {
  hits: number;
  misses: number;
  size: number;
  invalidations: number;
}

export interface AssetWatcherEvent {
  path: string;
  guid: AssetGUID | null;
  sourceHash: string;
}

export class AssetDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetDatabaseError";
  }
}

export interface CacheEntry {
  sourceHash: string;
  version: number;
  result: ImportedAsset;
}

