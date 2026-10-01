export type ResponseCurve = "linear" | "quadratic" | "exponential" | "logistic" | "inverse";

export interface Consideration {
  readonly name: string;
  readonly curve: ResponseCurve;
  readonly inputKey: string;
  readonly slope?: number;
  readonly exponent?: number;
  readonly xShift?: number;
  readonly yShift?: number;
}

export function consideration(name: string, inputKey: string, curve: ResponseCurve = "linear", params: Partial<Pick<Consideration, "slope" | "exponent" | "xShift" | "yShift">> = {}): Consideration {
  return { name, inputKey, curve, ...params };
}

export function evaluateCurve(curve: ResponseCurve, x: number, params: Pick<Consideration, "slope" | "exponent" | "xShift" | "yShift"> = {}): number {
  const slope = params.slope ?? 1;
  const exponent = params.exponent ?? 2;
  const xShift = params.xShift ?? 0;
  const yShift = params.yShift ?? 0;
  const value = x + xShift;
  switch (curve) {
    case "linear":
      return clamp01(slope * value + yShift);
    case "quadratic":
      return clamp01(slope * Math.pow(Math.max(value, 0), exponent) + yShift);
    case "exponential":
      return clamp01(slope * (Math.exp(Math.min(value, 8)) - 1) / (Math.exp(1) - 1) + yShift);
    case "logistic":
      return clamp01(1 / (1 + Math.exp(-slope * (value - 0.5))) + yShift);
    case "inverse":
      return clamp01(slope * (1 - value) + yShift);
    default:
      return clamp01(value);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export interface UtilityActionDefinition {
  readonly id: string;
  readonly considerations: readonly Consideration[];
  readonly baseScore?: number;
  readonly execute?: (inputs: ReadonlyMap<string, number>) => void;
}

export interface UtilitySelection {
  actionId: string;
  score: number;
  scores: Record<string, number>;
}

export class UtilityScorer {
  readonly actions: UtilityActionDefinition[];

  constructor(actions: UtilityActionDefinition[] = []) {
    this.actions = [...actions];
  }

  addAction(action: UtilityActionDefinition): void {
    this.actions.push(action);
  }

  score(action: UtilityActionDefinition, inputs: ReadonlyMap<string, number>): { score: number; scores: Record<string, number> } {
    const scores: Record<string, number> = {};
    let product = 1;
    let count = 0;
    for (const entry of action.considerations) {
      const raw = inputs.get(entry.inputKey) ?? 0;
      const value = evaluateCurve(entry.curve, raw, entry);
      scores[entry.name] = value;
      product *= value;
      count += 1;
    }
    const compensated = count > 0 ? Math.pow(product, 1 / count) : 1;
    const score = clamp01(compensated * (action.baseScore ?? 1));
    return { score, scores };
  }

  select(inputs: ReadonlyMap<string, number>): UtilitySelection | null {
    let best: UtilitySelection | null = null;
    for (const action of this.actions) {
      const { score, scores } = this.score(action, inputs);
      if (!best || score > best.score) best = { actionId: action.id, score, scores };
    }
    return best;
  }

  rank(inputs: ReadonlyMap<string, number>): UtilitySelection[] {
    return this.actions
      .map((action) => {
        const { score, scores } = this.score(action, inputs);
        return { actionId: action.id, score, scores };
      })
      .sort((a, b) => b.score - a.score);
  }

  run(inputs: ReadonlyMap<string, number>): UtilitySelection | null {
    const selection = this.select(inputs);
    if (!selection) return null;
    const action = this.actions.find((candidate) => candidate.id === selection.actionId);
    action?.execute?.(inputs);
    return selection;
  }
}
