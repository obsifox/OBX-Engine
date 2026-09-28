import { describe, expect, it } from "vitest";
import {
  FrameLimiter,
  FpsCounter,
  GameLoop,
  ManualLoopDriver,
  TaskSystem,
  TimeoutLoopDriver,
  detectPlatform,
} from "@obsifox/runtime";

describe("GameLoop (§3)", () => {
  it("runs update/render each frame and fixed-update on the accumulator", () => {
    const driver = new ManualLoopDriver();
    const loop = new GameLoop({ driver, fixedDelta: 0.01 });

    const fixedSteps: number[] = [];
    const updates: number[] = [];
    const renders: number[] = [];
    loop.onFixedUpdate((dt) => fixedSteps.push(dt));
    loop.onUpdate((dt) => updates.push(dt));
    loop.onRender((alpha) => renders.push(alpha));

    loop.start();
    driver.runFrames(3, { startMs: 1000, intervalMs: 10 }); // 10ms frames, 10ms fixed
    loop.stop();

    // First frame establishes t0 (delta 0), then two frames with 10ms each.
    expect(updates).toEqual([0, 0.01, 0.01]);
    // Frame 1: 0 steps; frames 2-3: 1 step each (10ms accumulated per frame).
    expect(fixedSteps).toEqual([0.01, 0.01]);
    expect(renders).toHaveLength(3);
    expect(loop.isRunning).toBe(false);
  });

  it("produces multiple fixed steps from a long frame", () => {
    const driver = new ManualLoopDriver();
    const loop = new GameLoop({ driver, fixedDelta: 0.01, maxFixedSteps: 10 });
    let fixedCount = 0;
    loop.onFixedUpdate(() => { fixedCount += 1; });
    loop.start();
    driver.step(0);
    driver.step(35); // 35ms -> 3 fixed steps + 5ms remainder
    expect(fixedCount).toBe(3);
  });

  it("pauses simulation but keeps update/render callbacks firing", () => {
    const driver = new ManualLoopDriver();
    const loop = new GameLoop({ driver, fixedDelta: 0.01 });
    let fixedCount = 0;
    const deltas: number[] = [];
    loop.onFixedUpdate(() => { fixedCount += 1; });
    loop.onUpdate((dt) => deltas.push(dt));

    loop.start();
    driver.step(0);
    driver.step(20);
    loop.clock.paused = true;
    driver.step(40);
    driver.step(60);
    loop.clock.paused = false;
    driver.step(80);

    // Pre-pause frame (20ms) and post-resume frame (80ms) each produce 2 steps.
    expect(fixedCount).toBe(4);
    // Paused frames report delta 0.
    expect(deltas).toEqual([0, 0.02, 0, 0, 0.02]);
  });

  it("tracks FPS and frame count", () => {
    const driver = new ManualLoopDriver();
    const loop = new GameLoop({ driver });
    loop.start();
    driver.runFrames(70, { startMs: 0, intervalMs: 16 });
    expect(loop.clock.frame).toBe(70);
    expect(loop.fps).toBeGreaterThan(50);
    expect(loop.fps).toBeLessThan(75);
  });

  it("refuses double start and driver swap while running", () => {
    const driver = new ManualLoopDriver();
    const loop = new GameLoop({ driver });
    loop.start();
    expect(() => loop.start()).toThrowError("already running");
    expect(() => { loop.driver = new ManualLoopDriver(); }).toThrowError("Cannot swap");
    loop.stop();
  });

  it("unsubscribe removes callbacks", () => {
    const driver = new ManualLoopDriver();
    const loop = new GameLoop({ driver });
    let count = 0;
    const off = loop.onUpdate(() => { count += 1; });
    loop.start();
    driver.step(0);
    off();
    driver.step(16);
    expect(count).toBe(1);
  });

  it("step hook wraps the frame body", () => {
    const driver = new ManualLoopDriver();
    const loop = new GameLoop({ driver });
    const order: string[] = [];
    loop.setStepHook((fn) => { order.push("before"); fn(); order.push("after"); });
    loop.onUpdate(() => order.push("update"));
    loop.start();
    driver.step(0);
    expect(order).toEqual(["before", "update", "after"]);
  });
});

