import { describe, expect, it } from "vitest";
import { Color, Vec3 } from "@obx/math";
import {
  addRgb,
  ambientRadiance,
  distanceAttenuation,
  evaluateLighting,
  LightRig,
  LIGHT_UNIFORM_STRIDE,
  lightRadiance,
  lightVector,
  makeAmbient,
  makeDirectional,
  makePoint,
  makeSpot,
  packLights,
  rgb,
  spotFalloff,
} from "../src/lights.js";
import {
  baseReflectance,
  distributionGgx,
  fresnelSchlick,
  PbrMaterial,
  shadePbr,
} from "../src/pbr.js";
import {
  CascadedShadowMaps,
  cascadeSplits,
  orthographicLightViewProjection,
  pcfSample,
  renderShadowMap,
  sampleShadowMap,
  type ShadowTriangle,
} from "../src/shadows.js";
import {
  bakeProbeFromSky,
  computeIrradiance,
  makeSky,
  renderSky,
  sampleReflection,
  skyRadiance,
} from "../src/environment.js";
import {
  applyColorGrade,
  applyTaa,
  applyVignette,
  createFrameBuffer,
  defaultPostSettings,
  extractBrightPass,
  toneMapValue,
} from "../src/post.js";

const origin = { position: new Vec3(0, 0, 0), normal: new Vec3(0, 1, 0) };

