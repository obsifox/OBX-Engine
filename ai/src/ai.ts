import { Random } from "@obx/core";

export class Blackboard {
  private readonly values = new Map<string, unknown>();

  set<T>(key: string, value: T): T {
    this.values.set(key, value);
    return value;
  }

  get<T>(key: string, fallback: T): T {
    return (this.values.get(key) as T | undefined) ?? fallback;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  delete(key: string): boolean {
    return this.values.delete(key);
  }
}

export interface StateHandlers<A> {
  enter?: (agent: A, blackboard: Blackboard) => void;
  update?: (dt: number, agent: A, blackboard: Blackboard) => string | void;
  exit?: (agent: A, blackboard: Blackboard) => void;
}

export interface StateDefinition<A> extends StateHandlers<A> {
  name: string;
}

export class StateMachine<A> {
  current: string;
  private readonly states = new Map<string, StateDefinition<A>>();

  constructor(
    states: readonly StateDefinition<A>[],
    initial: string,
    agent: A,
    blackboard: Blackboard,
  ) {
    for (const state of states) this.states.set(state.name, state);
    if (!this.states.has(initial)) throw new RangeError(`unknown state ${initial}`);
    this.current = initial;
    this.states.get(initial)!.enter?.(agent, blackboard);
  }

  transition(to: string, agent: A, blackboard: Blackboard): void {
    if (!this.states.has(to) || to === this.current) return;
    this.states.get(this.current)!.exit?.(agent, blackboard);
    this.current = to;
    this.states.get(to)!.enter?.(agent, blackboard);
  }

  update(dt: number, agent: A, blackboard: Blackboard): string {
    const state = this.states.get(this.current)!;
    const next = state.update?.(dt, agent, blackboard);
    if (typeof next === "string") this.transition(next, agent, blackboard);
    return this.current;
  }
}

export type BehaviorStatus = "success" | "failure" | "running";

export abstract class BehaviorNode {
  abstract tick(dt: number, blackboard: Blackboard): BehaviorStatus;
}

export class Action extends BehaviorNode {
  constructor(readonly run: (dt: number, blackboard: Blackboard) => BehaviorStatus) {
    super();
  }

  override tick(dt: number, blackboard: Blackboard): BehaviorStatus {
    return this.run(dt, blackboard);
  }
}

export class Condition extends BehaviorNode {
  constructor(readonly test: (blackboard: Blackboard) => boolean) {
    super();
  }

  override tick(_dt: number, blackboard: Blackboard): BehaviorStatus {
    return this.test(blackboard) ? "success" : "failure";
  }
}

export class Sequence extends BehaviorNode {
  constructor(readonly children: readonly BehaviorNode[]) {
    super();
  }

  override tick(dt: number, blackboard: Blackboard): BehaviorStatus {
    for (const child of this.children) {
      const status = child.tick(dt, blackboard);
      if (status !== "success") return status;
    }
    return "success";
  }
}

export class Selector extends BehaviorNode {
  constructor(readonly children: readonly BehaviorNode[]) {
    super();
  }

  override tick(dt: number, blackboard: Blackboard): BehaviorStatus {
    for (const child of this.children) {
      const status = child.tick(dt, blackboard);
      if (status !== "failure") return status;
    }
    return "failure";
  }
}

export class Inverter extends BehaviorNode {
  constructor(readonly child: BehaviorNode) {
    super();
  }

  override tick(dt: number, blackboard: Blackboard): BehaviorStatus {
    const status = this.child.tick(dt, blackboard);
    return status === "success" ? "failure" : status === "failure" ? "success" : status;
  }
}

export class Repeater extends BehaviorNode {
  private remaining: number;

  constructor(
    readonly child: BehaviorNode,
    times = 1,
  ) {
    super();
    this.remaining = times;
  }

  override tick(dt: number, blackboard: Blackboard): BehaviorStatus {
    if (this.remaining === 0) return "success";
    const status = this.child.tick(dt, blackboard);
    if (status !== "success") return status;
    if (this.remaining > 0) this.remaining -= 1;
    return this.remaining === 0 ? "success" : "running";
  }
}

export class BehaviorTree {
  private running = false;

  constructor(readonly root: BehaviorNode) {}

  tick(dt: number, blackboard: Blackboard): BehaviorStatus {
    this.running = true;
    const status = this.root.tick(dt, blackboard);
    this.running = status === "running";
    return status;
  }

  get isRunning(): boolean {
    return this.running;
  }
}

export interface UtilityOption<A> {
  name: string;
  score: (agent: A, blackboard: Blackboard) => number;
  run: (agent: A, blackboard: Blackboard) => void;
}

export class UtilityAI<A> {
  constructor(readonly options: readonly UtilityOption<A>[]) {}

  choose(agent: A, blackboard: Blackboard): UtilityOption<A> | null {
    let best: UtilityOption<A> | null = null;
    let bestScore = -Infinity;
    for (const option of this.options) {
      const score = option.score(agent, blackboard);
      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }
    return best;
  }

  execute(agent: A, blackboard: Blackboard): string | null {
    const option = this.choose(agent, blackboard);
    if (!option) return null;
    option.run(agent, blackboard);
    return option.name;
  }
}

export interface PerceptionOptions {
  visionRange: number;
  visionAngle: number;
  hearingRange: number;
}

export interface Point2 {
  x: number;
  z: number;
}

export class Perception {
  constructor(readonly options: PerceptionOptions) {}

