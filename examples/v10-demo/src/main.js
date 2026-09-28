import { writeFileSync, mkdirSync } from "node:fs";
import { encodePng, SoftwareBackend, Color } from "@obx/engine";
import {
  EditorSession,
  AddNodeCommand,
  RemoveNodeCommand,
  RenameNodeCommand,
  ReparentNodeCommand,
  SetPropertyCommand,
  CompositeCommand,
  defaultInspectorSchemas,
} from "@obx/editor";
import { Project, AssetIndex, satisfies, migrateManifest, standardFolders } from "@obx/project";
import { ExtensionRegistry } from "@obx/extensions";

const session = new EditorSession();
const doc = session.document;
const log = session.console;
const registry = new ExtensionRegistry();

registry.register({
  id: "obx.scene-tools",
  name: "Scene Tools",
  version: "1.0.0",
  contributions: {
    commands: [{ id: "scene.duplicate", title: "Duplicate Selected", run: (ctx) => ctx.log("duplicated") }],
    panels: [
      { id: "hierarchy", title: "Scene Tree", location: "left", order: 0 },
      { id: "assets", title: "Assets", location: "bottom", order: 1 },
    ],
    menus: [
      { id: "scene.add.menu", menu: "Scene", commandId: "scene.duplicate", order: 0 },
    ],
    tools: [{ id: "move", label: "Move", run: () => "move" }],
    gizmos: [{ id: "transform", nodeType: "Node3D", draw: () => "translate-gizmo" }],
    importers: [{ id: "png", extensions: [".png"], import: (source) => ({ kind: "texture", source }) }],
    assetTypes: [{ type: "texture", extensions: [".png"] }],
    nodeTypes: [{ type: "Prop", create: (name) => ({ type: "Prop", name }) }],
    inspectors: [{ type: "Node3D", describe: () => [{ path: "hp", label: "HP", kind: "number" }] }],
  },
  activate: (ctx) => ctx.log("scene-tools ready"),
});
registry.activate("obx.scene-tools");
registry.executeCommand("scene.duplicate");
registry.gizmoFor("Node3D");
registry.importerFor("hero.png");
registry.assetTypeFor("level.scene");
registry.inspectorFor("Node3D");
registry.createNode("Prop", "Crate");

const project = Project.create({ name: "ObsiFoxDemo", version: "0.1.0", settings: { language: "en" } });
for (const folder of standardFolders) {
  project.writeFile(`${folder}/.keep`, "");
}
project.writeFile("textures/hero.png", "PNGDATA");
project.addDependency({ name: "@obx/engine", version: "^0.10.0" });
const depsMissing = project.checkDependencies({ "@obx/engine": "0.10.0" });
const semverOk = satisfies("0.10.0", "^0.9.0") && !satisfies("0.11.0", "~0.10.0");
const migrated = migrateManifest({ format: 1, name: "legacy", settings: { width: 320, height: 180 } });

const rootId = doc.rootId;
const camera = doc.addNode("Camera", "Camera3D", rootId);
const sun = doc.addNode("Light", "Sun", rootId);
const hero = doc.addNode("Node3D", "Hero", rootId);
const weapon = doc.addNode("Node3D", "Weapon", hero.id);
const vfx = doc.addNode("Node3D", "VFX", hero.id);
const terrain = doc.addNode("Node3D", "Terrain", rootId);

session.stack.execute(new SetPropertyCommand(hero, "hp", 140));
session.stack.execute(new ReparentNodeCommand(doc, vfx.id, terrain.id));
session.stack.execute(
  new CompositeCommand("polish-scene", [
    new SetPropertyCommand(sun, "intensity", 1.8),
    new SetPropertyCommand(camera, "zoom", 1.4),
  ]),
);
session.stack.execute(new RenameNodeCommand(doc, weapon.id, "Blade"));
session.stack.undo();
session.stack.redo();
session.stack.beginTransaction("batch");
session.stack.execute(new AddNodeCommand(doc, "Node3D", "Spark", hero.id));
session.stack.execute(new SetPropertyCommand(hero, "mp", 60));
session.stack.commitTransaction();
session.stack.execute(new RemoveNodeCommand(doc, doc.findByName("Spark").id));
session.stack.undo();

session.selection.select(hero.id);
session.selection.add(weapon.id);
const selectedIds = session.selection.list;

const descriptors = session.inspector.describe(hero);
const hpDescriptor = descriptors.find((entry) => entry.path === "hp") ?? {
  path: "hp",
  label: "HP",
  kind: "number",
};
const hpValue = session.inspector.read(hero, "hp");
const validCheck = session.inspector.validate(hpDescriptor, 150);
const invalidCheck = session.inspector.validate(hpDescriptor, "high");

