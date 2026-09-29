import type { AssetGUID } from "./guid.js";

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

export function extensionOf(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index + 1).toLowerCase();
}

function decodeText(source: Uint8Array): string {
  return new TextDecoder().decode(source);
}

function viewOf(source: Uint8Array): DataView {
  return new DataView(source.buffer, source.byteOffset, source.byteLength);
}

function ascii(source: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length && offset + index < source.length; index += 1) {
    out += String.fromCharCode(source[offset + index]!);
  }
  return out;
}

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

export const pngImporter: AssetImporter = {
  name: "png",
  extensions: ["png"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 26 || ascii(source, 1, 3) !== "PNG") throw new ImportError("not a png file", context.path);
    const view = viewOf(source);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return {
      type: "image",
      data: { format: "png", width, height, bitDepth: source[24], colorType: source[25] },
      dependencies: [],
      metadata: { width, height, format: "png" },
    };
  },
};

export const bmpImporter: AssetImporter = {
  name: "bmp",
  extensions: ["bmp"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 26 || ascii(source, 0, 2) !== "BM") throw new ImportError("not a bmp file", context.path);
    const view = viewOf(source);
    const width = view.getInt32(18, true);
    const height = Math.abs(view.getInt32(22, true));
    return {
      type: "image",
      data: { format: "bmp", width, height },
      dependencies: [],
      metadata: { width, height, format: "bmp" },
    };
  },
};

export const jpgImporter: AssetImporter = {
  name: "jpg",
  extensions: ["jpg", "jpeg"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) throw new ImportError("not a jpeg file", context.path);
    let offset = 2;
    let width = 0;
    let height = 0;
    while (offset + 9 < source.length) {
      if (source[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = source[offset + 1]!;
      const length = (source[offset + 2]! << 8) | source[offset + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        height = (source[offset + 5]! << 8) | source[offset + 6]!;
        width = (source[offset + 7]! << 8) | source[offset + 8]!;
        break;
      }
      offset += 2 + length;
    }
    return {
      type: "image",
      data: { format: "jpg", width, height },
      dependencies: [],
      metadata: { width, height, format: "jpg" },
    };
  },
};

export const webpImporter: AssetImporter = {
  name: "webp",
  extensions: ["webp"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 16 || ascii(source, 0, 4) !== "RIFF" || ascii(source, 8, 4) !== "WEBP") {
      throw new ImportError("not a webp file", context.path);
    }
    const chunk = ascii(source, 12, 4);
    let width = 0;
    let height = 0;
    if (chunk === "VP8 " && source.length >= 30) {
      width = ((source[26]! << 8) | source[25]!) & 0x3fff;
      height = ((source[28]! << 8) | source[27]!) & 0x3fff;
    } else if (chunk === "VP8L" && source.length >= 25) {
      const bits = source[21]! | (source[22]! << 8) | (source[23]! << 16) | (source[24]! << 24);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (chunk === "VP8X" && source.length >= 30) {
      width = (source[24]! | (source[25]! << 8) | (source[26]! << 16)) + 1;
      height = (source[27]! | (source[28]! << 8) | (source[29]! << 16)) + 1;
    }
    return {
      type: "image",
      data: { format: "webp", width, height, chunk },
      dependencies: [],
      metadata: { width, height, format: "webp" },
    };
  },
};

export const svgImporter: AssetImporter = {
  name: "svg",
  extensions: ["svg"],
  version: 1,
  import(context) {
    const text = decodeText(context.source);
    const width = /<svg[^>]*\swidth="([\d.]+)/.exec(text);
    const height = /<svg[^>]*\sheight="([\d.]+)/.exec(text);
    const viewBox = /viewBox="([\d.\s-]+)"/.exec(text);
    return {
      type: "image",
      data: {
        format: "svg",
        width: width ? Number(width[1]) : 0,
        height: height ? Number(height[1]) : 0,
        viewBox: viewBox ? viewBox[1]!.trim() : null,
      },
      dependencies: [],
      metadata: { format: "svg", vector: true },
    };
  },
};

export const wavImporter: AssetImporter = {
  name: "wav",
  extensions: ["wav"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 44 || ascii(source, 0, 4) !== "RIFF" || ascii(source, 8, 4) !== "WAVE") {
      throw new ImportError("not a wav file", context.path);
    }
    const view = viewOf(source);
    let offset = 12;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    while (offset + 8 <= source.length) {
      const id = ascii(source, offset, 4);
      const size = view.getUint32(offset + 4, true);
      if (id === "fmt ") {
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);
      }
      offset += 8 + size + (size % 2);
    }
    return {
      type: "audio",
      data: { format: "wav", channels, sampleRate, bitsPerSample },
      dependencies: [],
      metadata: { format: "wav", channels, sampleRate },
    };
  },
};

export const oggImporter: AssetImporter = {
  name: "ogg",
  extensions: ["ogg"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 36 || ascii(source, 0, 4) !== "OggS") throw new ImportError("not an ogg file", context.path);
    const view = viewOf(source);
    return {
      type: "audio",
      data: { format: "ogg", channels: source[39] ?? 0, sampleRate: view.getUint32(40, true) },
      dependencies: [],
      metadata: { format: "ogg" },
    };
  },
};

