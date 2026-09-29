import { describe, expect, it } from "vitest";
import { ManualPlatform, NodePlatform } from "@obx/platform";
import { World, defineComponent } from "@obx/ecs";
import { RuntimeHost } from "../src/host.js";

const Position = defineComponent<{ x: number; y: number }>("Host.Position", {
  defaults: () => ({ x: 0, y: 0 }),
});

describe("runtime host", () => {
  it("bootstraps window, surface and lifecycle", () => {
    const platform = new ManualPlatform();
    const host = new RuntimeHost({ platform, title: "Demo", width: 320, height: 240 });
    expect(host.window.state.title).toBe("Demo");
    expect(host.surface.width).toBe(320);
    expect(host.surface.data.length).toBe(320 * 240 * 4);
    expect(platform.lifecycle.phase).toBe("created");
    host.start();
    expect(platform.lifecycle.phase).toBe("running");
    expect(host.isRunning).toBe(true);
    host.stop();
    expect(platform.lifecycle.phase).toBe("stopped");
    expect(host.isRunning).toBe(false);
  });

  it("runs deterministic frames with fixed deltas", () => {
    const deltas: number[] = [];
    const platform = new ManualPlatform();
    const host = new RuntimeHost({
      platform,
      onFrame: (deltaMs) => deltas.push(deltaMs),
    });
    host.start();
    host.step(16);
    host.step(16);
    host.step(32);
    host.stop();
    expect(host.frameCount).toBe(3);
    expect(deltas).toEqual([0, 16, 32]);
  });

  it("captures frame errors and reports them", () => {
    const seen: unknown[] = [];
    const platform = new ManualPlatform();
    const host = new RuntimeHost({
      platform,
      onFrame: () => {
        throw new Error("frame exploded");
      },
      onError: (error) => seen.push(error),
    });
    host.start();
    host.step(16);
    host.step(16);
    host.stop();
    expect(host.frameCount).toBe(2);
    expect(host.errors).toHaveLength(2);
    expect(String(seen[0])).toContain("frame exploded");
  });

  it("runs existing engine systems through the host", () => {
    const world = new World("host-world");
    const entity = world.createEntity([Position, { x: 1, y: 2 }]);
    const platform = new ManualPlatform();
    const host = new RuntimeHost({
      platform,
      onFrame: (deltaMs) => {
        const position = world.getComponent(entity, Position)!;
        position.x += deltaMs;
      },
    });
    host.start();
    host.step(10);
    host.step(10);
    host.stop();
    expect(world.getComponent(entity, Position)!.x).toBe(11);
  });

  it("forwards input events to subscribers", () => {
    const platform = new ManualPlatform();
    const host = new RuntimeHost({ platform });
    const codes: string[] = [];
    host.onInput((event) => codes.push(event.code ?? event.type));
    platform.input.emit({ type: "key", code: "KeyW", pressed: true });
    platform.input.emit({ type: "pointer", x: 3, y: 4 });
    expect(codes).toEqual(["KeyW", "pointer"]);
    expect(host.recentInput(2)).toHaveLength(2);
  });

  it("resizes the surface when the window resizes", () => {
    const platform = new ManualPlatform();
    const host = new RuntimeHost({ platform, width: 100, height: 100 });
    host.window.resize(200, 150);
    platform.events.emit("resize", { width: 200, height: 150 });
    expect(host.surface.width).toBe(200);
    expect(host.surface.data.length).toBe(200 * 150 * 4);
  });

  it("reports host statistics", () => {
    const platform = new ManualPlatform();
    const host = new RuntimeHost({ platform, title: "Stats", width: 64, height: 64 });
    host.start();
    host.step(16);
    const stats = host.stats();
    expect(stats.frames).toBe(1);
    expect(stats.running).toBe(true);
    expect(stats.window).toEqual({ title: "Stats", width: 64, height: 64 });
    expect(stats.lifecycle).toBe("running");
    host.stop();
  });

  it("starts and stops cleanly on the node platform", async () => {
    const platform = new NodePlatform();
    let frames = 0;
    const host = new RuntimeHost({
      platform,
      targetFps: 120,
      onFrame: () => {
        frames += 1;
      },
    });
    host.start();
    await new Promise((resolve) => setTimeout(resolve, 60));
    host.stop();
    expect(frames).toBeGreaterThan(0);
    expect(platform.lifecycle.phase).toBe("stopped");
  });
});