session.tool.setMode("translate");
session.tool.applyDrag(hero, { x: 1.2, y: 0, z: -0.4 }, true);
const heroPosition = session.inspector.read(hero, "transform.position");

session.viewport.pan(24, 12);
session.viewport.zoomAt({ x: 200, y: 120 }, 1.25);
const gizmoOrigin = session.viewport.worldToScreen({ x: 0, y: 0 });

log.log("info", "Scene loaded: ObsiFox Demo");
log.log("info", "Extensions active: 1");
log.log("warn", "Texture 'hero.png' imported at 2x scale");
log.log("error", "Missing dependency: obx.shaders (optional)");
log.log("info", `Undo history: ${session.stack.history.length}`);
const logCounts = session.console.counts;

session.profiler.record("update", 2.1);
session.profiler.record("render", 5.4);
session.profiler.record("script", 0.9);
session.profiler.record("update", 2.4);
const profilerReport = session.profiler.report();

const assets = new AssetIndex();
assets.register({ path: "textures/hero.png", type: "texture", meta: { filter: "linear" } });
assets.register({ path: "scenes/level1.scene", type: "scene", meta: {} });
const missingAssets = assets.missing(project);
const textures = assets.byType("texture");

const W = 640, H = 360;
const backend = new SoftwareBackend(W, H);
const px = backend.pixels;
const brand = {
  obsidian: [11, 14, 20],
  surface: [27, 35, 51],
  dark: [20, 26, 38],
  border: [42, 53, 80],
  fox: [255, 106, 26],
  ember: [255, 176, 32],
  cyan: [65, 224, 255],
  light: [232, 236, 242],
  slate: [138, 148, 166],
};

function blend(index, r, g, b, alpha = 1) {
  px[index] = Math.round((px[index] ?? 0) * (1 - alpha) + r * alpha);
  px[index + 1] = Math.round((px[index + 1] ?? 0) * (1 - alpha) + g * alpha);
  px[index + 2] = Math.round((px[index + 2] ?? 0) * (1 - alpha) + b * alpha);
  px[index + 3] = 255;
}

function fillRect(x0, y0, w, h, color, alpha = 1) {
  const xs = Math.max(0, Math.floor(x0));
  const xe = Math.min(W - 1, Math.ceil(x0 + w));
  const ys = Math.max(0, Math.floor(y0));
  const ye = Math.min(H - 1, Math.ceil(y0 + h));
  for (let y = ys; y <= ye; y += 1) {
    for (let x = xs; x <= xe; x += 1) {
      blend((y * W + x) * 4, color[0], color[1], color[2], alpha);
    }
  }
}

function strokeRect(x0, y0, w, h, color, thickness = 1) {
  fillRect(x0, y0, w, thickness, color);
  fillRect(x0, y0 + h - thickness, w, thickness, color);
  fillRect(x0, y0, thickness, h, color);
  fillRect(x0 + w - thickness, y0, thickness, h, color);
}

function drawLine(x0, y0, x1, y1, color, thickness = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    fillRect(x - thickness / 2, y - thickness / 2, thickness, thickness, color);
  }
}

function fillCircle(cx, cy, radius, color, alpha = 1) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      blend((y * W + x) * 4, color[0], color[1], color[2], alpha);
    }
  }
}

function label(x, y, text, color, scale = 2) {
  for (let i = 0; i < text.length * scale; i += 3) {
    fillRect(x + i, y, 2, 7, color);
  }
}

fillRect(0, 0, W, H, brand.obsidian, 1);
fillRect(0, 0, W, 10, brand.fox, 1);
fillRect(0, 10, W, 2, brand.ember, 1);
for (const [x, color] of [[16, brand.fox], [28, brand.ember], [40, brand.cyan]]) {
  fillCircle(x + 4, 5, 3, brand.dark, 1);
  fillCircle(x + 4, 5, 2, color, 1);
}
label(64, 3, "ObsiFox Studio", brand.dark, 2);

const panel = (x, y, w, h) => {
  fillRect(x, y, w, h, brand.surface, 1);
  strokeRect(x, y, w, h, brand.border, 1);
};
panel(8, 22, 150, 196);
panel(8, 226, 150, 126);
panel(166, 22, 300, 330);
panel(474, 22, 158, 158);
panel(474, 188, 158, 164);

for (let x = 180; x < 460; x += 28) {
  drawLine(x, 30, x, 344, brand.dark, 1);
}
for (let y = 36; y < 344; y += 28) {
  drawLine(174, y, 458, y, brand.dark, 1);
}

