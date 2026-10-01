import type { UiNode } from "./ui.js";
import { easings, UiTweenManager } from "./ui.js";
import type { MotionPreference } from "./a11y.js";
import { scaledDuration } from "./a11y.js";

export type UiStyleValue = number;

export interface UiKeyframe {
  time: number;
  values: Record<string, UiStyleValue>;
}

export interface UiAnimationClip {
  name: string;
  duration: number;
  loop: boolean;
  keyframes: UiKeyframe[];
  easing: keyof typeof easings;
}

export function uiAnimationClip(name: string, keyframes: UiKeyframe[], duration: number, loop = false, easing: keyof typeof easings = "easeInOut"): UiAnimationClip {
  return { name, duration, loop, keyframes: [...keyframes].sort((a, b) => a.time - b.time), easing };
}

export function sampleUiClip(clip: UiAnimationClip, time: number): Record<string, UiStyleValue> {
  const wrapped = clip.loop && clip.duration > 0 ? ((time % clip.duration) + clip.duration) % clip.duration : Math.min(Math.max(time, 0), clip.duration);
  const frames = clip.keyframes;
  if (frames.length === 0) return {};
  if (wrapped <= frames[0]!.time) return { ...frames[0]!.values };
  const last = frames[frames.length - 1]!;
  if (wrapped >= last.time) return { ...last.values };
  for (let i = 1; i < frames.length; i += 1) {
    const b = frames[i]!;
    if (wrapped <= b.time) {
      const a = frames[i - 1]!;
      const span = b.time - a.time;
      const t = span <= 0 ? 1 : (wrapped - a.time) / span;
      const eased = easings[clip.easing](t);
      const values: Record<string, UiStyleValue> = {};
      for (const key of Object.keys(a.values)) {
        const from = a.values[key] ?? 0;
        const to = b.values[key] ?? from;
        values[key] = from + (to - from) * eased;
      }
      return values;
    }
  }
  return { ...last.values };
}

export class UiAnimationPlayer {
  clips: UiAnimationClip[] = [];
  time = 0;
  #tweenManager: UiTweenManager;

  constructor(tweenManager = new UiTweenManager()) {
    this.#tweenManager = tweenManager;
  }

  add(clip: UiAnimationClip): void {
    this.clips.push(clip);
  }

  play(node: UiNode, clip: UiAnimationClip, preference: MotionPreference = { reduced: false }): void {
    const duration = scaledDuration(clip.duration, preference);
    if (duration === 0) {
      const values = sampleUiClip(clip, clip.duration);
      const style = node.style as unknown as Record<string, number>;
      for (const [key, value] of Object.entries(values)) style[key] = value;
      return;
    }
    const from = sampleUiClip(clip, 0);
    const to = sampleUiClip(clip, clip.duration);
    this.#tweenManager.animate(node, to, duration, easings[clip.easing]);
    void from;
  }

  update(dt: number): void {
    this.time += dt;
    this.#tweenManager.update(dt);
  }

  valuesAt(time: number, clipName: string): Record<string, UiStyleValue> {
    const clip = this.clips.find((entry) => entry.name === clipName);
    return clip ? sampleUiClip(clip, time) : {};
  }
}

export interface UiTransition {
  property: string;
  from: number;
  to: number;
  durationMs: number;
  easing: keyof typeof easings;
  elapsedMs: number;
  preference: MotionPreference;
}

export class UiTransitionRunner {
  #transitions: UiTransition[] = [];

  add(property: string, from: number, to: number, durationMs: number, easing: keyof typeof easings = "easeOutQuad", preference: MotionPreference = { reduced: false }): UiTransition {
    const transition: UiTransition = { property, from, to, durationMs: scaledDuration(durationMs, preference), easing, elapsedMs: 0, preference };
    this.#transitions.push(transition);
    return transition;
  }

  update(dtMs: number): void {
    for (let i = this.#transitions.length - 1; i >= 0; i -= 1) {
      const transition = this.#transitions[i]!;
      transition.elapsedMs += dtMs;
      if (transition.elapsedMs >= transition.durationMs) this.#transitions.splice(i, 1);
    }
  }

  value(property: string): number | null {
    const transition = this.#transitions.find((entry) => entry.property === property);
    if (!transition) return null;
    const t = transition.durationMs === 0 ? 1 : Math.min(transition.elapsedMs / transition.durationMs, 1);
    return transition.from + (transition.to - transition.from) * easings[transition.easing](t);
  }

  get active(): number {
    return this.#transitions.length;
  }
}