describe("lights", () => {
  it("attenuates inverse square with smooth range cutoff", () => {
    expect(distanceAttenuation(2, 10)).toBeCloseTo(0.24920064, 6);
    expect(distanceAttenuation(10, 10)).toBe(0);
    expect(distanceAttenuation(2, 0)).toBeCloseTo(0.25, 6);
  });

  it("computes spotlight falloff against the cone axis", () => {
    const spot = makeSpot(new Vec3(0, 2, 0), new Vec3(0, -1, 0), new Color(1, 1, 1));
    expect(spotFalloff(spot, new Vec3(0, 1, 0))).toBe(1);
    expect(spotFalloff(spot, new Vec3(0, -1, 0))).toBe(0);
  });

  it("derives light vectors from surface points", () => {
    const point = makePoint(new Vec3(0, 2, 0), new Color(1, 1, 1));
    const vector = lightVector(point, origin);
    expect(vector.direction.y).toBeCloseTo(1, 6);
    expect(vector.distance).toBeCloseTo(2, 6);
  });

  it("radiates zero from disabled or ambient lights", () => {
    expect(lightRadiance(makeAmbient(new Color(1, 1, 1)), origin)).toEqual({ r: 0, g: 0, b: 0 });
    const off = makePoint(new Vec3(0, 2, 0), new Color(1, 1, 1));
    off.enabled = false;
    expect(lightRadiance(off, origin)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("radiates on-axis spotlight through the surface", () => {
    const spot = makeSpot(new Vec3(0, 2, 0), new Vec3(0, -1, 0), new Color(1, 1, 1));
    const radiance = lightRadiance(spot, origin);
    expect(radiance.r).toBeCloseTo(0.24920064, 4);
    expect(radiance.g).toBeCloseTo(0.24920064, 4);
  });

  it("accumulates ambient and directional contributions", () => {
    const lights = [makeAmbient(new Color(1, 1, 1)), makeDirectional(new Vec3(0, -1, 0), new Color(1, 1, 1))];
    const total = evaluateLighting(lights, origin, rgb(1, 0, 0));
    expect(total.r).toBeCloseTo(2, 5);
    expect(total.g).toBeCloseTo(0, 5);
  });

  it("packs light uniforms with numeric kind codes", () => {
    const lights = [
      makeDirectional(new Vec3(0, -1, 0), new Color(1, 0, 0), 2),
      makePoint(new Vec3(1, 2, 3), new Color(0, 1, 0), 3, 7),
      makeSpot(new Vec3(0, 1, 0), new Vec3(0, -1, 0), new Color(0, 0, 1)),
      makeAmbient(new Color(1, 1, 1)),
    ];
    const packed = packLights(lights);
    expect(packed.length).toBe(4 * LIGHT_UNIFORM_STRIDE);
    expect(packed[3]).toBe(0);
    expect(packed[LIGHT_UNIFORM_STRIDE + 3]).toBe(1);
    expect(packed[LIGHT_UNIFORM_STRIDE * 2 + 3]).toBe(2);
    expect(packed[LIGHT_UNIFORM_STRIDE * 3 + 3]).toBe(3);
    expect(packed[LIGHT_UNIFORM_STRIDE + 11]).toBe(7);
    expect(packed[LIGHT_UNIFORM_STRIDE]).toBe(1);
  });

  it("rig filters disabled lights", () => {
    const rig = new LightRig();
    const off = makePoint(new Vec3(0, 1, 0), new Color(1, 1, 1));
    off.enabled = false;
    rig.add(makeAmbient(new Color(1, 1, 1))).add(off);
    expect(rig.enabled()).toHaveLength(1);
    expect(rig.pack().length).toBe(LIGHT_UNIFORM_STRIDE);
  });
});

describe("pbr", () => {
  it("evaluates fresnel at the extremes", () => {
    expect(fresnelSchlick(1, rgb(0.04, 0.04, 0.04)).r).toBeCloseTo(0.04, 6);
    expect(fresnelSchlick(0, rgb(0.04, 0.04, 0.04)).r).toBeCloseTo(1, 6);
    expect(fresnelSchlick(0.5, rgb(0.04, 0.04, 0.04)).r).toBeCloseTo(0.07, 6);
  });

  it("blends base reflectance by metalness", () => {
    expect(baseReflectance(rgb(0.5, 0.5, 0.5), 0).r).toBeCloseTo(0.04, 6);
    expect(baseReflectance(rgb(0.5, 0.5, 0.5), 1).r).toBeCloseTo(0.5, 6);
  });

  it("peaks ggx distribution at normal alignment", () => {
    expect(distributionGgx(1, 0.5)).toBeCloseTo(5.092958, 5);
    expect(distributionGgx(0, 0.5)).toBeCloseTo(0.0625 / Math.PI, 6);
  });

  it("shades ambient-only lighting directly", () => {
    const material = new PbrMaterial({ baseColor: new Color(1, 1, 1) });
    const result = shadePbr(material, {
      point: origin,
      viewDir: new Vec3(0, 1, 0),
      lights: [makeAmbient(new Color(1, 1, 1))],
    });
    expect(result.r).toBeCloseTo(1, 5);
    expect(result.g).toBeCloseTo(1, 5);
    expect(result.b).toBeCloseTo(1, 5);
  });

  it("drops direct light fully in shadow", () => {
    const material = new PbrMaterial({ baseColor: new Color(1, 1, 1) });
    const lights = [makeAmbient(new Color(1, 1, 1)), makeDirectional(new Vec3(0, -1, 0), new Color(1, 1, 1))];
    const lit = shadePbr(material, { point: origin, viewDir: new Vec3(0, 1, 0), lights });
    const shadowed = shadePbr(material, { point: origin, viewDir: new Vec3(0, 1, 0), lights, shadow: 0 });
    expect(lit.r).toBeGreaterThan(shadowed.r + 0.01);
    expect(shadowed.r).toBeCloseTo(1, 5);
  });

  it("scales emission by strength", () => {
    const material = new PbrMaterial({ emissive: new Color(0.5, 0.5, 0.5), emissionStrength: 2 });
    const result = shadePbr(material, { point: origin, viewDir: new Vec3(0, 1, 0), lights: [] });
    expect(result.r).toBeCloseTo(1, 5);
    expect(ambientRadiance(makeAmbient(new Color(1, 1, 1)), rgb(0.25, 0.5, 1))).toEqual({ r: 0.25, g: 0.5, b: 1 });
  });
});

describe("shadows", () => {
  const quad: ShadowTriangle[] = [
    { a: new Vec3(-5, 0, -5), b: new Vec3(5, 0, -5), c: new Vec3(5, 0, 5) },
    { a: new Vec3(-5, 0, -5), b: new Vec3(5, 0, 5), c: new Vec3(-5, 0, 5) },
  ];
  const viewProjection = orthographicLightViewProjection(new Vec3(0, 10, 0), new Vec3(0, -1, 0), 10);

  it("marks occluders below as shadowed and above as lit", () => {
    const map = renderShadowMap(quad, viewProjection, 32, 32);
    expect(sampleShadowMap(map, new Vec3(0, 0.5, 0))).toBe(1);
    expect(sampleShadowMap(map, new Vec3(0, -0.5, 0))).toBe(0);
  });

  it("softens shadow edges with pcf", () => {
    const map = renderShadowMap(quad, viewProjection, 32, 32);
    const sample = pcfSample(map, new Vec3(0, 0.5, 0), 0.002, 4, 1);
    expect(sample).toBeGreaterThanOrEqual(0);
    expect(sample).toBeLessThanOrEqual(1);
  });

  it("splits cascades between uniform and logarithmic schemes", () => {
    const splits = cascadeSplits(1, 100, 4);
    expect(splits).toHaveLength(4);
    expect(splits[0]).toBeCloseTo(8.8092, 3);
    expect(splits[1]).toBeCloseTo(20.125, 3);
    expect(splits[2]).toBeCloseTo(42.5295, 3);
    expect(splits[3]).toBe(100);
    expect(cascadeSplits(1, 100, 1)).toEqual([100]);
  });

  it("assigns depths to cascades", () => {
    const csm = new CascadedShadowMaps();
    const splits = [8.8, 20, 42, 100];
    expect(csm.cascadeForDepth(5, splits)).toBe(0);
    expect(csm.cascadeForDepth(30, splits)).toBe(2);
    expect(csm.cascadeForDepth(200, splits)).toBe(3);
    expect(csm.maps).toHaveLength(0);
  });
});

describe("environment", () => {
  it("evaluates sky gradient at exact anchors", () => {
    const sky = makeSky({ sunIntensity: 0 });
    const zenith = skyRadiance(sky, new Vec3(0, 1, 0));
    const horizon = skyRadiance(sky, new Vec3(1, 0, 0));
    expect(zenith.r).toBeCloseTo(0.15, 5);
    expect(zenith.b).toBeCloseTo(0.8, 5);
    expect(horizon.r).toBeCloseTo(0.7, 5);
  });

  it("brightens toward the sun disc", () => {
    const sky = makeSky();
    const towardSun = skyRadiance(sky, sky.sunDirection);
    const zenith = skyRadiance(sky, new Vec3(0, 1, 0));
    expect(towardSun.r).toBeGreaterThan(zenith.r + 1);
  });

  it("bakes uniform skies into uniform probes", () => {
    const sky = makeSky({
      zenith: new Color(0.2, 0.4, 0.6),
      horizon: new Color(0.2, 0.4, 0.6),
      ground: new Color(0.2, 0.4, 0.6),
      sunIntensity: 0,
    });
    const probe = bakeProbeFromSky(sky, 4);
    for (const direction of [new Vec3(0, 1, 0), new Vec3(1, 0, 0), new Vec3(0, -1, 0), new Vec3(0, 0, -1)]) {
      const sample = sampleReflection(probe, direction);
      expect(sample.r).toBeCloseTo(0.2, 4);
      expect(sample.g).toBeCloseTo(0.4, 4);
      expect(sample.b).toBeCloseTo(0.6, 4);
    }
    const irradiance = computeIrradiance(probe);
    expect(irradiance.g).toBeCloseTo(0.4, 4);
  });

  it("renders sky buffers with opaque pixels", () => {
    const pixels = renderSky(makeSky(), { position: new Vec3(0, 0, 0), forward: new Vec3(0, 0, -1), up: new Vec3(0, 1, 0), fovRadians: 1, aspect: 1 }, 2, 2);
    expect(pixels.length).toBe(16);
    for (let i = 3; i < 16; i += 4) expect(pixels[i]).toBe(1);
  });
});

describe("post", () => {
  it("maps tones with known anchors", () => {
    expect(toneMapValue(2, "linear")).toBe(1);
    expect(toneMapValue(0.25, "linear")).toBe(0.25);
    expect(toneMapValue(1, "reinhard")).toBeCloseTo(0.5, 6);
    expect(toneMapValue(0, "aces")).toBe(0);
    expect(toneMapValue(1, "aces")).toBeCloseTo(0.803797, 5);
    expect(toneMapValue(-3, "reinhard")).toBe(0);
  });

  it("allocates framebuffer planes on demand", () => {
    const flat = createFrameBuffer(2, 2);
    expect(flat.color.length).toBe(16);
    expect(flat.depth).toBeNull();
    const full = createFrameBuffer(2, 2, true, true);
    expect(full.depth!.length).toBe(4);
    expect(full.velocity!.length).toBe(8);
  });

  it("extracts only pixels above the bloom threshold", () => {
    const buffer = createFrameBuffer(1, 1);
    buffer.color.set([1, 1, 1, 1]);
    const bright = extractBrightPass(buffer, 0.5);
    expect(bright[0]).toBeCloseTo(0.5, 6);
    expect(bright[3]).toBe(1);
    const dim = createFrameBuffer(1, 1);
    dim.color.set([0.1, 0.1, 0.1, 1]);
    expect(extractBrightPass(dim, 0.5)[0]).toBe(0);
  });

  it("desaturates grades to luminance", () => {
    const buffer = createFrameBuffer(1, 1);
    buffer.color.set([1, 0, 0, 1]);
    applyColorGrade(buffer, { exposure: 1, contrast: 1, saturation: 0, lift: 0, gamma: 1, gain: 1 });
    expect(buffer.color[0]).toBeCloseTo(0.2126, 4);
    expect(buffer.color[1]).toBeCloseTo(0.2126, 4);
    expect(buffer.color[2]).toBeCloseTo(0.2126, 4);
  });

  it("darkens vignette corners relative to the center", () => {
    const buffer = createFrameBuffer(3, 3);
    for (let i = 0; i < 9; i += 1) buffer.color.set([1, 1, 1, 1], i * 4);
    applyVignette(buffer, { strength: 1, radius: 0.5 });
    expect(buffer.color[0]!).toBeLessThan(buffer.color[4 * 4]!);
  });

  it("locks taa output to history at full alpha", () => {
    const buffer = createFrameBuffer(1, 1);
    buffer.color.set([0.2, 0.2, 0.2, 1]);
    const history = new Float32Array([0.8, 0.8, 0.8, 1]);
    applyTaa(buffer, history, { enabled: true, alpha: 1 });
    expect(buffer.color[0]).toBeCloseTo(0.8, 6);
    expect(history[0]).toBeCloseTo(0.8, 6);
  });

  it("keeps buffers identical when effects are disabled", () => {
    const buffer = createFrameBuffer(1, 1);
    buffer.color.set([0.4, 0.5, 0.6, 1]);
    const before = Array.from(buffer.color);
    const settings = defaultPostSettings();
    applyColorGrade(buffer, settings.grade);
    for (let i = 0; i < before.length; i += 1) expect(buffer.color[i]).toBeCloseTo(before[i]!, 5);
  });
});