const gizmoX = 220 + gizmoOrigin.x * 0.55;
const gizmoY = 210 + gizmoOrigin.y * 0.55;
drawLine(gizmoX, gizmoY, gizmoX + 56, gizmoY + 8, brand.fox, 3);
drawLine(gizmoX, gizmoY, gizmoX + 6, gizmoY - 56, brand.cyan, 3);
drawLine(gizmoX, gizmoY, gizmoX - 40, gizmoY + 34, brand.ember, 3);
fillCircle(gizmoX, gizmoY, 5, brand.light, 1);
fillCircle(gizmoX, gizmoY, 3, brand.dark, 1);
for (const [dx, dy, color] of [[56, 8, brand.fox], [6, -56, brand.cyan], [-40, 34, brand.ember]]) {
  fillCircle(gizmoX + dx, gizmoY + dy, 4, color, 1);
}
label(180, 30, "VIEWPORT 2D", brand.slate);
label(180, 46, "grid + translate gizmo", brand.slate, 1);

label(18, 32, "SCENE TREE", brand.slate);
const rows = [
  ["ObsiFoxDemo", brand.light],
  [" Camera3D", brand.light],
  [" Sun", brand.light],
  [" Hero", brand.ember],
  ["  Blade", brand.light],
  [" Terrain", brand.light],
  ["  VFX", brand.light],
];
rows.forEach(([row, color], i) => {
  label(18, 52 + i * 18, row, color);
});
strokeRect(12, 52 + 3 * 18 - 3, 138, 13, brand.ember, 1);
label(18, 190, "selected x" + selectedIds.length, brand.cyan, 1);

label(18, 236, "ASSETS", brand.slate);
label(18, 254, "hero.png", brand.cyan, 1);
label(18, 270, "level1.scene", brand.light, 1);
label(18, 286, "missing x" + missingAssets.length, brand.ember, 1);
label(18, 302, "textures x" + textures.length, brand.slate, 1);
label(18, 318, "files x" + project.listFiles().length, brand.slate, 1);
label(18, 334, "ext x" + Object.keys(registry.stats()).length, brand.slate, 1);

label(484, 32, "INSPECTOR", brand.slate);
label(484, 50, "Hero Node3D", brand.light, 1);
label(484, 66, "hp = " + hpValue, brand.cyan, 1);
label(484, 82, "pos snapped", brand.cyan, 1);
label(484, 98, "fields x" + descriptors.length, brand.slate, 1);
label(484, 114, validCheck === null ? "validate ok" : "validate bad", brand.cyan, 1);
label(484, 130, invalidCheck ? "reject non-num" : "no error", brand.fox, 1);
label(484, 146, "schemas x" + defaultInspectorSchemas.length, brand.slate, 1);
label(484, 162, "undo x" + session.stack.depth, brand.slate, 1);

label(484, 198, "PROFILER", brand.slate);
profilerReport.forEach((entry, i) => {
  const y = 216 + i * 20;
  label(484, y, entry.label + " " + entry.average, brand.light, 1);
  fillRect(566, y, entry.average * 14, 8, i === 0 ? brand.fox : i === 1 ? brand.cyan : brand.ember, 1);
});
label(484, 282, "CONSOLE", brand.slate);
label(484, 300, "info x" + logCounts.info, brand.light, 1);
label(484, 316, "warn x" + logCounts.warn, brand.ember, 1);
label(484, 332, "error x" + logCounts.error, brand.fox, 1);

const frame = { width: W, height: H, data: backend.pixels };
mkdirSync("output", { recursive: true });
writeFileSync("output/frame.png", encodePng(frame));

const stats = {
  version: "0.10.0",
  editor: {
    nodes: doc.all().length,
    selected: selectedIds.length,
    undoDepth: session.stack.depth,
    canUndo: session.stack.canUndo,
    canRedo: session.stack.canRedo,
    history: session.stack.history,
    transformMode: session.tool.mode,
    heroPosition,
  },
  inspector: {
    fields: descriptors.length,
    hp: hpValue,
    validCheck,
    invalidCheck,
    schemas: defaultInspectorSchemas.map((schema) => schema.type),
  },
  console: { counts: logCounts, entries: log.entries.length },
  profiler: { report: profilerReport, frameTotal: session.profiler.frameTotal },
  viewport: { camera: session.viewport.camera, gizmoOrigin },
  project: {
    format: project.manifest.format,
    version: project.manifest.version,
    folders: standardFolders.length,
    files: project.listFiles().length,
    depsMissing,
    semverOk,
    migratedWidth: migrated.settings["render.width"],
  },
  assets: { registered: JSON.parse(assets.serialize()).length, textures: textures.length, missing: missingAssets },
  extensions: registry.stats(),
};
writeFileSync("output/stats.json", JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
