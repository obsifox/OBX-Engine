import { describe, expect, it } from "vitest";
import {
  BreakpointManager,
  CallStack,
  DebugSession,
  DiagnosticsRing,
  ExceptionTrap,
  InMemoryTransport,
  StepController,
  WatchList,
  evaluateWatch,
  type DebugProgram,
} from "../src/index.js";

function program(): DebugProgram {
  return {
    script: "game.js",
    instructions: [
      { op: "enter", name: "main" },
      { op: "line", line: 1 },
      { op: "set", name: "x", value: 10 },
      { op: "line", line: 2 },
      { op: "expr", name: "y", expression: "x * 2" },
      { op: "line", line: 3 },
      { op: "enter", name: "helper" },
      { op: "line", line: 7 },
      { op: "set", name: "z", value: 1 },
      { op: "leave" },
      { op: "line", line: 4 },
      { op: "leave" },
      { op: "line", line: 5 },
    ],
  };
}

describe("breakpoints", () => {
  it("pauses at breakpoints with hit counts and conditions", () => {
    const session = new DebugSession();
    session.attach(program());
    session.breakpoints.add({ script: "game.js", line: 3, column: 1 });
    session.run();
    expect(session.state).toBe("paused");
    expect(session.callStack.top()!.location.line).toBe(3);
    expect(session.callStack.top()!.functionName).toBe("main");
    expect(session.breakpoints.all[0]!.hitCount).toBe(1);
    session.continue();
    expect(session.state).toBe("stopped");

    const manager = new BreakpointManager();
    const conditional = manager.add({ script: "game.js", line: 2, column: 1 }, "x > 50");
    expect(manager.shouldPause({ script: "game.js", line: 2, column: 1 }, { x: 10 })).toBeNull();
    conditional.condition = "x > 5";
    expect(manager.shouldPause({ script: "game.js", line: 2, column: 1 }, { x: 10 })).not.toBeNull();
    manager.setEnabled(conditional.id, false);
    expect(manager.at({ script: "game.js", line: 2, column: 1 })).toHaveLength(0);
    expect(manager.remove(conditional.id)).toBe(true);
    expect(manager.remove("missing")).toBe(false);
  });
});

describe("stepping", () => {
  it("steps into over and out of calls", () => {
    const session = new DebugSession();
    session.attach(program());
    session.breakpoints.add({ script: "game.js", line: 3, column: 1 });
    session.run();
    session.stepInto();
    expect(session.callStack.top()!.location.line).toBe(7);
    expect(session.callStack.top()!.functionName).toBe("helper");
    expect(session.callStack.depth).toBe(2);

    const session2 = new DebugSession();
    session2.attach(program());
    session2.breakpoints.add({ script: "game.js", line: 3, column: 1 });
    session2.run();
    session2.stepOver();
    expect(session2.callStack.top()!.location.line).toBe(4);
    expect(session2.callStack.top()!.functionName).toBe("main");

    const session3 = new DebugSession();
    session3.attach(program());
    session3.breakpoints.add({ script: "game.js", line: 7, column: 1 });
    session3.run();
    expect(session3.callStack.depth).toBe(2);
    session3.stepOut();
    expect(session3.callStack.depth).toBe(1);
    expect(session3.callStack.top()!.location.line).toBe(4);
  });

  it("tracks step modes and anchor depths", () => {
    const step = new StepController();
    step.request("over", 3);
    expect(step.anchorDepth).toBe(3);
    expect(step.shouldStopAt(3, true)).toBe(true);
    expect(step.shouldStopAt(4, true)).toBe(false);
    step.request("into", 1);
    expect(step.shouldStopAt(5, true)).toBe(true);
    step.request("out", 2);
    expect(step.shouldStopAt(1, false)).toBe(true);
    step.request("continue", 1);
    expect(step.shouldStopAt(1, true)).toBe(false);
  });
});

describe("call stack and variables", () => {
  it("pushes frames and updates locals", () => {
    const stack = new CallStack();
    stack.push({ functionName: "a", location: { script: "s", line: 1, column: 1 }, locals: { x: 1 } });
    stack.push({ functionName: "b", location: { script: "s", line: 2, column: 1 }, locals: { y: 2 } });
    expect(stack.depth).toBe(2);
    expect(stack.frames()[0]!.functionName).toBe("b");
    expect(stack.updateLocal("y", 3)).toBe(true);
    expect(stack.top()!.locals.y).toBe(3);
    expect(stack.pop()!.functionName).toBe("b");
    stack.replaceTop({ script: "s", line: 9, column: 1 });
    expect(stack.top()!.location.line).toBe(9);
    stack.clear();
    expect(stack.depth).toBe(0);
    expect(stack.top()).toBeNull();
    expect(stack.pop()).toBeNull();
  });
});

