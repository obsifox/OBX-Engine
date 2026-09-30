import { Vec3, Color, Colors } from "@obx/math";
import { addRgb, mulRgb, rgb, scaleRgb, type Rgb, rgbOf } from "./lights.js";

export interface Sky {
  zenith: Color;
  horizon: Color;
  ground: Color;
  sunDirection: Vec3;
  sunColor: Color;
  sunSize: number;
  sunIntensity: number;
}

export interface SkyCamera {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  fovRadians: number;
  aspect: number;
}

export function makeSky(options: Partial<Sky> = {}): Sky {
  return {
    zenith: options.zenith?.clone() ?? new Color(0.15, 0.35, 0.8),
    horizon: options.horizon?.clone() ?? new Color(0.7, 0.8, 0.95),
    ground: options.ground?.clone() ?? new Color(0.2, 0.18, 0.16),
    sunDirection: options.sunDirection?.clone().normalize() ?? new Vec3(0.4, 0.8, 0.3).normalize(),
    sunColor: options.sunColor?.clone() ?? Colors.white.clone(),
    sunSize: options.sunSize ?? 0.02,
    sunIntensity: options.sunIntensity ?? 4,
  };
}

export function skyRayDirection(camera: SkyCamera, u: number, v: number): Vec3 {
  const forward = camera.forward.clone().normalize();
  const right = forward.clone().cross(camera.up.clone().normalize()).normalize();
  const up = right.clone().cross(forward).normalize();
  const halfHeight = Math.tan(camera.fovRadians / 2);
  const halfWidth = halfHeight * camera.aspect;
  const x = (u * 2 - 1) * halfWidth;
  const y = (1 - v * 2) * halfHeight;
  return forward.clone().add(right.scale(x)).add(up.scale(y)).normalize();
}

export function skyRadiance(sky: Sky, direction: Vec3): Rgb {
  const up = direction.y;
  let base: Rgb;
  if (up >= 0) {
    const t = Math.pow(Math.max(0, up), 0.6);
    base = addRgb(scaleRgb(rgbOf(sky.horizon), 1 - t), scaleRgb(rgbOf(sky.zenith), t));
  } else {
    const t = Math.min(1, Math.pow(-up, 0.6));
    base = addRgb(scaleRgb(rgbOf(sky.horizon), 1 - t), scaleRgb(rgbOf(sky.ground), t));
  }
  const sunDot = direction.dot(sky.sunDirection);
  const sun = Math.pow(Math.max(0, sunDot), Math.max(1, 1 / Math.max(sky.sunSize, 1e-4)));
  return addRgb(base, scaleRgb(rgbOf(sky.sunColor), sun * sky.sunIntensity));
}

export function renderSky(sky: Sky, camera: SkyCamera, width: number, height: number): Float32Array {
  const pixels = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const direction = skyRayDirection(camera, (x + 0.5) / width, (y + 0.5) / height);
      const color = skyRadiance(sky, direction);
      const index = (y * width + x) * 4;
      pixels[index] = color.r;
      pixels[index + 1] = color.g;
      pixels[index + 2] = color.b;
      pixels[index + 3] = 1;
    }
  }
  return pixels;
}

export interface ReflectionProbe {
  size: number;
  faces: Float32Array[];
}

export function createReflectionProbe(size = 8): ReflectionProbe {
  return {
    size,
    faces: Array.from({ length: 6 }, () => new Float32Array(size * size * 4)),
  };
}

export const CUBE_FACE_DIRECTIONS: ((u: number, v: number) => Vec3)[] = [
  (u, v) => new Vec3(1, 1 - 2 * v, 1 - 2 * u),
  (u, v) => new Vec3(-1, 1 - 2 * v, 2 * u - 1),
  (u, v) => new Vec3(2 * u - 1, 1, 2 * v - 1),
  (u, v) => new Vec3(2 * u - 1, -1, 1 - 2 * v),
  (u, v) => new Vec3(2 * u - 1, 1 - 2 * v, 1),
  (u, v) => new Vec3(1 - 2 * u, 1 - 2 * v, -1),
];

