export type ObjectiveType = "collect" | "kill" | "reach" | "talk" | "flag";

export interface ObjectiveDefinition {
  id: string;
  type: ObjectiveType;
  target: string;
  count: number;
  optional?: boolean;
}

export interface RewardDefinition {
  items?: Array<{ id: string; count: number }>;
  flags?: string[];
}

export interface QuestDefinition {
  id: string;
  title: string;
  prerequisites?: string[];
  objectives: ObjectiveDefinition[];
  rewards?: RewardDefinition;
  next?: string[];
}

export type QuestStatus = "inactive" | "active" | "completed" | "failed";

export interface QuestState {
  status: QuestStatus;
  progress: Record<string, number>;
  rewardsClaimed: boolean;
}

export interface QuestEvent {
  type: ObjectiveType;
  target: string;
  count?: number;
}

export interface QuestSnapshot {
  version: number;
  states: Record<string, QuestState>;
  flags: string[];
}

export const QUEST_SNAPSHOT_VERSION = 1;

export class QuestSystem {
  private readonly definitions = new Map<string, QuestDefinition>();
  private readonly states = new Map<string, QuestState>();
  private readonly flagSet = new Set<string>();

  constructor(definitions: readonly QuestDefinition[] = []) {
    for (const definition of definitions) this.define(definition);
  }

  define(definition: QuestDefinition): QuestDefinition {
    if (this.definitions.has(definition.id)) throw new RangeError(`duplicate quest ${definition.id}`);
    if (definition.objectives.length === 0) throw new RangeError(`quest ${definition.id} has no objectives`);
    const ids = new Set<string>();
    for (const objective of definition.objectives) {
      if (ids.has(objective.id)) throw new RangeError(`duplicate objective ${definition.id}.${objective.id}`);
      ids.add(objective.id);
    }
    this.definitions.set(definition.id, definition);
    return definition;
  }

  get size(): number {
    return this.definitions.size;
  }

  definition(id: string): QuestDefinition | undefined {
    return this.definitions.get(id);
  }

  status(id: string): QuestStatus {
    return this.states.get(id)?.status ?? "inactive";
  }

  state(id: string): QuestState | null {
    return this.states.get(id) ?? null;
  }

  progress(id: string, objectiveId: string): number {
    return this.states.get(id)?.progress[objectiveId] ?? 0;
  }

  hasFlag(flag: string): boolean {
    return this.flagSet.has(flag);
  }

  available(): string[] {
    return [...this.definitions.values()]
      .filter((definition) => this.status(definition.id) === "inactive" && this.prerequisitesMet(definition))
      .map((definition) => definition.id);
  }

  activeQuests(): string[] {
    return [...this.states.entries()].filter(([, state]) => state.status === "active").map(([id]) => id);
  }

  completedQuests(): string[] {
    return [...this.states.entries()].filter(([, state]) => state.status === "completed").map(([id]) => id);
  }

  start(id: string): boolean {
    const definition = this.definitions.get(id);
    if (!definition) throw new RangeError(`unknown quest ${id}`);
    if (this.status(id) !== "inactive" || !this.prerequisitesMet(definition)) return false;
    this.states.set(id, {
      status: "active",
      progress: Object.fromEntries(definition.objectives.map((objective) => [objective.id, 0])),
      rewardsClaimed: false,
    });
    return true;
  }

  notify(event: QuestEvent): string[] {
    const touched: string[] = [];
    const amount = Math.max(1, event.count ?? 1);
    for (const [id, state] of this.states) {
      if (state.status !== "active") continue;
      const definition = this.definitions.get(id)!;
      let changed = false;
      for (const objective of definition.objectives) {
        if (objective.type !== event.type || objective.target !== event.target) continue;
        const current = state.progress[objective.id] ?? 0;
        if (current >= objective.count) continue;
        state.progress[objective.id] = Math.min(objective.count, current + amount);
        changed = true;
      }
      if (changed) {
        touched.push(id);
        if (this.isComplete(id)) state.status = "completed";
      }
    }
    return touched;
  }

  objectiveDone(id: string, objectiveId: string): boolean {
    const definition = this.definitions.get(id);
    const state = this.states.get(id);
    if (!definition || !state) return false;
    const objective = definition.objectives.find((entry) => entry.id === objectiveId);
    if (!objective) return false;
    return (state.progress[objectiveId] ?? 0) >= objective.count;
  }

  isComplete(id: string): boolean {
    const definition = this.definitions.get(id);
    const state = this.states.get(id);
    if (!definition || !state) return false;
    return definition.objectives.every((objective) => {
      if (objective.optional) return true;
      return (state.progress[objective.id] ?? 0) >= objective.count;
    });
  }

  fail(id: string): boolean {
    const state = this.states.get(id);
    if (!state || state.status !== "active") return false;
    state.status = "failed";
    return true;
  }

  abandon(id: string): boolean {
    const state = this.states.get(id);
    if (!state || state.status !== "active") return false;
    this.states.delete(id);
    return true;
  }

  claimRewards(id: string): RewardDefinition | null {
    const definition = this.definitions.get(id);
    const state = this.states.get(id);
    if (!definition || !state) return null;
    if (state.status !== "completed" || state.rewardsClaimed) return null;
    state.rewardsClaimed = true;
    for (const flag of definition.rewards?.flags ?? []) this.flagSet.add(flag);
    return definition.rewards ?? {};
  }

  followUps(id: string): string[] {
    return [...(this.definitions.get(id)?.next ?? [])];
  }

  serialize(): string {
    const snapshot: QuestSnapshot = {
      version: QUEST_SNAPSHOT_VERSION,
      states: Object.fromEntries([...this.states.entries()].map(([id, state]) => [id, structuredClone(state)])),
      flags: [...this.flagSet],
    };
    return JSON.stringify(snapshot);
  }

  restore(serialized: string): void {
    const snapshot = JSON.parse(serialized) as QuestSnapshot;
    if (snapshot.version !== QUEST_SNAPSHOT_VERSION) throw new RangeError(`unsupported quest snapshot ${snapshot.version}`);
    this.states.clear();
    this.flagSet.clear();
    for (const [id, state] of Object.entries(snapshot.states)) {
      if (this.definitions.has(id)) this.states.set(id, structuredClone(state));
    }
    for (const flag of snapshot.flags) this.flagSet.add(flag);
  }

  private prerequisitesMet(definition: QuestDefinition): boolean {
    return (definition.prerequisites ?? []).every((id) => this.status(id) === "completed");
  }
}
