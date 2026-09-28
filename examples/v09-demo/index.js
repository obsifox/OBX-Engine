import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox, ScriptHost, ObsiScriptEngine, generateDts, validateApi } from "@obx/scripting";
import { NativeAbi, WasmModule, ExtensionRegistry, generateCHeader } from "@obx/native";
import { makeNative } from "@obx/obsiscript";
import { SoftwareBackend, encodePng } from "@obx/rendering";

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, "output");
mkdirSync(outputDir, { recursive: true });

const wasmAdd = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

const abi = new NativeAbi("mathx", "1.0.0");
let seed = 12345;
abi.define("rand", "f64(f64)", () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 1000) / 1000;
});
abi.define("twice", "i32(i32)", (a) => a * 2);

const registry = new ExtensionRegistry({ platform: "linux", grants: ["clock"] });
registry.load({
  name: "mathx",
  version: "1.0.0",
  platforms: ["any"],
  capabilities: ["none"],
  abi,
  update: () => {},
});

const dots = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];
let setDotCalls = 0;

const bindings = {
  setDot: makeNative("setDot", 3, (args) => {
    const index = args[0];
    dots[index] = { x: args[1], y: args[2] };
    setDotCalls += 1;
    return null;
  }),
  nativeRand: makeNative("nativeRand", 0, () => registry.abi("mathx").call("rand", [0])),
  wasmAdd: makeNative("wasmAdd", 2, () => 0),
};

const api = {
  functions: [
    { name: "setDot", params: [{ name: "i", type: "number" }, { name: "x", type: "number" }, { name: "y", type: "number" }], returns: "void" },
    { name: "nativeRand", params: [], returns: "number" },
    { name: "wasmAdd", params: [{ name: "a", type: "number" }, { name: "b", type: "number" }], returns: "number" },
  ],
  constants: [{ name: "FIELD_W", type: "number" }],
};
bindings.FIELD_W = 320;
const dts = generateDts(api, "obx");
const missing = validateApi(api, bindings);

const phaseLog = [];
const host = new ScriptHost({
  engine: new ObsiScriptEngine(),
  api,
  bindings,
  hooks: { onPhase: (id, phase) => phaseLog.push(`${id}:${phase}`) },
});

const sourceV1 = `
export fn init() {
  state["px"] = [];
  state["py"] = [];
  state["vx"] = [];
  state["vy"] = [];
  for (let i = 0; i < 8; i = i + 1) {
    push(state["px"], 30 + i * 26);
    push(state["py"], 30 + (i % 4) * 28);
    push(state["vx"], (i + 1) * 5);
    push(state["vy"], 8 + i * 3);
  }
}
export fn update(dt) {
  for (let i = 0; i < 8; i = i + 1) {
    let x = state["px"][i] + state["vx"][i] * dt;
    let y = state["py"][i] + state["vy"][i] * dt;
    if (x < 8 or x > 312) {
      state["vx"][i] = 0 - state["vx"][i];
    }
    if (y < 8 or y > 172) {
      state["vy"][i] = 0 - state["vy"][i];
    }
    state["px"][i] = x;
    state["py"][i] = y;
    setDot(i, x, y);
  }
}
`;

const sourceV2 = `
export fn init() {
  state["px"] = [];
  state["py"] = [];
  state["vx"] = [];
  state["vy"] = [];
  for (let i = 0; i < 8; i = i + 1) {
    push(state["px"], 30 + i * 26);
    push(state["py"], 30 + (i % 4) * 28);
    push(state["vx"], (i + 1) * 7);
    push(state["vy"], 10 + i * 4);
  }
}
export fn update(dt) {
  for (let i = 0; i < 8; i = i + 1) {
    let x = state["px"][i] + state["vx"][i] * dt;
    let y = state["py"][i] + state["vy"][i] * dt;
    if (x < 8 or x > 312) {
      state["vx"][i] = 0 - state["vx"][i];
    }
    if (y < 8 or y > 172) {
      state["vy"][i] = 0 - state["vy"][i];
    }
    state["px"][i] = x;
    state["py"][i] = y;
    setDot(i, x, y);
  }
}
`;

host.register("field", sourceV1);
host.init("field");
for (let step = 0; step < 60; step += 1) host.update(1 / 30);
host.reload("field", sourceV2);
for (let step = 0; step < 140; step += 1) host.update(1 / 30);

const sandbox = new Sandbox();
const blockedAttempts = [
  'eval("boom")',
  "process.exit(1)",
  "require('fs')",
  "globalThis.hack = 1",
].filter((code) => {
  try {
    sandbox.assert(code);
    return false;
  } catch {
    return true;
  }
}).length;

const wasm = await WasmModule.fromBytes(wasmAdd).instantiate();
let checksum = 0;
for (let i = 1; i <= 8; i += 1) checksum += wasm.call("add", i, i * 2);
let nativeSum = 0;
for (let i = 0; i < 8; i += 1) nativeSum += registry.abi("mathx").call("rand", [0]);

const width = 640;
const height = 360;
const backend = new SoftwareBackend(width, height);
const px = backend.pixels;

function blend(index, r, g, b, alpha = 1) {
  px[index] = Math.round((px[index] ?? 0) * (1 - alpha) + r * alpha);
  px[index + 1] = Math.round((px[index + 1] ?? 0) * (1 - alpha) + g * alpha);
  px[index + 2] = Math.round((px[index + 2] ?? 0) * (1 - alpha) + b * alpha);
  px[index + 3] = 255;
}

