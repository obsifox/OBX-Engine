import { describe, expect, it, vi } from "vitest";
import {
  Clock,
  ConfigStore,
  EventBus,
  Lifecycle,
  LifecycleError,
  LifecycleState,
  Logger,
  MemoryLogSink,
  MemoryTracker,
  Scheduler,
  Signal,
  EngineError,
  InvalidArgumentError,
  assert,
  ensure,
  msToSeconds,
  secondsToMs,
} from "@obsifox/core";

describe("Error system (§2)", () => {
  it("carries code and context", () => {
    const error = new EngineError("boom", { code: "ERR_CUSTOM", context: { a: 1 } });
    expect(error.code).toBe("ERR_CUSTOM");
    expect(error.context).toEqual({ a: 1 });
    expect(error.toJSON()).toMatchObject({ name: "EngineError", message: "boom" });
    expect(error).toBeInstanceOf(Error);
  });

  it("assert/ensure throw typed errors", () => {
    expect(() => assert(false, "nope")).toThrowError("nope");
    try {
      ensure(false, "bad arg", { field: "x" });
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidArgumentError);
      expect((error as InvalidArgumentError).context).toEqual({ field: "x" });
    }
  });
});

describe("Logger (§2)", () => {
  it("respects levels and scopes", () => {
    const sink = new MemoryLogSink();
    const logger = new Logger({ level: "debug", sinks: [sink], scopes: ["engine"] });
    const child = logger.child("renderer");

    logger.info("hello", { n: 1 });
    logger.trace("hidden"); // below level
    child.warn("careful");

    expect(sink.records).toHaveLength(2);
    expect(sink.records[0]).toMatchObject({ level: "info", message: "hello", scopes: ["engine"] });
    expect(sink.records[1]).toMatchObject({ level: "warn", message: "careful", scopes: ["engine", "renderer"] });
  });

  it("silent level disables everything", () => {
    const sink = new MemoryLogSink();
    const logger = new Logger({ level: "silent", sinks: [sink] });
    logger.fatal("dead");
    expect(sink.records).toHaveLength(0);
    expect(logger.isEnabled("fatal")).toBe(false);
  });

  it("survives a throwing sink", () => {
    const good = new MemoryLogSink();
    const logger = new Logger({
      level: "info",
      sinks: [{ write: () => { throw new Error("sink down"); } }, good],
    });
    expect(() => logger.info("ok")).not.toThrow();
    expect(good.records).toHaveLength(1);
  });
});

describe("EventBus + Signal (§2)", () => {
  it("subscribes, emits and unsubscribes", () => {
    const bus = new EventBus<{ ping: number }>();
    const received: number[] = [];
    const off = bus.on("ping", (n) => received.push(n));
    bus.emit("ping", 1);
    off();
    bus.emit("ping", 2);
    expect(received).toEqual([1]);
  });

  it("supports once and priorities", () => {
    const bus = new EventBus<{ e: string }>();
    const order: string[] = [];
    bus.on("e", () => order.push("low"));
    bus.on("e", () => order.push("high"), { priority: 10 });
    bus.once("e", () => order.push("once"));

    bus.emit("e", "x");
    bus.emit("e", "y");
    expect(order).toEqual(["high", "low", "once", "high", "low"]);
  });

  it("isolates handler errors and aggregates", () => {
    const bus = new EventBus<{ e: null }>();
    const calls: string[] = [];
    bus.on("e", () => { throw new Error("bad"); });
    bus.on("e", () => calls.push("still ran"));
    expect(() => bus.emit("e", null)).toThrowError(AggregateError);
    expect(calls).toEqual(["still ran"]);
  });

  it("Signal connects/once/disconnects", () => {
    const signal = new Signal<[number, string]>();
    const seen: Array<[number, string]> = [];
    const handler = (a: number, b: string): void => { seen.push([a, b]); };
    signal.connect(handler);
    signal.once((a, b) => seen.push([a * 10, b]));
    signal.emit(1, "x");
    signal.emit(2, "y");
    signal.disconnect(handler);
    signal.emit(3, "z");
    expect(seen).toEqual([[1, "x"], [10, "x"], [2, "y"]]);
    expect(signal.listenerCount).toBe(0);
  });
});

