import { mkdirSync, writeFileSync } from "node:fs";
import {
  Application,
  Camera2D,
  Color,
  Colors,
  InputManager,
  ManualLoopDriver,
  ManualPlatform,
  Renderer2D,
  SoftwareBackend,
  Texture,
  Vec2,
  World,
  encodePng,
  defineComponent,
  defineSystem,
} from "@obx/engine";

const Movement = defineComponent("Demo.Movement", {
  defaults: () => ({ phase: 0, speed: 0, bob: 0 }),
});

const LetterPatterns = {
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
};

function makeFoxTexture(frame) {
  const texture = new Texture(16, 16);
  const orange = Color.fromHex("#FF6A1A");
  const ember = Color.fromHex("#FFB020");
  const dark = Colors.obsidian;
  for (let y = 2; y < 14; y += 1) {
    for (let x = 3; x < 13; x += 1) {
      texture.setPixel(x, y, y < 5 ? ember : orange);
    }
  }
  texture.setPixel(2, 1, orange);
  texture.setPixel(3, 0, orange);
  texture.setPixel(12, 0, orange);
  texture.setPixel(13, 1, orange);
  texture.setPixel(6, 14, dark);
  texture.setPixel(7, 15, dark);
  texture.setPixel(8, 15, dark);
  texture.setPixel(9, 14, dark);
  const eyesOpen = frame !== 3;
  if (eyesOpen) {
    texture.setPixel(5, 7, dark);
    texture.setPixel(6, 7, dark);
    texture.setPixel(9, 7, dark);
    texture.setPixel(10, 7, dark);
    texture.setPixel(5, 8, Colors.signalCyan);
    texture.setPixel(10, 8, Colors.signalCyan);
  } else {
    texture.setPixel(5, 7, dark);
    texture.setPixel(6, 7, dark);
    texture.setPixel(9, 7, dark);
    texture.setPixel(10, 7, dark);
  }
  texture.setPixel(7, 10, dark);
  texture.setPixel(8, 10, dark);
  return texture;
}

const WIDTH = 960;
const HEIGHT = 540;
const backend = new SoftwareBackend(WIDTH, HEIGHT);
const renderer = new Renderer2D(backend);
const camera = new Camera2D({
  viewportWidth: WIDTH,
  viewportHeight: HEIGHT,
  position: new Vec2(WIDTH / 2, HEIGHT / 2),
});
const input = new InputManager();
input.defineAxis("moveX", { positiveKeys: ["KeyD", "ArrowRight"], negativeKeys: ["KeyA", "ArrowLeft"] });
input.defineAction("boost", { keys: ["Space"] });

const world = new World("twod-demo");
const foxFrames = [0, 1, 2, 3].map(makeFoxTexture);
const checker = Texture.checker(
  Color.fromHex("#141B28"),
  Color.fromHex("#0E1420"),
  24,
  WIDTH,
  HEIGHT,
  "bg",
);
const white = Texture.solid(Colors.white, 1, 1);

const player = world.createEntity(Movement);
world.setName(player, "player");
const playerState = world.getComponentOrThrow(player, Movement);
playerState.phase = 0;
playerState.speed = 160;

const flock = [];
for (let i = 0; i < 6; i += 1) {
  const fox = world.createEntity(Movement);
  const state = world.getComponentOrThrow(fox, Movement);
  state.phase = i * 0.9;
  state.speed = 60 + i * 18;
  state.bob = 26 + i * 5;
  flock.push(fox);
}

world.addSystem(defineSystem({
  name: "demo-input",
  execute: ({ delta }) => {
    const boost = input.isActionDown("boost") ? 1.8 : 1;
    playerState.phase += input.getAxis("moveX") * delta * boost;
  },
}));

world.addSystem(defineSystem({
  name: "demo-animation",
  after: ["demo-input"],
  execute: ({ delta }) => {
    for (const fox of flock) {
      world.getComponentOrThrow(fox, Movement).phase += delta * 0.55;
    }
  },
}));