export function bakeProbeFromSky(sky: Sky, size = 8): ReflectionProbe {
  const probe = createReflectionProbe(size);
  for (let face = 0; face < 6; face += 1) {
    const data = probe.faces[face]!;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const direction = CUBE_FACE_DIRECTIONS[face]!((x + 0.5) / size, (y + 0.5) / size).normalize();
        const color = skyRadiance(sky, direction);
        const index = (y * size + x) * 4;
        data[index] = color.r;
        data[index + 1] = color.g;
        data[index + 2] = color.b;
        data[index + 3] = 1;
      }
    }
  }
  return probe;
}

export function computeIrradiance(probe: ReflectionProbe): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (const face of probe.faces) {
    for (let i = 0; i < face.length; i += 4) {
      r += face[i]!;
      g += face[i + 1]!;
      b += face[i + 2]!;
      count += 1;
    }
  }
  return rgb(r / Math.max(count, 1), g / Math.max(count, 1), b / Math.max(count, 1));
}

export function sampleReflection(probe: ReflectionProbe, direction: Vec3): Rgb {
  const dir = direction.clone().normalize();
  const absX = Math.abs(dir.x);
  const absY = Math.abs(dir.y);
  const absZ = Math.abs(dir.z);
  let face = 0;
  let u = 0;
  let v = 0;
  if (absX >= absY && absX >= absZ) {
    face = dir.x > 0 ? 0 : 1;
    u = (dir.x > 0 ? -dir.z : dir.z) / absX;
    v = -dir.y / absX;
  } else if (absY >= absX && absY >= absZ) {
    face = dir.y > 0 ? 2 : 3;
    u = dir.x / absY;
    v = (dir.y > 0 ? dir.z : -dir.z) / absY;
  } else {
    face = dir.z > 0 ? 4 : 5;
    u = (dir.z > 0 ? dir.x : -dir.x) / absZ;
    v = -dir.y / absZ;
  }
  const size = probe.size;
  const x = Math.min(size - 1, Math.max(0, Math.floor(((u + 1) / 2) * size)));
  const y = Math.min(size - 1, Math.max(0, Math.floor(((v + 1) / 2) * size)));
  const data = probe.faces[face]!;
  const index = (y * size + x) * 4;
  return rgb(data[index]!, data[index + 1]!, data[index + 2]!);
}

export function iblDiffuse(probe: ReflectionProbe, albedo: Rgb, ao: number): Rgb {
  return mulRgb(scaleRgb(computeIrradiance(probe), ao), scaleRgb(albedo, 1 / Math.PI));
}

export function iblSpecular(probe: ReflectionProbe, normal: Vec3, viewDir: Vec3, metallic: Rgb, roughness: number): Rgb {
  const reflected = normal.clone().scale(2 * Math.max(0, normal.dot(viewDir))).sub(viewDir).normalize();
  const blur = Math.min(1, Math.max(0, roughness));
  const sharp = sampleReflection(probe, reflected);
  const diffuse = computeIrradiance(probe);
  const color = addRgb(scaleRgb(sharp, 1 - blur), scaleRgb(diffuse, blur));
  return mulRgb(color, metallic);
}

export function iblAmbient(probe: ReflectionProbe, normal: Vec3, albedo: Rgb, metallic: number, roughness: number, ao = 1): Rgb {
  const diffuse = iblDiffuse(probe, albedo, ao);
  const f0 = {
    r: 0.04 + (albedo.r - 0.04) * metallic,
    g: 0.04 + (albedo.g - 0.04) * metallic,
    b: 0.04 + (albedo.b - 0.04) * metallic,
  };
  const viewDir = normal.clone();
  const specular = iblSpecular(probe, normal, viewDir, f0, roughness);
  return addRgb(scaleRgb(diffuse, 1 - metallic), specular);
}

export interface EnvironmentProbe {
  irradiance: Rgb;
  sky: Sky | null;
}

export function environmentProbeFromSky(sky: Sky): EnvironmentProbe {
  const probe = bakeProbeFromSky(sky, 4);
  return { irradiance: computeIrradiance(probe), sky };
}
