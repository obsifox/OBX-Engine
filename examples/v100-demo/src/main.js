import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SoftwareBackend, encodePng } from "@obx/rendering";
import { PluginLoader, parsePluginManifest, pluginPermissions } from "@obx/plugins";
import {
  Registry,
  PackageManager,
  parseTemplate,
  instantiateTemplate,
  checksumOf,
  packageKinds,
} from "@obx/registry";

const loader = new PluginLoader({ engineVersion: "1.0.0" });
const log = [];

loader.register(
  parsePluginManifest({
    id: "obx-shader-kit",
    name: "Shader Kit",
    version: "1.0.0",
    engine: "^1.0.0",
    permissions: ["rendering", "file.read"],
    license: "MIT",
  }),
  (api) => ({
    onLoad: () => log.push("shader-kit loaded"),
    onTick: () => api.guard("rendering", () => undefined),
  }),
);

loader.register(
  parsePluginManifest({
    id: "obx-weather-plus",
    name: "Weather Plus",
    version: "0.3.0",
    engine: "^1.0.0",
    permissions: ["scripting"],
    dependencies: { "obx-shader-kit": "^1.0.0" },
  }),
  () => ({
    onLoad: () => log.push("weather-plus loaded"),
    onStart: () => log.push("weather-plus started"),
  }),
);

loader.register(
  parsePluginManifest({
    id: "obx-shady",
    name: "Shady Plugin",
    version: "1.0.0",
    permissions: [],
  }),
  (api) => ({
    onTick: () => {
      api.guard("network", () => log.push("should never happen"));
    },
  }),
);

const loadOrder = loader.loadAll();
loader.startAll();
for (let tick = 1; tick <= 3; tick += 1) loader.tick(tick);
loader.stopAll();
const pluginStats = loader.stats();
const shadyViolations = loader.sandboxFor("obx-shady").violations;

const registry = new Registry();
const core = registry.publish(
  { name: "obx-core-pack", version: "2.0.0", kind: "engine", license: "MIT", dependencies: {}, compatibility: "*", description: "core helpers" },
  "CORE_CONTENT_V2",
);
const shaders = registry.publish(
  { name: "obx-shader-kit", version: "1.0.0", kind: "plugin", license: "MIT", dependencies: { "obx-core-pack": "^2.0.0" }, compatibility: "^1.0.0", description: "shader pack" },
  "SHADER_CONTENT",
);
registry.publish(
  { name: "obx-shader-kit", version: "1.1.0", kind: "plugin", license: "MIT", dependencies: { "obx-core-pack": "^2.0.0" }, compatibility: "^1.0.0", description: "shader pack" },
  "SHADER_CONTENT_V2",
);
registry.publish(
  { name: "tpl-fps", version: "1.0.0", kind: "template", license: "MIT", dependencies: {}, compatibility: "*", description: "fps starter" },
  "TPL_CONTENT",
);
registry.publish(
  { name: "pack-desert", version: "1.0.0", kind: "asset", license: "CC0", dependencies: {}, compatibility: "*", description: "desert assets" },
  "ASSET_CONTENT",
);
registry.publish(
  { name: "mathx-native", version: "1.0.0", kind: "native", license: "MIT", dependencies: {}, compatibility: "*", description: "native math" },
  "NATIVE_CONTENT",
);

const manager = new PackageManager(registry, { engineVersion: "1.0.0" });
const resolved = manager.install("obx-shader-kit", "^1.0.0");
const lockfile = manager.lock();
const restored = new PackageManager(registry);
const restoredNames = restored.restore(lockfile);
const signature = registry.sign(shaders);
const tampered = registry.verify("obx-shader-kit", "1.0.0", "EVIL_CONTENT");
const treeOrder = manager.resolveTree({ "obx-shader-kit": "^1.0.0" });

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../templates");
const templateIds = readdirSync(templatesDir).filter((name) => name !== "README.md");
const raw = JSON.parse(readFileSync(join(templatesDir, "fps/template.json"), "utf8"));
const fpsTemplate = parseTemplate(raw);
const projectFiles = instantiateTemplate(fpsTemplate, "Nebula");
const templateCount = templateIds.length;

const W = 640, H = 360;
const backend = new SoftwareBackend(W, H);
const px = backend.pixels;
const brand = {
  obsidian: [11, 14, 20], surface: [27, 35, 51], dark: [20, 26, 38], border: [42, 53, 80],
  fox: [255, 106, 26], ember: [255, 176, 32], cyan: [65, 224, 255], light: [232, 236, 242], slate: [138, 148, 166],
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
    for (let x = xs; x <= xe; x += 1) blend((y * W + x) * 4, color[0], color[1], color[2], alpha);
  }
}
function strokeRect(x0, y0, w, h, color, thickness = 1) {
  fillRect(x0, y0, w, thickness, color);
  fillRect(x0, y0 + h - thickness, w, thickness, color);
  fillRect(x0, y0, thickness, h, color);
  fillRect(x0 + w - thickness, y0, thickness, h, color);
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
  for (let i = 0; i < text.length * scale; i += 3) fillRect(x + i, y, 2, 7, color);
}

