export type BtStatus = "success" | "failure" | "running";

export interface BtBlackboard {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
}

export function createBlackboard(initial: Record<string, unknown> = {}): BtBlackboard {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    get<T>(key: string): T | undefined {
      return data.get(key) as T | undefined;
    },
    set(key: string, value: unknown): void {
      data.set(key, value);
    },
    has(key: string): boolean {
      return data.has(key);
    },
  };
}

export interface BtTickRecord {
  node: string;
  status: BtStatus;
  depth: number;
  order: number;
}

export interface BtNode {
  readonly name: string;
  tick(blackboard: BtBlackboard, trace: BtTickRecord[], depth: number, counter: { order: number }): BtStatus;
  reset(): void;
}

export abstract class BtComposite implements BtNode {
  readonly name: string;
  readonly children: BtNode[];

  constructor(name: string, children: BtNode[]) {
    this.name = name;
    this.children = children;
  }

  abstract tick(blackboard: BtBlackboard, trace: BtTickRecord[], depth: number, counter: { order: number }): BtStatus;

  reset(): void {
    for (const child of this.children) child.reset();
  }
}

export class BtSequence extends BtComposite {
  #cursor = 0;

  override tick(blackboard: BtBlackboard, trace: BtTickRecord[], depth: number, counter: { order: number }): BtStatus {
    while (this.#cursor < this.children.length) {
      const child = this.children[this.#cursor]!;
      const status = child.tick(blackboard, trace, depth + 1, counter);
      trace.push({ node: child.name, status, depth: depth + 1, order: counter.order++ });
      if (status === "running") return "running";
      if (status === "failure") {
        this.#cursor = 0;
        return "failure";
      }
      this.#cursor += 1;
    }
    this.#cursor = 0;
    return "success";
  }

  override reset(): void {
    this.#cursor = 0;
    super.reset();
  }
}

export class BtSelector extends BtComposite {
  #cursor = 0;

  override tick(blackboard: BtBlackboard, trace: BtTickRecord[], depth: number, counter: { order: number }): BtStatus {
    while (this.#cursor < this.children.length) {
      const child = this.children[this.#cursor]!;
      const status = child.tick(blackboard, trace, depth + 1, counter);
      trace.push({ node: child.name, status, depth: depth + 1, order: counter.order++ });
      if (status === "running") return "running";
      if (status === "success") {
        this.#cursor = 0;
        return "success";
      }
      this.#cursor += 1;
    }
    this.#cursor = 0;
    return "failure";
  }

  override reset(): void {
    this.#cursor = 0;
    super.reset();
  }
}

export class BtParallel extends BtComposite {
  readonly successThreshold: number;

  constructor(name: string, children: BtNode[], successThreshold = children.length) {
    super(name, children);
    this.successThreshold = successThreshold;
  }

  override tick(blackboard: BtBlackboard, trace: BtTickRecord[], depth: number, counter: { order: number }): BtStatus {
    let successes = 0;
    let failures = 0;
    for (const child of this.children) {
      const status = child.tick(blackboard, trace, depth + 1, counter);
      trace.push({ node: child.name, status, depth: depth + 1, order: counter.order++ });
      if (status === "success") successes += 1;
      if (status === "failure") failures += 1;
    }
    if (successes >= this.successThreshold) return "success";
    if (failures > this.children.length - this.successThreshold) return "failure";
    return "running";
  }
}

export class BtInverter implements BtNode {
  readonly name: string;
  #child: BtNode;

  constructor(child: BtNode) {
    this.name = `inverter(${child.name})`;
    this.#child = child;
  }

  tick(blackboard: BtBlackboard, trace: BtTickRecord[], depth: number, counter: { order: number }): BtStatus {
    const status = this.#child.tick(blackboard, trace, depth + 1, counter);
    if (status === "success") return "failure";
    if (status === "failure") return "success";
    return "running";
  }

  reset(): void {
    this.#child.reset();
  }
}

export class BtRepeat implements BtNode {
  readonly name: string;
  #child: BtNode;
  #times: number;
  #done = 0;

  constructor(child: BtNode, times: number) {
    this.name = `repeat(${child.name}, ${times})`;
    this.#child = child;
    this.#times = times;
  }

  tick(blackboard: BtBlackboard, trace: BtTickRecord[], depth: number, counter: { order: number }): BtStatus {
    while (this.#done < this.#times) {
      const status = this.#child.tick(blackboard, trace, depth + 1, counter);
      if (status === "running") return "running";
      if (status === "failure") {
        this.#done = 0;
        return "failure";
      }
      this.#done += 1;
      this.#child.reset();
    }
    this.#done = 0;
    return "success";
  }

  reset(): void {
    this.#done = 0;
    this.#child.reset();
  }
}

export type BtPredicate = (blackboard: BtBlackboard) => boolean;
export type BtActionFn = (blackboard: BtBlackboard) => BtStatus;

export class BtCondition implements BtNode {
  readonly name: string;
  #predicate: BtPredicate;

  constructor(name: string, predicate: BtPredicate) {
    this.name = name;
    this.#predicate = predicate;
  }

  tick(blackboard: BtBlackboard, _trace: BtTickRecord[], _depth: number, _counter: { order: number }): BtStatus {
    return this.#predicate(blackboard) ? "success" : "failure";
  }

  reset(): void {
  }
}

export class BtAction implements BtNode {
  readonly name: string;
  #action: BtActionFn;

  constructor(name: string, action: BtActionFn) {
    this.name = name;
    this.#action = action;
  }

  tick(blackboard: BtBlackboard, _trace: BtTickRecord[], _depth: number, _counter: { order: number }): BtStatus {
    return this.#action(blackboard);
  }

  reset(): void {
  }
}

export class BtTree {
  readonly root: BtNode;
  lastStatus: BtStatus = "failure";
  lastTrace: BtTickRecord[] = [];

  constructor(root: BtNode) {
    this.root = root;
  }

  tick(blackboard: BtBlackboard): BtStatus {
    const trace: BtTickRecord[] = [];
    const counter = { order: 0 };
    this.lastStatus = this.root.tick(blackboard, trace, 0, counter);
    trace.push({ node: this.root.name, status: this.lastStatus, depth: 0, order: counter.order++ });
    this.lastTrace = trace;
    return this.lastStatus;
  }

  reset(): void {
    this.root.reset();
    this.lastTrace = [];
  }
}
