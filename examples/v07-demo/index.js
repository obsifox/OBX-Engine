import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Random } from "@obx/core";
import {
  DayNightCycle,
  Heightfield,
  WorldPartition,
  WeatherScheduler,
} from "@obx/world";
import {
  AStar,
  Crowd,
  DynamicObstacle,
  NavGrid,
  PathAgent,
  lineOfSight,
  smoothPath,
} from "@obx/navigation";
import {
  NpcAgent,
  Perception,
  TreeBrain,
  patrolBrain,
} from "@obx/ai";
import { SoftwareBackend, encodePng } from "@obx/rendering";

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, "output");
mkdirSync(outputDir, { recursive: true });

const width = 640;
const height = 360;
const cols = 64;
const rows = 36;
const tileW = width / cols;
const tileH = height / rows;

const field = Heightfield.generate(cols, rows, { seed: 77, amplitude: 10, frequency: 0.11, octaves: 4 });
const grid = new NavGrid(cols, rows, 1);
for (let z = 0; z < rows; z += 1) {
  for (let x = 0; x < cols; x += 1) {
    const h = field.sample(x + 0.5, z + 0.5);
    const n = field.normal(x + 0.5, z + 0.5);
    if (h < 2.4 || n.y < 0.62) {
      grid.setWalkable(x, z, false);
    } else if (h < 3.4) {
      grid.setCost(x, z, 2.6);
    } else if (h > 8.2) {
      grid.setCost(x, z, 1.7);
    }
  }
}

const landslide = new DynamicObstacle({ x: 28, z: 22, width: 6, height: 3 });
landslide.apply(grid);

const astar = new AStar(grid);

function nearestWalkable(x, z) {
  for (let r = 0; r < 10; r += 1) {
    for (let dz = -r; dz <= r; dz += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const cell = grid.worldToCell(x + dx, z + dz);
        if (grid.isWalkable(cell.x, cell.z)) return grid.cellToWorld(cell.x, cell.z);
      }
    }
  }
  return { x, z };
}

const rng = new Random(4242);
const crowd = new Crowd();
const agents = [];
const paths = [];
for (let i = 0; i < 10; i += 1) {
  const start = nearestWalkable(2.5 + (i % 2) * 1.5, 3 + i * 3.1);
  const goal = nearestWalkable(61.5 - (i % 3), 3.5 + i * 3.0);
  const raw = astar.findPath(start, goal);
  const smooth = smoothPath(grid, raw);
  const agent = crowd.add(new PathAgent(grid, start.x, start.z, {
    speed: 4.6 + rng.range(0, 1.4),
    avoidanceRadius: 1.7,
    arrival: 0.3,
  }));
  agent.setPath(smooth);
  agents.push(agent);
  paths.push(smooth);
}

const player = { x: 10, z: 30 };
const npc = new NpcAgent({
  x: 32,
  z: 18,
  facing: 0,
  perception: new Perception({ visionRange: 14, visionAngle: 1.7, hearingRange: 15 }),
  brain: new TreeBrain(patrolBrain()),
});

const cycle = new DayNightCycle({ dayLength: 240, start: 0.23 });
const weather = new WeatherScheduler(new Random(31), 8);
const partition = new WorldPartition({
  chunkSize: 8,
  viewDistance: 48,
  unloadDistance: 64,
  budgetPerTick: 8,
  lodDistances: [16, 32],
});

const rainRandom = new Random(99);
const streaks = [];
for (let i = 0; i < 140; i += 1) {
  streaks.push({
    x: rainRandom.range(0, width),
    y: rainRandom.range(0, height),
    speed: rainRandom.range(140, 240),
    length: rainRandom.range(10, 22),
  });
}

