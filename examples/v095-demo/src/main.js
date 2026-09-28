import { writeFileSync, mkdirSync } from "node:fs";
import { SoftwareBackend, encodePng } from "@obx/rendering";
import { MemoryNetwork, GameClient, RpcSystem, ReliableChannel, protocolProfiles } from "@obx/networking";
import { DedicatedServer, createServerConfig } from "@obx/server";
import { BuildPipeline, BuildGraph, BuildCache, hashContent, exportTargets, processAssets, optimizeCode } from "@obx/build";
import { runCli, createCliHost } from "@obx/cli";

const net = new MemoryNetwork();
const [heroWire, serverHeroWire] = net.createPair({ latencyTicks: 1, dropRate: 0.05, seed: 21 });
const [allyWire, serverAllyWire] = net.createPair({ latencyTicks: 2, dropRate: 0.02, seed: 22 });

const reducer = (state, input) => ({
  ...state,
  x: (state.x ?? 0) + (input.fields.dx ?? 0),
  y: (state.y ?? 0) + (input.fields.dy ?? 0),
});

const config = createServerConfig({ name: "arena-eu", port: 7777, tickRate: 20, maxClients: 8, logLevel: "debug" });
const server = new DedicatedServer(config, { reducer, interestRadius: 30 });
server.plugins.register({
  id: "motd",
  onStart: () => undefined,
  onMessage: () => "welcome to arena-eu",
});
server.plugins.register({
  id: "bad-plugin",
  onTick: () => {
    throw new Error("bad tick");
  },
});
server.scripts.register({ id: "spawner", onTick: () => undefined });
server.scripts.register({ id: "weather", onTick: () => undefined });
server.scripts.disable("weather");

server.network.replication.track("hero", { x: 0, y: 0, hp: 100 });
server.network.replication.track("ally", { x: 3, y: 3, hp: 90 });
server.network.replication.track("npc", { x: 40, y: 40, hp: 50 });

server.start();
server.connect("hero", serverHeroWire);
server.connect("ally", serverAllyWire);

const heroClient = new GameClient(heroWire, { initialState: { x: 0, y: 0, hp: 100 }, reducer });
const allyClient = new GameClient(allyWire, { initialState: { x: 3, y: 3, hp: 90 }, reducer });

let heroPredicted = { x: 0, y: 0, hp: 100 };
for (let tick = 1; tick <= 30; tick += 1) {
  if (tick <= 4) {
    heroClient.sendInput({ dx: 2, dy: 1 });
    heroClient.prediction.predict({ seq: tick, fields: { dx: 2, dy: 1 } });
  }
  if (tick <= 2) allyClient.sendInput({ dx: -1, dy: 2 });
  server.step(1);
  net.step(1);
  heroClient.tick(20);
  allyClient.tick(20);
}

const heroState = server.network.replication.state("hero");
const heroLatest = heroClient.latest;
const heroView = heroClient.interpolationFor("hero").sample(20);
heroClient.prediction.correct({ x: heroState.x, y: heroState.y, hp: 100 }, 4);
heroPredicted = heroClient.prediction.predicted;
const lagSnap = server.network.lagCompensation.rewind(12);

const rpcNet = new MemoryNetwork();
const [rpcA, rpcB] = rpcNet.createPair();
const rpcClient = new RpcSystem(new ReliableChannel(rpcA), { timeoutTicks: 12 });
const rpcServer = new RpcSystem(new ReliableChannel(rpcB));
rpcServer.register("add", (payload) => String(Number(payload) + 1));
rpcServer.register("echo", (payload) => payload.toUpperCase());
rpcClient.call("add", "41");
rpcClient.call("echo", "obx");
rpcClient.call("missing");
for (let step = 0; step < 6; step += 1) {
  rpcNet.step(1);
  rpcClient.tick();
  rpcServer.tick();
}
const rpcResults = rpcClient.poll();

const host = createCliHost();
const flow = [];
const step = (argv) => {
  const result = runCli(argv, host);
  flow.push({ argv: argv.join(" "), code: result.code, out: result.out.length });
  return result;
};

