import { describe, expect, it } from "vitest";
import { ManualPlatform, NodePlatform } from "@obx/platform";
import {
  InlineExecutor,
  JobError,
  JobSystem,
  TaskGraph,
  WorkerPool,
  WorkStealingQueue,
} from "../src/index.js";

describe("job system", () => {
  it("executes inline jobs with results and states", async () => {
    const system = new JobSystem();
    const handle = system.schedule("sum", (payload: { values: number[] }) => payload.values.reduce((a, b) => a + b, 0), { values: [1, 2, 3] });
    expect(handle.state).toBe("done");
    expect(handle.result).toBe(6);
    await expect(handle.wait()).resolves.toBe(6);
  });

  it("propagates job failures", () => {
    const system = new JobSystem();
    const handle = system.schedule("boom", () => {
      throw new Error("kaput");
    });
    expect(handle.state).toBe("failed");
    expect(handle.error).toContain("kaput");
    expect(system.stats().failed).toBe(1);
  });

  it("defers inline execution until pumped", () => {
    const executor = new InlineExecutor({ defer: true });
    const system = new JobSystem({ executor });
    const handle = system.schedule("later", () => 7);
    expect(handle.state).toBe("queued");
    executor.pump();
    expect(handle.result).toBe(7);
  });

  it("cancels queued jobs before execution", () => {
    const executor = new InlineExecutor({ defer: true });
    const system = new JobSystem({ executor });
    const handle = system.schedule("cancelled", () => 1);
    handle.cancel();
    expect(handle.state).toBe("cancelled");
    executor.pump();
    expect(handle.state).toBe("cancelled");
    expect(system.stats().cancelled).toBe(1);
  });

  it("waits on fences across multiple jobs", async () => {
    const system = new JobSystem();
    const handles = [1, 2, 3, 4].map((value) => system.schedule(`n${value}`, (payload: { v: number }) => payload.v * 10, { v: value }));
    const fence = system.fence(handles);
    await fence.wait();
    expect(fence.completed).toBe(true);
    expect(fence.results()).toEqual([10, 20, 30, 40]);
  });

  it("schedules many items with a composed source", () => {
    const system = new JobSystem();
    const handle = system.scheduleMany("squares", [1, 2, 3], (item: number) => item * item);
    expect(handle.result).toEqual([1, 4, 9]);
  });

  it("runs main-thread actions through the queue", () => {
    const system = new JobSystem();
    const order: string[] = [];
    system.runOnMainThread(() => order.push("a"));
    system.runOnMainThread(() => order.push("b"));
    expect(order).toEqual([]);
    expect(system.drainMainThread()).toBe(2);
    expect(order).toEqual(["a", "b"]);
  });

  it("provides work-stealing queue semantics", () => {
    const queue = new WorkStealingQueue<number>();
    queue.push(1);
    queue.push(2);
    queue.push(3);
    expect(queue.steal()).toBe(3);
    expect(queue.take()).toBe(1);
    expect(queue.size).toBe(1);
    expect(queue.drain()).toEqual([2]);
    expect(queue.size).toBe(0);
  });

  it("runs task graphs in dependency order", async () => {
    const system = new JobSystem();
    const graph = new TaskGraph();
    const order: string[] = [];
    graph.addTask("assets", [], () => {
      order.push("assets");
      return 2;
    });
    graph.addTask("mesh", ["assets"], (payload) => {
      order.push("mesh");
      return (payload.deps.assets as number) * 21;
    });
    graph.addTask("scene", ["mesh"], (payload) => {
      order.push("scene");
      return payload.deps.mesh;
    });
    const results = await graph.run(system);
    expect(order).toEqual(["assets", "mesh", "scene"]);
    expect(results.get("scene")).toBe(42);
  });

  it("detects task graph cycles and duplicate ids", () => {
    const graph = new TaskGraph();
    graph.addTask("a", ["b"], () => 0);
    graph.addTask("b", ["a"], () => 0);
    expect(() => graph.topologicalOrder()).toThrow(JobError);
    const other = new TaskGraph();
    other.addTask("x", [], () => 0);
    expect(() => other.addTask("x", [], () => 0)).toThrow(JobError);
  });

  it("fails graph tasks blocked by failed dependencies", async () => {
    const system = new JobSystem();
    const graph = new TaskGraph();
    graph.addTask("bad", [], () => {
      throw new Error("nope");
    });
    graph.addTask("after", ["bad"], () => 1);
    await expect(graph.run(system)).rejects.toThrow();
  });

  it("executes jobs on a real worker pool", async () => {
    const platform = new NodePlatform();
    const pool = new WorkerPool(platform, { workers: 2 });
    const system = new JobSystem({ executor: pool });
    const handles = [
      system.schedule("double", (payload: { v: number }) => payload.v * 2, { v: 20 }, "(payload) => payload.v * 2"),
      system.schedule("double", (payload: { v: number }) => payload.v * 2, { v: 5 }, "(payload) => payload.v * 2"),
      system.schedule("add", (payload: { a: number; b: number }) => payload.a + payload.b, { a: 4, b: 9 }, "(payload) => payload.a + payload.b"),
    ];
    const fence = system.fence(handles);
    await fence.wait();
    expect(fence.results()).toEqual([40, 10, 13]);
    expect(pool.workerCount).toBe(2);
    await system.shutdown();
  });

  it("reports worker failures without breaking the pool", async () => {
    const platform = new NodePlatform();
    const pool = new WorkerPool(platform, { workers: 1 });
    const system = new JobSystem({ executor: pool });
    const bad = system.schedule("bad", () => {
      throw new Error("worker-boom");
    }, undefined, "() => { throw new Error('worker-boom'); }");
    await expect(bad.wait()).rejects.toThrow();
    const good = system.schedule("good", () => 99, undefined, "() => 99");
    await expect(good.wait()).resolves.toBe(99);
    await system.shutdown();
  });

  it("cancels pool jobs before dispatch", async () => {
    const platform = new ManualPlatform();
    const pool = new WorkerPool(platform, { workers: 1 });
    const system = new JobSystem({ executor: pool });
    const handle = system.schedule("soon", () => 1, undefined, "() => 1");
    handle.cancel();
    expect(handle.state).toBe("cancelled");
    await system.shutdown();
  });

  it("shares deterministic ordering on the manual platform threads", async () => {
    const platform = new ManualPlatform();
    const received: unknown[] = [];
    const thread = platform.threads.create({
      run: (context) => {
        context.onMessage((message) => context.postMessage({ got: message }));
      },
    });
    thread.onMessage((message) => received.push(message));
    thread.post(1);
    thread.post(2);
    platform.pumpThreads();
    expect(received).toEqual([{ got: 1 }, { got: 2 }]);
    await thread.terminate();
  });
});
