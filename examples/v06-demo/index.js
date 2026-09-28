import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Vec3 } from "@obx/math";
import { Random } from "@obx/core";
import { Body, PhysicsWorld, planeShape, boxShape } from "@obx/physics";
import { createCar, VehicleAI } from "@obx/vehicle";
import { ParticleEmitter, dustEmitter, sparksEmitter, smokeEmitter, rainEmitter } from "@obx/particles";
import { ScreenEffects, WeatherSystem, explosionEffect, impactEffect } from "@obx/vfx";
import { SoftwareBackend, encodePng } from "@obx/rendering";

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, "output");
mkdirSync(outputDir, { recursive: true });

const world = new PhysicsWorld({ gravity: new Vec3(0, -12, 0) });
world.addBody(new Body({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0), friction: 0.95 }));
world.addBody(new Body({ type: "static", shape: boxShape(new Vec3(1.4, 0.18, 1.2)), position: new Vec3(5.2, 0.35, 0), friction: 0.9 }));
const crates = [
  world.addBody(new Body({ shape: boxShape(new Vec3(0.4, 0.4, 0.4)), position: new Vec3(9.2, 0.9, 0), restitution: 0.05, friction: 0.6 })),
  world.addBody(new Body({ shape: boxShape(new Vec3(0.4, 0.4, 0.4)), position: new Vec3(10.1, 0.9, 0.2), restitution: 0.05, friction: 0.6 })),
  world.addBody(new Body({ shape: boxShape(new Vec3(0.4, 0.4, 0.4)), position: new Vec3(9.6, 1.75, -0.1), restitution: 0.05, friction: 0.6 })),
];

const car = createCar(world, { position: new Vec3(0.5, 1.2, 0) });
const waypoints = [
  { position: new Vec3(6, 0, 0), targetSpeed: 7 },
  { position: new Vec3(10.5, 0, 0), targetSpeed: 5.5 },
  { position: new Vec3(14, 0, 0), targetSpeed: 7 },
];
const ai = new VehicleAI(car, waypoints);

const random = new Random(2026);
const tireSmoke = new ParticleEmitter(dustEmitter({ rate: 0, maxParticles: 160, endSize: 0.6, seed: 11 }), 11);
const engineSmoke = new ParticleEmitter(smokeEmitter({ rate: 0, maxParticles: 80, endSize: 1.1, seed: 12 }), 12);
const impact = impactEffect(random);
const blast = explosionEffect(random);
const weather = new WeatherSystem(random);
weather.set("rain", 0.85);
weather.rain.config.spawnCenter.set(10, 5, 0);
const screen = new ScreenEffects();

let triggered = false;
let blastTriggered = false;
let captureStep = -1;

for (let step = 0; step < 320; step += 1) {
  if (captureStep >= 0 && step >= captureStep) break;
  const input = ai.step();
  car.update(1 / 60, input, world);
  world.step(1 / 60);
  tireSmoke.update(1 / 60);
  engineSmoke.update(1 / 60);
  if (triggered) impact.graph.update(1 / 60, screen);
  if (blastTriggered) blast.graph.update(1 / 60, screen);
  weather.update(1 / 60, new Vec3(0.8, 0, 0), world);
  screen.update(1 / 60);

  if (car.speed > 2.2 && step % 4 === 0) {
    for (const wheel of car.wheels) {
      const attach = wheel.attachPoint(car.body);
      if (!wheel.contact) continue;
      const particle = tireSmoke.particles.find((entry) => !entry.alive);
      if (particle) {
        particle.position.copy(attach);
        particle.velocity.set(-1.2 - random.range(0, 1), random.range(0.4, 1.2), random.range(-0.4, 0.4));
        particle.life = 0;
        particle.maxLife = random.range(0.5, 1.1);
        particle.startSize = random.range(0.25, 0.5);
        particle.size = particle.startSize;
        particle.alive = true;
      }
          }
  }
  if (!triggered && car.body.position.x > 4.6) {
    triggered = true;
    impact.graph.update(0.01, screen);
    const sparkParticle = impact.sparks.particles.find((entry) => !entry.alive);
    if (sparkParticle) {
      sparkParticle.position.copy(car.body.position);
      impact.sparks.burst(14);
    }
  }
  if (!blastTriggered && car.body.position.x > 8.4) {
    blastTriggered = true;
    captureStep = step + 30;
    blast.graph.update(0.01, screen);
    for (const crate of crates) {
      const away = crate.position.clone().sub(car.body.position).normalize();
      crate.applyImpulse(away.scale(1800).add(new Vec3(0, 900, 0)));
    }
    engineSmoke.burst(16);
    engineSmoke.particles.forEach((particle, index) => {
      if (particle.alive) {
        particle.position.copy(car.body.position).add(new Vec3(0, 0.4, 0));
        particle.velocity.set(Math.cos(index) * 1.5, 1.2 + index * 0.08, Math.sin(index) * 1.5);
      }
    });
  }
}

const width = 640;
const height = 360;
const backend = new SoftwareBackend(width, height);
const px = backend.pixels;

const cameraX = Math.max(2, Math.min(car.body.position.x - 4.6, 11.5));
const cameraY = 1.9;
const zoom = 30;

