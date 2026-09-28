import { writeFileSync, mkdirSync } from "node:fs";
import { SoftwareBackend, encodePng } from "@obx/rendering";
import { HeightFog, FoliageInstancer, DecalProjector, WaterSurface } from "@obx/rendering";
import { Random } from "@obx/core";
import { AsyncStreamer, HlodSystem, OcclusionGrid, WorldSimulation } from "@obx/world";
import { CombatBrain, WildlifeBrain } from "@obx/ai";
import { Lobby, RoomManager, Matchmaking, AntiCheatHooks } from "@obx/multiplayer";
import { CpuProfiler, MemoryProfiler, ChannelTracker, FrameDebugger, ProfileReport } from "@obx/profiler";

const cpu = new CpuProfiler();
const memory = new MemoryProfiler();
const netChannel = new ChannelTracker("network");
const frames = new FrameDebugger();

cpu.begin("world");
const sim = new WorldSimulation({ seed: 21, daysPerSeason: 30, population: { village: 42, city: 180, camp: 9 } });
const seasonReport = [];
for (let i = 0; i < 3; i += 1) {
  seasonReport.push(sim.advance(30));
}
const demographics = sim.demographics;
const worldEvents = sim.events;

const streamer = new AsyncStreamer({ budgetPerTick: 3, maxQueue: 8 });
for (const id of ["cell_0_0", "cell_1_0", "cell_0_1", "cell_1_1", "cell_2_0"]) {
  streamer.enqueue({ id, priority: id === "cell_1_0" ? 10 : 1, load: () => `mesh:${id}` });
}
const loadA = streamer.tick().loaded;
const loadB = streamer.tick().loaded;
streamer.unload("cell_0_0");

const hlod = new HlodSystem();
hlod.register("rock", 2, 2);
hlod.register("tower", 22, 4);
hlod.register("mountain", 120, 60);
const lodRows = hlod.resolve({ x: 0, y: 0 });

const occlusion = new OcclusionGrid(24, 16);
occlusion.block(10, 2, 10, 13);
const visibleTargets = occlusion.query({ x: 2, y: 8 }, [
  { id: "left", x: 6, y: 8 },
  { id: "behind", x: 18, y: 8 },
  { id: "gap", x: 18, y: 1 },
]);
cpu.advance(2.4);
cpu.end("world");

cpu.begin("ai");
const heroBrain = new CombatBrain({ health: 88, aggression: 0.75 });
const combatMoves = [
  heroBrain.perceive({ distance: 7, threat: 0.25, allies: 1, ammo: 18 }),
  heroBrain.perceive({ distance: 28, threat: 0.1, allies: 0, ammo: 18 }),
  heroBrain.perceive({ distance: 6, threat: 0.4, allies: 0, ammo: 1 }),
];
heroBrain.damage(70);
combatMoves.push(heroBrain.perceive({ distance: 9, threat: 0.6, allies: 0, ammo: 12 }));

const deer = new WildlifeBrain({ seed: 9, fear: 0.85, hunger: 0.6, fleeRadius: 14 });
const wildlifeMoves = [
  deer.perceive({ predatorDistance: 4, foodDistance: 8, herdSize: 1 }),
  deer.perceive({ predatorDistance: 30, foodDistance: 2, herdSize: 1 }),
  deer.perceive({ predatorDistance: 30, foodDistance: 25, herdSize: 5 }),
];
cpu.advance(1.2);
cpu.end("ai");

