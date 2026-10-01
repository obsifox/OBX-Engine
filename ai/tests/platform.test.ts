import { describe, expect, it } from "vitest";
import {
  AiDebugger,
  BtAction,
  BtCondition,
  BtInverter,
  BtParallel,
  BtRepeat,
  BtSelector,
  BtSequence,
  BtTree,
  GoapPlanner,
  PerceptionSystem,
  UtilityScorer,
  consideration,
  createBlackboard,
  evaluateCurve,
  goapAction,
  worldState,
} from "../src/index.js";

describe("behavior trees", () => {
  it("runs sequences and selectors with memory", () => {
    const board = createBlackboard({ hp: 10, enemy: true });
    const tree = new BtTree(
      new BtSelector("root", [
        new BtSequence("fight", [
          new BtCondition("enemy-visible", (b) => b.get<boolean>("enemy") === true),
          new BtAction("attack", (b) => {
            b.set("hp", (b.get<number>("hp") ?? 0) - 3);
            return "success";
          }),
        ]),
        new BtAction("idle", () => "success"),
      ]),
    );
    expect(tree.tick(board)).toBe("success");
    expect(board.get("hp")).toBe(7);
    expect(tree.lastTrace.length).toBeGreaterThan(0);
  });

  it("inverts, repeats and parallel-completes", () => {
    const board = createBlackboard();
    const inverter = new BtInverter(new BtAction("fail", () => "failure"));
    expect(inverter.tick(board, [], 0, { order: 0 })).toBe("success");
    let count = 0;
    const repeat = new BtRepeat(new BtAction("inc", () => {
      count += 1;
      return "success";
    }), 3);
    expect(repeat.tick(board, [], 0, { order: 0 })).toBe("success");
    expect(count).toBe(3);
    const parallel = new BtParallel("both", [
      new BtAction("a", () => "success"),
      new BtAction("b", () => "failure"),
    ], 1);
    expect(parallel.tick(board, [], 0, { order: 0 })).toBe("success");
  });

  it("keeps running state across ticks", () => {
    const board = createBlackboard({ progress: 0 });
    const work = new BtSequence("work", [
      new BtAction("step", (b) => {
        const progress = (b.get<number>("progress") ?? 0) + 1;
        b.set("progress", progress);
        return progress >= 3 ? "success" : "running";
      }),
    ]);
    const tree = new BtTree(work);
    expect(tree.tick(board)).toBe("running");
    expect(tree.tick(board)).toBe("running");
    expect(tree.tick(board)).toBe("success");
  });
});

describe("utility scoring", () => {
  it("evaluates response curves", () => {
    expect(evaluateCurve("linear", 0.5)).toBeCloseTo(0.5, 5);
    expect(evaluateCurve("quadratic", 0.5, { exponent: 2 })).toBeCloseTo(0.25, 5);
    expect(evaluateCurve("inverse", 0.25)).toBeCloseTo(0.75, 5);
    expect(evaluateCurve("logistic", 0.5)).toBeCloseTo(0.5, 3);
  });

  it("ranks actions with compensated consideration products", () => {
    const scorer = new UtilityScorer([
      {
        id: "attack",
        considerations: [consideration("range", "range", "inverse"), consider("health", "health")],
        baseScore: 1,
      },
      {
        id: "heal",
        considerations: [consideration("health", "health", "inverse")],
        baseScore: 1,
      },
    ]);
    const inputs = new Map([
      ["range", 0.2],
      ["health", 0.1],
    ]);
    const best = scorer.select(inputs);
    expect(best?.actionId).toBe("heal");
    const ranked = scorer.rank(inputs);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
  });
});

function consider(name: string, key: string) {
  return consideration(name, key, "linear");
}

describe("perception", () => {
  it("sees within the cone and hears nearby stimuli", () => {
    const perception = new PerceptionSystem({ sightRange: 10, sightAngleDegrees: 90, hearingRange: 5 });
    const stimuli = [
      { id: "front", kind: "enemy", position: { x: 0, y: 0, z: 5 }, strength: 1 },
      { id: "behind", kind: "enemy", position: { x: 0, y: 0, z: -5 }, strength: 1 },
      { id: "far", kind: "enemy", position: { x: 0, y: 0, z: 30 }, strength: 1 },
      { id: "loud", kind: "noise", position: { x: -3, y: 0, z: 0 }, strength: 1 },
    ];
    const seen = perception.sense({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, stimuli, 0.5);
    const ids = seen.map((entry) => entry.stimulus.id);
    expect(ids).toContain("front");
    expect(ids).toContain("loud");
    expect(ids).not.toContain("far");
    const front = perception.awareOf("front");
    expect(front!.awareness).toBeGreaterThan(0);
  });

  it("decays and forgets stimuli over time", () => {
    const perception = new PerceptionSystem({ awarenessGainPerSecond: 2, awarenessDecayPerSecond: 1, forgetThreshold: 0.1 });
    const stimulus = [{ id: "s", kind: "noise", position: { x: 1, y: 0, z: 0 }, strength: 1 }];
    perception.sense({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, stimulus, 0.2);
    expect(perception.awareOf("s")).not.toBeNull();
    for (let i = 0; i < 10; i += 1) perception.sense({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, [], 0.5);
    expect(perception.awareOf("s")).toBeNull();
  });
});

describe("goap planning", () => {
  it("plans action chains to reach a goal", () => {
    const planner = new GoapPlanner([
      goapAction("pickup-axe", 1, { hasAxe: false }, { hasAxe: true }),
      goapAction("chop-tree", 2, { hasAxe: true }, { hasWood: true }),
      goapAction("make-fire", 1, { hasWood: true }, { fireLit: true }),
    ]);
    const plan = planner.plan(worldState({ hasAxe: false, hasWood: false, fireLit: false }), new Map([["fireLit", true]]));
    expect(plan).not.toBeNull();
    expect(plan!.actions.map((action) => action.name)).toEqual(["pickup-axe", "chop-tree", "make-fire"]);
    expect(plan!.cost).toBe(4);
  });

  it("returns null when the goal is unreachable", () => {
    const planner = new GoapPlanner([goapAction("noop", 1, { ready: true }, { done: true })]);
    const plan = planner.plan(worldState({ ready: false }), new Map([["done", true]]));
    expect(plan).toBeNull();
  });
});

describe("ai debugger", () => {
  it("records frames, plans and summaries", () => {
    const debuggerUi = new AiDebugger(10);
    const perception = new PerceptionSystem();
    const seen = perception.sense({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, [{ id: "e", kind: "enemy", position: { x: 2, y: 0, z: 0 }, strength: 1 }], 0.5);
    const frame = debuggerUi.recordTick("success", [{ node: "root", status: "success", depth: 0, order: 0 }], seen, 100);
    expect(frame.treeStatus).toBe("success");
    const planner = new GoapPlanner([goapAction("step", 1, {}, { done: true })]);
    const plan = planner.plan(worldState(), new Map([["done", true]]))!;
    debuggerUi.recordPlan("done", plan, 101);
    debuggerUi.pause();
    debuggerUi.recordTick("failure", [], [], 102);
    expect(debuggerUi.frames).toHaveLength(2);
    expect(debuggerUi.summarize().frames).toBe(2);
    expect(debuggerUi.frameAt(0)).not.toBeNull();
  });
});