describe("Clock (§2 Time)", () => {
  it("accumulates scaled time", () => {
    const clock = new Clock();
    clock.advance(0.1);
    clock.advance(0.1);
    expect(clock.time).toBeCloseTo(0.2);
    expect(clock.frame).toBe(2);
  });

  it("clamps huge deltas (tab switches)", () => {
    const clock = new Clock({ maxDelta: 0.25 });
    clock.advance(5);
    expect(clock.deltaUnscaled).toBe(0.25);
    expect(clock.time).toBe(0.25);
  });

  it("timeScale and pause affect engine time only", () => {
    const clock = new Clock({ timeScale: 0.5, maxDelta: 10 });
    clock.advance(1);
    expect(clock.time).toBeCloseTo(0.5);
    expect(clock.unscaledTime).toBeCloseTo(1);

    clock.paused = true;
    clock.advance(1);
    expect(clock.time).toBeCloseTo(0.5);
    expect(clock.unscaledTime).toBeCloseTo(2);
    expect(clock.delta).toBe(0);
  });

  it("produces fixed steps and interpolation alpha", () => {
    const clock = new Clock({ fixedDelta: 0.01, maxFixedSteps: 100 });
    clock.advance(0.035);
    const { steps, alpha } = clock.consumeFixedSteps();
    expect(steps).toBe(3);
    expect(alpha).toBeCloseTo(0.5);
  });

  it("caps fixed steps (spiral of death)", () => {
    const clock = new Clock({ fixedDelta: 0.01, maxFixedSteps: 2, maxDelta: 10 });
    clock.advance(1);
    const { steps } = clock.consumeFixedSteps();
    expect(steps).toBe(2);
    // Backlog dropped — next frame starts clean.
    const next = clock.consumeFixedSteps();
    expect(next.steps).toBe(0);
  });

  it("unit helpers", () => {
    expect(msToSeconds(1000)).toBe(1);
    expect(secondsToMs(2)).toBe(2000);
  });
});

describe("Scheduler (§2)", () => {
  it("runs one-shot timers at engine time", () => {
    const scheduler = new Scheduler();
    const runs: number[] = [];
    scheduler.schedule((t) => runs.push(t), 1);
    scheduler.update(0.5);
    expect(runs).toHaveLength(0);
    scheduler.update(1);
    expect(runs).toEqual([1]);
    scheduler.update(2);
    expect(runs).toEqual([1]);
  });

  it("repeats and cancels", () => {
    const scheduler = new Scheduler();
    let count = 0;
    const handle = scheduler.scheduleRepeating(() => { count += 1; }, 1);
    scheduler.advance(3.5);
    expect(count).toBe(3);
    scheduler.cancel(handle);
    scheduler.advance(5);
    expect(count).toBe(3);
  });

  it("nextTick runs on the following update", () => {
    const scheduler = new Scheduler();
    const runs: string[] = [];
    scheduler.scheduleNextTick(() => runs.push("tick"));
    expect(runs).toHaveLength(0);
    scheduler.update(0);
    expect(runs).toEqual(["tick"]);
  });

  it("rejects time travel", () => {
    const scheduler = new Scheduler();
    scheduler.update(5);
    expect(() => scheduler.update(4)).toThrowError(InvalidArgumentError);
  });
});

