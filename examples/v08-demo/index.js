import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ItemRegistry, Inventory, Equipment } from "@obx/inventory";
import { DialogueGraph, DialogueRunner, LocalizedText } from "@obx/dialogue";
import { QuestSystem } from "@obx/quest";
import { DayNightCycle, Heightfield } from "@obx/world";
import { SoftwareBackend, encodePng } from "@obx/rendering";

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, "output");
mkdirSync(outputDir, { recursive: true });

const items = new ItemRegistry();
items.define({ id: "herb", name: "Herb", maxStack: 10, weight: 0.2, tags: ["consumable"] });
items.define({ id: "coin", name: "Coin", maxStack: 99, weight: 0.01, metadata: { value: 1 } });
items.define({ id: "sword", name: "Sword", weight: 3, maxDurability: 100, tags: ["weapon"], equipmentSlot: "main" });
items.define({ id: "helmet", name: "Helmet", weight: 1.5, maxDurability: 60, equipmentSlot: "head" });
items.define({ id: "potion", name: "Potion", maxStack: 5, weight: 0.4, tags: ["consumable"] });

const bag = new Inventory({ slots: 12, maxWeight: 20 });
const gear = new Equipment({ slots: ["main", "head"] });
bag.add(items.create("sword"));
bag.add(items.create("helmet"));
bag.add(items.create("potion", 2));

const dialogueNodes = [
  {
    id: "greet",
    speaker: "Merchant",
    text: "quest.offer",
    voice: "merchant_offer",
    choices: [
      { id: "accept", text: "quest.accept", next: "accept" },
      { id: "price", text: "shop.price", next: "price" },
      { id: "vip", text: "shop.vip", condition: (vars) => vars.get("vip", false), next: "vip" },
    ],
  },
  { id: "accept", speaker: "Merchant", text: "quest.thanks", effects: [(vars) => vars.set("deal", true)], next: "bye" },
  { id: "price", speaker: "Merchant", text: "shop.quote", next: "bye" },
  { id: "vip", speaker: "Merchant", text: "shop.vipLine", next: "bye" },
  { id: "bye", speaker: "Merchant", text: "farewell", next: null },
];

const locales = new LocalizedText({
  en: {
    "quest.offer": "Herbs for the healer?",
    "quest.accept": "I will gather them",
    "shop.price": "What do you charge?",
    "shop.vip": "VIP?",
    "shop.quote": "Five coins a bundle",
    "shop.vipLine": "Members only",
    "quest.thanks": "Bless you",
    farewell: "Safe roads",
  },
  fa: {
    "quest.offer": "برای درمانگر گیاه داری؟",
    "quest.accept": "جمع می‌کنم",
  },
});

const graph = new DialogueGraph(dialogueNodes);
const runner = new DialogueRunner(graph, {
  locale: "en",
  text: (key, locale) => locales.resolve(key, locale),
});

const quests = [
  {
    id: "herbs",
    title: "Gather herbs",
    objectives: [
      { id: "collect", type: "collect", target: "herb", count: 5 },
      { id: "bonus", type: "talk", target: "healer", count: 1, optional: true },
    ],
    rewards: { items: [{ id: "coin", count: 10 }], flags: ["herbs_done"] },
    next: ["cure"],
  },
  {
    id: "cure",
    title: "Cure the elder",
    prerequisites: ["herbs"],
    objectives: [
      { id: "deliver", type: "talk", target: "elder", count: 1 },
      { id: "hunt", type: "kill", target: "wolf", count: 3 },
    ],
  },
];

const log = new QuestSystem(quests);
const events = [];

runner.start("greet");
events.push(`speak:${runner.current?.id}`);
const visibleChoices = runner.availableChoices().map((choice) => choice.id);
runner.choose("accept");
events.push(`choose:accept->${runner.current?.id}`);
runner.advance();
events.push(`advance:${runner.current?.id ?? "end"}`);
runner.advance();

log.start("herbs");
events.push("quest:start:herbs");
for (let i = 0; i < 5; i += 1) {
  bag.add(items.create("herb", 1));
  log.notify({ type: "collect", target: "herb", count: 1 });
  events.push(`collect:herb:${log.progress("herbs", "collect")}`);
}
const rewards = log.claimRewards("herbs");
for (const entry of rewards?.items ?? []) {
  const leftover = bag.add(items.create(entry.id, entry.count));
  events.push(`reward:${entry.id}:${entry.count - leftover}`);
}
events.push(`quest:status:${log.status("herbs")}`);