cpu.begin("multiplayer");
const lobby = new Lobby();
lobby.join({ id: "ada", name: "Ada", skill: 1240, ready: false });
lobby.join({ id: "bob", name: "Bob", skill: 1180, ready: false });
lobby.ready("ada");
lobby.ready("bob");
lobby.say("ada", "gl hf");
const rooms = new RoomManager({ maxRooms: 4, defaultCapacity: 4 });
const room = rooms.create("ada", { name: "Dust2" });
rooms.join(room.id, "bob");
const matchmaking = new Matchmaking({ matchSize: 2, skillRange: 80 });
matchmaking.enqueue({ id: "ada", skill: 1240 });
matchmaking.enqueue({ id: "bob", skill: 1180 });
matchmaking.enqueue({ id: "cat", skill: 2100 });
const matches = matchmaking.tick();
const hooks = new AntiCheatHooks();
hooks.register("speed", (event) => Number(event.data.speed ?? 0) <= 10);
hooks.register("ammo", (event) => Number(event.data.ammo ?? 0) >= 0);
const auditClean = hooks.audit({ playerId: "ada", type: "move", data: { speed: 6, ammo: 12 } });
const auditCheat = hooks.audit({ playerId: "cat", type: "move", data: { speed: 40, ammo: -3 } });
cpu.advance(0.6);
cpu.end("multiplayer");

frames.beginFrame(1);
const fog = new HeightFog({ density: 0.045, heightFalloff: 0.22, baseHeight: 0, color: [122, 138, 162] });
const water = new WaterSurface();
const rng = new Random(33);
const instancer = new FoliageInstancer({ cellSize: 20 });
const foliage = instancer.scatter({ x0: 0, y0: 92, x1: 320, y1: 168 }, 220, () => rng.next());
const decals = new DecalProjector();
decals.project({ x: 140, y: 130, width: 26, height: 10, rotation: 0, source: "crater" });
decals.project({ x: 210, y: 140, width: 14, height: 8, rotation: 0.4, source: "scorch" });
memory.alloc("textures", 512 * 1024);
memory.alloc("textures", 256 * 1024);
memory.alloc("meshes", 384 * 1024);
memory.free("textures", 128 * 1024);
netChannel.record("bytes", 1800);
netChannel.record("bytes", 2400);
netChannel.record("packets", 42);
cpu.advance(16);
frames.drawCall(1, 220 * 2);
frames.drawCall(2, 90);
frames.event("shadow-pass");
frames.event("water-pass");

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

for (let y = 12; y < 210; y += 1) {
  const t = (y - 12) / 198;
  const heightFactor = fog.factorAt(80 * (1 - t), 40);
  const sky = fog.shade([52, 74, 112], 80 * (1 - t), 40);
  fillRect(0, y, W, 1, sky);
}
for (let x = 0; x < W; x += 2) {
  const wave = water.height(x * 0.05, 1.2, 1.4);
  const horizon = 168 + Math.round(wave * 10);
  const depth = fog.shade([24, 62, 96], 4, 26);
  drawLine(x, horizon, x, 214, depth, 2);
  if (water.foam(x * 0.05, 1.2, 1.4)) fillRect(x, horizon - 2, 2, 2, brand.light, 0.7);
}
for (const instance of foliage) {
  const px0 = instance.x * 2;
  const py0 = 92 + (instance.y - 92) * 0.72;
  const shade = fog.shade([38 + instance.variant * 12, 96, 44], 12, 22);
  fillRect(px0, py0, 3, 3 + instance.scale * 3, shade, 0.9);
}
for (const decal of decals.overlapping({ x0: 0, y0: 0, x1: 400, y1: 200 })) {
  const color = decal.source === "crater" ? [58, 48, 42] : [42, 38, 36];
  fillRect(decal.x * 2 - decal.width, 120 + decal.y * 0.3, decal.width * 2, decal.height, color, 0.85);
}
fillRect(0, 210, W, 150, brand.obsidian, 1);
fillRect(0, 208, W, 3, brand.fox, 1);
label(14, 216, "OBX 0.96 ADVANCED SYSTEMS", brand.ember, 2);

const panel = (x, y, w, h) => {
  fillRect(x, y, w, h, brand.surface, 1);
  strokeRect(x, y, w, h, brand.border, 1);
};
panel(8, 234, 196, 118);
panel(212, 234, 200, 118);
panel(420, 234, 212, 118);

