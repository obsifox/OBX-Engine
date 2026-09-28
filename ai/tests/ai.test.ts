import { describe, expect, it } from "vitest";
import { Random } from "@obx/core";
import {
  Action,
  BehaviorTree,
  Blackboard,
  Condition,
  FsmBrain,
  GoalSystem,
  Inverter,
  NpcAgent,
  Perception,
  Repeater,
  Schedule,
  Selector,
  Sequence,
  StateMachine,
  TreeBrain,
  UtilityAI,
  animalBrain,
  patrolBrain,
  type BehaviorStatus,
  type StateDefinition,
} from "../src/index.js";

describe("Blackboard", () => {
  it("stores typed values with fallbacks", () => {
    const board = new Blackboard();
    expect(board.get("hp", 100)).toBe(100);
    board.set("hp", 42);
    expect(board.get("hp", 100)).toBe(42);
    expect(board.has("hp")).toBe(true);
    expect(board.delete("hp")).toBe(true);
    expect(board.has("hp")).toBe(false);
    expect(board.delete("hp")).toBe(false);
  });
});

interface TestAgent {
  hp: number;
  log: string[];
}

describe("StateMachine", () => {
  const states: StateDefinition<TestAgent>[] = [
    {
      name: "idle",
      enter: (agent) => agent.log.push("enter:idle"),
      update: (_dt, agent) => {
        agent.log.push("update:idle");
        return agent.hp < 50 ? "hurt" : undefined;
      },
      exit: (agent) => agent.log.push("exit:idle"),
    },
    {
      name: "hurt",
      enter: (agent) => agent.log.push("enter:hurt"),
      update: (_dt, agent) => {
        agent.log.push("update:hurt");
        return agent.hp >= 50 ? "idle" : undefined;
      },
      exit: (agent) => agent.log.push("exit:hurt"),
    },
  ];

  it("enters, updates and transitions with hooks", () => {
    const agent: TestAgent = { hp: 10, log: [] };
    const board = new Blackboard();
    const machine = new StateMachine(states, "idle", agent, board);
    expect(agent.log).toEqual(["enter:idle"]);
    machine.update(0.1, agent, board);
    expect(machine.current).toBe("hurt");
    expect(agent.log).toEqual(["enter:idle", "update:idle", "exit:idle", "enter:hurt"]);
    agent.hp = 80;
    machine.update(0.1, agent, board);
    expect(machine.current).toBe("idle");
  });

  it("rejects unknown initial states", () => {
    const agent: TestAgent = { hp: 1, log: [] };
    expect(() => new StateMachine(states, "nope", agent, new Blackboard())).toThrow(RangeError);
    const machine = new StateMachine(states, "idle", agent, new Blackboard());
    machine.transition("missing", agent, new Blackboard());
    expect(machine.current).toBe("idle");
  });
});

