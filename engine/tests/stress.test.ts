import { describe, expect, it } from "vitest";
import { World, defineComponent } from "@obx/ecs";
import { BuildPipeline, BuildCache } from "@obx/build";
import { MemoryNetwork, ReliableChannel } from "@obx/networking";
import { PluginLoader, parsePluginManifest } from "@obx/plugins";
import { Profiler } from "@obx/editor";

const Position = defineComponent<{ x: number; y: number }>("Stress.Position", {
  defaults: () => ({ x: 0, y: 0 }),
});

describe("stress", () => {
  it("survives heavy ecs churn", () => {
    const world = new World();
    const ids: number[] = [];
    for (let index = 0; index < 500; index += 1) {
      const entity = world.createEntity([Position, { x: index, y: index * 2 }]);
      ids.push(entity);
    }
    for (let index = 0; index < ids.length; index += 3) world.destroyEntity(ids[index]!);
    const snapshot = world.serialize();
    const restored = new World();
    restored.loadSerialized(snapshot);
    expect(restored.listEntities().length).toBe(world.listEntities().length);
  });

  it("bundled fifty modules with cache reuse", () => {
    const pipeline = new BuildPipeline({ cache: new BuildCache() });
    const files = new Map<string, string>();
    for (let index = 0; index < 50; index += 1) {
      files.set(`m${index}.js`, `const v${index} = ${index};`);
    }
    const input = { name: "Stress", version: "1.0.0", entry: "m0.js", files };
    const first = pipeline.run(input, "web");
    const second = pipeline.run(input, "web");
    expect(first.files.get("bundle.js")!.length).toBeGreaterThan(500);
    expect(second.cacheHits).toBe(1);
    expect(first.steps[0]).toBe("analyze(50)");
  });

  it("delivered two hundred messages across a lossy link", () => {
    const network = new MemoryNetwork();
    const [a, b] = network.createPair({ dropRate: 0.2, seed: 5 });
    const left = new ReliableChannel(a, { resendTicks: 1, maxRetries: 50, ordered: true, channel: 0 });
    const right = new ReliableChannel(b, { resendTicks: 1, maxRetries: 50, ordered: true, channel: 0 });
    for (let index = 0; index < 200; index += 1) left.send(new TextEncoder().encode(`m${index}`));
    const received: string[] = [];
    for (let step = 0; step < 400; step += 1) {
      network.step(1);
      left.tick();
      right.tick();
      for (const payload of right.receive()) received.push(new TextDecoder().decode(payload));
    }
    expect(received).toHaveLength(200);
    expect(received[199]).toBe("m199");
    expect(left.stats.retransmitted).toBeGreaterThan(0);
    expect(left.stats.lost).toBe(0);
  });

  it("ticked one hundred sandboxed plugins under profiler watch", () => {
    const profiler = new Profiler();
    const loader = new PluginLoader();
    let ticks = 0;
    for (let index = 0; index < 100; index += 1) {
      loader.register(
        parsePluginManifest({ id: `p${index}`, name: `Plugin ${index}`, permissions: ["scripting"] }),
        (api) => ({
          onTick: () => {
            api.guard("scripting", () => {
              ticks += 1;
            });
          },
        }),
      );
    }
    profiler.record("register", 100 * 0.01);
    loader.loadAll();
    loader.startAll();
    for (let tick = 1; tick <= 5; tick += 1) loader.tick(tick);
    profiler.record("ticks", 5 * 1);
    expect(ticks).toBe(500);
    expect(loader.stats().started).toBe(100);
    expect(profiler.report().map((entry) => entry.label)).toEqual(["ticks", "register"]);
    expect(profiler.frameTotal).toBeCloseTo(6, 5);
  });
});