function fillRect(x0, y0, w, h, color, alpha = 1) {
  const xs = Math.max(0, Math.floor(x0));
  const xe = Math.min(width - 1, Math.ceil(x0 + w));
  const ys = Math.max(0, Math.floor(y0));
  const ye = Math.min(height - 1, Math.ceil(y0 + h));
  for (let y = ys; y <= ye; y += 1) {
    for (let x = xs; x <= xe; x += 1) {
      blend((y * width + x) * 4, color[0], color[1], color[2], alpha);
    }
  }
}

function fillCircle(cx, cy, radius, color, alpha = 1) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      blend((y * width + x) * 4, color[0], color[1], color[2], alpha);
    }
  }
}

function strokeRect(x0, y0, w, h, color, thickness = 1) {
  fillRect(x0, y0, w, thickness, color);
  fillRect(x0, y0 + h - thickness, w, thickness, color);
  fillRect(x0, y0, thickness, h, color);
  fillRect(x0 + w - thickness, y0, thickness, h, color);
}

fillRect(0, 0, width, height, [11, 14, 20], 1);
fillRect(0, 0, width, 22, [27, 35, 51], 1);
fillRect(0, 22, width, 3, [255, 106, 26], 1);
fillRect(0, 25, width, 1, [255, 176, 32], 1);

const panel = [27, 35, 51];
const panelDark = [20, 26, 38];
const border = [42, 53, 80];

fillRect(14, 38, 300, 216, panel, 1);
strokeRect(14, 38, 300, 216, border, 1);
fillRect(22, 46, 60, 6, [255, 176, 32], 1);

const sourceLines = sourceV2.split("\n").filter((line) => line.length >= 0);
sourceLines.forEach((line, index) => {
  const y = 62 + index * 7.0;
  if (y > 248) return;
  const trimmed = line.trim();
  const indent = line.length - trimmed.length;
  const barWidth = Math.min(250, trimmed.length * 4.6);
  const color =
    trimmed.startsWith("export fn update")
      ? [255, 106, 26]
      : trimmed.startsWith("export fn init")
        ? [65, 224, 255]
        : trimmed.startsWith("if")
          ? [255, 176, 32]
          : trimmed.startsWith("for")
            ? [76, 175, 80]
            : [232, 236, 242];
  fillRect(26 + indent * 4, y, barWidth, 4, color, trimmed.length === 0 ? 0.12 : 0.85);
});

fillRect(326, 38, 300, 216, panel, 1);
strokeRect(326, 38, 300, 216, border, 1);
fillRect(334, 46, 60, 6, [65, 224, 255], 1);
fillRect(338, 60, 276, 182, panelDark, 1);
strokeRect(338, 60, 276, 182, border, 1);

for (let i = 1; i < 8; i += 1) {
  fillRect(338 + i * 34.5, 60, 1, 182, [42, 53, 80], 0.6);
  fillRect(338, 60 + i * 22.75, 276, 1, [42, 53, 80], 0.6);
}

const dotColors = [
  [255, 106, 26],
  [255, 176, 32],
  [65, 224, 255],
  [76, 175, 80],
  [232, 236, 242],
  [255, 106, 26],
  [255, 176, 32],
  [65, 224, 255],
];
dots.forEach((dot, index) => {
  const pxX = 338 + (dot.x / 320) * 276;
  const pxY = 60 + (dot.y / 180) * 182;
  fillCircle(pxX, pxY, 8, [11, 14, 20], 0.7);
  fillCircle(pxX, pxY, 5.6, dotColors[index], 1);
  fillCircle(pxX, pxY, 2, [11, 14, 20], 0.5);
});

fillRect(14, 262, 300, 84, panel, 1);
strokeRect(14, 262, 300, 84, border, 1);
fillRect(22, 270, 60, 6, [76, 175, 80], 1);
phaseLog.forEach((entry, index) => {
  const x = 26 + (index % 8) * 34;
  const y = 288 + Math.floor(index / 8) * 22;
  const phase = entry.split(":")[1];
  const color =
    phase === "running"
      ? [255, 176, 32]
      : phase === "loaded"
        ? [65, 224, 255]
        : phase === "disposed"
          ? [138, 148, 166]
          : [255, 106, 26];
  fillRect(x, y, 28, 14, panelDark, 1);
  strokeRect(x, y, 28, 14, color, 1);
  fillRect(x + 4, y + 4, 20, 6, color, 1);
});

fillRect(326, 262, 300, 84, panel, 1);
strokeRect(326, 262, 300, 84, border, 1);
fillRect(334, 270, 60, 6, [255, 106, 26], 1);
const meters = [
  { value: Math.min(1, checksum / 72), color: [255, 176, 32], w: checksum },
  { value: Math.min(1, nativeSum / 8), color: [65, 224, 255], w: nativeSum },
  { value: Math.min(1, setDotCalls / 1600), color: [76, 175, 80], w: setDotCalls },
  { value: Math.min(1, blockedAttempts / 4), color: [255, 106, 26], w: blockedAttempts },
];
meters.forEach((meter, index) => {
  const y = 288 + index * 13;
  fillRect(334, y, 284, 9, panelDark, 1);
  fillRect(334, y, 284 * meter.value, 9, meter.color, 1);
});

const png = encodePng({ width, height, data: backend.pixels });
writeFileSync(join(outputDir, "frame.png"), png);

const stats = {
  phases: phaseLog,
  reloads: host.get("field").version - 1,
  setDotCalls,
  checksum,
  nativeSum: Number(nativeSum.toFixed(3)),
  blockedAttempts,
  missingBindings: missing,
  dtsLines: dts.split("\n").length,
  cHeaderLines: generateCHeader(abi).split("\n").length,
  wasmExports: wasm.exports(),
  modules: Object.keys(registry.names()).length,
  scriptPhase: host.get("field").phase,
};
writeFileSync(join(outputDir, "stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
console.log(JSON.stringify(stats, null, 2));