describe("behavior tree nodes", () => {
  it("runs sequences with failure short-circuit", () => {
    const board = new Blackboard();
    const calls: string[] = [];
    const sequence = new Sequence([
      new Action(() => {
        calls.push("a");
        return "success";
      }),
      new Action(() => {
        calls.push("b");
        return "failure";
      }),
      new Action(() => {
        calls.push("c");
        return "success";
      }),
    ]);
    expect(sequence.tick(0.1, board)).toBe("failure");
    expect(calls).toEqual(["a", "b"]);
  });

  it("runs selectors with success short-circuit and propagates running", () => {
    const board = new Blackboard();
    const selector = new Selector([
      new Action(() => "failure"),
      new Action(() => "running"),
      new Action(() => "success"),
    ]);
    expect(selector.tick(0.1, board)).toBe("running");
    const empty = new Selector([new Action(() => "failure")]);
    expect(empty.tick(0.1, board)).toBe("failure");
  });

  it("inverts results and passes running through", () => {
    const board = new Blackboard();
    expect(new Inverter(new Action(() => "success")).tick(0.1, board)).toBe("failure");
    expect(new Inverter(new Action(() => "failure")).tick(0.1, board)).toBe("success");
    expect(new Inverter(new Action(() => "running")).tick(0.1, board)).toBe("running");
    expect(new Condition((b) => b.get("flag", false)).tick(0.1, board)).toBe("failure");
    board.set("flag", true);
    expect(new Condition((b) => b.get("flag", false)).tick(0.1, board)).toBe("success");
  });

  it("repeats children across ticks", () => {
    const board = new Blackboard();
    let count = 0;
    const repeater = new Repeater(
      new Action(() => {
        count += 1;
        return "success";
      }),
      3,
    );
    expect(repeater.tick(0.1, board)).toBe("running");
    expect(repeater.tick(0.1, board)).toBe("running");
    expect(repeater.tick(0.1, board)).toBe("success");
    expect(count).toBe(3);
    const single = new Repeater(new Action(() => "failure"), 5);
    expect(single.tick(0.1, board)).toBe("failure");
  });

  it("tracks tree run state", () => {
    const board = new Blackboard();
    const statuses: BehaviorStatus[] = [];
    const tree = new BehaviorTree(
      new Selector([
        new Action(() => {
          statuses.push("running");
          return "running";
        }),
      ]),
    );
    expect(tree.tick(0.1, board)).toBe("running");
    expect(tree.isRunning).toBe(true);
    expect(statuses).toEqual(["running"]);
    const done = new BehaviorTree(new Action(() => "success"));
    done.tick(0.1, board);
    expect(done.isRunning).toBe(false);
  });
});

describe("UtilityAI", () => {
  it("executes the highest scoring option", () => {
    interface Bot {
      energy: number;
    }
    const ai = new UtilityAI<Bot>([
      {
        name: "rest",
        score: (bot) => 1 - bot.energy,
        run: (_bot, board) => board.set("did", "rest"),
      },
      {
        name: "work",
        score: (bot) => bot.energy,
        run: (_bot, board) => board.set("did", "work"),
      },
    ]);
    const board = new Blackboard();
    expect(ai.execute({ energy: 0.9 }, board)).toBe("work");
    expect(board.get("did", "")).toBe("work");
    expect(ai.execute({ energy: 0.1 }, board)).toBe("rest");
    expect(ai.choose({ energy: 0.5 }, board)?.name === "rest" || ai.choose({ energy: 0.5 }, board)?.name === "work").toBe(true);
  });
});

describe("Perception", () => {
  const perception = new Perception({ visionRange: 10, visionAngle: Math.PI / 2, hearingRange: 4 });

  it("respects vision cone and range", () => {
    expect(perception.canSee({ x: 0, z: 0 }, 0, { x: 0, z: 5 })).toBe(true);
    expect(perception.canSee({ x: 0, z: 0 }, 0, { x: 5, z: 3 })).toBe(false);
    expect(perception.canSee({ x: 0, z: 0 }, Math.PI / 2, { x: 5, z: 0 })).toBe(true);
    expect(perception.canSee({ x: 0, z: 0 }, 0, { x: 0, z: 20 })).toBe(false);
    expect(perception.canSee({ x: 0, z: 0 }, 0, { x: 0, z: 0 })).toBe(true);
    expect(perception.canSee({ x: 0, z: 0 }, 0, { x: 0, z: 5 }, () => true)).toBe(false);
  });

  it("hears within range", () => {
    expect(perception.canHear(3.9)).toBe(true);
    expect(perception.canHear(4.1)).toBe(false);
  });
});

