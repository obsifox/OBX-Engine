import { Color, Vec3 } from "@obx/math";
import {
  addRgb,
  baseReflectance,
  bakeProbeFromSky,
  evaluateBrdf,
  fresnelSchlick,
  iblAmbient,
  lightRadiance,
  lightVector,
  makeAmbient,
  makeDirectional,
  makePoint,
  makeSpot,
  mulRgb,
  scaleRgb,
  skyRadiance,
} from "@obx/rendering";

const SPHERES = [
  { cx: 0, cy: 1.62, cz: -0.2, r: 0.3, base: [0.12, 0.12, 0.14], metallic: 1, roughness: 0.22, specular: 0.5, emissive: [0.25, 0.88, 1.0], strength: 1.4 },
  { cx: 0, cy: 1.05, cz: -0.2, r: 0.38, base: [0.95, 0.42, 0.18], metallic: 1, roughness: 0.3, specular: 0.45, emissive: [1, 0.42, 0.1], strength: 1.1 },
  { cx: -0.42, cy: 1.05, cz: -0.2, r: 0.14, base: [0.95, 0.42, 0.18], metallic: 1, roughness: 0.3, specular: 0.45, emissive: [0, 0, 0], strength: 0 },
  { cx: 0.42, cy: 1.05, cz: -0.2, r: 0.14, base: [0.95, 0.42, 0.18], metallic: 1, roughness: 0.3, specular: 0.45, emissive: [0, 0, 0], strength: 0 },
  { cx: -0.16, cy: 0.5, cz: -0.2, r: 0.15, base: [0.72, 0.71, 0.7], metallic: 0.04, roughness: 0.16, specular: 0.35, emissive: [0, 0, 0], strength: 0 },
  { cx: 0.16, cy: 0.5, cz: -0.2, r: 0.15, base: [0.72, 0.71, 0.7], metallic: 0.04, roughness: 0.16, specular: 0.35, emissive: [0, 0, 0], strength: 0 },
  { cx: -1.85, cy: 0.34, cz: 0.7, r: 0.34, base: [0.02, 0.05, 0.08], metallic: 1, roughness: 0.05, specular: 0.9, emissive: [0.16, 0.55, 0.75], strength: 1.5 },
  { cx: 1.85, cy: 0.34, cz: 0.7, r: 0.34, base: [0.02, 0.05, 0.08], metallic: 1, roughness: 0.05, specular: 0.9, emissive: [1, 0.69, 0.13], strength: 1.5 },
  { cx: -1.3, cy: 0.09, cz: 1.6, r: 0.09, base: [0, 0, 0], metallic: 0, roughness: 0.5, specular: 0.2, emissive: [0.25, 0.88, 1.0], strength: 5.5 },
  { cx: -0.65, cy: 0.09, cz: 1.35, r: 0.09, base: [0, 0, 0], metallic: 0, roughness: 0.5, specular: 0.2, emissive: [0.25, 0.88, 1.0], strength: 5.5 },
  { cx: 0, cy: 0.09, cz: 1.2, r: 0.09, base: [0, 0, 0], metallic: 0, roughness: 0.5, specular: 0.2, emissive: [0.25, 0.88, 1.0], strength: 5.5 },
  { cx: 0.65, cy: 0.09, cz: 1.35, r: 0.09, base: [0, 0, 0], metallic: 0, roughness: 0.5, specular: 0.2, emissive: [0.25, 0.88, 1.0], strength: 5.5 },
  { cx: 1.3, cy: 0.09, cz: 1.6, r: 0.09, base: [0, 0, 0], metallic: 0, roughness: 0.5, specular: 0.2, emissive: [0.25, 0.88, 1.0], strength: 5.5 },
];

const SUN = new Vec3(-0.55, 0.62, -0.56).normalize();

function buildSky() {
  return {
    zenith: { r: 0.04, g: 0.13, b: 0.36 },
    horizon: { r: 0.42, g: 0.3, b: 0.26 },
    ground: { r: 0.14, g: 0.12, b: 0.11 },
    sunDirection: SUN,
    sunColor: { r: 1, g: 0.82, b: 0.55 },
    sunSize: 0.02,
    sunIntensity: 2.6,
  };
}