let captureStep = -1;
let steps = 0;
for (let step = 0; step < 240; step += 1) {
  if (captureStep >= 0 && step >= captureStep) break;
  steps = step + 1;
  cycle.update(1);
  const state = weather.update(1);
  crowd.update(0.35);
  player.x = 10 + step * 0.18;
  player.z = 30 + Math.sin(step * 0.03) * 2;
  const spotted = npc.perceive(
    player,
    npc.facing,
    (from, to) => !lineOfSight(grid, from, to),
  );
  npc.update(0.35);
  const mode = npc.blackboard.get("npc.mode", "patrol");
  const toPlayerX = player.x - npc.x;
  const toPlayerZ = player.z - npc.z;
  const toPlayerLength = Math.hypot(toPlayerX, toPlayerZ) || 1;
  if (mode === "chase") {
    npc.move((toPlayerX / toPlayerLength) * 0.22, (toPlayerZ / toPlayerLength) * 0.22);
    npc.facing = Math.atan2(toPlayerX, toPlayerZ);
  } else {
    npc.facing = Math.sin(step * 0.05) * 1.1;
  }
  if (step % 10 === 0) partition.update(npc.x, npc.z, step);
  if (captureStep < 0 && step >= 108 && spotted && state.intensity > 0.5) {
    captureStep = step;
  }
  if (captureStep < 0 && step === 126) {
    captureStep = step;
  }
}

const backend = new SoftwareBackend(width, height);
const px = backend.pixels;
const sun = cycle.sunColor;
const ambient = cycle.ambient;
const elevation = cycle.sunElevation;
const sunLength = Math.hypot(0.35, Math.max(0.12, elevation), 0.25);
const sunDir = { x: 0.35 / sunLength, y: Math.max(0.12, elevation) / sunLength, z: 0.25 / sunLength };
const weatherState = weather.state();

function blend(index, r, g, b, alpha) {
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

function terrainColor(h, x, z) {
  const wobble = ((x * 13 + z * 7) % 5) - 2;
  if (h < 2.4) return [30 + wobble, 56 + wobble, 96 + wobble * 2];
  if (h < 3.4) return [142 + wobble * 2, 124 + wobble, 88 + wobble];
  if (h < 6.2) return [50 + wobble * 2, 102 + wobble * 3, 54 + wobble];
  if (h < 8.2) return [96 + wobble * 2, 92 + wobble, 88 + wobble];
  return [172 + wobble, 180 + wobble, 192 + wobble];
}

for (let z = 0; z < rows; z += 1) {
  for (let x = 0; x < cols; x += 1) {
    const h = field.sample(x + 0.5, z + 0.5);
    const n = field.normal(x + 0.5, z + 0.5);
    const ndotl = Math.max(0, n.x * sunDir.x + n.y * sunDir.y + n.z * sunDir.z);
    const light = (0.32 + 0.72 * ambient) * (0.42 + 0.58 * ndotl);
    const base = terrainColor(h, x, z);
    const ripple = h < 2.4 ? Math.sin(x * 0.6 + z * 0.4 + steps * 0.12) * 5 : 0;
    const r = Math.min(255, (base[0] + ripple) * light * (0.55 + 0.45 * sun.r) * 1.5);
    const g = Math.min(255, (base[1] + ripple) * light * (0.55 + 0.45 * sun.g) * 1.5);
    const b = Math.min(255, (base[2] + ripple) * light * (0.55 + 0.45 * sun.b) * 1.5);
    fillRect(x * tileW, z * tileH, tileW + 1, tileH + 1, [r, g, b], 1);
  }
}

for (const cellX of [16, 32, 48]) {
  fillRect(cellX * tileW, 0, 1, height, [20, 26, 38], 0.35);
}
for (const cellZ of [12, 24]) {
  fillRect(0, cellZ * tileH, width, 1, [20, 26, 38], 0.35);
}

for (const path of paths) {
  for (let i = 0; i < path.length; i += 1) {
    const point = path[i];
    const next = path[i + 1] ?? point;
    const segments = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.z - point.z) / 0.55));
    for (let s = 0; s < segments; s += 1) {
      const t = segments === 1 ? 0 : s / segments;
      const pxX = (point.x + (next.x - point.x) * t) * tileW;
      const pxY = (point.z + (next.z - point.z) * t) * tileH;
      fillCircle(pxX, pxY, 1.7, [232, 236, 242], 0.22);
    }
  }
}