describe("ManualLoopDriver (§3)", () => {
  it("throws when stepping before start", () => {
    const driver = new ManualLoopDriver();
    expect(() => driver.step(0)).toThrowError("before start");
  });
});

describe("FrameLimiter (§3)", () => {
  it("gates frames at targetFps", () => {
    let now = 0;
    const limiter = new FrameLimiter({ targetFps: 50, now: () => now }); // 20ms budget
    expect(limiter.shouldRun()).toBe(true);
    expect(limiter.shouldRun()).toBe(false); // same tick
    now = 15;
    expect(limiter.shouldRun()).toBe(false);
    expect(limiter.timeUntilNextMs()).toBe(5);
    now = 25;
    expect(limiter.shouldRun()).toBe(true);
  });

  it("uncapped always runs", () => {
    const limiter = new FrameLimiter({ targetFps: 0 });
    expect(limiter.shouldRun()).toBe(true);
    expect(limiter.shouldRun()).toBe(true);
    expect(limiter.timeUntilNextMs()).toBe(0);
  });

  it("resyncs after long stalls", () => {
    let now = 0;
    const limiter = new FrameLimiter({ targetFps: 100, now: () => now });
    expect(limiter.shouldRun()).toBe(true);
    now = 5000; // long stall
    expect(limiter.shouldRun()).toBe(true);
    expect(limiter.shouldRun()).toBe(false);
  });
});

describe("FpsCounter (§3)", () => {
  it("averages over a window", () => {
    const counter = new FpsCounter({ windowSeconds: 1 });
    for (let i = 0; i < 100; i += 1) counter.sample(0.01);
    expect(counter.fps).toBeCloseTo(100, 0);
    expect(counter.frameTimeMs).toBeCloseTo(10);
    expect(counter.totalFrames).toBe(100);
    counter.reset();
    expect(counter.fps).toBe(0);
  });
});

describe("TaskSystem (§3/§62 foundation)", () => {
  it("runs tasks with bounded concurrency", async () => {
    const tasks = new TaskSystem({ concurrency: 2 });
    let running = 0;
    let peak = 0;
    const job = async (): Promise<number> => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return 42;
    };

    const results = await Promise.all([tasks.submit(job), tasks.submit(job), tasks.submit(job)]);
    expect(results.map((handle) => handle.promise instanceof Promise)).toEqual([true, true, true]);
    const values = await Promise.all(results.map((handle) => handle.promise));
    expect(values).toEqual([42, 42, 42]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("propagates task errors", async () => {
    const tasks = new TaskSystem();
    const handle = tasks.submit(() => { throw new Error("task failed"); });
    await expect(handle.promise).rejects.toThrowError("task failed");
  });

  it("cancels pending tasks", async () => {
    const tasks = new TaskSystem({ concurrency: 1 });
    const slow = tasks.submit(() => new Promise((resolve) => setTimeout(() => resolve(1), 10)));
    const victim = tasks.submit(() => 2);
    victim.cancel();
    await expect(victim.promise).rejects.toThrowError("cancelled");
    expect(await slow.promise).toBe(1);
  });
});

describe("Platforms (§64 foundation)", () => {
  it("detects node in tests", () => {
    const platform = detectPlatform();
    expect(platform.id).toBe("node");
    expect(platform.now()).toBeGreaterThan(0);
    expect(platform.createLoopDriver({ targetFps: 30 })).toBeInstanceOf(TimeoutLoopDriver);
  });

  it("manual platform is deterministic", async () => {
    const { ManualPlatform } = await import("@obsifox/runtime");
    const platform = new ManualPlatform();
    platform.advance(5);
    expect(platform.now()).toBe(5);
    const driver = platform.createLoopDriver();
    expect(driver).toBeInstanceOf(ManualLoopDriver);
  });
});

describe("TimeoutLoopDriver", () => {
  it("pumps frames via timers", async () => {
    const driver = new TimeoutLoopDriver({ targetFps: 0 });
    let frames = 0;
    driver.start(() => { frames += 1; });
    await new Promise((resolve) => setTimeout(resolve, 30));
    driver.stop();
    expect(frames).toBeGreaterThan(0);
  });
});
