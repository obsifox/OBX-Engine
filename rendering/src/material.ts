import { Color, Colors } from "@obx/math";
import type { Texture } from "./texture.js";

export type ShadingModel = "unlit" | "standard";

export interface MaterialOptions {
  name?: string;
  shading?: ShadingModel;
  baseColor?: Color;
  metallic?: number;
  roughness?: number;
  emissive?: Color;
  albedoTexture?: Texture | null;
  doubleSided?: boolean;
}

export class Material {
  name: string;
  shading: ShadingModel;
  baseColor: Color;
  metallic: number;
  roughness: number;
  emissive: Color;
  albedoTexture: Texture | null;
  doubleSided: boolean;

  constructor(options: MaterialOptions = {}) {
    this.name = options.name ?? "material";
    this.shading = options.shading ?? "standard";
    this.baseColor = options.baseColor?.clone() ?? Colors.white.clone();
    this.metallic = options.metallic ?? 0;
    this.roughness = options.roughness ?? 0.8;
    this.emissive = options.emissive?.clone() ?? Colors.transparent.clone();
    this.albedoTexture = options.albedoTexture ?? null;
    this.doubleSided = options.doubleSided ?? false;
  }

  clone(): Material {
    return new Material({
      name: this.name,
      shading: this.shading,
      baseColor: this.baseColor,
      metallic: this.metallic,
      roughness: this.roughness,
      emissive: this.emissive,
      albedoTexture: this.albedoTexture,
      doubleSided: this.doubleSided,
    });
  }
}

export interface AmbientLight {
  color: Color;
  intensity: number;
}

export interface DirectionalLight {
  direction: { x: number; y: number; z: number };
  color: Color;
  intensity: number;
}

export interface PointLight {
  position: { x: number; y: number; z: number };
  color: Color;
  intensity: number;
  range: number;
}

export interface LightingEnvironment {
  ambient: AmbientLight;
  directional: DirectionalLight[];
  point: PointLight[];
}

export function createLighting(options: Partial<LightingEnvironment> = {}): LightingEnvironment {
  return {
    ambient: options.ambient ?? { color: Colors.white.clone(), intensity: 0.15 },
    directional: options.directional ?? [],
    point: options.point ?? [],
  };
}

export interface Fog {
  color: Color;
  density: number;
}