describe("Schedule", () => {
  it("fires entries when time crosses them and wraps past midnight", () => {
    const fired: string[] = [];
    const schedule = new Schedule([
      { at: 8, name: "work", run: () => fired.push("work") },
      { at: 22, name: "sleep", run: () => fired.push("sleep") },
    ]);
    schedule.update(0);
    schedule.update(9);
    expect(fired).toEqual(["work"]);
    schedule.update(23);
    expect(fired).toEqual(["work", "sleep"]);
    schedule.update(0.5);
    schedule.update(7);
    expect(fired).toEqual(["work", "sleep"]);
    schedule.update(9.5);
    expect(fired).toEqual(["work", "sleep", "work"]);
    expect(schedule.entries.length).toBe(2);
  });
});

describe("GoalSystem", () => {
  interface Hero {
    hungry: boolean;
    done: boolean;
  }

  it("runs the highest priority runnable goal and switches when done", () => {
    const log: string[] = [];
    const goals = new GoalSystem<Hero>([
      {
        name: "eat",
        priority: 10,
        canRun: (hero) => hero.hungry,
        isDone: (hero) => hero.done,
        run: () => log.push("eat"),
      },
      {
        name: "idle",
        priority: 1,
        canRun: () => true,
        isDone: () => false,
        run: () => log.push("idle"),
      },
    ]);
    const hero: Hero = { hungry: true, done: false };
    const board = new Blackboard();
    expect(goals.update(0.1, hero, board)).toBe("eat");
    hero.done = true;
    expect(goals.update(0.1, hero, board)).toBe("idle");
    expect(log).toEqual(["eat", "idle"]);
  });
});

describe("NpcAgent", () => {
  it("perceives, moves and runs its brain", () => {
    const brain = new TreeBrain(patrolBrain());
    const npc = new NpcAgent({
      x: 0,
      z: 0,
      facing: 0,
      perception: new Perception({ visionRange: 8, visionAngle: Math.PI, hearingRange: 3 }),
      brain,
    });
    npc.update(0.1);
    expect(npc.lastStatus).toBe("success");
    expect(npc.blackboard.get("npc.mode", "")).toBe("patrol");
    expect(npc.perceive({ x: 0, z: 5 })).toBe(true);
    npc.update(0.1);
    expect(npc.blackboard.get("npc.mode", "")).toBe("chase");
    expect(npc.perceive({ x: 0, z: 50 })).toBe(false);
    npc.move(1, 2);
    expect(npc.x).toBe(1);
    expect(npc.z).toBe(2);
    expect(npc.blackboard.get("npc.x", 0)).toBe(1);
  });

  it("flees when hearing danger", () => {
    const npc = new NpcAgent({
      x: 0,
      z: 0,
      perception: new Perception({ visionRange: 2, visionAngle: 0.1, hearingRange: 6 }),
      brain: new TreeBrain(animalBrain(new Random(2))),
    });
    expect(npc.perceive({ x: 4, z: 0 })).toBe(true);
    npc.update(0.1);
    expect(npc.blackboard.get("npc.mode", "")).toBe("flee");
    expect(npc.perceive({ x: 40, z: 0 })).toBe(false);
    npc.update(0.1);
    expect(["idle", "wander"]).toContain(npc.blackboard.get("npc.mode", ""));
  });

  it("drives fsm brains", () => {
    interface Walker {
      log: string[];
    }
    const walker: Walker = { log: [] };
    const machine = new StateMachine<Walker>(
      [
        {
          name: "walk",
          update: (_dt, agent) => {
            agent.log.push("walk");
            return "idle";
          },
        },
        {
          name: "idle",
          update: (_dt, agent) => {
            agent.log.push("idle");
            return "walk";
          },
        },
      ],
      "walk",
      walker,
      new Blackboard(),
    );
    const npc = new NpcAgent({
      x: 0,
      z: 0,
      perception: new Perception({ visionRange: 1, visionAngle: 1, hearingRange: 1 }),
      brain: new FsmBrain(machine, walker),
    });
    npc.update(0.1);
    npc.update(0.1);
    expect(walker.log).toEqual(["walk", "idle"]);
    expect(["walk", "idle"]).toContain(npc.lastStatus);
  });
});