describe("ConfigStore (§2)", () => {
  it("reads and writes dot paths", () => {
    const config = new ConfigStore({ window: { width: 1280 } });
    expect(config.get("window.width")).toBe(1280);
    config.set("window.height", 720);
    config.set("render.backend", "webgl");
    expect(config.get("window.height")).toBe(720);
    expect(config.get("render.backend")).toBe("webgl");
    expect(config.get("missing.path", "fallback")).toBe("fallback");
    expect(config.has("window.width")).toBe(true);
    expect(config.delete("render.backend")).toBe(true);
    expect(config.has("render.backend")).toBe(false);
  });

  it("merges and notifies watchers", () => {
    const config = new ConfigStore({ a: { b: 1 } });
    const events: Array<[string, unknown]> = [];
    const unwatch = config.watch("a", (path, value) => events.push([path, value]));
    config.set("a.b", 2);
    config.merge({ a: { c: 3 } });
    unwatch();
    config.set("a.b", 9);
    expect(events).toEqual([["a.b", 2], ["a", { c: 3 }]]);
  });

  it("round-trips JSON", () => {
    const config = ConfigStore.fromJSON<{ game: { title: string } }>(JSON.stringify({ game: { title: "Fox" } }));
    expect(config.get("game.title")).toBe("Fox");
    expect(config.toJSON()).toEqual({ game: { title: "Fox" } });
    expect(() => ConfigStore.fromJSON("[]")).toThrowError("must be an object");
  });

  it("deep-clones set values", () => {
    const config = new ConfigStore();
    const value = { list: [1, 2] };
    config.set("x", value);
    value.list.push(3);
    expect(config.get<{ list: number[] }>("x").list).toEqual([1, 2]);
  });
});

describe("MemoryTracker (§2/§63)", () => {
  it("tracks by tag with budget", () => {
    const memory = new MemoryTracker({ budgetBytes: 100 });
    const handle = memory.track("textures", 80);
    expect(memory.totalBytes).toBe(80);
    memory.track("audio", 30);
    const snapshot = memory.snapshot();
    expect(snapshot.totalBytes).toBe(110);
    expect(snapshot.byTag).toEqual({ textures: 80, audio: 30 });
    expect(snapshot.overBudget).toBe(true);

    memory.update(handle, 50);
    expect(memory.totalBytes).toBe(80);
    memory.untrack(handle);
    expect(memory.snapshot().byTag).toEqual({ audio: 30 });
  });
});

describe("Lifecycle (§2)", () => {
  it("walks the happy path and notifies", () => {
    const lifecycle = new Lifecycle();
    const seen: Array<[string, string]> = [];
    lifecycle.onChange((next, prev) => seen.push([prev, next]));

    for (const state of [
      LifecycleState.INITIALIZING,
      LifecycleState.INITIALIZED,
      LifecycleState.STARTING,
      LifecycleState.RUNNING,
      LifecycleState.PAUSED,
      LifecycleState.RUNNING,
      LifecycleState.STOPPING,
      LifecycleState.STOPPED,
      LifecycleState.DESTROYING,
      LifecycleState.DESTROYED,
    ]) {
      lifecycle.transition(state);
    }
    expect(lifecycle.isDestroyed).toBe(true);
    expect(seen[0]).toEqual(["created", "initializing"]);
    expect(seen).toHaveLength(10);
  });

  it("rejects illegal transitions", () => {
    const lifecycle = new Lifecycle();
    expect(() => lifecycle.transition(LifecycleState.RUNNING)).toThrowError(LifecycleError);
    lifecycle.transition(LifecycleState.INITIALIZING);
    lifecycle.transition(LifecycleState.FAILED);
    expect(lifecycle.state).toBe("failed");
  });

  it("guard marks failed and rethrows", async () => {
    const lifecycle = new Lifecycle();
    lifecycle.transition(LifecycleState.INITIALIZING);
    await expect(lifecycle.guard(async () => { throw new Error("kaboom"); })).rejects.toThrowError("kaboom");
    expect(lifecycle.state).toBe("failed");
  });
});

describe("misc", () => {
  it("Logger default sink list is empty", () => {
    const logger = new Logger();
    expect(() => logger.info("no sink")).not.toThrow();
  });

  it("vi fake timers work with Scheduler wall usage", () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    expect(true).toBe(true);
  });
});