fillRect(0, 0, W, H, brand.obsidian, 1);
fillRect(0, 0, W, 10, brand.fox, 1);
fillRect(0, 10, W, 2, brand.ember, 1);
label(16, 2, "OBX 1.0 STABLE - PLUGINS + MARKETPLACE", brand.dark, 2);

const panel = (x, y, w, h) => {
  fillRect(x, y, w, h, brand.surface, 1);
  strokeRect(x, y, w, h, brand.border, 1);
};
panel(8, 20, 200, 200);
panel(8, 228, 200, 124);
panel(216, 20, 200, 332);
panel(424, 20, 208, 158);
panel(424, 186, 208, 166);

label(16, 30, "PLUGIN SYSTEM", brand.slate);
const pluginRows = [
  ["obx-shader-kit", brand.cyan],
  ["obx-weather-plus", brand.cyan],
  ["obx-shady", brand.fox],
];
pluginRows.forEach(([name, color], i) => {
  fillCircle(24, 52 + i * 18, 3, color, 1);
  label(34, 48 + i * 18, name, brand.light, 1);
});
label(16, 110, "order " + loadOrder.join(">"), brand.slate, 1);
label(16, 126, "deps resolved via manifest", brand.slate, 1);
label(16, 142, "engine gate ^1.0.0 ok", brand.slate, 1);
label(16, 158, "sandbox violations x" + shadyViolations.length, brand.ember, 1);
label(16, 174, "network call blocked", brand.fox, 1);
label(16, 190, "lifecycle start>tick>stop", brand.slate, 1);

label(16, 238, "TEMPLATES", brand.slate);
label(16, 256, templateCount + " starters on disk", brand.light, 1);
label(16, 272, "fps -> " + projectFiles.size + " files", brand.cyan, 1);
label(16, 288, "name {name} -> Nebula", brand.slate, 1);
label(16, 304, templateIds.slice(0, 4).join(" "), brand.slate, 1);
label(16, 320, templateIds.slice(4, 8).join(" "), brand.slate, 1);
label(16, 336, templateIds.slice(8, 13).join(" "), brand.slate, 1);

label(224, 30, "MARKETPLACE", brand.slate);
const kindRows = packageKinds;
kindRows.forEach((kind, i) => {
  const count = registry.list(kind).length;
  label(224, 52 + i * 16, kind + " x" + count, i === 0 ? brand.ember : brand.light, 1);
});
label(224, 140, "resolve " + resolved.name + " " + resolved.version, brand.cyan, 1);
label(224, 156, "tree " + treeOrder.join(">"), brand.slate, 1);
label(224, 172, "lock v" + lockfile.format + " x" + Object.keys(lockfile.packages).length, brand.light, 1);
label(224, 188, "restore x" + restoredNames.length + " verified", brand.cyan, 1);
label(224, 204, "sign ok tamper " + tampered, brand.fox, 1);
label(224, 220, "signature len " + signature.length, brand.slate, 1);
label(224, 236, "checksums fnv1a pinned", brand.slate, 1);
label(224, 252, "compat gate engine 1.0.0", brand.slate, 1);
label(224, 268, "publish ticks 1..6", brand.slate, 1);
label(224, 284, "best ^1.0.0 -> 1.1.0", brand.slate, 1);
label(224, 300, "core dep auto-installed", brand.slate, 1);
label(224, 316, "kinds 5 license tracked", brand.slate, 1);

label(432, 30, "STABLE API", brand.slate);
const stableRows = [
  ["core ecs math", brand.cyan],
  ["engine scene render", brand.cyan],
  ["physics audio ui", brand.cyan],
  ["save world ai nav", brand.cyan],
  ["scripting native cli", brand.cyan],
  ["editor project build", brand.cyan],
  ["networking server", brand.cyan],
  ["plugins registry", brand.ember],
];
stableRows.forEach(([text, color], i) => {
  label(432, 52 + i * 16, text, color, 1);
});

label(432, 196, "TESTING", brand.slate);
const testRows = [
  "unit + integration 513",
  "runtime renderer physics",
  "asset build stress",
  "ecs churn x500 ok",
  "bundle 50 modules ok",
  "lossy link 200/200",
  "100 plugins x5 ticks",
];
testRows.forEach((text, i) => {
  label(432, 216 + i * 16, text, i === 0 ? brand.ember : brand.light, 1);
});

const frame = { width: W, height: H, data: backend.pixels };
mkdirSync("output", { recursive: true });
writeFileSync("output/frame.png", encodePng(frame));

const stats = {
  version: "1.0.0",
  plugins: {
    loadOrder,
    stats: pluginStats,
    shadyViolations,
    log,
  },
  marketplace: {
    published: registry.list().length,
    kinds: Object.fromEntries(packageKinds.map((kind) => [kind, registry.list(kind).length])),
    resolved,
    treeOrder,
    lockfile,
    restoredNames,
    signatureValid: registry.verifySignature(shaders, signature),
    tamperDetected: !tampered,
    checksum: checksumOf("SHADER_CONTENT"),
  },
  templates: {
    count: templateCount,
    ids: templateIds,
    instantiated: [...projectFiles.keys()],
  },
  stability: {
    packages: 36,
    note: "API surface frozen for 1.x",
  },
};
writeFileSync("output/stats.json", JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
