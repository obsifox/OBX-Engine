import { Quat, Vec3 } from "@obx/math";

export type AnimValue = number | Vec3 | Quat;

export interface Keyframe<T extends AnimValue = AnimValue> {
  time: number;
  value: T;
}

export type Interpolation = "step" | "linear";

export class AnimationTrack<T extends AnimValue = AnimValue> {
  constructor(
    readonly target: string,
    readonly keys: readonly Keyframe<T>[],
    readonly interpolation: Interpolation = "linear",
  ) {
    if (keys.length === 0) throw new RangeError("Track needs keyframes");
    for (let i = 1; i < keys.length; i += 1) {
      if (keys[i]!.time < keys[i - 1]!.time) {
        throw new RangeError("Keyframes must be ordered");
      }
    }
  }

  sample(time: number): T {
    const keys = this.keys;
    if (time <= keys[0]!.time) return keys[0]!.value;
    const last = keys[keys.length - 1]!;
    if (time >= last.time) return last.value;
    for (let i = 1; i < keys.length; i += 1) {
      const b = keys[i]!;
      if (time <= b.time) {
        const a = keys[i - 1]!;
        if (this.interpolation === "step") return a.value;
        const span = b.time - a.time;
        const t = span <= 0 ? 1 : (time - a.time) / span;
        return blendValues(a.value, b.value, t) as T;
      }
    }
    return last.value;
  }
}

export function blendValues(a: AnimValue, b: AnimValue, t: number): AnimValue {
  if (typeof a === "number" && typeof b === "number") {
    return a + (b - a) * t;
  }
  if (a instanceof Vec3 && b instanceof Vec3) {
    return a.clone().lerp(b, t);
  }
  if (a instanceof Quat && b instanceof Quat) {
    return slerp(a, b, t);
  }
  return b;
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    return new Quat(
      a.x + (bx - a.x) * t,
      a.y + (by - a.y) * t,
      a.z + (bz - a.z) * t,
      a.w + (bw - a.w) * t,
    ).normalize();
  }
  const theta = Math.acos(Math.max(-1, Math.min(1, cos)));
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return new Quat(a.x * wa + bx * wb, a.y * wa + by * wb, a.z * wa + bz * wb, a.w * wa + bw * wb);
}

export type Pose = Map<string, AnimValue>;

export class AnimationClip {
  constructor(
    readonly name: string,
    readonly duration: number,
    readonly tracks: readonly AnimationTrack[],
    readonly loop = true,
  ) {}

  sample(time: number): Pose {
    const pose: Pose = new Map();
    const wrapped = this.loop && this.duration > 0 ? ((time % this.duration) + this.duration) % this.duration : Math.min(Math.max(time, 0), this.duration);
    for (const track of this.tracks) {
      pose.set(track.target, track.sample(wrapped));
    }
    return pose;
  }
}

export function blendPoses(a: Pose, b: Pose, t: number): Pose {
  const result: Pose = new Map();
  for (const [key, value] of a) {
    const other = b.get(key);
    result.set(key, other === undefined ? value : blendValues(value, other, t));
  }
  for (const [key, value] of b) {
    if (!result.has(key)) result.set(key, value);
  }
  return result;
}

export class AnimationPlayer {
  time = 0;
  speed = 1;
  playing = true;
  clip: AnimationClip | null = null;

  constructor(clip?: AnimationClip) {
    this.clip = clip ?? null;
  }

  play(clip: AnimationClip, restart = true): void {
    this.clip = clip;
    if (restart) this.time = 0;
    this.playing = true;
  }

  stop(): void {
    this.playing = false;
    this.time = 0;
  }

  pause(): void {
    this.playing = false;
  }

  resume(): void {
    this.playing = true;
  }

  update(dt: number): Pose | null {
    const clip = this.clip;
    if (!clip) return null;
    if (this.playing) {
      this.time += dt * this.speed;
      if (!clip.loop && this.time >= clip.duration) {
        this.time = clip.duration;
        this.playing = false;
      }
    }
    return clip.sample(this.time);
  }

