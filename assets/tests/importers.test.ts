import { describe, expect, it } from "vitest";
import {
  ImportError,
  ImporterRegistry,
  bmpImporter,
  createDefaultRegistry,
  fbxImporter,
  glbImporter,
  gltfImporter,
  jpgImporter,
  jsonImporter,
  mp3Importer,
  objImporter,
  oggImporter,
  pngImporter,
  svgImporter,
  textImporter,
  ttfImporter,
  wavImporter,
  webpImporter,
  type ImportContext,
} from "../src/index.js";

function context(path: string, source: Uint8Array): ImportContext {
  return { path, guid: "g", source, sourceHash: "h" };
}

function bytes(...values: (number | string)[]): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "string") {
      for (let index = 0; index < value.length; index += 1) out.push(value.charCodeAt(index));
    } else {
      out.push(value);
    }
  }
  return new Uint8Array(out);
}

function u32be(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function u32le(value: number): number[] {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

function u16le(value: number): number[] {
  return [value & 255, (value >>> 8) & 255];
}

const pngFixture = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ...u32be(13), ...bytes("IHDR"), ...u32be(128), ...u32be(64), 8, 6, 0, 0, 0,
  ...u32be(0), ...bytes("IEND"),
]);

const wavFixture = new Uint8Array([
  ...bytes("RIFF"), ...u32le(36), ...bytes("WAVE"),
  ...bytes("fmt "), ...u32le(16), ...u16le(1), ...u16le(2), ...u32le(44100), ...u32le(176400), ...u16le(4), ...u16le(16),
  ...bytes("data"), ...u32le(0),
]);

const jpgFixture = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x40, 0x00, 0x60,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]);

const webpFixture = new Uint8Array([
  ...bytes("RIFF"), ...u32le(20), ...bytes("WEBP"), ...bytes("VP8L"), ...u32le(5),
  0x2f, 0x10, 0x00, 0x02, 0x00, 0x00,
]);

const bmpFixture = new Uint8Array([
  ...bytes("BM"), ...u32le(100), 0, 0, 0, 0, ...u32le(54),
  ...u32le(40), ...u32le(80), ...u32le(-25 & 0xffffffff), ...u16le(1), ...u16le(24),
  ...new Array<number>(22).fill(0),
]);

