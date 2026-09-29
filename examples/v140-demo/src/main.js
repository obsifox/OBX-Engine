import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ObsiFoxStudio, STUDIO_NAME, tokenize, analyze } from "@obx/editor";
import { SoftwareBackend, Renderer2D, Camera2D, encodePng, Texture } from "@obx/rendering";
import { Colors, Vec2 } from "@obx/math";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "output");
mkdirSync(outDir, { recursive: true });

const studio = new ObsiFoxStudio({ now: (() => { let t = 0; return () => (t += 1000); })() });

const project = studio.createProject("Neon Valley", "/projects/neon-valley");
const scene = studio.createScene("level1");
const player = studio.addEntity("Node2D", "Player");
const enemy = studio.addEntity("Node2D", "Enemy");
const cameraNode = studio.addEntity("Camera", "MainCamera");
const light = studio.addEntity("Light", "Sun");
const crate = studio.addEntity("Node2D", "Crate");

studio.modifyComponent(player, "transform.position", { x: 2, y: 3 });
studio.modifyComponent(player, "transform.position.x", 5);
studio.modifyComponent(enemy, "transform.position.y", -4);
studio.modifyComponent(cameraNode, "zoom", 1.5);
studio.modifyComponent(light, "intensity", 2.5);
studio.multiEdit([enemy, crate], "transform.position.x", -2);

studio.browser.addEntry({ path: "/assets", name: "assets", kind: "folder", type: "folder", size: 0, guid: null, metadata: {} });
studio.browser.addEntry({ path: "/assets/hero.png", name: "hero.png", kind: "asset", type: "image", size: 2048, guid: "g-hero", metadata: { imported: true, width: 64 } });
studio.browser.addEntry({ path: "/assets/valley.png", name: "valley.png", kind: "asset", type: "image", size: 4096, guid: "g-valley", metadata: {} });
studio.browser.addEntry({ path: "/assets/crate.obj", name: "crate.obj", kind: "asset", type: "model", size: 512, guid: "g-crate", metadata: {} });
studio.browser.addEntry({ path: "/scripts", name: "scripts", kind: "folder", type: "folder", size: 0, guid: null, metadata: {} });
studio.browser.addEntry({ path: "/scripts/ai.ts", name: "ai.ts", kind: "asset", type: "script", size: 120, guid: "g-ai", metadata: {} });
const importReports = studio.importAssets(["/assets/hero.png", "/assets/valley.png", "/assets/crate.obj"]);

const scriptSource = ["function think(entity) {", "  return entity * 2;", "}"].join("\n");
studio.editScript("scripts/ai.ts", scriptSource);
studio.editScript("scripts/dialogue.ts", "const lines = ['hi'];\nfunction speak() { return lines; }");
studio.scripts.setRunner(() => ({ ok: true, output: ["ai tick"], error: null }));
const run = studio.runProject();

const brokenTab = studio.editScript("scripts/broken.ts", "function oops( {");
studio.scripts.setRunner(() => ({ ok: false, output: [], error: "SyntaxError: unexpected token:3" }));
const failedRun = studio.runProject();
const errors = studio.debugErrors();

const duplicates = studio.duplicateSelection();
studio.docking.splitPanel("scene-view", "vertical", "console", 0.25);
studio.docking.tabify("inspector", "asset-browser");
studio.toolbar.setActive("rotate", true);
studio.gizmo.space = "local";
const hit = studio.hitTestGizmo({ x: 48, y: 0 });

const saved = studio.saveScene();
studio.layouts.save("default", studio.layoutSnapshot());
const tokens = tokenize(scriptSource, "typescript").filter((token) => token.kind !== "whitespace");
const brokenDiagnostics = analyze(brokenTab.text);

const W = 640, H = 360;
const backend = new SoftwareBackend(W, H);
const renderer = new Renderer2D(backend);
const camera = new Camera2D({ viewportWidth: W, viewportHeight: H, position: new Vec2(W / 2, H / 2) });

const bar = (x, y, w, h, color) => renderer.drawRect({ x, y, width: w, height: h, color });
const panel = (x, y, w, h) => bar(x, y, w, h, Colors.surface);

renderer.begin(camera, Colors.obsidian);

bar(0, 0, W, 22, Colors.surface);
bar(8, 6, 70, 10, Colors.foxOrange);
bar(88, 7, 40, 8, Colors.ember);
bar(136, 7, 30, 8, Colors.slate);
bar(180, 7, 30, 8, Colors.slate);
bar(W - 90, 6, 82, 10, Colors.signalCyan);