function colorOf(rgbValue) {
  return { r: rgbValue[0], g: rgbValue[1], b: rgbValue[2] };
}

function hitSphere(ox, oy, oz, dx, dy, dz, sphere) {
  const mx = ox - sphere.cx;
  const my = oy - sphere.cy;
  const mz = oz - sphere.cz;
  const b = mx * dx + my * dy + mz * dz;
  const c = mx * mx + my * my + mz * mz - sphere.r * sphere.r;
  const disc = b * b - c;
  if (disc <= 0) return Infinity;
  const s = Math.sqrt(disc);
  const near = -b - s;
  if (near > 1e-3) return near;
  const far = -b + s;
  return far > 1e-3 ? far : Infinity;
}

function nearestHit(ox, oy, oz, dx, dy, dz) {
  let best = Infinity;
  let which = -1;
  for (let i = 0; i < SPHERES.length; i += 1) {
    const t = hitSphere(ox, oy, oz, dx, dy, dz, SPHERES[i]);
    if (t < best) {
      best = t;
      which = i;
    }
  }
  if (dy < -1e-6) {
    const tPlane = -oy / dy;
    if (tPlane > 1e-3 && tPlane < best) {
      best = tPlane;
      which = SPHERES.length;
    }
  }
  return { t: best, which };
}

function visibility(ox, oy, oz, dx, dy, dz, maxDistance) {
  const hit = nearestHit(ox, oy, oz, dx, dy, dz);
  return hit.t < maxDistance ? 0 : 1;
}

function checkerAlbedo(x, z) {
  const cell = (Math.floor(x * 0.85) + Math.floor(z * 0.85)) & 1;
  return cell === 0 ? { r: 0.36, g: 0.33, b: 0.3 } : { r: 0.17, g: 0.155, b: 0.15 };
}

function trace(sky, probe, lights, ox, oy, oz, dx, dy, dz, depth) {
  const hit = nearestHit(ox, oy, oz, dx, dy, dz);
  if (hit.which < 0) {
    return skyRadiance(sky, new Vec3(dx, dy, dz));
  }
  const hx = ox + dx * hit.t;
  const hy = oy + dy * hit.t;
  const hz = oz + dz * hit.t;
  let nx;
  let ny;
  let nz;
  let albedo;
  let metallic;
  let roughness;
  let specular;
  let emission;
  if (hit.which === SPHERES.length) {
    nx = 0;
    ny = 1;
    nz = 0;
    albedo = checkerAlbedo(hx, hz);
    metallic = 0;
    roughness = 0.72;
    specular = 0.12;
    emission = { r: 0, g: 0, b: 0 };
  } else {
    const sphere = SPHERES[hit.which];
    nx = (hx - sphere.cx) / sphere.r;
    ny = (hy - sphere.cy) / sphere.r;
    nz = (hz - sphere.cz) / sphere.r;
    albedo = colorOf(sphere.base);
    metallic = sphere.metallic;
    roughness = sphere.roughness;
    specular = sphere.specular;
    emission = scaleRgb(colorOf(sphere.emissive), sphere.strength);
  }
  const vx = -dx;
  const vy = -dy;
  const vz = -dz;
  let total = iblAmbient(probe, new Vec3(nx, ny, nz), albedo, metallic, roughness, 1);
  for (let i = 0; i < lights.length; i += 1) {
    const light = lights[i];
    const vector = lightVector(light, { position: new Vec3(hx, hy, hz), normal: new Vec3(nx, ny, nz) });
    const nDotL = nx * vector.direction.x + ny * vector.direction.y + nz * vector.direction.z;
    if (nDotL <= 1e-4) continue;
    let vis;
    if (light.kind === "directional") {
      vis = visibility(hx + nx * 0.003, hy + ny * 0.003, hz + nz * 0.003, vector.direction.x, vector.direction.y, vector.direction.z, Infinity);
    } else {
      const distance = vector.distance;
      vis = visibility(hx + nx * 0.003, hy + ny * 0.003, hz + nz * 0.003, vector.direction.x, vector.direction.y, vector.direction.z, distance - 1e-3);
    }
    if (vis <= 0) continue;
    const radiance = lightRadiance(light, { position: new Vec3(hx, hy, hz), normal: new Vec3(nx, ny, nz) });
    const brdf = evaluateBrdf({
      normal: new Vec3(nx, ny, nz),
      viewDir: new Vec3(vx, vy, vz),
      lightDir: vector.direction,
      roughness,
      metallic,
      albedo,
      specular,
    });
    const factor = vis / Math.max(nDotL, 1e-6);
    total = addRgb(total, mulRgb(brdf, scaleRgb(radiance, factor)));
  }
  total = addRgb(total, emission);
  if (depth > 0 && (metallic > 0.02 || roughness < 0.3)) {
    const dotVN = vx * nx + vy * ny + vz * nz;
    const rx = dx - 2 * dotVN * nx;
    const ry = dy - 2 * dotVN * ny;
    const rz = dz - 2 * dotVN * nz;
    const reflected = trace(sky, probe, lights, hx + nx * 0.004, hy + ny * 0.004, hz + nz * 0.004, rx, ry, rz, depth - 1);
    const f0 = baseReflectance(albedo, metallic);
    const fres = fresnelSchlick(Math.max(0, dotVN), f0);
    const weight = 0.2 + 0.65 * metallic;
    const soften = (1 - Math.min(1, roughness) * 0.72) * 0.6;
    const compressed = {
      r: reflected.r / (1 + reflected.r * 0.22),
      g: reflected.g / (1 + reflected.g * 0.22),
      b: reflected.b / (1 + reflected.b * 0.22),
    };
    total = addRgb(total, mulRgb(compressed, scaleRgb(fres, weight * soften)));
  }
  const fog = 1 - Math.exp(-0.005 * Math.pow(hit.t, 1.35));
  if (fog > 0.001) {
    total = addRgb(scaleRgb(total, 1 - fog), scaleRgb(skyRadiance(sky, new Vec3(dx, dy, dz)), fog * 0.3));
  }
  return total;
}

