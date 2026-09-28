import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Vec3 } from "@obx/math";
import { Body, PhysicsWorld, boxShape, planeShape, sphereShape, characterInput, Body as RigidBody } from "@obx/physics";
import { Character } from "@obx/character";
import { AudioMixer, EchoEffect, Envelope, createToneClip } from "@obx/audio";
import {
  AnimationClip,
  AnimationPlayer,
  AnimationTrack,
} from "@obx/animation";
import {
  SaveSystem,
  MemoryStorage,
} from "@obx/save";
import {
  createUiNode,
  append,
  layout,
  paint,
  uiStyle,
  defaultTheme,
} from "@obx/ui";
import { SoftwareBackend, encodePng } from "@obx/rendering";

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, "output");
mkdirSync(outputDir, { recursive: true });

const world = new PhysicsWorld({ gravity: new Vec3(0, -20, 0) });
world.addBody(new RigidBody({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0), friction: 0.8 }));
world.addBody(new RigidBody({ type: "static", shape: boxShape(new Vec3(2, 0.3, 1)), position: new Vec3(6, 1.2, 0), friction: 0.8 }));
world.addBody(new RigidBody({ type: "static", shape: boxShape(new Vec3(1.6, 0.3, 1)), position: new Vec3(11, 2.6, 0), friction: 0.8 }));

const balls = [
  world.addBody(new Body({ shape: sphereShape(0.5), position: new Vec3(2.2, 6, 0), restitution: 0.55, friction: 0.3 })),
  world.addBody(new Body({ shape: sphereShape(0.35), position: new Vec3(3.2, 8, 0), restitution: 0.5, friction: 0.3 })),
  world.addBody(new Body({ shape: sphereShape(0.42), position: new Vec3(4.1, 10, 0), restitution: 0.45, friction: 0.3 })),
];
const crates = [
  world.addBody(new Body({ shape: boxShape(new Vec3(0.45, 0.45, 0.45)), position: new Vec3(8, 4, 0), restitution: 0.1, friction: 0.6 })),
  world.addBody(new Body({ shape: boxShape(new Vec3(0.45, 0.45, 0.45)), position: new Vec3(8.1, 5.2, 0), restitution: 0.1, friction: 0.6 })),
];

const character = new Character(world, {
  position: new Vec3(0.6, 0.42, 0),
  walkSpeed: 3.2,
  runSpeed: 6,
  jumpSpeed: 7,
  maxHealth: 100,
  maxStamina: 100,
});
character.equipment.equip({ id: "boots", slot: "feet", modifiers: { moveSpeedMultiplier: 1.15 } });

const bobClip = new AnimationClip(
  "walk-bob",
  1,
  [
    new AnimationTrack("root.position", [
      { time: 0, value: new Vec3(0, 0, 0) },
      { time: 0.25, value: new Vec3(0, 0.08, 0) },
      { time: 0.5, value: new Vec3(0, 0, 0) },
      { time: 0.75, value: new Vec3(0, 0.08, 0) },
      { time: 1, value: new Vec3(0, 0, 0) },
    ]),
  ],
  true,
);
const bob = new AnimationPlayer(bobClip);

for (let step = 0; step < 260; step += 1) {
  const t = step / 60;
  const jump = step === 90 || step === 190;
  character.update(
    1 / 60,
    characterInput({ move: new Vec3(1, 0, 0), run: step > 120 && step < 200, jump }),
    world,
  );
  world.step(1 / 60);
  bob.update(1 / 60);
  void t;
}
const bobPose = bob.evaluate();
const bobY = bobPose.get("root.position").y;

const save = new SaveSystem({ storage: new MemoryStorage(), compression: true });
const snapshot = { x: character.position.x, y: character.position.y, balls: balls.map((ball) => ball.position.y) };
save.register({
  id: "sim",
  version: 1,
  serialize: () => snapshot,
  deserialize: () => undefined,
});
const slot = save.save("v05-demo");

const mixer = new AudioMixer();
const stepSound = createToneClip("step", 220, 0.12, { sampleRate: 22050, amplitude: 0.6, waveform: "triangle" });
mixer.buses.get("sfx").effects.push(new EchoEffect(0.08, 0.35, 0.4));
mixer.play(stepSound, {
  envelope: Envelope.adsr(0.01, 0.05, 0.4, 0.06),
  volume: 0.8,
  bus: "sfx",
});
const audioBuffer = new Float32Array(22050);
mixer.render(audioBuffer, 11025, 22050, 2);
let rms = 0;
for (let i = 0; i < audioBuffer.length; i += 1) rms += (audioBuffer[i] ?? 0) ** 2;
rms = Math.sqrt(rms / audioBuffer.length);

const width = 640;
const height = 360;
const backend = new SoftwareBackend(width, height);
const px = backend.pixels;

const cameraX = Math.max(3.5, Math.min(character.position.x - 4, 12.5));
const cameraY = 3.2;
const zoom = 32;

