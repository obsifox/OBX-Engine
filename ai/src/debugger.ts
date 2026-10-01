import type { BtStatus, BtTickRecord } from "./behaviortree.js";
import type { SensedStimulus } from "./perception.js";
import type { GoapPlan } from "./goap.js";

export interface AiDebugFrame {
  tick: number;
  timestamp: number;
  treeStatus?: BtStatus;
  trace: BtTickRecord[];
  stimuli: { id: string; awareness: number; distance: number }[];
  plan?: { goal: string; actionNames: string[]; cost: number };
  notes: string[];
}

export class AiDebugger {
  frames: AiDebugFrame[] = [];
  #tick = 0;
  #maxFrames: number;
  #paused = false;

  constructor(maxFrames = 240) {
    this.#maxFrames = maxFrames;
  }

  get paused(): boolean {
    return this.#paused;
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;
  }

  recordTick(treeStatus: BtStatus, trace: BtTickRecord[], stimuli: readonly SensedStimulus[], timestamp: number): AiDebugFrame {
    const frame: AiDebugFrame = {
      tick: this.#tick++,
      timestamp,
      treeStatus,
      trace: [...trace],
      stimuli: stimuli.map((entry) => ({ id: entry.stimulus.id, awareness: entry.awareness, distance: entry.distance })),
      notes: [],
    };
    if (!this.#paused) {
      this.frames.push(frame);
      if (this.frames.length > this.#maxFrames) this.frames.shift();
    }
    return frame;
  }

  recordPlan(goal: string, plan: GoapPlan, timestamp: number): AiDebugFrame {
    const frame: AiDebugFrame = {
      tick: this.#tick++,
      timestamp,
      trace: [],
      stimuli: [],
      plan: { goal, actionNames: plan.actions.map((action) => action.name), cost: plan.cost },
      notes: [],
    };
    if (!this.#paused) {
      this.frames.push(frame);
      if (this.frames.length > this.#maxFrames) this.frames.shift();
    }
    return frame;
  }

  note(frame: AiDebugFrame, message: string): void {
    frame.notes.push(message);
  }

  frameAt(tick: number): AiDebugFrame | null {
    return this.frames.find((frame) => frame.tick === tick) ?? null;
  }

  summarize(): { frames: number; lastStatus: BtStatus | null; averageAwareness: number } {
    const last = this.frames[this.frames.length - 1];
    let awarenessSum = 0;
    let awarenessCount = 0;
    for (const frame of this.frames) {
      for (const entry of frame.stimuli) {
        awarenessSum += entry.awareness;
        awarenessCount += 1;
      }
    }
    return {
      frames: this.frames.length,
      lastStatus: last?.treeStatus ?? null,
      averageAwareness: awarenessCount > 0 ? awarenessSum / awarenessCount : 0,
    };
  }

  clear(): void {
    this.frames = [];
    this.#tick = 0;
  }
}