let playerX = 0;
function renderFrame(time) {
  renderer.begin(camera, Colors.obsidian);
  renderer.drawSprite({ texture: checker, x: WIDTH / 2, y: HEIGHT / 2, width: WIDTH, height: HEIGHT, layer: -10 });

  for (let i = 0; i < 7; i += 1) {
    renderer.drawRect({
      x: 120 + i * 120,
      y: 96,
      width: 88,
      height: 8,
      color: i % 2 === 0 ? Colors.ember : Colors.signalCyan.withAlpha(0.65),
      layer: -5,
    });
  }

  const cell = 22;
  const letters = ["O", "B", "X"];
  letters.forEach((letter, index) => {
    const pattern = LetterPatterns[letter];
    const originX = WIDTH / 2 + (index - 1) * 170 - (5 * cell) / 2;
    const originY = 150;
    pattern.forEach((row, rowIndex) => {
      row.split("").forEach((bit, colIndex) => {
        if (bit === "1") {
          renderer.drawRect({
            x: originX + colIndex * cell + cell / 2,
            y: originY + rowIndex * cell + cell / 2,
            width: cell - 3,
            height: cell - 3,
            color: index === 1 ? Colors.ember : Colors.foxOrange,
            layer: 0,
          });
        }
      });
    });
  });

  flock.forEach((fox, index) => {
    const state = world.getComponentOrThrow(fox, Movement);
    const t = time * state.speed * 0.6 + state.phase * 120;
    const x = 140 + ((t % (WIDTH - 280)) + (WIDTH - 280)) % (WIDTH - 280);
    const y = 330 + Math.sin(time * 2 + state.phase) * state.bob;
    const frame = Math.floor(time * 8 + index) % foxFrames.length;
    renderer.drawSprite({
      texture: foxFrames[frame],
      x,
      y,
      width: 56,
      height: 56,
      rotation: Math.sin(time * 1.5 + state.phase) * 0.12,
      layer: 2,
    });
  });

  playerX = WIDTH / 2 + playerState.phase * 240;
  const playerFrame = Math.floor(time * (input.isActionDown("boost") ? 16 : 8)) % foxFrames.length;
  renderer.drawSprite({
    texture: foxFrames[playerFrame],
    x: playerX,
    y: 448,
    width: 72,
    height: 72,
    rotation: input.getAxis("moveX") * 0.08,
    layer: 3,
  });

  for (let i = 0; i < 5; i += 1) {
    renderer.drawRect({
      x: 80 + i * 200 + Math.sin(time * 1.2 + i) * 24,
      y: 250 + Math.cos(time + i * 1.3) * 18,
      width: 18,
      height: 18,
      color: Colors.signalCyan.withAlpha(0.8),
      rotation: time * 0.8 + i,
      layer: 1,
    });
  }

  renderer.drawRect({ x: WIDTH / 2, y: 512, width: WIDTH - 120, height: 6, color: Colors.foxOrange, layer: 5 });
  return renderer.end();
}

const driver = new ManualLoopDriver();
const app = new Application({
  name: "twod-demo",
  driver,
  platform: new ManualPlatform(),
  world,
  config: { autoTickWorld: true, fixedDelta: 1 / 60 },
});

input.keyDown("KeyD");
input.keyDown("Space");

await app.run();

let lastStats = null;
for (let frame = 0; frame < 120; frame += 1) {
  if (frame === 60) {
    input.keyUp("KeyD");
    input.keyDown("KeyA");
    input.keyUp("Space");
  }
  driver.step((frame * 1000) / 60);
  lastStats = renderFrame(frame / 60);
}

const texture = backend.toTexture("twod-frame");
const png = encodePng(texture);
mkdirSync("examples/twod-demo/output", { recursive: true });
writeFileSync("examples/twod-demo/output/frame.png", png);

console.log("OBX Engine v0.3 — 2D demo");
console.log("renderer stats:", lastStats);
console.log("world stats:", world.stats());
console.log("player axis state:", { phase: playerState.phase.toFixed(3), axis: input.getAxis("moveX") });
console.log(`frame written: examples/twod-demo/output/frame.png (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);
await app.quit();
