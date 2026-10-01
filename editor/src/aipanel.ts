import {
  AiDebugger,
  BtAction,
  BtCondition,
  BtSelector,
  BtSequence,
  BtTree,
  GoapPlanner,
  PerceptionSystem,
  UtilityScorer,
  createBlackboard,
  consideration,
  goapAction,
  worldState,
  type BtBlackboard,
  type BtStatus,
  type GoapAction,
  type GoapPlan,
  type SensedStimulus,
  type Stimulus,
  type UtilityActionDefinition,
  type WorldValue,
} from "@obx/ai";

export type BtNodeDocument =
  | { kind: "sequence"; name: string; children: BtNodeDocument[] }
  | { kind: "selector"; name: string; children: BtNodeDocument[] }
  | { kind: "condition"; name: string; key: string; equals: WorldValue }
  | { kind: "action"; name: string; effectKey: string; effectValue: WorldValue };

export interface AiEditorSnapshot {
  tree: BtNodeDocument | null;
  utilityActions: UtilityActionDefinition[];
  goal: Record<string, WorldValue>;
  lastStatus: BtStatus | null;
  lastPlan: string[] | null;
  sensed: { id: string; awareness: number }[];
}

function buildNode(document: BtNodeDocument): ReturnType<typeof createNode> {
  switch (document.kind) {
    case "sequence":
      return new BtSequence(document.name, document.children.map(buildNode));
    case "selector":
      return new BtSelector(document.name, document.children.map(buildNode));
    case "condition":
      return new BtCondition(document.name, (board) => board.get<WorldValue>(document.key) === document.equals);
    default:
      return new BtAction(document.name, (board) => {
        board.set(document.effectKey, document.effectValue);
        return "success";
      });
  }
}

function createNode(document: BtNodeDocument): BtSequence | BtSelector | BtCondition | BtAction {
  return buildNode(document) as BtSequence | BtSelector | BtCondition | BtAction;
}

export class AiEditorPanel {
  tree: BtNodeDocument | null = null;
  utilityActions: UtilityActionDefinition[] = [];
  goal: Record<string, WorldValue> = {};
  debugger = new AiDebugger(120);
  perception = new PerceptionSystem();
  blackboard: BtBlackboard = createBlackboard();
  #history: AiEditorSnapshot[] = [];
  #future: AiEditorSnapshot[] = [];

  #snapshot(): AiEditorSnapshot {
    return {
      tree: this.tree ? JSON.parse(JSON.stringify(this.tree)) : null,
      utilityActions: JSON.parse(JSON.stringify(this.utilityActions)),
      goal: { ...this.goal },
      lastStatus: null,
      lastPlan: null,
      sensed: [],
    };
  }

  #pushHistory(): void {
    this.#history.push(this.#snapshot());
    this.#future = [];
    if (this.#history.length > 48) this.#history.shift();
  }

  setTree(document: BtNodeDocument): void {
    this.#pushHistory();
    this.tree = document;
  }

  setGoal(goal: Record<string, WorldValue>): void {
    this.#pushHistory();
    this.goal = goal;
  }

  addUtilityAction(id: string, inputs: { name: string; key: string; curve: "linear" | "quadratic" | "exponential" | "logistic" | "inverse" }[]): void {
    this.#pushHistory();
    this.utilityActions.push({
      id,
      considerations: inputs.map((input) => consideration(input.name, input.key, input.curve)),
    });
  }

  buildTree(): BtTree | null {
    return this.tree ? new BtTree(buildNode(this.tree)) : null;
  }

  tick(inputs: ReadonlyMap<string, number> = new Map()): AiEditorSnapshot {
    const tree = this.buildTree();
    let status: BtStatus | null = null;
    if (tree) {
      for (const [key, value] of inputs) this.blackboard.set(key, value);
      status = tree.tick(this.blackboard);
    }
    const stimuli: Stimulus[] = [];
    const sensed: SensedStimulus[] = this.perception.sense({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, stimuli, 1 / 60);
    this.debugger.recordTick(status ?? "failure", tree?.lastTrace ?? [], sensed, performance.now());
    const scorer = this.utilityActions.length > 0 ? new UtilityScorer(this.utilityActions) : null;
    void scorer?.select(inputs);
    return {
      tree: this.tree ? JSON.parse(JSON.stringify(this.tree)) : null,
      utilityActions: [...this.utilityActions],
      goal: { ...this.goal },
      lastStatus: status,
      lastPlan: null,
      sensed: sensed.map((entry) => ({ id: entry.stimulus.id, awareness: entry.awareness })),
    };
  }

  sense(stimuli: readonly Stimulus[], deltaSeconds = 1 / 60): SensedStimulus[] {
    return this.perception.sense({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, stimuli, deltaSeconds);
  }

  plan(actions: readonly GoapAction[] = []): GoapPlan | null {
    const planner = new GoapPlanner([...actions]);
    const plan = planner.plan(worldState(Object.fromEntries(this.blackboardHasEntries())), new Map(Object.entries(this.goal)));
    if (plan) this.debugger.recordPlan(JSON.stringify(this.goal), plan, performance.now());
    return plan;
  }

  blackboardHasEntries(): [string, WorldValue][] {
    const entries: [string, WorldValue][] = [];
    for (const key of ["hasAxe", "hasWood", "fireLit", "ready", "done"]) {
      const value = this.blackboard.get<WorldValue>(key);
      if (value !== undefined) entries.push([key, value]);
    }
    return entries;
  }

  inspect(tick: number): ReturnType<AiDebugger["frameAt"]> {
    return this.debugger.frameAt(tick);
  }

  undo(): boolean {
    const previous = this.#history.pop();
    if (!previous) return false;
    this.#future.push(this.#snapshot());
    this.tree = previous.tree;
    this.utilityActions = previous.utilityActions;
    this.goal = previous.goal;
    return true;
  }

  redo(): boolean {
    const next = this.#future.pop();
    if (!next) return false;
    this.#history.push(this.#snapshot());
    this.tree = next.tree;
    this.utilityActions = next.utilityActions;
    this.goal = next.goal;
    return true;
  }

  validate(): string[] {
    const errors: string[] = [];
    const visit = (node: BtNodeDocument, depth: number): void => {
      if (depth > 24) errors.push("tree too deep");
      if ("children" in node) for (const child of node.children) visit(child, depth + 1);
    };
    if (this.tree) visit(this.tree, 0);
    const ids = new Set<string>();
    for (const action of this.utilityActions) {
      if (ids.has(action.id)) errors.push(`duplicate utility action ${action.id}`);
      ids.add(action.id);
      if (action.considerations.length === 0) errors.push(`utility action ${action.id} has no considerations`);
    }
    return errors;
  }
}

export { goapAction };
