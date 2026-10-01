import { Vec3 } from "@obx/math";
import type { Pose, AnimValue } from "./animation.js";
import { AnimationClip, blendPoses, blendValues } from "./animation.js";

export interface BlendTree2DSample {
  x: number;
  y: number;
  clip: AnimationClip;
}

export class BlendTree2D {
  readonly samples: BlendTree2DSample[];
  valueX = 0;
  valueY = 0;

  constructor(samples: BlendTree2DSample[] = [], valueX = 0, valueY = 0) {
    this.samples = [...samples];
    this.valueX = valueX;
    this.valueY = valueY;
  }

  add(sample: BlendTree2DSample): void {
    this.samples.push(sample);
  }

  nearestSamples(x: number, y: number): BlendTree2DSample[] {
    return [...this.samples].sort((a, b) => {
      const da = (a.x - x) ** 2 + (a.y - y) ** 2;
      const db = (b.x - x) ** 2 + (b.y - y) ** 2;
      return da - db;
    });
  }

  sample(time: number, x = this.valueX, y = this.valueY): Pose | null {
    if (this.samples.length === 0) return null;
    const sorted = this.nearestSamples(x, y);
    const first = sorted[0]!;
    const base = first.clip.sample(time);
    if (sorted.length === 1) return base;
    const second = sorted[1]!;
    const d1 = Math.hypot(first.x - x, first.y - y);
    const d2 = Math.hypot(second.x - x, second.y - y);
    const total = d1 + d2;
    const t = total <= 1e-6 ? 0.5 : d2 / total;
    return blendPoses(base, second.clip.sample(time), t);
  }
}

export class DirectBlend {
  constructor(
    readonly a: AnimationClip,
    readonly b: AnimationClip,
    public weight = 0.5,
  ) {}

  sample(time: number): Pose {
    return blendPoses(this.a.sample(time), this.b.sample(time), clamp01(this.weight));
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function blendAdditive(base: Pose, additive: Pose, weight = 1): Pose {
  const result: Pose = new Map(base);
  for (const [key, delta] of additive) {
    const current = result.get(key);
    if (current === undefined) continue;
    result.set(key, addValues(current, delta, weight));
  }
  return result;
}

function addValues(base: AnimValue, delta: AnimValue, weight: number): AnimValue {
  if (typeof base === "number" && typeof delta === "number") return base + delta * weight;
  if (base instanceof Vec3 && delta instanceof Vec3) return base.clone().add(delta.clone().scale(weight));
  return blendValues(base, delta, weight);
}

export interface LayerDefinition {
  name: string;
  clip: AnimationClip;
  weight: number;
  mask?: ReadonlySet<string>;
  additive?: boolean;
}

export class AnimationLayerStack {
  readonly layers: LayerDefinition[] = [];

  add(layer: LayerDefinition): void {
    this.layers.push(layer);
  }

  remove(name: string): boolean {
    const index = this.layers.findIndex((layer) => layer.name === name);
    if (index < 0) return false;
    this.layers.splice(index, 1);
    return true;
  }

  setWeight(name: string, weight: number): boolean {
    const layer = this.layers.find((entry) => entry.name === name);
    if (!layer) return false;
    layer.weight = clamp01(weight);
    return true;
  }

  compose(time: number, base: Pose): Pose {
    let result: Pose = new Map(base);
    for (const layer of this.layers) {
      const sampled = layer.clip.sample(time);
      if (layer.additive) {
        const applied = blendAdditive(result, sampled, layer.weight);
        result = applied;
        continue;
      }
      for (const [key, value] of sampled) {
        const bone = key.split(".")[0] ?? key;
        if (layer.mask && !layer.mask.has(bone)) continue;
        const current = result.get(key);
        result.set(key, current === undefined ? value : blendValues(current, value, layer.weight));
      }
    }
    return result;
  }
}