export const mp3Importer: AssetImporter = {
  name: "mp3",
  extensions: ["mp3"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 4) throw new ImportError("not an mp3 file", context.path);
    const hasId3 = ascii(source, 0, 3) === "ID3";
    const hasFrame = source[0] === 0xff && (source[1]! & 0xe0) === 0xe0;
    if (!hasId3 && !hasFrame) throw new ImportError("not an mp3 file", context.path);
    return {
      type: "audio",
      data: { format: "mp3", id3: hasId3 },
      dependencies: [],
      metadata: { format: "mp3" },
    };
  },
};

export const gltfImporter: AssetImporter = {
  name: "gltf",
  extensions: ["gltf"],
  version: 1,
  import(context) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(decodeText(context.source)) as Record<string, unknown>;
    } catch (error) {
      throw new ImportError(`invalid gltf: ${(error as Error).message}`, context.path);
    }
    const dependencies: string[] = [];
    const uris: unknown[] = [];
    for (const key of ["buffers", "images"]) {
      const list = parsed[key];
      if (Array.isArray(list)) {
        for (const entry of list) {
          const uri = (entry as { uri?: unknown }).uri;
          if (typeof uri === "string" && !uri.startsWith("data:")) uris.push(uri);
        }
      }
    }
    dependencies.push(...uris.map((uri) => String(uri)));
    const count = (key: string): number => (Array.isArray(parsed[key]) ? (parsed[key] as unknown[]).length : 0);
    return {
      type: "model",
      data: {
        format: "gltf",
        meshes: count("meshes"),
        materials: count("materials"),
        textures: count("textures"),
        animations: count("animations"),
        scenes: count("scenes"),
      },
      dependencies,
      metadata: { format: "gltf", externalDependencies: dependencies.length },
    };
  },
};

export const glbImporter: AssetImporter = {
  name: "glb",
  extensions: ["glb"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 20 || ascii(source, 0, 4) !== "glTF") throw new ImportError("not a glb file", context.path);
    const view = viewOf(source);
    const version = view.getUint32(4, true);
    const chunkLength = view.getUint32(12, true);
    const chunkType = ascii(source, 16, 4);
    if (chunkType !== "JSON") throw new ImportError("glb missing json chunk", context.path);
    const json = JSON.parse(decodeText(source.subarray(20, 20 + chunkLength))) as Record<string, unknown>;
    const count = (key: string): number => (Array.isArray(json[key]) ? (json[key] as unknown[]).length : 0);
    return {
      type: "model",
      data: { format: "glb", version, meshes: count("meshes"), materials: count("materials"), textures: count("textures") },
      dependencies: [],
      metadata: { format: "glb", containerVersion: version },
    };
  },
};

export const objImporter: AssetImporter = {
  name: "obj",
  extensions: ["obj"],
  version: 1,
  import(context) {
    const text = decodeText(context.source);
    let vertices = 0;
    let normals = 0;
    let uvs = 0;
    let faces = 0;
    const libraries: string[] = [];
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (line.startsWith("v ")) vertices += 1;
      else if (line.startsWith("vn ")) normals += 1;
      else if (line.startsWith("vt ")) uvs += 1;
      else if (line.startsWith("f ")) faces += 1;
      else if (line.startsWith("mtllib ")) libraries.push(line.slice(7).trim());
    }
    return {
      type: "model",
      data: { format: "obj", vertices, normals, uvs, faces },
      dependencies: libraries,
      metadata: { format: "obj", materialLibraries: libraries.length },
    };
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

export const fbxImporter: AssetImporter = {
  name: "fbx",
  extensions: ["fbx"],
  version: 1,
  import(context) {
    const { source } = context;
    const binary = ascii(source, 0, 20).startsWith("Kaydara FBX Binary");
    const version = binary && source.length >= 27 ? viewOf(source).getUint32(23, true) : 0;
    return {
      type: "model",
      data: { format: "fbx", binary, version },
      dependencies: [],
      metadata: { format: "fbx", support: "header-only" },
    };
  },
};

export class ImporterRegistry {
  readonly #importers = new Map<string, AssetImporter>();
  readonly #byExtension = new Map<string, AssetImporter>();

  register(importer: AssetImporter): void {
    if (this.#importers.has(importer.name)) throw new ImportError(`importer already registered: ${importer.name}`, importer.name);
    this.#importers.set(importer.name, importer);
    for (const extension of importer.extensions) {
      this.#byExtension.set(extension.toLowerCase(), importer);
    }
  }

  unregister(name: string): boolean {
    const importer = this.#importers.get(name);
    if (!importer) return false;
    this.#importers.delete(name);
    for (const extension of importer.extensions) {
      if (this.#byExtension.get(extension.toLowerCase()) === importer) this.#byExtension.delete(extension.toLowerCase());
    }
    return true;
  }

  get(name: string): AssetImporter | null {
    return this.#importers.get(name) ?? null;
  }

  forPath(path: string): AssetImporter | null {
    return this.#byExtension.get(extensionOf(path)) ?? null;
  }

  names(): string[] {
    return [...this.#importers.keys()];
  }
}

export function createDefaultRegistry(): ImporterRegistry {
  const registry = new ImporterRegistry();
  for (const importer of [
    jsonImporter,
    textImporter,
    pngImporter,
    bmpImporter,
    jpgImporter,
    webpImporter,
    svgImporter,
    wavImporter,
    oggImporter,
    mp3Importer,
    gltfImporter,
    glbImporter,
    objImporter,
    ttfImporter,
    fbxImporter,
  ]) {
    registry.register(importer);
  }
  return registry;
}
