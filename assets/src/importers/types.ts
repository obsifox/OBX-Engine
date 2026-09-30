import { type AssetGUID } from "../guid.js";

export interface ImportContext {
  path: string;
  guid: AssetGUID;
  source: Uint8Array;
  sourceHash: string;
}

export interface ImportedAsset {
  type: string;
  data: unknown;
  dependencies: string[];
  metadata: Record<string, unknown>;
}

export interface AssetImporter {
  readonly name: string;
  readonly extensions: string[];
  readonly version: number;
  import(context: ImportContext): ImportedAsset;
}

export class ImportError extends Error {
  constructor(message: string, readonly path: string) {
    super(message);
    this.name = "ImportError";
  }
}