function fillRect(x0, y0, w, h, color, alpha = 1) {
  const xs = Math.max(0, Math.floor(x0));
  const xe = Math.min(width - 1, Math.ceil(x0 + w));
  const ys = Math.max(0, Math.floor(y0));
  const ye = Math.min(height - 1, Math.ceil(y0 + h));
  for (let y = ys; y <= ye; y += 1) {
    for (let x = xs; x <= xe; x += 1) {
      const index = (y * width + x) * 4;
      px[index] = Math.round((px[index] ?? 0) * (1 - alpha) + color[0] * alpha);
      px[index + 1] = Math.round((px[index + 1] ?? 0) * (1 - alpha) + color[1] * alpha);
      px[index + 2] = Math.round((px[index + 2] ?? 0) * (1 - alpha) + color[2] * alpha);
      px[index + 3] = 255;
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
      const index = (y * width + x) * 4;
      px[index] = Math.round((px[index] ?? 0) * (1 - alpha) + color[0] * alpha);
      px[index + 1] = Math.round((px[index + 1] ?? 0) * (1 - alpha) + color[1] * alpha);
      px[index + 2] = Math.round((px[index + 2] ?? 0) * (1 - alpha) + color[2] * alpha);
      px[index + 3] = 255;
    }
  }
}
function worldToPixel(wx, wy) {
  return [(wx - cameraX) * zoom + width / 2, height / 2 - (wy - cameraY) * zoom];
}

fillRect(0, 0, width, height, [16, 22, 34]);
fillRect(0, 0, width, height * 0.32, [22, 30, 46]);
const [gx, gy] = worldToPixel(-6, 0.25);
fillRect(gx, gy, 28 * zoom, 0.5 * zoom, [52, 64, 92]);
const [rx, ry] = worldToPixel(3.8, 0.55);
fillRect(rx, ry, 2.8 * zoom, 0.36 * zoom, [70, 88, 124]);

for (const crate of crates) {
  const [cx, cy] = worldToPixel(crate.position.x - 0.4, crate.position.y + 0.4);
  fillRect(cx, cy, 0.8 * zoom, 0.8 * zoom, [255, 138, 26]);
  fillRect(cx + 3, cy + 3, 0.8 * zoom - 6, 0.8 * zoom - 6, [190, 96, 20]);
}

const bodyPos = car.body.position;
const [bx, by] = worldToPixel(bodyPos.x - 1.05, bodyPos.y + 0.42);
fillRect(bx, by, 2.1 * zoom, 0.5 * zoom, [255, 106, 26]);
const [cx2, cy2] = worldToPixel(bodyPos.x - 0.55, bodyPos.y + 0.82);
fillRect(cx2, cy2, 1.15 * zoom, 0.34 * zoom, [255, 176, 32]);
for (const wheel of car.wheels) {
  const attach = wheel.attachPoint(car.body);
  const [wx, wy] = worldToPixel(attach.x, attach.y - 0.06);
  fillCircle(wx, wy, 0.34 * zoom, [34, 40, 54]);
  fillCircle(wx, wy, 0.17 * zoom, [138, 148, 166]);
}

for (const emitter of [tireSmoke, engineSmoke]) {
  for (const particle of emitter.particles) {
    if (!particle.alive) continue;
    const [ppx, ppy] = worldToPixel(particle.position.x, particle.position.y);
    const lifeT = particle.life / particle.maxLife;
    const color = emitter === engineSmoke
      ? [255 - lifeT * 90, 120 + lifeT * 80, 40 + lifeT * 40]
      : [150 + lifeT * 60, 150 + lifeT * 60, 160 + lifeT * 50];
    fillCircle(ppx, ppy, Math.max(1, particle.size * zoom * 0.5 * (1 - lifeT * 0.35)), color, 0.42 * (1 - lifeT * 0.75));
  }
}

function drawEmitter(emitter, tint) {
  for (const particle of emitter.particles) {
    if (!particle.alive) continue;
    const [ppx, ppy] = worldToPixel(particle.position.x, particle.position.y);
    const lifeT = particle.life / particle.maxLife;
    const alpha = Math.max(0, 1 - lifeT) * 0.95;
    fillCircle(ppx, ppy, Math.max(1, particle.size * zoom * 0.5), tint, alpha);
  }
}
drawEmitter(impact.sparks, [255, 220, 120]);
drawEmitter(blast.sparks, [255, 190, 90]);
drawEmitter(blast.smoke, [120, 118, 128]);

const state = screen.state();
const flashColor = [
  Math.round(state.flashColor.r * 255),
  Math.round(state.flashColor.g * 255),
  Math.round(state.flashColor.b * 255),
];
if (state.flash > 0) fillRect(0, 0, width, height, flashColor, state.flash * 0.5);

for (const emitter of [weather.rain]) {
  for (const particle of emitter.particles) {
    if (!particle.alive) continue;
    const [ppx, ppy] = worldToPixel(particle.position.x, particle.position.y);
    fillRect(ppx, ppy, 1.5, 10, [170, 200, 255], 0.55);
  }
}

const vignette = state.vignette;
if (vignette > 0) fillRect(0, 0, width, height, [8, 10, 16], vignette * 0.3);

const png = encodePng({ width, height, data: px });
writeFileSync(join(outputDir, "frame.png"), png);

console.log("v06-demo frame written", {
  width,
  height,
  carX: Number(bodyPos.x.toFixed(2)),
  carSpeed: Number(car.speed.toFixed(2)),
  gear: car.transmission.gear,
  rpm: Math.round(car.engine.rpm),
  integrity: Number(car.integrity.toFixed(3)),
  tireSmoke: tireSmoke.aliveCount,
  blastSmoke: blast.smoke.aliveCount,
  rain: weather.rain.aliveCount,
  shake: Number(state.shake.toFixed(3)),
});
