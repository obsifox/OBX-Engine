import { Quat, Vec3 } from "@obx/math";
import type { AnimValue, BoneDefinition, Interpolation, Keyframe, Pose } from "./animation.js";
import { AnimationClip, AnimationTrack, Skeleton } from "./animation.js";
import type { AnimationEvent } from "./events.js";
import { EventTrack } from "./events.js";
import type { BlendTree2DSample } from "./blends.js";
import { AnimationLayerStack, BlendTree2D, LayerDefinition } from "./blends.js";

export interface ClipDocument {
  name: string;
  duration: number;
  loop: boolean;
  tracks: { target: string; interpolation: Interpolation; keys: { time: number; value: number | number[] }[] }[];
  events: AnimationEvent[];
}

export interface SkeletonDocument {
  bones: { name: string; parent: string | null; position: [number, number, number]; rotation: [number, number, number, number] }[];
}

function serializeValue(value: AnimValue): number | number[] {
  if (typeof value === "number") return value;
  if (value instanceof Vec3) return [value.x, value.y, value.z];
  return [value.x, value.y, value.z, value.w];
}

function deserializeValue(raw: number | number[]): AnimValue {
  if (typeof raw === "number") return raw;
  if (raw.length === 3) return new Vec3(raw[0]!, raw[1]!, raw[2]!);
  return new Quat(raw[0]!, raw[1]!, raw[2]!, raw[3]!);
}

export class AnimationEditor {
  #tracks = new Map<string, { interpolation: Interpolation; keys: Keyframe[] }>();
  #events: AnimationEvent[] = [];
  name: string;
  duration: number;
  loop: boolean;

  constructor(name: string, duration = 1, loop = true) {
    this.name = name;
    this.duration = duration;
    this.loop = loop;
  }

  get trackTargets(): string[] {
    return [...this.tracks.keys()];
  }

  private get tracks(): Map<string, { interpolation: Interpolation; keys: Keyframe[] }> {
    return this.#tracks;
  }

  addTrack(target: string, interpolation: Interpolation = "linear"): void {
    if (!this.#tracks.has(target)) this.#tracks.set(target, { interpolation, keys: [] });
  }

  setTrackInterpolation(target: string, interpolation: Interpolation): boolean {
    const track = this.#tracks.get(target);
    if (!track) return false;
    track.interpolation = interpolation;
    return true;
  }

  setKey(target: string, time: number, value: AnimValue): void {
    let track = this.#tracks.get(target);
    if (!track) {
      track = { interpolation: "linear", keys: [] };
      this.#tracks.set(target, track);
    }
    const existing = track.keys.find((key) => Math.abs(key.time - time) <= 1e-6);
    if (existing) {
      existing.value = value;
    } else {
      track.keys.push({ time, value });
      track.keys.sort((a, b) => a.time - b.time);
    }
    if (time > this.duration) this.duration = time;
  }

  removeKey(target: string, time: number): boolean {
    const track = this.#tracks.get(target);
    if (!track) return false;
    const index = track.keys.findIndex((key) => Math.abs(key.time - time) <= 1e-6);
    if (index < 0) return false;
    track.keys.splice(index, 1);
    return true;
  }

  addEvent(event: AnimationEvent): void {
    this.#events.push(event);
  }

  removeEvent(name: string, atTime?: number): number {
    const before = this.#events.length;
    this.#events = this.#events.filter((event) => event.name !== name || (atTime !== undefined && Math.abs(event.time - atTime) > 1e-6));
    return before - this.#events.length;
  }

  eventTrack(): EventTrack {
    return new EventTrack(this.#events);
  }

  validate(): string[] {
    const errors: string[] = [];
    if (this.duration <= 0) errors.push("duration must be positive");
    for (const [target, track] of this.#tracks) {
      if (track.keys.length === 0) errors.push(`track ${target} has no keyframes`);
      for (let i = 1; i < track.keys.length; i += 1) {
        if (track.keys[i]!.time < track.keys[i - 1]!.time) errors.push(`track ${target} keys out of order`);
      }
    }
    for (const event of this.#events) {
      if (event.time < 0 || event.time > this.duration) errors.push(`event ${event.name} outside clip duration`);
    }
    return errors;
  }

  build(): AnimationClip {
    const errors = this.validate();
    if (errors.length > 0) throw new RangeError(errors.join("; "));
    const tracks = [...this.#tracks.entries()].map(([target, track]) => new AnimationTrack(target, track.keys, track.interpolation));
    return new AnimationClip(this.name, this.duration, tracks, this.loop);
  }

  serialize(): ClipDocument {
    return {
      name: this.name,
      duration: this.duration,
      loop: this.loop,
      tracks: [...this.#tracks.entries()].map(([target, track]) => ({
        target,
        interpolation: track.interpolation,
        keys: track.keys.map((key) => ({ time: key.time, value: serializeValue(key.value) })),
      })),
      events: this.#events.map((event) => ({ ...event })),
    };
  }

  static deserialize(document: ClipDocument): AnimationEditor {
    const editor = new AnimationEditor(document.name, document.duration, document.loop);
    for (const track of document.tracks) {
      editor.addTrack(track.target, track.interpolation);
      for (const key of track.keys) editor.setKey(track.target, key.time, deserializeValue(key.value));
    }
    for (const event of document.events) editor.addEvent(event);
    return editor;
  }
}

export class SkeletonEditor {
  #bones: BoneDefinition[] = [];

