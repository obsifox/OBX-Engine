import { ascii, decodeText, viewOf } from "../importers/paths.js";
import { ImportError, type AssetImporter } from "../importers/types.js";

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