describe("built-in importers", () => {
  it("imports json and text", () => {
    const json = jsonImporter.import(context("a.json", new TextEncoder().encode('{"x": 1}')));
    expect(json.data).toEqual({ x: 1 });
    expect(json.dependencies).toEqual([]);
    expect(() => jsonImporter.import(context("bad.json", new TextEncoder().encode("{")))).toThrow(ImportError);
    const text = textImporter.import(context("a.txt", new TextEncoder().encode("line1\nline2")));
    expect(text.type).toBe("text");
    expect(text.metadata).toMatchObject({ characters: 11, lines: 2 });
  });

  it("imports png headers", () => {
    const result = pngImporter.import(context("a.png", pngFixture));
    expect(result.type).toBe("image");
    expect(result.metadata).toMatchObject({ width: 128, height: 64, format: "png" });
    expect(() => pngImporter.import(context("bad.png", new Uint8Array(40)))).toThrow(ImportError);
  });

  it("imports bmp, jpg and webp dimensions", () => {
    const bmp = bmpImporter.import(context("a.bmp", bmpFixture));
    expect(bmp.metadata).toMatchObject({ width: 80, height: 25, format: "bmp" });
    const jpg = jpgImporter.import(context("a.jpg", jpgFixture));
    expect(jpg.metadata).toMatchObject({ width: 96, height: 64, format: "jpg" });
    const webp = webpImporter.import(context("a.webp", webpFixture));
    expect(webp.metadata).toMatchObject({ width: 17, height: 9, format: "webp" });
  });

  it("imports svg geometry", () => {
    const svg = new TextEncoder().encode('<svg width="120" height="60" viewBox="0 0 120 60"></svg>');
    const result = svgImporter.import(context("a.svg", svg));
    expect(result.data).toMatchObject({ format: "svg", width: 120, height: 60, viewBox: "0 0 120 60" });
  });

  it("imports wav and ogg audio metadata", () => {
    const wav = wavImporter.import(context("a.wav", wavFixture));
    expect(wav.data).toMatchObject({ format: "wav", channels: 2, sampleRate: 44100, bitsPerSample: 16 });
    expect(() => wavImporter.import(context("bad.wav", new Uint8Array(8)))).toThrow(ImportError);
    const oggFixture = new Uint8Array(48);
    oggFixture.set(bytes("OggS"), 0);
    oggFixture[39] = 1;
    const view = new DataView(oggFixture.buffer);
    view.setUint32(40, 22050, true);
    const ogg = oggImporter.import(context("a.ogg", oggFixture));
    expect(ogg.data).toMatchObject({ format: "ogg", channels: 1, sampleRate: 22050 });
  });

  it("imports mp3 with and without id3", () => {
    const id3 = mp3Importer.import(context("a.mp3", bytes("ID3", 4, 0, 0, 0, 0, 0)));
    expect(id3.data).toMatchObject({ format: "mp3", id3: true });
    const frame = mp3Importer.import(context("b.mp3", bytes(0xff, 0xfb, 0x90, 0x00)));
    expect(frame.data).toMatchObject({ format: "mp3", id3: false });
    expect(() => mp3Importer.import(context("bad.mp3", bytes("nope")))).toThrow(ImportError);
  });

  it("imports gltf with external dependencies and glb containers", () => {
    const gltfSource = JSON.stringify({
      meshes: [{ name: "m" }],
      materials: [{}],
      textures: [{}, {}],
      buffers: [{ uri: "scene.bin" }],
      images: [{ uri: "albedo.png" }, { uri: "data:image/png;base64,xx" }],
    });
    const gltf = gltfImporter.import(context("a.gltf", new TextEncoder().encode(gltfSource)));
    expect(gltf.data).toMatchObject({ format: "gltf", meshes: 1, materials: 1, textures: 2 });
    expect(gltf.dependencies).toEqual(["scene.bin", "albedo.png"]);
    const json = '{"meshes":[{}],"materials":[{}]}';
    const glb = new Uint8Array([
      ...bytes("glTF"), ...u32le(2), ...u32le(20 + json.length),
      ...u32le(json.length), ...bytes("JSON"), ...bytes(json),
    ]);
    const glbResult = glbImporter.import(context("a.glb", glb));
    expect(glbResult.data).toMatchObject({ format: "glb", version: 2, meshes: 1, materials: 1 });
    expect(() => glbImporter.import(context("bad.glb", bytes("nope")))).toThrow(ImportError);
  });

  it("imports obj geometry and material libraries", () => {
    const obj = [
      "mtllib scene.mtl",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "vt 0 0",
      "vn 0 0 1",
      "f 1/1/1 2/1/1 3/1/1",
    ].join("\n");
    const result = objImporter.import(context("a.obj", new TextEncoder().encode(obj)));
    expect(result.data).toMatchObject({ format: "obj", vertices: 3, faces: 1, uvs: 1, normals: 1 });
    expect(result.dependencies).toEqual(["scene.mtl"]);
  });

  it("imports font headers", () => {
    const ttf = new Uint8Array([...u32be(0x00010000), 0, 3, 0, 12, ...new Array<number>(20).fill(0)]);
    const result = ttfImporter.import(context("a.ttf", ttf));
    expect(result.data).toMatchObject({ format: "ttf", tables: 3 });
    const otf = new Uint8Array([...bytes("OTTO"), 0, 5, 0, 12, ...new Array<number>(20).fill(0)]);
    expect(ttfImporter.import(context("a.otf", otf)).data).toMatchObject({ format: "otf", tables: 5 });
    expect(() => ttfImporter.import(context("bad.ttf", new Uint8Array(20)))).toThrow(ImportError);
  });

  it("sniffs fbx headers only", () => {
    const fbx = new Uint8Array([...bytes("Kaydara FBX Binary  "), 0, 0, 0, ...u32le(7400), 0, 0]);
    const result = fbxImporter.import(context("a.fbx", fbx));
    expect(result.data).toMatchObject({ format: "fbx", binary: true, version: 7400 });
    expect(result.metadata).toMatchObject({ support: "header-only" });
  });
});

describe("importer registry", () => {
  it("resolves importers by extension and supports overrides", () => {
    const registry = createDefaultRegistry();
    expect(registry.forPath("a/b/c.PNG")!.name).toBe("png");
    expect(registry.forPath("model.glb")!.name).toBe("glb");
    expect(registry.forPath("x.unknown")).toBeNull();
    expect(registry.names()).toContain("json");
    registry.register({
      name: "custom",
      extensions: ["bin"],
      version: 2,
      import: (ctx) => ({ type: "binary", data: ctx.source.length, dependencies: [], metadata: {} }),
    });
    expect(registry.forPath("data.bin")!.name).toBe("custom");
    expect(registry.unregister("custom")).toBe(true);
    expect(registry.forPath("data.bin")).toBeNull();
    expect(() => registry.register(jsonImporter)).toThrow(ImportError);
  });

  it("supports standalone registries", () => {
    const registry = new ImporterRegistry();
    expect(registry.get("json")).toBeNull();
    registry.register(jsonImporter);
    expect(registry.get("json")).toBe(jsonImporter);
  });
});
