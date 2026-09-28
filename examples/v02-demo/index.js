import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Color, Transform2D, Vec2 } from "@obx/math";
import { Camera2D, Renderer2D, SoftwareBackend, encodePng } from "@obx/rendering";

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, "output");
mkdirSync(outputDir, { recursive: true });

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const width = 640;
const height = 360;
const backend = new SoftwareBackend(width, height);
const renderer = new Renderer2D(backend);
const camera = new Camera2D({ viewportWidth: width, viewportHeight: height, zoom: 1 });

renderer.begin(camera, new Color(0.043, 0.055, 0.078, 1));
for (let row = 0; row < 9; row += 1) {
  for (let col = 0; col < 16; col += 1) {
    const t = (col + row * 0.35) / 16;
    const angle = (col * 0.19 + row * 0.31) * Math.PI * 0.62;
    renderer.drawRect({
      x: 48 + col * 25.6,
      y: 40 + row * 25.6,
      width: 16 * lerp(0.5, 1.25, t),
      height: 16 * lerp(0.5, 1.25, t),
      rotation: angle,
      color: new Color(lerp(1, 0.25, t), lerp(0.42, 0.88, t), lerp(0.1, 1, t), 1),
    });
  }
}
const transformA = new Transform2D(new Vec2(250, 300), -0.32, new Vec2(1, 1));
const transformB = new Transform2D(new Vec2(390, 300), 0.48, new Vec2(1, 1));
const mid = Transform2D.lerp(transformA, transformB, 0.5);
renderer.drawRect({
  x: mid.position.x - 26,
  y: mid.position.y - 26,
  width: 52,
  height: 52,
  rotation: mid.rotation,
  color: new Color(1, 0.69, 0.125, 1),
});
renderer.end();

const png = encodePng({ width, height, data: backend.pixels });
writeFileSync(join(outputDir, "frame.png"), png);
console.log("v02-demo frame written", {
  width,
  height,
  quads: 145,
  midRotation: Number(mid.rotation.toFixed(3)),
});