function fillRect(x0, y0, w, h, color) {
  const xs = Math.max(0, Math.floor(x0));
  const xe = Math.min(width - 1, Math.ceil(x0 + w));
  const ys = Math.max(0, Math.floor(y0));
  const ye = Math.min(height - 1, Math.ceil(y0 + h));
  for (let y = ys; y <= ye; y += 1) {
    for (let x = xs; x <= xe; x += 1) {
      const index = (y * width + x) * 4;
      px[index] = color[0];
      px[index + 1] = color[1];
      px[index + 2] = color[2];
      px[index + 3] = 255;
    }
  }
}
function fillCircle(cx, cy, radius, color) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > radius * radius) continue;
      const index = (y * width + x) * 4;
      px[index] = color[0];
      px[index + 1] = color[1];
      px[index + 2] = color[2];
      px[index + 3] = 255;
    }
  }
}
function worldToPixel(wx, wy) {
  return [(wx - cameraX) * zoom + width / 2, height / 2 - (wy - cameraY) * zoom];
}

fillRect(0, 0, width, height, [11, 14, 20]);
const [gx, gy] = worldToPixel(-2, 0.4);
fillRect(gx, gy, 22 * zoom, 0.8 * zoom, [50, 64, 96]);
const [p1x, p1y] = worldToPixel(4, 1.8);
fillRect(p1x, p1y, 4 * zoom, 0.6 * zoom, [70, 90, 130]);
const [p2x, p2y] = worldToPixel(9.4, 3.2);
fillRect(p2x, p2y, 3.2 * zoom, 0.6 * zoom, [70, 90, 130]);
for (const crate of crates) {
  const [cx, cy] = worldToPixel(crate.position.x - 0.45, crate.position.y + 0.45);
  fillRect(cx, cy, 0.9 * zoom, 0.9 * zoom, [255, 138, 26]);
}
const [chx, chy] = worldToPixel(character.position.x - 0.35, character.position.y + 0.42 + bobY);
fillRect(chx, chy, 0.7 * zoom, 0.84 * zoom, [65, 224, 255]);
fillRect(chx, chy, 0.7 * zoom, 0.22 * zoom, [38, 150, 190]);
const ballColors = [
  [255, 106, 26],
  [255, 176, 32],
  [65, 224, 255],
];
balls.forEach((ball, index) => {
  const [pxX, pxY] = worldToPixel(ball.position.x, ball.position.y);
  fillCircle(pxX, pxY, ball.shape.radius * zoom, ballColors[index]);
});

const hud = createUiNode("panel", {
  style: uiStyle({
    width: 210,
    height: 84,
    position: "absolute",
    anchorX: 0,
    anchorY: 0,
    x: 12,
    y: 12,
    color: "rgba(27,35,51,0.95)",
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
    gap: 8,
    radius: 8,
    borderColor: defaultTheme.primary,
    borderWidth: 2,
  }),
});
append(hud, createUiNode("panel", {
  style: uiStyle({ width: 176, height: 12, color: "#FF4D4D", radius: 4 }),
}));
append(hud, createUiNode("panel", {
  style: uiStyle({ width: 132, height: 12, color: "#FFB020", radius: 4 }),
}));
append(hud, createUiNode("slider", {
  style: uiStyle({ width: 176, height: 14, color: "#2A3550", textColor: "#41E0FF" }),
  min: 0,
  max: 1,
  value: 0.66,
}));
const hudMap = layout(hud, { x: 0, y: 0, width, height });
const commands = paint(hud, hudMap);
for (const command of commands) {
  if (command.kind !== "rect") continue;
  let color = [27, 35, 51];
  let alpha = command.opacity;
  if (command.color.startsWith("#")) {
    color = [
      parseInt(command.color.slice(1, 3), 16),
      parseInt(command.color.slice(3, 5), 16),
      parseInt(command.color.slice(5, 7), 16),
    ];
  } else if (command.color.startsWith("rgba(")) {
    const parts = command.color.slice(5, -1).split(",").map(Number);
    color = [parts[0], parts[1], parts[2]];
    alpha *= parts[3];
  }
  const x0 = Math.max(0, Math.floor(command.rect.x));
  const y0 = Math.max(0, Math.floor(command.rect.y));
  const x1 = Math.min(width - 1, Math.ceil(command.rect.x + command.rect.width));
  const y1 = Math.min(height - 1, Math.ceil(command.rect.y + command.rect.height));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = (y * width + x) * 4;
      px[index] = Math.round((px[index] ?? 0) * (1 - alpha) + color[0] * alpha);
      px[index + 1] = Math.round((px[index + 1] ?? 0) * (1 - alpha) + color[1] * alpha);
      px[index + 2] = Math.round((px[index + 2] ?? 0) * (1 - alpha) + color[2] * alpha);
    }
  }
}

const png = encodePng({ width, height, data: px });
writeFileSync(join(outputDir, "frame.png"), png);

console.log("v05-demo frame written", {
  width,
  height,
  characterX: Number(character.position.x.toFixed(3)),
  characterState: character.state,
  bobY: Number(bobY.toFixed(3)),
  ballHeights: balls.map((ball) => Number(ball.position.y.toFixed(2))),
  saveChecksum: slot.checksum,
  audioRms: Number(rms.toFixed(4)),
  uiCommands: commands.length,
});
