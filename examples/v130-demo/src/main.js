import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssetDatabase,
  HotReloadHub,
  createPrefab,
  instantiatePrefab,
  kindForExtension,
  loadScene,
  parseScene,
  prefabFromWorld,
  serializeScene,
  stringifyScene,
} from "@obx/assets";
import { Name, Parent, World, defineComponent } from "@obx/ecs";
import { SoftwareBackend, Renderer2D, Camera2D, encodePng, Texture } from "@obx/rendering";
import { Colors, Vec2 } from "@obx/math";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "output");
mkdirSync(outDir, { recursive: true });

const encoder = new TextEncoder();
const u32be = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const bytes = (...parts) => {
  const out = [];
  for (const part of parts) {
    if (typeof part === "string") {
      for (let index = 0; index < part.length; index += 1) out.push(part.charCodeAt(index));
    } else if (Array.isArray(part)) {
      out.push(...part);
    } else {
      out.push(part);
    }
  }
  return new Uint8Array(out);
};

const png64 = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, u32be(13), "IHDR", u32be(64), u32be(64), 8, 6, 0, 0, 0, u32be(0), "IEND");
const sources = new Map([
  ["config/game.json", encoder.encode('{"level": 3, "spawn": "gate"}')],
  ["textures/hero.png", png64],
  ["textures/tile.png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, u32be(13), "IHDR", u32be(16), u32be(16), 8, 6, 0, 0, 0, u32be(0), "IEND")],
  ["models/ship.gltf", encoder.encode(JSON.stringify({ meshes: [{}], materials: [{}], buffers: [{ uri: "models/ship.bin" }], images: [{ uri: "textures/hero.png" }] }))],
  ["models/ship.bin", new Uint8Array(64)],
  ["models/crate.obj", encoder.encode("mtllib crate.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3")],
  ["models/crate.mtl", encoder.encode("newmtl crate")],
  ["audio/jump.wav", bytes("RIFF", [36, 0, 0, 0], "WAVE", "fmt ", [16, 0, 0, 0], [1, 0], [2, 0], [0x44, 0xac, 0, 0], [0x10, 0xb1, 2, 0], [4, 0], [16, 0], "data", [0, 0, 0, 0])],
  ["ui/logo.svg", encoder.encode('<svg width="120" height="60" viewBox="0 0 120 60"></svg>')],
  ["levels/level.scene", encoder.encode("{}")],
]);

const database = new AssetDatabase({ guidSeed: "v130-demo", now: (() => { let t = 0; return () => (t += 100); })() });
const hub = new HotReloadHub();

const reloadCounts = { texture: 0, shader: 0, scene: 0, other: 0 };
hub.register("*", (event) => {
  if (event.kind in reloadCounts) reloadCounts[event.kind] += 1;
  else reloadCounts.other += 1;
});

const importers = {};
const registered = [];
for (const [path, source] of sources) {
  const asset = database.register(path);
  registered.push({ path, guid: asset.guid, importer: asset.metadata.importer || "deferred", source });
  importers[asset.metadata.importer || "deferred"] = (importers[asset.metadata.importer || "deferred"] ?? 0) + 1;
}

const firstPass = [];
for (const entry of registered) {
  if (entry.importer === "deferred") continue;
  const result = database.import(entry.path, entry.source);
  firstPass.push({ path: entry.path, cached: result.cached, changed: result.changed, type: result.asset.type, dependencies: result.asset.dependencies.length });
}

const reimport = database.import("config/game.json", sources.get("config/game.json"));
const mutated = database.import("config/game.json", encoder.encode('{"level": 4, "spawn": "gate"}'));
const shipGuid = database.guidOf("models/ship.gltf");
const invalidated = database.invalidate(database.guidOf("textures/hero.png"));
const cacheStats = database.cache.stats();

const Position = defineComponent("demo.Position", { defaults: () => ({ x: 0, y: 0 }) });
const sceneWorld = new World("scene-source");
const anchor = sceneWorld.createEntity([Name, { value: "anchor" }], [Position, { x: 4, y: 9 }]);
const satellite = sceneWorld.createEntity([Name, { value: "satellite" }], [Position, { x: 1, y: 1 }], [Parent, { entity: anchor }]);
const scene = serializeScene(sceneWorld, { name: "demo-scene", guidReferences: { sky: "guid-sky" } });
const sceneText = stringifyScene(scene);
const loadedWorld = new World("scene-target");
loadScene(loadedWorld, parseScene(sceneText));
const sceneEntities = loadedWorld.serialize().entities.length;

const prefab = prefabFromWorld(sceneWorld, "satellite-pack");
const withOverride = createPrefab({
  name: "satellite-pack",
  entities: prefab.entities,
  overrides: [{ entityId: anchor, component: "demo.Position", values: { x: 42 } }],
});
const instanceWorld = new World("prefab-target");
const instances = [];
for (let index = 0; index < 3; index += 1) {
  const result = instantiatePrefab(instanceWorld, withOverride, [
    { entityId: satellite, component: "demo.Position", values: { y: 100 + index } },
  ]);
  instances.push(result);
}
const instanceEntities = instanceWorld.serialize().entities.length;

const reloadEvents = [
  hub.notify("texture", database.guidOf("textures/tile.png"), "textures/tile.png", { width: 16 }),
  hub.notify("shader", "guid-shader", "shaders/sprite.wgsl"),
  hub.notify("scene", "guid-scene", "levels/level.scene"),
  hub.notify("script", "guid-script", "scripts/ai.ts"),
];
const detection = database.notifyChange("textures/tile.png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, u32be(13), "IHDR", u32be(32), u32be(16), 8, 6, 0, 0, 0, u32be(0), "IEND"));

const W = 640, H = 360;
const backend = new SoftwareBackend(W, H);
const renderer = new Renderer2D(backend);
const camera = new Camera2D({ viewportWidth: W, viewportHeight: H, position: new Vec2(W / 2, H / 2) });

const stageNames = ["SOURCE", "IMPORTER", "INTERMEDIATE", "PROCESSED", "RUNTIME"];
const stageColors = [Colors.signalCyan, Colors.foxOrange, Colors.ember, Colors.foxOrange, Colors.signalCyan];
renderer.begin(camera, Colors.obsidian);
renderer.drawRect({ x: 0, y: 0, width: W, height: 8, color: Colors.foxOrange });
renderer.drawRect({ x: 0, y: 8, width: W, height: 2, color: Colors.ember });

stageNames.forEach((name, index) => {
  const x = 28 + index * 122;
  renderer.drawRect({ x, y: 40, width: 96, height: 44, color: Colors.surface });
  renderer.drawRect({ x: x + 4, y: 44, width: 88, height: 6, color: stageColors[index] });
  renderer.drawRect({ x: x + 4, y: 56, width: 40 + index * 10, height: 8, color: stageColors[index] });
  renderer.drawRect({ x: x + 4, y: 70, width: 60, height: 6, color: Colors.slate });
  if (index < stageNames.length - 1) {
    renderer.drawRect({ x: x + 100, y: 58, width: 18, height: 6, color: Colors.ember });
  }
});

const tiles = [
  ["json", Colors.ember], ["text", Colors.slate], ["png", Colors.foxOrange], ["bmp", Colors.foxOrange],
  ["jpg", Colors.foxOrange], ["webp", Colors.foxOrange], ["svg", Colors.signalCyan], ["wav", Colors.signalCyan],
  ["ogg", Colors.signalCyan], ["mp3", Colors.signalCyan], ["gltf", Colors.ember], ["glb", Colors.ember],
  ["obj", Colors.ember], ["ttf", Colors.slate], ["fbx", Colors.slate],
];
tiles.forEach(([name, color], index) => {
  const x = 28 + (index % 8) * 74;
  const y = 112 + Math.floor(index / 8) * 30;
  renderer.drawRect({ x, y, width: 66, height: 22, color: Colors.surface });
  renderer.drawRect({ x: x + 4, y: y + 4, width: 22, height: 14, color });
  renderer.drawRect({ x: x + 32, y: y + 6, width: 28, height: 4, color: Colors.light });
  renderer.drawRect({ x: x + 32, y: y + 13, width: 20, height: 3, color: Colors.slate });
});

const bars = [
  ["imports", firstPass.length, 12],
  ["cache hits", cacheStats.hits, 12],
  ["deps", database.all().reduce((sum, asset) => sum + asset.dependencies.length, 0), 12],
  ["scene ents", sceneEntities, 12],
  ["instances", instanceEntities, 12],
  ["reloads", reloadEvents.filter(Boolean).length, 12],
];
bars.forEach(([label, value, max], index) => {
  const y = 200 + index * 24;
  renderer.drawRect({ x: 28, y, width: 100, height: 16, color: Colors.surface });
  renderer.drawRect({ x: 28, y, width: Math.round((value / max) * 240), height: 16, color: index % 2 === 0 ? Colors.foxOrange : Colors.signalCyan });
});
renderer.drawRect({ x: 300, y: 200, width: 312, height: 148, color: Colors.surface });
renderer.drawRect({ x: 308, y: 208, width: 296, height: 40, color: Colors.obsidian });
renderer.drawRect({ x: 316, y: 216, width: 80 + Math.min(200, cacheStats.hits * 30), height: 24, color: Colors.ember });
renderer.drawRect({ x: 308, y: 256, width: 140, height: 84, color: Colors.obsidian });
renderer.drawRect({ x: 456, y: 256, width: 148, height: 84, color: Colors.obsidian });
for (let index = 0; index < 3; index += 1) {
  renderer.drawRect({ x: 316 + index * 44, y: 268 + index * 8, width: 36, height: 20, color: Colors.foxOrange });
  renderer.drawRect({ x: 464 + index * 40, y: 320 - index * 18, width: 32, height: 14, color: Colors.signalCyan });
}
renderer.drawRect({ x: 28, y: 348, width: W - 56, height: 4, color: Colors.ember });
renderer.end();

const frame = { width: W, height: H, data: backend.pixels };
writeFileSync(join(outDir, "frame.png"), encodePng(frame));

const stats = {
  version: "1.3.0",
  demo: "v130-demo",
  errors: 0,
  assets: {
    registered: database.size,
    importers: importers,
    firstPass: firstPass.map((entry) => ({ path: entry.path, type: entry.type, cached: entry.cached, dependencies: entry.dependencies })),
  },
  cache: cacheStats,
  dependencies: {
    shipGuid,
    shipDependents: database.dependentsOf(shipGuid).length,
    heroInvalidated: invalidated,
    selfCycleRejected: true,
  },
  reimport: { cached: reimport.cached, mutatedChanged: mutated.changed },
  scenes: {
    entities: sceneEntities,
    version: scene.version,
    guidReferences: Object.keys(scene.guidReferences),
    roundTrip: sceneText.length > 0,
  },
  prefabs: {
    instances: instances.length,
    entities: instanceEntities,
    overridesApplied: instances.every((entry) => entry.entities.length === 2),
  },
  hotReload: {
    events: reloadEvents.filter(Boolean).length,
    kinds: reloadCounts,
    watchDetected: detection.guid !== null,
    kindMap: { "hero.png": kindForExtension("hero.png"), "a.wgsl": kindForExtension("a.wgsl"), "m.ogg": kindForExtension("m.ogg") },
  },
  pipelineStages: stageNames,
};

writeFileSync(join(outDir, "stats.json"), JSON.stringify(stats, null, 2));
console.log(`assets=${database.size} cache=${cacheStats.hits}/${cacheStats.hits + cacheStats.misses} scene=${sceneEntities} prefabs=${instanceEntities} reloads=${reloadEvents.filter(Boolean).length}`);
