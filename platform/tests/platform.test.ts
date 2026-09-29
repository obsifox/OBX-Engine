import { describe, expect, it } from "vitest";
import { ManualPlatform, NodePlatform, PlatformError, createPlatform } from "../src/index.js";

describe("platform abstraction", () => {
  it("reports capabilities for manual and node platforms", () => {
    const manual = new ManualPlatform();
    const node = new NodePlatform();
    expect(manual.capabilities.threads).toBe(true);
    expect(manual.capabilities.highResolutionTiming).toBe(false);
    expect(node.capabilities.highResolutionTiming).toBe(true);
    expect(node.capabilities.filesystem).toBe(true);
    expect(createPlatform("manual").kind).toBe("manual");
    expect(createPlatform("node").kind).toBe("node");
  });

  it("creates windows with state transitions", () => {
    const platform = new ManualPlatform();
    const window = platform.createWindow({ title: "Game", width: 800, height: 600 });
    expect(window.state.title).toBe("Game");
    expect(window.state.width).toBe(800);
    window.resize(1024, 768);
    window.hide();
    expect(window.state.visible).toBe(false);
    window.show();
    expect(window.state.visible).toBe(true);
    expect(platform.windows()).toHaveLength(1);
    window.close();
    expect(window.isClosed()).toBe(true);
  });

  it("rejects invalid window and surface dimensions", () => {
    const platform = new ManualPlatform();
    const window = platform.createWindow();
    expect(() => window.resize(0, 10)).toThrow(PlatformError);
    expect(() => platform.createSurface(0, 5)).toThrow(PlatformError);
  });

  it("allocates and resizes pixel surfaces", () => {
    const platform = new ManualPlatform();
    const surface = platform.createSurface(4, 3);
    expect(surface.data.length).toBe(4 * 3 * 4);
    surface.resize(2, 2);
    expect(surface.width).toBe(2);
    expect(surface.data.length).toBe(16);
  });

  it("supports manual filesystem operations", () => {
    const platform = new ManualPlatform();
    platform.files.writeText("/save/data.txt", "hello");
    expect(platform.files.readText("/save/data.txt")).toBe("hello");
    expect(platform.files.exists("/save/data.txt")).toBe(true);
    expect(platform.files.list("/save")).toEqual(["data.txt"]);
    const stat = platform.files.stat("/save/data.txt");
    expect(stat.size).toBe(5);
    expect(stat.directory).toBe(false);
    platform.files.remove("/save/data.txt");
    expect(platform.files.exists("/save/data.txt")).toBe(false);
  });

  it("supports node filesystem operations in a real directory", async () => {
    const node = new NodePlatform();
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = path.join(os.tmpdir(), `obx-platform-${Date.now()}`);
    node.files.mkdir(dir);
    node.files.writeText(path.join(dir, "note.bin"), "v1");
    expect(node.files.readText(path.join(dir, "note.bin"))).toBe("v1");
    expect(node.files.list(dir)).toEqual(["note.bin"]);
    expect(node.files.stat(path.join(dir, "note.bin")).size).toBe(2);
    node.files.remove(dir);
  });

  it("advances manual time and fires timers deterministically", () => {
    const platform = new ManualPlatform();
    const fired: number[] = [];
    platform.timing.createTimer(() => fired.push(platform.timing.now()), 10);
    const repeating = platform.timing.createTimer(() => fired.push(-1), 25, { repeat: true });
    platform.advance(60);
    expect(fired.filter((value) => value === -1)).toHaveLength(2);
    expect(repeating.active).toBe(true);
    repeating.cancel();
    platform.advance(50);
    expect(fired.filter((value) => value === -1)).toHaveLength(2);
    expect(platform.timing.now()).toBe(110);
  });

  it("measures node time and sleeps", () => {
    const node = new NodePlatform();
    const start = node.timing.now();
    node.timing.sleep(2);
    expect(node.timing.now()).toBeGreaterThan(start);
  });

  it("runs manual threads with deterministic message pumping", () => {
    const platform = new ManualPlatform();
    const received: number[] = [];
    const thread = platform.threads.create({
      run: (context) => {
        context.onMessage((message) => {
          context.postMessage((message as number) * 2);
        });
      },
    });
    thread.onMessage((message) => received.push(message as number));
    thread.post(21);
    expect(received).toEqual([]);
    platform.pumpThreads();
    expect(received).toEqual([42]);
    return thread.terminate();
  });

  it("runs node worker threads with real parallel execution", async () => {
    const node = new NodePlatform();
    const values: unknown[] = [];
    const errors: string[] = [];
    const thread = node.threads.create({
      run: (context) => {
        context.onMessage((message) => {
          context.postMessage({ echoed: message });
        });
      },
    });
    thread.onMessage((message) => values.push(message));
    thread.onError((error) => errors.push(error));
    thread.post("ping");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(values).toEqual([{ echoed: "ping" }]);
    expect(errors).toEqual([]);
    expect(node.threads.count).toBe(1);
    await thread.terminate();
  });

  it("records native events with history and unsubscribe", () => {
    const platform = new ManualPlatform();
    const seen: string[] = [];
    const off = platform.events.on("*", (event) => seen.push(event.type));
    platform.events.emit("focus");
    platform.events.emit("resize", { width: 10, height: 10 });
    off();
    platform.events.emit("blur");
    expect(seen).toEqual(["focus", "resize"]);
    expect(platform.events.history()).toHaveLength(3);
  });

  it("stores clipboard text", () => {
    const platform = new ManualPlatform();
    expect(platform.clipboard.hasText()).toBe(false);
    platform.clipboard.write("copied");
    expect(platform.clipboard.read()).toBe("copied");
    platform.clipboard.clear();
    expect(platform.clipboard.hasText()).toBe(false);
  });

  it("enforces lifecycle transitions and notifies", () => {
    const platform = new ManualPlatform();
    const transitions: string[] = [];
    platform.lifecycle.onTransition((from, to) => transitions.push(`${from}>${to}`));
    platform.lifecycle.start();
    expect(platform.lifecycle.phase).toBe("running");
    platform.lifecycle.suspend();
    expect(platform.lifecycle.phase).toBe("suspended");
    platform.lifecycle.resume();
    platform.lifecycle.stop();
    expect(platform.lifecycle.phase).toBe("stopped");
    expect(transitions).toEqual([
      "created>starting",
      "starting>running",
      "running>suspending",
      "suspending>suspended",
      "suspended>resuming",
      "resuming>running",
      "running>stopping",
      "stopping>stopped",
    ]);
  });

  it("rejects invalid lifecycle transitions", () => {
    const platform = new ManualPlatform();
    expect(() => platform.lifecycle.stop()).not.toThrow();
    expect(() => platform.lifecycle.start()).toThrow(PlatformError);
  });

  it("routes input events through the bridge", () => {
    const platform = new ManualPlatform();
    const events: string[] = [];
    platform.input.on((event) => events.push(event.type));
    platform.input.emit({ type: "key", code: "KeyA", pressed: true });
    platform.input.emit({ type: "pointer", x: 5, y: 7, button: 0 });
    expect(events).toEqual(["key", "pointer"]);
    expect(platform.input.recent(10)).toHaveLength(2);
  });
});