export function renderScene(width, height, samples = 2) {
  const sky = buildSky();
  const probe = bakeProbeFromSky(sky, 16);
  const lights = [
    makeAmbient(new Color(0.16, 0.21, 0.34), 0.4),
    makeDirectional(SUN.clone().scale(-1), new Color(1, 0.9, 0.74), 1.7),
    makePoint(new Vec3(3.2, 1.5, 1.6), new Color(1, 0.48, 0.18), 5.5, 14),
    makeSpot(new Vec3(-3.6, 3.4, -1.1), new Vec3(0.62, -0.66, -0.42), new Color(0.3, 0.72, 1), 13, 0.48, 0.35, 22),
  ];
  const camera = { x: 0, y: 1.55, z: 4.7 };
  const target = { x: 0, y: 0.88, z: 0 };
  let fx = target.x - camera.x;
  let fy = target.y - camera.y;
  let fz = target.z - camera.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  const rl = Math.hypot(rx, ry, rz);
  rx /= rl;
  ry /= rl;
  rz /= rl;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const aspect = width / height;
  const tanFov = Math.tan((48 * Math.PI) / 360);
  const color = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let ar = 0;
      let ag = 0;
      let ab = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const u = ((x + (sx + 0.5) / samples) / width * 2 - 1) * aspect * tanFov;
          const v = (1 - (y + (sy + 0.5) / samples) / height * 2) * tanFov;
          let dx = fx + rx * u + ux * v;
          let dy = fy + ry * u + uy * v;
          let dz = fz + rz * u + uz * v;
          const dl = Math.hypot(dx, dy, dz);
          dx /= dl;
          dy /= dl;
          dz /= dl;
          const sample = trace(sky, probe, lights, camera.x, camera.y, camera.z, dx, dy, dz, 2);
          ar += sample.r;
          ag += sample.g;
          ab += sample.b;
        }
      }
      const index = (y * width + x) * 4;
      const norm = 1 / (samples * samples);
      color[index] = ar * norm;
      color[index + 1] = ag * norm;
      color[index + 2] = ab * norm;
      color[index + 3] = 1;
    }
  }
  return { width, height, color, sky, probe, lights };
}
