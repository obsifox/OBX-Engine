/**
 * Integration test — a miniature "game" exercising the v0.1+v0.2 stack:
 * Engine + GameLoop (fixed timestep) + ECS systems + events + save/load.
 */
import { describe, expect, it } from "vitest";
import {
  Application,
  ManualLoopDriver,
  ManualPlatform,
  World,
  defineComponent,
  defineSystem,
  defineWorldResource,
} from "@obsifox/engine";

const Position = defineComponent<{ x: number; y: number }>("MiniGame.Position", {
  defaults: () => ({ x: 0, y: 0 }),
});
const Velocity = defineComponent<{ x: number; y: number }>("MiniGame.Velocity", {
  defaults: () => ({ x: 0, y: 0 }),
});
const Health = defineComponent<{ hp: number }>("MiniGame.Health", {
  defaults: () => ({ hp: 100 }),
});

const Score = defineWorldResource<{ points: number }>("MiniGame.Score");

describe("mini-game integration (v0.1 + v0.2)", () => {
  it("simulates movement, scoring and save/load across frames", async () => {
    const driver = new ManualLoopDriver();
    const app = new Application({
      name: "mini-game",
      driver,
      platform: new ManualPlatform(),
      config: { fixedDelta: 1 / 60, autoTickWorld: true },
    });

    const world = app.engine.world;
    world.addResource(Score, { points: 0 });

    // Spawn: a moving player and a stationary wall.
    const player = world.createEntity(
      [Position, { x: 0, y: 0 }],
      [Velocity, { x: 60, y: 0 }], // 60 units/second
      Health,
    );
    world.setName(player, "player");
    const wall = world.createEntity([Position, { x: 1000, y: 0 }]);
    world.setName(wall, "wall");

    // Systems: physics runs before scoring (before/after ordering).
    world.addSystem(defineSystem({
      name: "physics",
      execute: ({ delta }) => {
        for (const [, pos, vel] of world.query(Position, Velocity)) {
          pos.x += vel.x * delta;
          pos.y += vel.y * delta;
        }
      },
    }));

    world.addSystem(defineSystem({
      name: "scoring",
      after: ["physics"],
      execute: ({ delta }) => {
        const score = world.getResourceOrThrow(Score);
        score.points += delta * 10;
      },
    }));

    let fixedTicks = 0;
    app.onFixedUpdate(() => { fixedTicks += 1; });

    await app.run();

    // Simulate 1 second at 60fps (first frame establishes t0).
    driver.runFrames(60, { startMs: 0, intervalMs: 1000 / 60 });

    const pos = world.getComponent(player, Position);
    // ~0.983s of engine time * 60 units/s.
    expect(pos?.x).toBeGreaterThan(58);
    expect(pos?.x).toBeLessThan(60.5);
    expect(world.getResource(Score)?.points).toBeGreaterThan(9.5);
    expect(world.getResource(Score)?.points).toBeLessThan(10.2);
    expect(fixedTicks).toBeGreaterThanOrEqual(55);
    expect(fixedTicks).toBeLessThanOrEqual(63);
    expect(world.getComponent(wall, Position)?.x).toBe(1000);

    // Save mid-game, run more frames, then restore the snapshot and compare.
    const save = JSON.parse(JSON.stringify(world.serialize())) as ReturnType<World["serialize"]>;
    const savedX = world.getComponent(player, Position)?.x ?? 0;

    driver.runFrames(60, { startMs: 1000, intervalMs: 1000 / 60 });
    expect(world.getComponent(player, Position)?.x).toBeGreaterThan(savedX + 55);

    const reloaded = World.fromSerialized(save);
    const reloadedPlayer = reloaded
      .listEntities()
      .find((entity) => reloaded.getName(entity) === "player") as number;
    expect(reloadedPlayer).toBeDefined();
    expect(reloaded.getComponent(reloadedPlayer, Position)?.x).toBeCloseTo(savedX, 6);
    expect(reloaded.getResourceOrThrow(Score).points).toBeCloseTo(10, 0);
    expect(reloaded.getChildren(reloadedPlayer)).toEqual([]);

    await app.quit();
  });
});