  evaluate(): Pose | null {
    return this.clip ? this.clip.sample(this.time) : null;
  }
}

export type StateCondition = (params: ReadonlyMap<string, number | boolean | string>) => boolean;

export interface StateDefinition {
  name: string;
  clip: AnimationClip;
  speed?: number;
}

export interface TransitionDefinition {
  from: string;
  to: string;
  condition: StateCondition;
  fadeTime?: number;
}

export class AnimationStateMachine {
  readonly params = new Map<string, number | boolean | string>();
  current: string;
  private currentClip: AnimationClip;
  private player = new AnimationPlayer();
  private fadeFrom: Pose | null = null;
  private fadeTime = 0;
  private fadeElapsed = 0;

  constructor(
    readonly states: readonly StateDefinition[],
    readonly transitions: readonly TransitionDefinition[],
    initialState?: string,
  ) {
    const first = states.find((state) => state.name === initialState) ?? states[0];
    if (!first) throw new RangeError("State machine needs states");
    this.current = first.name;
    this.currentClip = first.clip;
    this.player.play(first.clip);
  }

  set(name: string, value: number | boolean | string): void {
    this.params.set(name, value);
  }

  update(dt: number): Pose {
    const from = this.transitions.find(
      (transition) => transition.from === this.current && transition.condition(this.params),
    );
    if (from) {
      const target = this.states.find((state) => state.name === from.to);
      if (target) {
        this.fadeFrom = this.player.evaluate();
        this.fadeTime = from.fadeTime ?? 0.2;
        this.fadeElapsed = 0;
        this.current = target.name;
        this.currentClip = target.clip;
        this.player.play(target.clip);
      }
    }
    const pose = this.player.update(dt) ?? this.currentClip.sample(0);
    if (this.fadeFrom) {
      this.fadeElapsed += dt;
      const t = this.fadeTime <= 0 ? 1 : Math.min(1, this.fadeElapsed / this.fadeTime);
      const blended = blendPoses(this.fadeFrom, pose, t);
      if (t >= 1) this.fadeFrom = null;
      return blended;
    }
    return pose;
  }
}

export interface BlendTreeEntry {
  clip: AnimationClip;
  threshold: number;
}

export class BlendTree1D {
  constructor(
    readonly entries: readonly BlendTreeEntry[],
    public parameter = 0,
  ) {
    if (entries.length === 0) throw new RangeError("Blend tree needs entries");
    for (let i = 1; i < entries.length; i += 1) {
      if (entries[i]!.threshold < entries[i - 1]!.threshold) {
        throw new RangeError("Blend tree entries must be sorted");
      }
    }
  }

  sample(time: number): Pose {
    const entries = this.entries;
    const value = this.parameter;
    if (value <= entries[0]!.threshold) return entries[0]!.clip.sample(time);
    const last = entries[entries.length - 1]!;
    if (value >= last.threshold) return last.clip.sample(time);
    for (let i = 1; i < entries.length; i += 1) {
      const b = entries[i]!;
      if (value <= b.threshold) {
        const a = entries[i - 1]!;
        const span = b.threshold - a.threshold;
        const t = span <= 0 ? 1 : (value - a.threshold) / span;
        return blendPoses(a.clip.sample(time), b.clip.sample(time), t);
      }
    }
    return last.clip.sample(time);
  }
}

export interface BoneDefinition {
  name: string;
  parent: string | null;
  position: Vec3;
  rotation: Quat;
}

export interface BonePose {
  position: Vec3;
  rotation: Quat;
}

export class Skeleton {
  readonly order: string[] = [];

