import { ascii, decodeText, viewOf } from "../importers/paths.js";
import { ImportError, type AssetImporter } from "../importers/types.js";

export const jsonImporter: AssetImporter = {
  name: "json",
  extensions: ["json"],
  version: 1,
  import(context) {
    try {
      return { type: "json", data: JSON.parse(decodeText(context.source)), dependencies: [], metadata: {} };
    } catch (error) {
      throw new ImportError(`invalid json: ${(error as Error).message}`, context.path);
    }
  },
};

export const textImporter: AssetImporter = {
  name: "text",
  extensions: ["txt", "md", "csv"],
  version: 1,
  import(context) {
    const text = decodeText(context.source);
    return { type: "text", data: text, dependencies: [], metadata: { characters: text.length, lines: text.split("\n").length } };
  },
};

export const ttfImporter: AssetImporter = {
  name: "ttf",
  extensions: ["ttf", "otf"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 12) throw new ImportError("not a font file", context.path);
    const view = viewOf(source);
    const version = view.getUint32(0);
    const valid = version === 0x00010000 || ascii(source, 0, 4) === "OTTO" || ascii(source, 0, 4) === "true";
    if (!valid) throw new ImportError("not a font file", context.path);
    const numTables = view.getUint16(4);
    return {
      type: "font",
      data: { format: ascii(source, 0, 4) === "OTTO" ? "otf" : "ttf", tables: numTables },
      dependencies: [],
      metadata: { format: "font", tables: numTables },
    };
  },
};