const unlocked = log.available();
log.start("cure");
events.push("quest:start:cure");
log.notify({ type: "talk", target: "elder" });
log.notify({ type: "kill", target: "wolf", count: 2 });
events.push(`cure:progress:${log.progress("cure", "hunt")}/3`);

const swordSlot = bag.find("sword");
if (swordSlot) {
  const sword = bag.remove(swordSlot.index);
  if (sword) {
    const previous = gear.equip(sword, "main");
    events.push(`equip:sword${previous ? ":replaced" : ""}`);
  }
}
const helmetSlot = bag.find("helmet");
if (helmetSlot) {
  const helmet = bag.remove(helmetSlot.index);
  if (helmet) {
    gear.equip(helmet, "head");
    events.push("equip:helmet");
  }
}

const width = 640;
const height = 360;
const backend = new SoftwareBackend(width, height);
const px = backend.pixels;

const cycle = new DayNightCycle({ dayLength: 400, start: 0.68 });
for (let i = 0; i < 40; i += 1) cycle.update(1);
const sun = cycle.sunColor;
const ambient = cycle.ambient;

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

function strokeRect(x0, y0, w, h, color, thickness = 2) {
  fillRect(x0, y0, w, thickness, color);
  fillRect(x0, y0 + h - thickness, w, thickness, color);
  fillRect(x0, y0, thickness, h, color);
  fillRect(x0 + w - thickness, y0, thickness, h, color);
}

fillRect(0, 0, width, height, [11, 14, 20], 1);

const field = Heightfield.generate(64, 5, { seed: 19, amplitude: 8, frequency: 0.2, octaves: 3 });
for (let x = 0; x < 64; x += 1) {
  const h = field.sample(x + 0.5, 2.5);
  const bar = Math.round(20 + h * 12);
  fillRect(x * 10, 0, 10, 24, [bar * 0.5, bar * 0.8, bar * 0.55], 1);
}
fillRect(0, 24, width, 3, [255, 106, 26], 1);
fillRect(0, 27, width, 1, [255, 176, 32], 1);

const panel = [27, 35, 51];
const panelDark = [20, 26, 38];
const border = [42, 53, 80];
const itemColors = {
  herb: [76, 175, 80],
  coin: [255, 176, 32],
  sword: [255, 106, 26],
  helmet: [138, 148, 166],
  potion: [220, 72, 72],
};

fillRect(16, 40, 200, 200, panel, 1);
strokeRect(16, 40, 200, 200, border, 1);
fillRect(24, 48, 60, 6, [255, 176, 32], 1);
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 3; col += 1) {
    const cellX = 28 + col * 60;
    const cellY = 66 + row * 42;
    fillRect(cellX, cellY, 50, 34, panelDark, 1);
    strokeRect(cellX, cellY, 50, 34, border, 1);
  }
}
const slotOrder = bag.slots.map((item, index) => ({ item, index })).filter((entry) => entry.item);
slotOrder.forEach((entry, order) => {
  const col = order % 3;
  const row = Math.floor(order / 3);
  const cellX = 28 + col * 60;
  const cellY = 66 + row * 42;
  const color = itemColors[entry.item.id] ?? [232, 236, 242];
  fillRect(cellX + 8, cellY + 7, 34, 20, color, 1);
  const dots = Math.min(6, entry.item.count);
  for (let d = 0; d < dots; d += 1) {
    fillCircle(cellX + 12 + d * 6, cellY + 31, 1.6, [232, 236, 242], 0.9);
  }
});

fillRect(232, 40, 200, 200, panel, 1);
strokeRect(232, 40, 200, 200, border, 1);
fillRect(240, 48, 60, 6, [65, 224, 255], 1);
fillCircle(282, 118, 26, [11, 14, 20], 1);
fillCircle(282, 118, 22, [65, 224, 255], 1);
fillCircle(372, 118, 26, [11, 14, 20], 1);
fillCircle(372, 118, 22, [255, 106, 26], 1);
fillRect(302, 168, 112, 40, panelDark, 1);
strokeRect(302, 168, 112, 40, [255, 176, 32], 2);
fillRect(312, 176, 92, 8, [232, 236, 242], 0.9);
fillRect(312, 190, 64, 6, [138, 148, 166], 0.8);
const choiceColors = [
  [255, 176, 32],
  [255, 176, 32],
  [138, 148, 166],
];
choiceColors.forEach((color, index) => {
  fillRect(240 + index * 66, 212, 58, 22, panelDark, 1);
  strokeRect(240 + index * 66, 212, 58, 22, color, index === 0 ? 3 : 1);
});

