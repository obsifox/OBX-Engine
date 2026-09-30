import { Vec3, Color, Colors } from "@obx/math";

export type LightKind = "ambient" | "directional" | "point" | "spot" | "area";

export interface LightBase {
  kind: LightKind;
  color: Color;
  intensity: number;
  enabled: boolean;
}

export interface AmbientLight extends LightBase {
  kind: "ambient";
}

export interface DirectionalLight extends LightBase {
  kind: "directional";
  direction: Vec3;
}

export interface PointLight extends LightBase {
  kind: "point";
  position: Vec3;
  range: number;
}

export interface SpotLight extends LightBase {
  kind: "spot";
  position: Vec3;
  direction: Vec3;
  angle: number;
  penumbra: number;
  range: number;
}

export interface AreaLight extends LightBase {
  kind: "area";
  position: Vec3;
  direction: Vec3;
  width: number;
  height: number;
  range: number;
}

export type Light = AmbientLight | DirectionalLight | PointLight | SpotLight | AreaLight;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface SurfacePoint {
  position: Vec3;
  normal: Vec3;
}

export function rgb(r: number, g: number, b: number): Rgb {
  return { r, g, b };
}

export function rgbOf(color: Color): Rgb {
  return { r: color.r, g: color.g, b: color.b };
}

export function addRgb(a: Rgb, b: Rgb): Rgb {
  return { r: a.r + b.r, g: a.g + b.g, b: a.b + b.b };
}

export function scaleRgb(a: Rgb, s: number): Rgb {
  return { r: a.r * s, g: a.g * s, b: a.b * s };
}

export function mulRgb(a: Rgb, b: Rgb): Rgb {
  return { r: a.r * b.r, g: a.g * b.g, b: a.b * b.b };
}

export function clampRgb(a: Rgb, min = 0, max = Number.POSITIVE_INFINITY): Rgb {
  return {
    r: Math.min(max, Math.max(min, a.r)),
    g: Math.min(max, Math.max(min, a.g)),
    b: Math.min(max, Math.max(min, a.b)),
  };
}

export function makeAmbient(color: Color, intensity = 1): AmbientLight {
  return { kind: "ambient", color: color.clone(), intensity, enabled: true };
}

export function makeDirectional(direction: Vec3, color: Color, intensity = 1): DirectionalLight {
  return { kind: "directional", direction: direction.clone().normalize(), color: color.clone(), intensity, enabled: true };
}

export function makePoint(position: Vec3, color: Color, intensity = 1, range = 10): PointLight {
  return { kind: "point", position: position.clone(), color: color.clone(), intensity, range, enabled: true };
}

export function makeSpot(position: Vec3, direction: Vec3, color: Color, intensity = 1, angle = Math.PI / 6, penumbra = 0.2, range = 10): SpotLight {
  return {
    kind: "spot",
    position: position.clone(),
    direction: direction.clone().normalize(),
    color: color.clone(),
    intensity,
    angle,
    penumbra,
    range,
    enabled: true,
  };
}

export function makeArea(position: Vec3, direction: Vec3, color: Color, width = 1, height = 1, intensity = 1, range = 10): AreaLight {
  return {
    kind: "area",
    position: position.clone(),
    direction: direction.clone().normalize(),
    color: color.clone(),
    width,
    height,
    intensity,
    range,
    enabled: true,
  };
}

export function distanceAttenuation(distance: number, range: number): number {
  if (range <= 0) return 1 / Math.max(distance * distance, 1e-4);
  const cutoff = Math.max(0, 1 - Math.pow(distance / range, 4));
  return (cutoff * cutoff) / Math.max(distance * distance, 1e-4);
}

export function spotFalloff(spot: SpotLight, directionToLight: Vec3): number {
  const cosTheta = -directionToLight.dot(spot.direction);
  const outer = Math.cos(spot.angle);
  const inner = Math.cos(spot.angle * (1 - Math.max(0, Math.min(1, spot.penumbra))));
  if (cosTheta <= outer) return 0;
  if (cosTheta >= inner) return 1;
  const t = (cosTheta - outer) / Math.max(inner - outer, 1e-5);
  return t * t;
}

export function areaSolidAngleScale(light: AreaLight): number {
  return Math.max(light.width * light.height, 1e-4);
}