  canSee(from: Point2, facing: number, target: Point2, blocked?: (from: Point2, to: Point2) => boolean): boolean {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance > this.options.visionRange) return false;
    if (distance > 1e-6) {
      const angle = Math.atan2(dx, dz);
      let delta = angle - facing;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      if (Math.abs(delta) > this.options.visionAngle / 2) return false;
    }
    if (blocked && blocked(from, target)) return false;
    return true;
  }

  canHear(distance: number): boolean {
    return distance <= this.options.hearingRange;
  }
}

export interface ScheduleEntry {
  at: number;
  name: string;
  run: () => void;
}

export class Schedule {
  private lastTime = 0;

  constructor(readonly entries: readonly ScheduleEntry[]) {
    this.sorted = [...entries].sort((a, b) => a.at - b.at);
  }

  private readonly sorted: ScheduleEntry[];

  update(timeOfDay: number): string[] {
    const fired: string[] = [];
    for (const entry of this.sorted) {
      const crossed = this.lastTime <= entry.at && entry.at < timeOfDay;
      const wrapped = timeOfDay < this.lastTime && (entry.at > this.lastTime || entry.at < timeOfDay);
      if (crossed || wrapped) {
        entry.run();
        fired.push(entry.name);
      }
    }
    this.lastTime = timeOfDay;
    return fired;
  }
}

export interface GoalDefinition<A> {
  name: string;
  priority: number;
  canRun: (agent: A, blackboard: Blackboard) => boolean;
  isDone: (agent: A, blackboard: Blackboard) => boolean;
  run: (dt: number, agent: A, blackboard: Blackboard) => void;
}

export class GoalSystem<A> {
  active: string | null = null;

  constructor(readonly goals: readonly GoalDefinition<A>[]) {}

  update(dt: number, agent: A, blackboard: Blackboard): string | null {
    const active = this.goals.find((goal) => goal.name === this.active);
    if (active && !active.isDone(agent, blackboard) && active.canRun(agent, blackboard)) {
      active.run(dt, agent, blackboard);
      return active.name;
    }
    const candidates = [...this.goals]
      .filter((goal) => goal.canRun(agent, blackboard) && !goal.isDone(agent, blackboard))
      .sort((a, b) => b.priority - a.priority);
    const next = candidates[0] ?? null;
    this.active = next?.name ?? null;
    next?.run(dt, agent, blackboard);
    return this.active;
  }
}

export interface AgentBrain {
  update(dt: number, blackboard: Blackboard): string | null;
}

export class FsmBrain<A> implements AgentBrain {
  constructor(
    readonly machine: StateMachine<A>,
    readonly agent: A,
  ) {}

  update(dt: number, blackboard: Blackboard): string | null {
    this.machine.update(dt, this.agent, blackboard);
    return this.machine.current;
  }
}

export class TreeBrain implements AgentBrain {
  constructor(readonly tree: BehaviorTree) {}

  update(dt: number, blackboard: Blackboard): string | null {
    return this.tree.tick(dt, blackboard);
  }
}

export interface NpcOptions {
  x: number;
  z: number;
  facing?: number;
  perception: Perception;
  brain: AgentBrain;
  random?: Random;
}

export class NpcAgent {
  x: number;
  z: number;
  facing: number;
  readonly blackboard = new Blackboard();
  lastStatus: string | null = null;

  constructor(readonly options: NpcOptions) {
    this.x = options.x;
    this.z = options.z;
    this.facing = options.facing ?? 0;
    this.blackboard.set("npc.x", this.x);
    this.blackboard.set("npc.z", this.z);
  }

  update(dt: number): string | null {
    this.blackboard.set("npc.x", this.x);
    this.blackboard.set("npc.z", this.z);
    this.lastStatus = this.options.brain.update(dt, this.blackboard);
    return this.lastStatus;
  }

  perceive(target: Point2, facing = this.facing, blocked?: (from: Point2, to: Point2) => boolean): boolean {
    const seen = this.options.perception.canSee({ x: this.x, z: this.z }, facing, target, blocked);
    const distance = Math.hypot(target.x - this.x, target.z - this.z);
    const heard = this.options.perception.canHear(distance);
    this.blackboard.set("target.visible", seen);
    this.blackboard.set("target.heard", heard);
    this.blackboard.set("target.x", target.x);
    this.blackboard.set("target.z", target.z);
    return seen || heard;
  }

  move(dx: number, dz: number): void {
    this.x += dx;
    this.z += dz;
    this.blackboard.set("npc.x", this.x);
    this.blackboard.set("npc.z", this.z);
  }
}

export function patrolBrain(): BehaviorTree {
  return new BehaviorTree(
    new Selector([
      new Sequence([
        new Condition((board) => board.get("target.visible", false) || board.get("target.heard", false)),
        new Action((_dt, board) => {
          board.set("npc.mode", "chase");
          return "success";
        }),
      ]),
      new Action((_dt, board) => {
        board.set("npc.mode", "patrol");
        return "success";
      }),
    ]),
  );
}

export function animalBrain(random: Random = new Random(1)): BehaviorTree {
  return new BehaviorTree(
    new Selector([
      new Sequence([
        new Condition((board) => board.get("target.heard", false)),
        new Action((_dt, board) => {
          board.set("npc.mode", "flee");
          return "success";
        }),
      ]),
      new Action((_dt, board) => {
        board.set("npc.mode", random.next() < 0.5 ? "idle" : "wander");
        return "success";
      }),
    ]),
  );
}
