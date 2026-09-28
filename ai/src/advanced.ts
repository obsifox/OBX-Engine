import { Random } from "@obx/core";

export type CombatAction = "idle" | "engage" | "flank" | "flee" | "reload";

export interface CombatPerception {
  distance: number;
  threat: number;
  allies: number;
  ammo: number;
}

export class CombatBrain {
  private healthValue: number;
  readonly scores: Array<{ action: CombatAction; score: number }> = [];

  constructor(readonly options: { health?: number; aggression?: number; fleeThreshold?: number } = {}) {
    this.healthValue = options.health ?? 100;
  }

  perceive(perception: CombatPerception): CombatAction {
    const aggression = this.options.aggression ?? 0.5;
    const fleeThreshold = this.options.fleeThreshold ?? 0.25;
    const healthRatio = this.healthValue / 100;
    const options: Record<CombatAction, number> = {
      idle: perception.distance > 25 ? 0.6 : 0.1,
      engage: aggression * healthRatio * (1 - perception.threat) * Math.min(1, perception.ammo / 10) * Math.max(0, 1 - perception.distance / 30),
      flank: aggression * (1 - healthRatio) * (1 - perception.threat) * (perception.allies > 0 ? 0.9 : 0.3),
      flee: healthRatio < fleeThreshold ? 1 : perception.threat * (1 - aggression),
      reload: perception.ammo <= 2 ? 0.95 : 0.05,
    };
    this.scores.length = 0;
    let best: CombatAction = "idle";
    let bestScore = -Infinity;
    for (const [action, score] of Object.entries(options) as Array<[CombatAction, number]>) {
      this.scores.push({ action, score: Number(score.toFixed(3)) });
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  }

  damage(amount: number): void {
    this.healthValue = Math.max(0, this.healthValue - amount);
  }

  heal(amount: number): void {
    this.healthValue = Math.min(100, this.healthValue + amount);
  }

  get health(): number {
    return this.healthValue;
  }
}

export type WildlifeAction = "wander" | "graze" | "flee" | "herd";

export interface WildlifePerception {
  predatorDistance: number;
  foodDistance: number;
  herdSize: number;
}

export class WildlifeBrain {
  private readonly rng: Random;
  private readonly history: WildlifeAction[] = [];

  constructor(readonly options: { seed?: number; fear?: number; hunger?: number; fleeRadius?: number } = {}) {
    this.rng = new Random(options.seed ?? 3);
  }

  perceive(perception: WildlifePerception): WildlifeAction {
    const fear = this.options.fear ?? 0.5;
    const hunger = this.options.hunger ?? 0.5;
    const fleeRadius = this.options.fleeRadius ?? 12;
    const scores: Record<WildlifeAction, number> = {
      flee: perception.predatorDistance < fleeRadius ? fear * (1 - perception.predatorDistance / fleeRadius) + 0.4 : 0,
      graze: hunger * (1 - perception.foodDistance / 20),
      herd: perception.herdSize > 2 ? 0.45 : 0.1,
      wander: 0.2 + this.rng.next() * 0.2,
    };
    let best: WildlifeAction = "wander";
    let bestScore = -Infinity;
    for (const [action, score] of Object.entries(scores) as Array<[WildlifeAction, number]>) {
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    this.history.push(best);
    return best;
  }

  get recent(): WildlifeAction[] {
    return [...this.history];
  }
}

export const AI_ADVANCED_VERSION = "0.96.0";