describe("watch expressions", () => {
  it("evaluates expressions and reports errors", () => {
    const scope = { x: 10, name: "Ada", nested: { value: 7 }, flag: true };
    expect(evaluateWatch("x * 2 + 1", scope)).toBe(21);
    expect(evaluateWatch("nested.value + x", scope)).toBe(17);
    expect(evaluateWatch('name + "!"', scope)).toBe("Ada!");
    expect(evaluateWatch("(x + 5) / 3", scope)).toBe(5);
    expect(evaluateWatch("flag", scope)).toBe(true);
    expect(() => evaluateWatch("missing", scope)).toThrow("unknown variable");
    expect(() => evaluateWatch("nested.bad", scope)).toThrow("unknown property");
    expect(() => evaluateWatch("x +", scope)).toThrow();

    const watches = new WatchList();
    watches.add("x * 2");
    watches.add("nope");
    const results = watches.evaluate(scope);
    expect(results[0]!.value).toBe(20);
    expect(results[0]!.error).toBeNull();
    expect(results[1]!.value).toBeNull();
    expect(results[1]!.error).toContain("unknown variable");
    expect(watches.remove(results[1]!.id)).toBe(true);
    expect(watches.all).toHaveLength(1);
  });
});

describe("exceptions and diagnostics", () => {
  it("traps exceptions and records diagnostics", () => {
    const trap = new ExceptionTrap();
    const info = trap.trap("boom", { script: "s", line: 4, column: 1 });
    expect(info.handled).toBe(false);
    expect(trap.unhandled()).toHaveLength(1);
    trap.markHandled(0);
    expect(trap.unhandled()).toHaveLength(0);
    expect(trap.markHandled(5)).toBe(false);

    const ring = new DiagnosticsRing(3);
    ring.record("info", "boot");
    ring.record("warn", "slow");
    ring.record("error", "fail");
    ring.record("info", "extra");
    expect(ring.size).toBe(3);
    expect(ring.count("info")).toBe(1);
    expect(ring.recent(2)[0]!.message).toBe("fail");
  });

  it("faults on throw and exposes exception info", () => {
    const session = new DebugSession();
    session.attach({
      script: "bad.js",
      instructions: [
        { op: "line", line: 1 },
        { op: "throw", message: "kaboom" },
      ],
    });
    session.run();
    expect(session.state).toBe("faulted");
    expect(session.exceptions.exceptions[0]!.message).toBe("kaboom");
    expect(session.diagnostics.count("error")).toBe(1);
  });
});

describe("remote debugging", () => {
  it("drives a session through the transport protocol", () => {
    const transport = new InMemoryTransport();
    const session = new DebugSession();
    session.attach(program(), transport);
    const events: string[] = [];
    transport.bindClient((message) => events.push(String(message.event ?? message.type)));

    const bp = transport.sendToServer({ type: "setBreakpoint", location: { script: "game.js", line: 2, column: 1 } as never });
    expect(bp!.id).toBe("bp-1");
    transport.sendToServer({ type: "continue" });
    expect(session.state).toBe("paused");

    const stack = transport.sendToServer({ type: "stackTrace" });
    expect(String(stack!.frames)).toContain("main@2");
    const vars = transport.sendToServer({ type: "variables" });
    expect(String(vars!.scope)).toContain('"x":10');
    const value = transport.sendToServer({ type: "evaluate", expression: "x + 5" });
    expect(value!.value).toBe("15");

    transport.sendToServer({ type: "step", mode: "over" });
    transport.sendToServer({ type: "pause" });
    expect(session.state).toBe("paused");
    const cleared = transport.sendToServer({ type: "clearBreakpoint", id: "bp-1" });
    expect(cleared!.ok).toBe(true);
    expect(transport.messages).toBeGreaterThan(5);
    expect(events.length).toBeGreaterThan(0);
    expect(session.handleRemote({ type: "unknown" })).toBeNull();
  });

  it("sets globals and evaluates against merged scope", () => {
    const session = new DebugSession();
    session.attach(program());
    session.setGlobal("gravity", 9.8);
    session.breakpoints.add({ script: "game.js", line: 2, column: 1 });
    session.run();
    expect(session.evaluate("gravity + x")).toBe(19.8);
    expect(session.scope().x).toBe(10);
  });
});
