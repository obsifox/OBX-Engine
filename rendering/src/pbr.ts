import { Color, Colors, Vec3 } from "@obx/math";
import { Material, type MaterialOptions } from "./material.js";
import type { Texture } from "./texture.js";
import {
  addRgb,
  clampRgb,
  mulRgb,
  rgb,
  scaleRgb,
  type Light,
  type Rgb,
  type SurfacePoint,
  ambientRadiance,
  lightRadiance,
  lightVector,
  rgbOf,
} from "./lights.js";
import type { ReflectionProbe } from "./environment.js";
import { iblAmbient } from "./environment.js";

export interface PbrMaterialOptions extends MaterialOptions {
  normalTexture?: Texture | null;
  aoTexture?: Texture | null;
  metallicRoughnessTexture?: Texture | null;
  ao?: number;
  normalScale?: number;
  emissionStrength?: number;
  specular?: number;
}

export class PbrMaterial extends Material {
  normalTexture: Texture | null;
  aoTexture: Texture | null;
  metallicRoughnessTexture: Texture | null;
  ao: number;
  normalScale: number;
  emissionStrength: number;
  specular: number;

  constructor(options: PbrMaterialOptions = {}) {
    super(options);
    this.normalTexture = options.normalTexture ?? null;
    this.aoTexture = options.aoTexture ?? null;
    this.metallicRoughnessTexture = options.metallicRoughnessTexture ?? null;
    this.ao = options.ao ?? 1;
    this.normalScale = options.normalScale ?? 1;
    this.emissionStrength = options.emissionStrength ?? 1;
    this.specular = options.specular ?? 0.5;
  }

  albedoRgb(): Rgb {
    return rgbOf(this.baseColor);
  }

  emissionRgb(): Rgb {
    return scaleRgb(rgbOf(this.emissive), this.emissionStrength);
  }

  roughnessClamped(): number {
    return Math.min(1, Math.max(0.02, this.roughness));
  }

  clonene(): PbrMaterial {
    return new PbrMaterial({
      name: this.name,
      shading: this.shading,
      baseColor: this.baseColor.clone(),
      metallic: this.metallic,
      roughness: this.roughness,
      emissive: this.emissive.clone(),
      albedoTexture: this.albedoTexture,
      doubleSided: this.doubleSided,
      normalTexture: this.normalTexture,
      aoTexture: this.aoTexture,
      metallicRoughnessTexture: this.metallicRoughnessTexture,
      ao: this.ao,
      normalScale: this.normalScale,
      emissionStrength: this.emissionStrength,
      specular: this.specular,
    });
  }
}

export function distributionGgx(normalDotHalf: number, roughness: number): number {
  const a = roughness * roughness;
  const a2 = a * a;
  const nDotH2 = normalDotHalf * normalDotHalf;
  const denominator = nDotH2 * (a2 - 1) + 1;
  return a2 / Math.max(Math.PI * denominator * denominator, 1e-8);
}

export function geometrySchlickGgx(normalDotDirection: number, roughness: number): number {
  const r = roughness + 1;
  const k = (r * r) / 8;
  return normalDotDirection / Math.max(normalDotDirection * (1 - k) + k, 1e-8);
}

export function geometrySmith(normalDotView: number, normalDotLight: number, roughness: number): number {
  return geometrySchlickGgx(normalDotView, roughness) * geometrySchlickGgx(normalDotLight, roughness);
}

export function fresnelSchlick(cosTheta: number, f0: Rgb): Rgb {
  const factor = Math.pow(1 - Math.min(1, Math.max(0, cosTheta)), 5);
  return addRgb(f0, scaleRgb(addRgb(rgb(1, 1, 1), scaleRgb(f0, -1)), factor));
}

export function baseReflectance(albedo: Rgb, metallic: number): Rgb {
  const dielectric = rgb(0.04, 0.04, 0.04);
  return addRgb(scaleRgb(dielectric, 1 - metallic), scaleRgb(albedo, metallic));
}

export interface BrdfContext {
  normal: Vec3;
  viewDir: Vec3;
  lightDir: Vec3;
  roughness: number;
  metallic: number;
  albedo: Rgb;
  specular: number;
}

export function evaluateBrdf(context: BrdfContext): Rgb {
  const { normal, viewDir, lightDir, roughness, metallic, albedo } = context;
  const half = viewDir.clone().add(lightDir).normalize();
  const normalDotLight = Math.max(0, normal.dot(lightDir));
  const normalDotView = Math.max(1e-4, normal.dot(viewDir));
  const normalDotHalf = Math.max(0, normal.dot(half));
  const viewDotHalf = Math.max(0, viewDir.dot(half));
  const f0 = baseReflectance(albedo, metallic);
  const fresnel = fresnelSchlick(viewDotHalf, f0);
  const distribution = distributionGgx(normalDotHalf, roughness);
  const geometry = geometrySmith(normalDotView, normalDotLight, roughness);
  const specular = scaleRgb(
    mulRgb(fresnel, rgb(distribution * geometry, distribution * geometry, distribution * geometry)),
    context.specular / Math.max(4 * normalDotView * normalDotLight, 1e-4),
  );
  const kd = scaleRgb(addRgb(rgb(1, 1, 1), scaleRgb(fresnel, -1)), 1 - metallic);
  const diffuse = scaleRgb(mulRgb(kd, albedo), 1 / Math.PI);
  return scaleRgb(addRgb(diffuse, specular), normalDotLight);
}

export interface ShadeContext {
  point: SurfacePoint;
  viewDir: Vec3;
  lights: readonly Light[];
  probe?: ReflectionProbe | null;
  shadow?: number;
}

export function shadePbr(material: PbrMaterial, context: ShadeContext): Rgb {
  const albedo = material.albedoRgb();
  const roughness = material.roughnessClamped();
  const metallic = Math.min(1, Math.max(0, material.metallic));
  const shadow = context.shadow === undefined ? 1 : Math.min(1, Math.max(0, context.shadow));
  let total = rgb(0, 0, 0);
  for (const light of context.lights) {
    if (!light.enabled) continue;
    if (light.kind === "ambient") {
      total = addRgb(total, ambientRadiance(light, albedo));
      continue;
    }
    const { direction } = lightVector(light, context.point);
    const normalDotLight = context.point.normal.dot(direction);
    if (normalDotLight <= 0) continue;
    const radiance = lightRadiance(light, context.point);
    const brdf = evaluateBrdf({
      normal: context.point.normal,
      viewDir: context.viewDir,
      lightDir: direction,
      roughness,
      metallic,
      albedo,
      specular: material.specular,
    });
    total = addRgb(total, mulRgb(brdf, scaleRgb(radiance, shadow / Math.max(normalDotLight, 1e-6))));
  }
  if (context.probe) {
    total = addRgb(total, iblAmbient(context.probe, context.point.normal, albedo, metallic, roughness, material.ao));
  }
  total = addRgb(total, material.emissionRgb());
  return clampRgb(total, 0);
}

export function metalnessWorkflowAlbedo(base: Color, metallic: number): Rgb {
  return scaleRgb(rgbOf(base), 1 - 0.5 * metallic);
}

export const DEFAULT_PBR = (): PbrMaterial => new PbrMaterial({ baseColor: Colors.white.clone() });