fillRect(448, 40, 176, 200, panel, 1);
strokeRect(448, 40, 176, 200, border, 1);
fillRect(456, 48, 60, 6, [76, 175, 80], 1);
const questRows = [
  { label: [232, 236, 242], fill: 1, check: [76, 175, 80], status: log.status("herbs") },
  { label: [138, 148, 166], fill: 2 / 3, check: [255, 176, 32], status: log.status("cure") },
];
questRows.forEach((row, index) => {
  const y = 76 + index * 56;
  fillRect(464, y, 92, 8, row.label, 0.9);
  fillRect(464, y + 16, 132, 12, panelDark, 1);
  fillRect(464, y + 16, 132 * row.fill, 12, row.check, 1);
  fillCircle(612, y + 22, 7, row.status === "completed" ? [76, 175, 80] : [255, 176, 32], 1);
  fillCircle(612, y + 22, 3, [11, 14, 20], 1);
});
fillRect(464, 196, 132, 28, panelDark, 1);
strokeRect(464, 196, 132, 28, border, 1);
fillRect(472, 204, 40, 12, [255, 106, 26], 1);
fillRect(524, 204, 40, 12, [138, 148, 166], 1);

fillRect(16, 252, 608, 92, panel, 1);
strokeRect(16, 252, 608, 92, border, 1);
fillRect(24, 260, 60, 6, [232, 236, 242], 1);
const equipmentBoxes = [
  { x: 32, color: itemColors.sword, active: gear.get("main") !== null },
  { x: 104, color: itemColors.helmet, active: gear.get("head") !== null },
  { x: 176, color: [42, 53, 80], active: false },
];
for (const box of equipmentBoxes) {
  fillRect(box.x, 278, 56, 52, panelDark, 1);
  strokeRect(box.x, 278, 56, 52, box.active ? [255, 176, 32] : border, box.active ? 2 : 1);
  if (box.active) fillRect(box.x + 10, 292, 36, 24, box.color, 1);
}
const weightRatio = Math.min(1, bag.weight / bag.maxWeight);
fillRect(260, 288, 200, 16, panelDark, 1);
fillRect(260, 288, 200 * weightRatio, 16, [65, 224, 255], 1);
strokeRect(260, 288, 200, 16, border, 1);
fillRect(480, 288, 130, 16, panelDark, 1);
fillRect(480, 288, 130 * (log.progress("cure", "hunt") / 3), 16, [255, 106, 26], 1);
strokeRect(480, 288, 130, 16, border, 1);

const png = encodePng({ width, height, data: backend.pixels });
writeFileSync(join(outputDir, "frame.png"), png);

const stats = {
  dialogue: {
    startedAt: "greet",
    endedAt: runner.current?.id ?? null,
    finished: runner.finished,
    visibleChoices,
    historyLength: runner.history.length,
    localeSample: locales.resolve("quest.offer", "fa"),
  },
  quests: {
    herbs: log.status("herbs"),
    cure: log.status("cure"),
    herbsProgress: log.progress("herbs", "collect"),
    cureHunt: log.progress("cure", "hunt"),
    followUps: log.followUps("herbs"),
    flag: log.hasFlag("herbs_done"),
  },
  inventory: {
    weight: Number(bag.weight.toFixed(2)),
    maxWeight: bag.maxWeight,
    usedSlots: bag.usedSlots,
    herbs: bag.count("herb"),
    coins: bag.count("coin"),
    potions: bag.count("potion"),
  },
  equipment: {
    main: gear.get("main")?.id ?? null,
    head: gear.get("head")?.id ?? null,
    durability: gear.totalDurability(),
  },
  world: {
    sunElevation: Number(cycle.sunElevation.toFixed(3)),
    ambient: Number(ambient.toFixed(3)),
  },
  events,
  unlocked,
};
writeFileSync(join(outputDir, "stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
console.log(JSON.stringify(stats, null, 2));
