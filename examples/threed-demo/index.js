import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Color, Quat, Vec3 } from "@obx/math";
import {
  Camera3D,
  Material,
  Renderer3D,
  Software3DBackend,
  composeWorldMatrix,
  createCube,
  createLighting,
  createPlane,
  createUvSphere,
  encodePng,
} from "@obx/rendering";

const root = dirname(fileURLToPath(import.meta.url));
const outputDir = join(root, "output");
mkdirSync(outputDir, { recursive: true });

const width = 480;
const height = 270;
const backend = new Software3DBackend(width, height);
const renderer = new Renderer3D(backend);

const camera = new Camera3D({
  fovY: Math.PI / 3,
  aspect: width / height,
  near: 0.1,
  far: 100,
});
camera.setLookAt(new Vec3(4.1, 2.7, 5.4), new Vec3(0, 1.05, 0));

const lighting = createLighting({
  ambient: { color: new Color(0.5, 0.58, 0.78, 1), intensity: 0.52 },
  directional: [
    {
      direction: { x: -0.45, y: -1, z: -0.35 },
      color: new Color(1, 0.92, 0.82, 1),
      intensity: 1.25,
    },
  ],
  point: [
    {
      position: { x: -2.2, y: 3, z: 2.4 },
      color: new Color(0.25, 0.88, 1, 1),
      intensity: 1.4,
      range: 14,
    },
  ],
});

const fog = { color: new Color(0.043, 0.055, 0.078, 1), density: 0.013 };

const floorMaterial = new Material({
  name: "floor",
  shading: "standard",
  baseColor: new Color(0.27, 0.32, 0.43, 1),
  metallic: 0,
  roughness: 0.92,
});
const cubeMaterial = new Material({
  name: "emberCube",
  shading: "standard",
  baseColor: new Color(1, 0.42, 0.1, 1),
  metallic: 0.18,
  roughness: 0.32,
  emissive: new Color(0.05, 0.015, 0, 1),
});
const sphereMaterial = new Material({
  name: "cyanSphere",
  shading: "standard",
  baseColor: new Color(0.18, 0.78, 0.95, 1),
  metallic: 0.12,
  roughness: 0.22,
});

const floor = createPlane(24, 24);
const cube = createCube(2.2);
const sphere = createUvSphere(1.25, 28, 18);

renderer.begin(camera, {
  clearColor: new Color(0.043, 0.055, 0.078, 1),
  lighting,
  fog,
});
renderer.drawMesh(floor, floorMaterial, composeWorldMatrix(new Vec3(0, 0, 0), Quat.identity(), new Vec3(1, 1, 1)));
renderer.drawMesh(
  cube,
  cubeMaterial,
  composeWorldMatrix(new Vec3(-1.7, 1.1, 0.2), Quat.fromAxisAngle(new Vec3(0, 1, 0), 0.6), new Vec3(1, 1, 1)),
);
renderer.drawMesh(
  sphere,
  sphereMaterial,
  composeWorldMatrix(new Vec3(1.9, 1.25, -0.7), Quat.identity(), new Vec3(1, 1, 1)),
);
const stats = renderer.end();

const png = encodePng({ width, height, data: backend.pixels });
writeFileSync(join(outputDir, "frame.png"), png);
writeFileSync(join(outputDir, "frame.ppm"), ppm(backend));

function ppm(target) {
  const header = Buffer.from(`P6\n${target.width} ${target.height}\n255\n`);
  const body = Buffer.alloc(target.width * target.height * 3);
  for (let i = 0, j = 0; i < target.pixels.length; i += 4, j += 3) {
    body[j] = target.pixels[i];
    body[j + 1] = target.pixels[i + 1];
    body[j + 2] = target.pixels[i + 2];
  }
  return Buffer.concat([header, body]);
}

console.log("threed-demo frame written", {
  width,
  height,
  bytes: png.length,
  ...stats,
});
