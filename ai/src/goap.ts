export type WorldValue = boolean | number | string;
export type WorldState = ReadonlyMap<string, WorldValue>;

export function worldState(entries: Record<string, WorldValue> = {}): Map<string, WorldValue> {
  return new Map(Object.entries(entries));
}

export function statesEqual(a: WorldState, b: WorldState): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

export function satisfies(state: WorldState, conditions: ReadonlyMap<string, WorldValue>): boolean {
  for (const [key, value] of conditions) {
    if (state.get(key) !== value) return false;
  }
  return true;
}

export function applyEffects(state: WorldState, effects: ReadonlyMap<string, WorldValue>): Map<string, WorldValue> {
  const next = new Map(state);
  for (const [key, value] of effects) next.set(key, value);
  return next;
}

export interface GoapAction {
  readonly name: string;
  readonly cost: number;
  readonly preconditions: ReadonlyMap<string, WorldValue>;
  readonly effects: ReadonlyMap<string, WorldValue>;
}

export function goapAction(name: string, cost: number, preconditions: Record<string, WorldValue>, effects: Record<string, WorldValue>): GoapAction {
  return { name, cost, preconditions: new Map(Object.entries(preconditions)), effects: new Map(Object.entries(effects)) };
}

export interface GoapPlan {
  actions: GoapAction[];
  cost: number;
  steps: number;
}

export class GoapPlanner {
  readonly actions: GoapAction[];
  readonly maxSteps: number;

  constructor(actions: GoapAction[] = [], maxSteps = 64) {
    this.actions = [...actions];
    this.maxSteps = maxSteps;
  }

  plan(start: WorldState, goal: ReadonlyMap<string, WorldValue>): GoapPlan | null {
    interface SearchNode {
      state: Map<string, WorldValue>;
      actions: GoapAction[];
      cost: number;
    }
    const open: SearchNode[] = [{ state: new Map(start), actions: [], cost: 0 }];
    const visited = new Set<string>();
    let steps = 0;
    while (open.length > 0) {
      open.sort((a, b) => a.cost - b.cost);
      const current = open.shift()!;
      steps += 1;
      if (steps > this.maxSteps) return null;
      if (satisfies(current.state, goal)) return { actions: current.actions, cost: current.cost, steps };
      const key = serializeState(current.state);
      if (visited.has(key)) continue;
      visited.add(key);
      for (const action of this.actions) {
        if (!satisfies(current.state, action.preconditions)) continue;
        const nextState = applyEffects(current.state, action.effects);
        const nextKey = serializeState(nextState);
        if (visited.has(nextKey)) continue;
        open.push({ state: nextState, actions: [...current.actions, action], cost: current.cost + action.cost });
      }
    }
    return null;
  }
}

function serializeState(state: WorldState): string {
  return [...state.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, value]) => `${key}=${String(value)}`).join("|");
}