step(["create", "NebulaQuest"]);
host.files.set("projects/NebulaQuest/src/main.js", 'import "src/util.js";\n// game entry\nconst main = 1;');
host.files.set("projects/NebulaQuest/src/util.js", "const util = 2;");
host.files.set("projects/NebulaQuest/assets/level.txt", "aaaaabbbbbcccccdddddeeeee");
host.files.set("projects/NebulaQuest/tests/core.test.js", "assert(true);");
step(["doctor"]);
step(["build", "web"]);
step(["export", "web"]);
step(["export", "windows"]);
step(["export", "server"]);
step(["config", "set", "difficulty", "hard"]);
step(["assets", "check"]);
step(["package"]);
step(["test"]);

const graph = new BuildGraph();
const graphRan = [];
graph.addNode({ id: "analyze", inputs: [], outputs: [], run: () => graphRan.push("analyze") });
graph.addNode({ id: "compile", inputs: [], outputs: [], run: () => graphRan.push("compile") });
graph.addNode({ id: "bundle", inputs: [], outputs: [], run: () => graphRan.push("bundle") });
graph.addNode({ id: "package", inputs: [], outputs: [], run: () => graphRan.push("package") });
graph.addEdge("analyze", "compile");
graph.addEdge("compile", "bundle");
graph.addEdge("bundle", "package");
graph.build(new Map());
graph.build(new Map());
graph.markDirty("compile");
graph.build(new Map());

const cache = new BuildCache();
const pipeline = new BuildPipeline({ cache });
const buildInput = {
  name: "NebulaQuest",
  version: "0.1.0",
  entry: "src/main.js",
  files: new Map([...host.files].filter(([path]) => path.startsWith("projects/NebulaQuest/") && (path.endsWith(".js") || path.includes("/assets/"))).map(([path, content]) => [path.slice("projects/NebulaQuest/".length), content])),
};
const firstBuild = pipeline.run(buildInput, "web");
const secondBuild = pipeline.run(buildInput, "web");
const thirdBuild = pipeline.run(buildInput, "android");
const assetRecords = processAssets({ "assets/level.txt": "aaaaabbbbbcccccdddddeeeee" });

const serverStatus = server.status();
server.stop();

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
  for (let i = 0; i < text.length * scale; i += 3) fillRect(x + i, y, 2, 7, color);
}

fillRect(0, 0, W, H, brand.obsidian, 1);
fillRect(0, 0, W, 10, brand.fox, 1);
fillRect(0, 10, W, 2, brand.ember, 1);
label(16, 2, "OBX 0.95 NETWORKING + BUILD", brand.dark, 2);

const panel = (x, y, w, h) => {
  fillRect(x, y, w, h, brand.surface, 1);
  strokeRect(x, y, w, h, brand.border, 1);
};
panel(8, 18, 300, 168);
panel(8, 194, 300, 158);
panel(316, 18, 316, 168);
panel(316, 194, 316, 158);

label(16, 26, "NETWORK ARENA-EU", brand.slate);
fillCircle(70, 100, 14, brand.dark, 1);
fillCircle(70, 100, 11, brand.fox, 1);
label(52, 122, "SERVER", brand.fox, 1);
const nodes = [
  { x: 210, y: 62, name: "HERO", color: brand.cyan },
  { x: 210, y: 108, name: "ALLY", color: brand.ember },
  { x: 210, y: 150, name: "RPC", color: brand.light },
];
for (const node of nodes) {
  drawLine(84, 100, node.x - 10, node.y, brand.border, 2);
  fillCircle(node.x, node.y, 9, brand.dark, 1);
  fillCircle(node.x, node.y, 6, node.color, 1);
  label(node.x + 14, node.y - 4, node.name, node.color, 1);
}
label(16, 150, "inputs " + server.network.stats.inputs + " snapshots " + server.network.stats.snapshots, brand.slate, 1);
label(16, 164, "packets sent " + heroClient.stats.sent + " recv " + heroClient.stats.received, brand.slate, 1);