  addBone(name: string, parent: string | null, position: Vec3, rotation: Quat = Quat.identity()): BoneDefinition {
    if (this.#bones.some((bone) => bone.name === name)) throw new RangeError(`Duplicate bone ${name}`);
    const bone: BoneDefinition = { name, parent, position: position.clone(), rotation: rotation.clone() };
    this.#bones.push(bone);
    return bone;
  }

  removeBone(name: string): boolean {
    const children = this.#bones.filter((bone) => bone.parent === name);
    if (children.length > 0) return false;
    const index = this.#bones.findIndex((bone) => bone.name === name);
    if (index < 0) return false;
    this.#bones.splice(index, 1);
    return true;
  }

  reparent(name: string, newParent: string | null): boolean {
    const bone = this.#bones.find((entry) => entry.name === name);
    if (!bone) return false;
    if (newParent === name) return false;
    let cursor = newParent === null ? null : this.#bones.find((entry) => entry.name === newParent) ?? null;
    while (cursor) {
      if (cursor.name === name) return false;
      const parentName = cursor.parent;
      cursor = parentName === null ? null : this.#bones.find((entry) => entry.name === parentName) ?? null;
    }
    bone.parent = newParent;
    return true;
  }

  setRestPose(name: string, position: Vec3, rotation: Quat): boolean {
    const bone = this.#bones.find((entry) => entry.name === name);
    if (!bone) return false;
    bone.position = position.clone();
    bone.rotation = rotation.clone();
    return true;
  }

  validate(): string[] {
    const errors: string[] = [];
    const names = new Set(this.#bones.map((bone) => bone.name));
    for (const bone of this.#bones) {
      if (bone.parent && !names.has(bone.parent)) errors.push(`bone ${bone.name} missing parent ${bone.parent}`);
    }
    try {
      this.build();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "invalid skeleton");
    }
    return errors;
  }

  build(): Skeleton {
    return new Skeleton(this.#bones);
  }

  serialize(): SkeletonDocument {
    return {
      bones: this.#bones.map((bone) => ({
        name: bone.name,
        parent: bone.parent,
        position: [bone.position.x, bone.position.y, bone.position.z],
        rotation: [bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.rotation.w],
      })),
    };
  }

  static deserialize(document: SkeletonDocument): SkeletonEditor {
    const editor = new SkeletonEditor();
    for (const bone of document.bones) {
      editor.addBone(bone.name, bone.parent, new Vec3(bone.position[0], bone.position[1], bone.position[2]), new Quat(bone.rotation[0], bone.rotation[1], bone.rotation[2], bone.rotation[3]));
    }
    return editor;
  }
}

export interface BlendTree2DDocument {
  valueX: number;
  valueY: number;
  samples: { x: number; y: number; clip: ClipDocument }[];
}

export class BlendTree2DEditor {
  #samples: { x: number; y: number; clip: ClipDocument }[] = [];
  valueX = 0;
  valueY = 0;

  addSample(x: number, y: number, clip: AnimationEditor): void {
    this.#samples.push({ x, y, clip: clip.serialize() });
  }

  build(): BlendTree2D {
    const samples: BlendTree2DSample[] = this.#samples.map((sample) => ({
      x: sample.x,
      y: sample.y,
      clip: AnimationEditor.deserialize(sample.clip).build(),
    }));
    return new BlendTree2D(samples, this.valueX, this.valueY);
  }

  serialize(): BlendTree2DDocument {
    return { valueX: this.valueX, valueY: this.valueY, samples: this.#samples.map((sample) => ({ ...sample })) };
  }
}

export class LayerStackEditor {
  #layers: { name: string; clip: ClipDocument; weight: number; mask: string[] | null; additive: boolean }[] = [];

  addLayer(name: string, clip: AnimationEditor, weight = 1, mask: string[] | null = null, additive = false): void {
    this.#layers.push({ name, clip: clip.serialize(), weight, mask, additive });
  }

  build(): AnimationLayerStack {
    const stack = new AnimationLayerStack();
    for (const layer of this.#layers) {
      const definition: LayerDefinition = {
        name: layer.name,
        clip: AnimationEditor.deserialize(layer.clip).build(),
        weight: layer.weight,
        mask: layer.mask ? new Set(layer.mask) : undefined,
        additive: layer.additive,
      };
      stack.add(definition);
    }
    return stack;
  }
}

export function poseSummary(pose: Pose): Record<string, number | number[]> {
  const summary: Record<string, number | number[]> = {};
  for (const [key, value] of pose) summary[key] = serializeValue(value);
  return summary;
}
