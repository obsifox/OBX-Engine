import { describe, expect, it } from "vitest";
import { Application, Engine, LifecycleState, ManualLoopDriver, ManualPlatform, defineComponent } from "@obx/engine";

const Position = defineComponent<{ x: number }>("EngineTest.Position", {
  defaults: () => ({ x: 0 }),
});

function createTestEngine(): { engine: Engine; driver: ManualLoopDriver } {
  const driver = new ManualLoopDriver();
  const engine = new Engine({
    driver,
    platform: new ManualPlatform(),
    config: { name: "test-engine", autoTickWorld: false },
  });
  return { engine, driver };
}

describe("Engine (§2)", () => {
  it("walks the full lifecycle", async () => {
    const { engine, driver } = createTestEngine();
    const events: string[] = [];
    engine.events.on("engine:initialized", () => events.push("initialized"));
    engine.events.on("engine:started", () => events.push("started"));
    engine.events.on("engine:stopped", () => events.push("stopped"));
    engine.events.on("engine:destroyed", () => events.push("destroyed"));

    await engine.init();
    expect(engine.lifecycle.state).toBe(LifecycleState.INITIALIZED);

    engine.start();
    expect(engine.lifecycle.state).toBe(LifecycleState.RUNNING);
    expect(engine.loop.isRunning).toBe(true);

    driver.step(0);
    driver.step(16);

    engine.stop();
    expect(engine.lifecycle.state).toBe(LifecycleState.STOPPED);
    await engine.destroy();
    expect(engine.lifecycle.state).toBe(LifecycleState.DESTROYED);
    expect(events).toEqual(["initialized", "started", "stopped", "destroyed"]);
  });

  it("refuses start before init", async () => {
    const { engine } = createTestEngine();
    expect(() => engine.start()).toThrowError("engine.init()");
    await engine.destroy();
  });

  it("pause/resume freezes simulation time", async () => {
    const { engine, driver } = createTestEngine();
    await engine.init();
    engine.start();

    driver.step(0);
    driver.step(16);
    const timeBeforePause = engine.clock.time;
    expect(timeBeforePause).toBeGreaterThan(0);

    engine.pause();
    expect(engine.lifecycle.state).toBe(LifecycleState.PAUSED);
    driver.step(32);
    driver.step(48);
    expect(engine.clock.time).toBe(timeBeforePause);

    engine.resume();
    driver.step(64);
    expect(engine.clock.time).toBeGreaterThan(timeBeforePause);

    await engine.destroy();
  });

  it("emits frame events and runs the scheduler on engine time", async () => {
    const { engine, driver } = createTestEngine();
    await engine.init();
    engine.start();

    let frames = 0;
    engine.events.on("engine:frame", () => { frames += 1; });

    const scheduled: number[] = [];
    engine.scheduler.schedule((time) => scheduled.push(time), 0.03);

    driver.step(0);
    driver.step(20);
    expect(scheduled).toHaveLength(0);
    driver.step(40);
    expect(scheduled).toEqual([0.04]);
    expect(frames).toBe(3);

    await engine.destroy();
  });

  it("auto-ticks the default world when enabled", async () => {
    const driver = new ManualLoopDriver();
    const engine = new Engine({ driver, platform: new ManualPlatform(), config: { name: "auto-world" } });
    await engine.init();
    engine.start();

    const entity = engine.world.createEntity([Position, { x: 5 }]);
    const seen: number[] = [];
    engine.world.addSystem({
      name: "probe",
      phase: "update",
      order: 0,
      before: [],
      after: [],
      execute: (ctx) => {
        const pos = ctx.world.getComponent(entity, Position);
        if (pos) seen.push(pos.x);
        pos && (pos.x += ctx.delta);
      },
    });

    driver.step(0);
    driver.step(100);
    expect(seen.length).toBeGreaterThanOrEqual(2);

    await engine.destroy();
  });

  it("reports errors through events and signals", async () => {
    const { engine } = createTestEngine();
    await engine.init();
    const errors: unknown[] = [];
    engine.signals.error.connect((error) => errors.push(error));
    engine.reportError(new Error("render crashed"));
    expect(errors).toHaveLength(1);
    await engine.destroy();
  });

  it("config drives name and log level", async () => {
    const { engine } = createTestEngine();
    expect(engine.name).toBe("test-engine");
    expect(engine.logger.level).toBe("info");
    engine.config.set("logLevel", "debug");
    await engine.init();
    expect(engine.logger.level).toBe("debug");
    await engine.destroy();
  });

  it("is idempotent on double destroy", async () => {
    const { engine } = createTestEngine();
    await engine.init();
    await engine.destroy();
    await engine.destroy();
    expect(engine.lifecycle.isDestroyed).toBe(true);
  });
});

describe("Application (§2/§51 seed)", () => {
  it("run/quit drives the engine", async () => {
    const driver = new ManualLoopDriver();
    const app = new Application({
      name: "demo-app",
      driver,
      platform: new ManualPlatform(),
      config: { autoTickWorld: false },
    });

    await app.run();
    expect(app.isRunning).toBe(true);
    expect(app.name).toBe("demo-app");

    let updates = 0;
    app.onUpdate(() => { updates += 1; });
    driver.step(0);
    driver.step(16);
    expect(updates).toBe(2);

    await app.quit();
    expect(app.isRunning).toBe(false);
    expect(app.engine.lifecycle.isDestroyed).toBe(true);
  });
});