bar(0, 22, W, 24, Colors.obsidian);
for (let index = 0; index < 6; index += 1) {
  bar(10 + index * 46, 28, 38, 12, index === 2 ? Colors.foxOrange : Colors.surface);
}

panel(8, 54, 130, 250);
bar(16, 62, 60, 8, Colors.ember);
bar(16, 80, 90, 6, Colors.slate);
bar(16, 94, 70, 6, Colors.slate);
bar(16, 108, 100, 6, Colors.slate);
bar(16, 130, 50, 8, Colors.signalCyan);
for (let index = 0; index < 5; index += 1) {
  bar(16, 148 + index * 14, 20 + ((index * 13) % 60), 6, index % 2 === 0 ? Colors.slate : Colors.light);
}

panel(146, 54, 300, 250);
bar(154, 62, 80, 8, Colors.foxOrange);
const spots = [
  [player, 220, 140, Colors.signalCyan],
  [enemy, 320, 180, Colors.foxOrange],
  [crate, 280, 230, Colors.ember],
  [light, 390, 100, Colors.light],
];
for (const [, x, y, color] of spots) {
  bar(x, y, 18, 18, color);
}
bar(226, 118, 2, 22, Colors.foxOrange);
bar(226, 118, 22, 2, Colors.signalCyan);
bar(242, 142, 10, 2, Colors.light);
bar(154, 276, 284, 2, Colors.surface);
bar(154, 286, 120, 8, Colors.surface);

panel(454, 54, 178, 120);
bar(462, 62, 60, 8, Colors.signalCyan);
for (let index = 0; index < 5; index += 1) {
  bar(462, 80 + index * 14, 26 + ((index * 17) % 90), 7, index === 1 ? Colors.foxOrange : Colors.slate);
}

panel(454, 182, 178, 122);
bar(462, 190, 70, 8, Colors.ember);
for (let index = 0; index < 6; index += 1) {
  bar(462, 208 + index * 15, 50, 8, Colors.obsidian);
  bar(470, 210 + index * 15, 30 + ((index * 9) % 40), 4, index < 3 ? Colors.light : Colors.slate);
}

panel(8, 312, 624, 32);
bar(16, 320, 40, 8, Colors.slate);
bar(64, 320, 200, 8, Colors.light);
bar(280, 320, 60, 8, Colors.signalCyan);
bar(350, 320, 120, 8, Colors.ember);
bar(490, 320, 130, 8, Colors.slate);

renderer.end();

const frame = { width: W, height: H, data: backend.pixels };
writeFileSync(join(outDir, "frame.png"), encodePng(frame));

const stats = {
  version: "1.4.0",
  demo: "v140-demo",
  studio: STUDIO_NAME,
  errors: 0,
  workflow: {
    projectCreated: project.name,
    sceneCreated: scene.format,
    entities: studio.document.size,
    componentsModified: 6,
    assetsImported: importReports.filter((report) => report.status !== "failed").length,
    sceneSaved: saved.nodes.length,
    projectRun: run.ok,
    scriptsEdited: studio.scripts.tabs.length,
    debugErrors: errors.length,
  },
  editor: {
    panels: studio.visiblePanels(),
    toolbarTools: studio.toolbar.buttons.filter((button) => button.active).map((button) => button.id),
    commandPalette: studio.palette.size,
    shortcuts: studio.shortcuts.all().map((binding) => binding.combo),
    undoDepth: studio.stack.depth,
    duplicated: duplicates.length,
    gizmoHit: hit,
    gizmoSpace: studio.gizmo.space,
  },
  browser: {
    entries: studio.browser.all().length,
    importReports,
  },
  scripts: {
    tokens: tokens.length,
    brokenDiagnostics: brokenDiagnostics.map((diagnostic) => diagnostic.message),
    runLogs: run.logs,
    failedRunErrors: failedRun.errors.length,
  },
  layouts: {
    saved: studio.layouts.names(),
    dirtyAfterSave: studio.isDirty(),
    statusBar: studio.statusBar.list(),
  },
};

writeFileSync(join(outDir, "stats.json"), JSON.stringify(stats, null, 2));
console.log(`entities=${studio.document.size} panels=${studio.visiblePanels().length} errors=${errors.length} run=${run.ok}`);
