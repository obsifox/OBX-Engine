/**
 * ObsiFox Engine — hello-engine example (§74 Developer Experience seed).
 *
 * Runs the engine headlessly in real time for ~3 seconds with a tiny ECS
 * simulation, printing frame stats and a scheduled timer message.
 *
 *   npm run example:hello
 */
import {
  Application,
  ConsoleLogSink,
  defineComponent,
  defineSystem,
} from "@obsifox/engine";

const Position = defineComponent("Demo.Position", { defaults: () => ({ x: 0, y: 0 }) });
const Velocity = defineComponent("Demo.Velocity", { defaults: () => ({ x: 120, y: 60 }) });

const app = new Application({
  name: "hello-obsifox",
  config: { targetFps: 60, logLevel: "info" },
});

app.engine.logger.addSink(new ConsoleLogSink());

const world = app.engine.world;

// Spawn a few moving entities.
const entities = world.createEntities(3, Position, Velocity);
world.setName(entities[0], "fox");
world.setName(entities[1], "runner");
world.setName(entities[2], "comet");
console.log(`spawned ${world.entityCount} entities`, world.stats());

world.addSystem(defineSystem({
  name: "move",
  execute: ({ delta }) => {
    for (const [, pos, vel] of world.query(Position, Velocity)) {
      pos.x += vel.x * delta;
      pos.y += vel.y * delta;
    }
  },
}));

// A one-shot engine-time timer.
app.engine.scheduler.schedule(() => {
  console.log("⏱  2 engine-seconds elapsed — timer fired");
}, 2);

let frames = 0;
app.onUpdate(() => {
  frames += 1;
  if (frames % 60 === 0) {
    const fox = world.getComponent(entities[0], Position);
    console.log(
      `frame ${String(frames).padStart(3)} | fps ≈ ${app.engine.loop.fps.toFixed(1)} | fox at (${fox.x.toFixed(1)}, ${fox.y.toFixed(1)})`,
    );
  }
  if (frames >= 180) {
    void (async () => {
      console.log("final world state:", JSON.stringify(world.serialize().entities, null, 2).slice(0, 400) + " ...");
      await app.quit();
      console.log("bye from ObsiFox Engine 👋");
    })();
  }
});

await app.run();
console.log("engine running — press Ctrl+C to stop early");