  constructor(readonly bones: readonly BoneDefinition[]) {
    const names = new Set(bones.map((bone) => bone.name));
    if (names.size !== bones.length) throw new RangeError("Duplicate bone names");
    const resolved = new Set<string>();
    for (const bone of bones) {
      if (bone.parent && !names.has(bone.parent)) {
        throw new RangeError(`Missing parent ${bone.parent}`);
      }
      if (bone.parent && !resolved.has(bone.parent)) {
        const chain = [bone];
        const seen = new Set<string>([bone.name]);
        let current = bone;
        while (current.parent) {
          if (seen.has(current.parent)) throw new RangeError("Bone cycle");
          seen.add(current.parent);
          current = bones.find((candidate) => candidate.name === current.parent)!;
          chain.push(current);
        }
        for (let i = chain.length - 1; i >= 0; i -= 1) {
          if (!resolved.has(chain[i]!.name)) {
            resolved.add(chain[i]!.name);
            this.order.push(chain[i]!.name);
          }
        }
      } else if (!resolved.has(bone.name)) {
        resolved.add(bone.name);
        this.order.push(bone.name);
      }
    }
  }

  restPose(): Pose {
    const pose: Pose = new Map();
    for (const bone of this.bones) {
      pose.set(`${bone.name}.position`, bone.position.clone());
      pose.set(`${bone.name}.rotation`, bone.rotation.clone());
    }
    return pose;
  }

  worldPose(pose: Pose): Map<string, BonePose> {
    const world = new Map<string, BonePose>();
    for (const name of this.order) {
      const bone = this.bones.find((candidate) => candidate.name === name)!;
      const localPosition = (pose.get(`${name}.position`) as Vec3 | undefined) ?? bone.position;
      const localRotation = (pose.get(`${name}.rotation`) as Quat | undefined) ?? bone.rotation;
      const parentPose = bone.parent ? world.get(bone.parent) : undefined;
      if (parentPose) {
        const offset = parentPose.rotation.rotateVec3(localPosition);
        world.set(name, {
          position: parentPose.position.clone().add(offset),
          rotation: parentPose.rotation.clone().multiply(localRotation).normalize(),
        });
      } else {
        world.set(name, {
          position: localPosition.clone(),
          rotation: localRotation.clone(),
        });
      }
    }
    return world;
  }
}

export function applyLayer(base: Pose, layer: Pose, weight: number, mask?: ReadonlySet<string>): Pose {
  const result: Pose = new Map(base);
  for (const [key, value] of layer) {
    const bone = key.split(".")[0] ?? key;
    if (mask && !mask.has(bone)) continue;
    const current = result.get(key);
    result.set(key, current === undefined ? value : blendValues(current, value, weight));
  }
  return result;
}

export interface RootMotionDelta {
  position: Vec3;
  rotation: Quat;
}

export function rootMotion(clip: AnimationClip, fromTime: number, toTime: number): RootMotionDelta {
  const from = clip.sample(fromTime);
  const to = clip.sample(toTime);
  const fromPos = (from.get("root.position") as Vec3 | undefined) ?? new Vec3(0, 0, 0);
  const toPos = (to.get("root.position") as Vec3 | undefined) ?? new Vec3(0, 0, 0);
  const fromRot = (from.get("root.rotation") as Quat | undefined) ?? Quat.identity();
  const toRot = (to.get("root.rotation") as Quat | undefined) ?? Quat.identity();
  return {
    position: toPos.clone().sub(fromPos),
    rotation: fromRot.clone().invert().multiply(toRot),
  };
}

export interface TwoBoneIkResult {
  rootAngle: number;
  midAngle: number;
}

export function twoBoneIK(
  rootLength: number,
  midLength: number,
  target: Vec3,
  poleAngle = 0,
): TwoBoneIkResult {
  const distance = Math.min(target.length(), rootLength + midLength - 1e-6);
  const toTarget = target.clone();
  if (toTarget.lengthSq() < 1e-12) toTarget.set(1, 0, 0);
  const axis = toTarget.clone().normalize();
  const cosRoot = (rootLength * rootLength + distance * distance - midLength * midLength) /
    (2 * rootLength * distance);
  const rootAngle = Math.acos(Math.max(-1, Math.min(1, cosRoot))) + poleAngle;
  const cosMid = (rootLength * rootLength + midLength * midLength - distance * distance) /
    (2 * rootLength * midLength);
  const midAngle = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosMid)));
  void axis;
  return { rootAngle, midAngle };
}