label(16, 242, "WORLD + AI", brand.slate);
label(16, 258, seasonReport.map((s) => s.season).join(">"), brand.cyan, 1);
label(16, 272, "events " + worldEvents.length + " pop city " + demographics.city, brand.light, 1);
label(16, 286, "stream " + loadA.join(",") + " +" + loadB.length, brand.slate, 1);
label(16, 300, "lod " + lodRows.map((r) => r.mesh[0]).join("/") + " vis " + visibleTargets.join(","), brand.slate, 1);
label(16, 314, "combat " + combatMoves.join(">"), brand.ember, 1);
label(16, 328, "wildlife " + wildlifeMoves.join(">"), brand.ember, 1);
label(16, 342, "audit clean " + auditClean.ok + " cheat " + auditCheat.ok, brand.fox, 1);

label(220, 242, "MULTIPLAYER", brand.slate);
label(220, 258, "lobby ready " + lobby.allReady() + " msg " + lobby.messages.length, brand.cyan, 1);
label(220, 272, "room " + room.name + " x" + rooms.get(room.id).players.length, brand.light, 1);
label(220, 286, "match " + (matches[0] ? matches[0].players.join("+") : "-"), brand.light, 1);
label(220, 300, "queued " + matchmaking.queued.join(","), brand.slate, 1);
label(220, 314, "hooks " + hooks.hooks.join(","), brand.slate, 1);
label(220, 328, "violations cat " + hooks.violationsFor("cat").length, brand.fox, 1);
label(220, 342, "roomcount " + rooms.count + " avg skill " + (matches[0] ? matches[0].averageSkill : 0), brand.slate, 1);

label(428, 242, "PROFILER", brand.slate);
const cpuReport = cpu.report();
cpuReport.forEach((entry, i) => {
  label(428, 258 + i * 14, entry.name + " " + entry.total + "ms", brand.light, 1);
});
label(428, 300, "mem " + Math.round(memory.totalCurrent / 1024) + "kb peak " + Math.round(memory.totalPeak / 1024) + "kb", brand.cyan, 1);
label(428, 314, "net bytes " + netChannel.report().bytes.total + " pkt 42", brand.slate, 1);
frames.drawCall(3, 20);
frames.endFrame();
const drawStats = frames.drawStats();
label(428, 328, "draws " + drawStats.calls + " tris " + drawStats.triangles, brand.slate, 1);
label(428, 342, "frames " + drawStats.frames + " foliage " + foliage.length, brand.slate, 1);

cpu.advance(1);
cpu.begin("report");
const bundle = ProfileReport.combine(cpu, memory, [netChannel], frames);
cpu.end("report");

const frame = { width: W, height: H, data: backend.pixels };
mkdirSync("output", { recursive: true });
writeFileSync("output/frame.png", encodePng(frame));

const stats = {
  version: "0.96.0",
  world: {
    seasons: seasonReport.map((s) => s.season),
    finalDay: seasonReport[seasonReport.length - 1].day,
    demographics,
    events: worldEvents.map((e) => e.type),
    streamLoaded: [...loadA, ...loadB],
    streamerStats: streamer.stats,
    lod: lodRows,
    visibleTargets,
  },
  ai: { combat: combatMoves, wildlife: wildlifeMoves, heroHealth: heroBrain.health },
  multiplayer: {
    lobbyReady: lobby.allReady(),
    messages: lobby.messages.length,
    room: rooms.get(room.id),
    match: matches[0] ?? null,
    queued: matchmaking.queued,
    auditClean,
    auditCheat,
  },
  profiler: {
    cpu: cpu.report(),
    memory: memory.snapshot(),
    network: netChannel.report(),
    drawStats,
    frames: frames.captured.length,
  },
  rendering: {
    foliage: foliage.length,
    batches: instancer.batches().length,
    decals: decals.count,
    fogSample: Number(fog.factorAt(10, 30).toFixed(3)),
    waveSample: Number(water.height(1, 2, 0.5).toFixed(3)),
  },
};
writeFileSync("output/stats.json", JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