label(16, 202, "REPLICATION + PREDICTION", brand.slate);
label(16, 220, "hero server x" + heroState.x + " y" + heroState.y, brand.cyan, 1);
label(16, 236, "hero client x" + heroLatest.entities.hero.x + " y" + heroLatest.entities.hero.y, brand.light, 1);
label(16, 252, "interp x" + heroView.x.toFixed(1) + " tick " + heroLatest.tick, brand.slate, 1);
label(16, 268, "predicted x" + heroPredicted.x + " pending 0", brand.ember, 1);
label(16, 284, "lag rewind(12) hero x" + (lagSnap ? lagSnap.hero.x : "-"), brand.slate, 1);
label(16, 300, "rpc add 41->" + (rpcResults.find((r) => r.method === "add")?.value ?? "-"), brand.light, 1);
label(16, 316, "rpc echo->" + (rpcResults.find((r) => r.method === "echo")?.value ?? "-"), brand.light, 1);
label(16, 332, "rpc missing->" + (rpcResults.find((r) => r.method === "missing")?.value ?? "-"), brand.fox, 1);

label(324, 26, "BUILD PIPELINE", brand.slate);
const steps = ["analyze", "compile", "bundle", "assets", "optimize", "runtime", "package", "sign", "release"];
steps.forEach((name, i) => {
  const x = 326 + (i % 5) * 61;
  const y = 44 + Math.floor(i / 5) * 22;
  fillRect(x, y, 55, 15, brand.dark, 1);
  strokeRect(x, y, 55, 15, i < 7 ? brand.cyan : brand.fox, 1);
  label(x + 4, y + 4, name, brand.light, 1);
});
label(324, 96, "graph analyze->compile->bundle->package", brand.slate, 1);
label(324, 112, "dirty rebuild ran " + graphRan.join(","), brand.slate, 1);
label(324, 128, "cache 1st " + firstBuild.cacheHits + " 2nd " + secondBuild.cacheHits, brand.cyan, 1);
label(324, 144, "optimize " + optimizeCode("// x\nconst a = 1;").length + "b asset zip " + assetRecords[0].compressedSize + "/" + assetRecords[0].size, brand.slate, 1);
label(324, 160, "hash " + hashContent("bundle"), brand.slate, 1);

label(324, 202, "CLI OBSIFOX", brand.slate);
flow.forEach((entry, i) => {
  const y = 220 + i * 11;
  if (y > 340) return;
  label(324, y, (entry.code === 0 ? "ok  " : "err ") + entry.argv, entry.code === 0 ? brand.light : brand.fox, 1);
});
const targets = Object.keys(exportTargets);
targets.forEach((name, i) => {
  const x = 324 + i * 62;
  fillRect(x, 340, 56, 12, brand.dark, 1);
  strokeRect(x, 340, 56, 12, name === "web" ? brand.ember : brand.border, 1);
  label(x + 4, 342, name, brand.slate, 1);
});

const frame = { width: W, height: H, data: backend.pixels };
mkdirSync("output", { recursive: true });
writeFileSync("output/frame.png", encodePng(frame));

const stats = {
  version: "0.95.0",
  server: {
    status: serverStatus,
    logs: server.logger.filter("all").length,
    pluginErrors: server.plugins.errorsFor("bad-plugin"),
    scripts: server.scripts.list(),
  },
  network: {
    inputs: server.network.stats.inputs,
    snapshots: server.network.stats.snapshots,
    hero: heroState,
    heroClientView: heroLatest.entities.hero,
    interpX: Number(heroView.x.toFixed(2)),
    predicted: heroPredicted,
    lagRewind12: lagSnap ? lagSnap.hero : null,
    rpc: rpcResults.map((r) => ({ method: r.method, ok: r.ok, value: r.value })),
    profiles: Object.keys(protocolProfiles),
  },
  build: {
    graphRan,
    firstCacheHits: firstBuild.cacheHits,
    secondCacheHits: secondBuild.cacheHits,
    thirdTarget: thirdBuild.target,
    steps: firstBuild.steps,
    assetCompressed: assetRecords[0].compressedSize,
    assetOriginal: assetRecords[0].size,
    bundleHash: hashContent(firstBuild.files.get("bundle.js")),
  },
  cli: {
    flow,
    distFiles: [...host.files.keys()].filter((p) => p.startsWith("dist/")).length,
  },
};
writeFileSync("output/stats.json", JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