export function lightVector(light: Light, point: SurfacePoint): { direction: Vec3; distance: number } {
  switch (light.kind) {
    case "directional":
      return { direction: light.direction.clone().scale(-1), distance: Number.POSITIVE_INFINITY };
    case "point":
    case "spot":
    case "area": {
      const toLight = light.position.clone().sub(point.position);
      const distance = toLight.length();
      return { direction: distance > 1e-6 ? toLight.scale(1 / distance) : new Vec3(0, 1, 0), distance };
    }
    case "ambient":
      return { direction: new Vec3(0, 1, 0), distance: 0 };
  }
}

export function lightRadiance(light: Light, point: SurfacePoint): Rgb {
  if (!light.enabled || light.kind === "ambient") return rgb(0, 0, 0);
  const { direction, distance } = lightVector(light, point);
  const nDotL = Math.max(0, point.normal.dot(direction));
  if (nDotL <= 0) return rgb(0, 0, 0);
  let attenuation = 1;
  if (light.kind === "point" || light.kind === "spot" || light.kind === "area") {
    attenuation = distanceAttenuation(distance, light.range);
  }
  if (light.kind === "spot") {
    attenuation *= spotFalloff(light, direction);
  }
  if (light.kind === "area") {
    attenuation *= areaSolidAngleScale(light);
  }
  return scaleRgb(rgbOf(light.color), light.intensity * attenuation * nDotL);
}

export function ambientRadiance(light: AmbientLight, albedo: Rgb): Rgb {
  if (!light.enabled) return rgb(0, 0, 0);
  return mulRgb(scaleRgb(rgbOf(light.color), light.intensity), albedo);
}

export function evaluateLighting(lights: readonly Light[], point: SurfacePoint, albedo: Rgb): Rgb {
  let total = rgb(0, 0, 0);
  for (const light of lights) {
    if (light.kind === "ambient") {
      total = addRgb(total, ambientRadiance(light, albedo));
    } else {
      total = addRgb(total, mulRgb(lightRadiance(light, point), albedo));
    }
  }
  return total;
}

export const LIGHT_UNIFORM_STRIDE = 12;

export function packLights(lights: readonly Light[]): Float32Array {
  const data = new Float32Array(lights.length * LIGHT_UNIFORM_STRIDE);
  lights.forEach((light, index) => {
    const base = index * LIGHT_UNIFORM_STRIDE;
    const { direction } = lightVector(light, { position: new Vec3(0, 0, 0), normal: new Vec3(0, 1, 0) });
    const position = light.kind === "point" || light.kind === "spot" || light.kind === "area" ? light.position : direction;
    data[base] = position.x;
    data[base + 1] = position.y;
    data[base + 2] = position.z;
    data[base + 3] = light.kind === "point" ? 1 : light.kind === "spot" ? 2 : light.kind === "ambient" ? 3 : light.kind === "area" ? 4 : 0;
    data[base + 4] = light.color.r;
    data[base + 5] = light.color.g;
    data[base + 6] = light.color.b;
    data[base + 7] = light.intensity;
    const directionOut = "direction" in light ? light.direction : new Vec3(0, -1, 0);
    data[base + 8] = directionOut.x;
    data[base + 9] = directionOut.y;
    data[base + 10] = directionOut.z;
    data[base + 11] = "range" in light ? light.range : 0;
  });
  return data;
}

export class LightRig {
  readonly lights: Light[] = [];

  add(light: Light): this {
    this.lights.push(light);
    return this;
  }

  clear(): void {
    this.lights.length = 0;
  }

  enabled(): Light[] {
    return this.lights.filter((light) => light.enabled);
  }

  pack(): Float32Array {
    return packLights(this.enabled());
  }

  evaluate(point: SurfacePoint, albedo: Rgb): Rgb {
    return evaluateLighting(this.enabled(), point, albedo);
  }
}

export const BLACK_RGB: Rgb = rgb(0, 0, 0);
export const WHITE_RGB: Rgb = rgb(1, 1, 1);

export function colorToRgb(color: Color): Rgb {
  return rgbOf(color);
}

export function defaultAlbedo(): Rgb {
  return rgbOf(Colors.white);
}