const coneRadius = 14;
const coneHalf = 0.85;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const dx = x / tileW - npc.x;
    const dz = y / tileH - npc.z;
    const distance = Math.hypot(dx, dz);
    if (distance > coneRadius) continue;
    let angle = Math.atan2(dx, dz) - npc.facing;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    if (Math.abs(angle) > coneHalf) continue;
    const falloff = 1 - (distance / coneRadius) * 0.75;
    blend((y * width + x) * 4, 255, 106, 26, 0.2 * falloff);
  }
}

const agentColors = [
  [255, 176, 32],
  [232, 236, 242],
  [138, 148, 166],
  [255, 106, 26],
  [65, 224, 255],
];
agents.forEach((agent, index) => {
  const color = agentColors[index % agentColors.length];
  fillCircle(agent.x * tileW, agent.z * tileH, 4.6, [11, 14, 20], 0.55);
  fillCircle(agent.x * tileW, agent.z * tileH, 3.4, color, 1);
  if (!agent.finished) {
    const target = agent.path[agent.pathIndex];
    if (target) {
      const dx = target.x - agent.x;
      const dz = target.z - agent.z;
      const length = Math.hypot(dx, dz) || 1;
      fillCircle(agent.x * tileW + (dx / length) * 5.5, agent.z * tileH + (dz / length) * 5.5, 1.5, color, 0.8);
    }
  }
});

fillCircle(npc.x * tileW, npc.z * tileH, 6.2, [11, 14, 20], 0.6);
fillCircle(npc.x * tileW, npc.z * tileH, 4.8, [255, 106, 26], 1);
fillCircle(npc.x * tileW + Math.sin(npc.facing) * 5, npc.z * tileH + Math.cos(npc.facing) * 5, 2, [255, 176, 32], 1);

fillCircle(player.x * tileW, player.z * tileH, 6.2, [11, 14, 20], 0.6);
fillCircle(player.x * tileW, player.z * tileH, 4.6, [65, 224, 255], 1);
fillCircle(player.x * tileW, player.z * tileH, 2.2, [232, 236, 242], 0.9);

const rainAlpha = weatherState.intensity * 0.55;
if (rainAlpha > 0.01) {
  for (const streak of streaks) {
    const y = ((streak.y + steps * streak.speed * 0.02) % (height + 40)) - 20;
    for (let s = 0; s < streak.length; s += 1) {
      const ix = Math.floor(streak.x - s * 0.45);
      const iy = Math.floor(y + s);
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue;
      blend((iy * width + ix) * 4, 170, 200, 235, rainAlpha * (1 - s / streak.length) * 0.75);
    }
  }
}

const fog = weatherState.type === "cloudy" || weatherState.type === "storm" ? weatherState.intensity * 0.16 : weatherState.intensity * 0.06;
if (fog > 0.005) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      blend((y * width + x) * 4, 150, 162, 182, fog);
    }
  }
}

const darkening = 1 - Math.min(0.15, Math.max(0, 0.55 - ambient) * 0.3);
if (darkening < 0.999) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      px[index] = Math.round((px[index] ?? 0) * darkening);
      px[index + 1] = Math.round((px[index + 1] ?? 0) * darkening);
      px[index + 2] = Math.round((px[index + 2] ?? 0) * darkening);
    }
  }
}

const png = encodePng({ width, height, data: px });
writeFileSync(join(outputDir, "frame.png"), png);

const reached = agents.filter((agent) => agent.finished).length;
const waypointCount = paths.reduce((total, path) => total + path.length, 0);
const stats = {
  steps,
  agents: agents.length,
  reached,
  averageWaypoints: Number((waypointCount / paths.length).toFixed(2)),
  npcMode: npc.blackboard.get("npc.mode", "patrol"),
  playerDistanceToNpc: Number(Math.hypot(player.x - npc.x, player.z - npc.z).toFixed(2)),
  weather: weatherState,
  sunElevation: Number(elevation.toFixed(3)),
  ambient: Number(ambient.toFixed(3)),
  dayTime: Number(cycle.time.toFixed(3)),
  loadedChunks: partition.loadedCount(),
  samples: { cols, rows, seed: 77 },
};
writeFileSync(join(outputDir, "stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
console.log(JSON.stringify(stats, null, 2));
