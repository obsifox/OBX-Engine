export interface AiPoint {
  x: number;
  y: number;
  z: number;
}

export interface Stimulus {
  id: string;
  kind: string;
  position: AiPoint;
  strength: number;
}

export interface SensedStimulus {
  stimulus: Stimulus;
  distance: number;
  awareness: number;
  inSight: boolean;
  heard: boolean;
}

export interface SenseConfig {
  sightRange: number;
  sightAngleDegrees: number;
  hearingRange: number;
  awarenessGainPerSecond: number;
  awarenessDecayPerSecond: number;
  forgetThreshold: number;
}

export function defaultSenseConfig(over: Partial<SenseConfig> = {}): SenseConfig {
  return {
    sightRange: over.sightRange ?? 12,
    sightAngleDegrees: over.sightAngleDegrees ?? 110,
    hearingRange: over.hearingRange ?? 8,
    awarenessGainPerSecond: over.awarenessGainPerSecond ?? 1.4,
    awarenessDecayPerSecond: over.awarenessDecayPerSecond ?? 0.35,
    forgetThreshold: over.forgetThreshold ?? 0.05,
  };
}

function distance(a: AiPoint, b: AiPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export class PerceptionSystem {
  config: SenseConfig;
  memory = new Map<string, SensedStimulus>();

  constructor(config: Partial<SenseConfig> = {}) {
    this.config = defaultSenseConfig(config);
  }

  sense(observer: AiPoint, forward: AiPoint, stimuli: readonly Stimulus[], deltaSeconds: number): SensedStimulus[] {
    const forgotten: string[] = [];
    for (const entry of this.memory.values()) {
      entry.awareness = Math.max(0, entry.awareness - this.config.awarenessDecayPerSecond * deltaSeconds);
      if (entry.awareness <= this.config.forgetThreshold) forgotten.push(entry.stimulus.id);
    }
    for (const id of forgotten) this.memory.delete(id);
    const seen: SensedStimulus[] = [];
    const forwardLength = Math.hypot(forward.x, forward.y, forward.z) || 1;
    const fx = forward.x / forwardLength;
    const fy = forward.y / forwardLength;
    const fz = forward.z / forwardLength;
    const halfAngle = (this.config.sightAngleDegrees * Math.PI) / 180 / 2;
    for (const stimulus of stimuli) {
      const dx = stimulus.position.x - observer.x;
      const dy = stimulus.position.y - observer.y;
      const dz = stimulus.position.z - observer.z;
      const dist = Math.hypot(dx, dy, dz);
      const inSightRange = dist <= this.config.sightRange;
      const dot = dist <= 1e-6 ? 1 : (dx * fx + dy * fy + dz * fz) / dist;
      const angleOk = dot >= Math.cos(halfAngle);
      const inSight = inSightRange && angleOk;
      const heard = dist <= this.config.hearingRange * stimulus.strength;
      if (!inSight && !heard) continue;
      const previous = this.memory.get(stimulus.id)?.awareness ?? 0;
      const gain = this.config.awarenessGainPerSecond * stimulus.strength * deltaSeconds;
      const awareness = Math.min(1, previous + gain);
      const entry: SensedStimulus = { stimulus, distance: dist, awareness, inSight, heard };
      this.memory.set(stimulus.id, entry);
      seen.push(entry);
    }
    return seen;
  }

  awareOf(id: string): SensedStimulus | null {
    return this.memory.get(id) ?? null;
  }

  mostAware(): SensedStimulus | null {
    let best: SensedStimulus | null = null;
    for (const entry of this.memory.values()) {
      if (!best || entry.awareness > best.awareness) best = entry;
    }
    return best;
  }

  forget(id: string): boolean {
    return this.memory.delete(id);
  }

  clear(): void {
    this.memory.clear();
  }
}
