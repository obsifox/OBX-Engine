/**
 * ObsiFox Engine — ecs-demo example (§4 ECS showcase).
 *
 * Deterministic ECS tour: components, queries, system ordering,
 * hierarchy, resources and save/load — no wall-clock waiting.
 *
 *   npm run example:ecs
 */
import {
  World,
  defineComponent,
  defineSystem,
  defineWorldResource,
} from "@obsifox/engine";

const Position = defineComponent("EcsDemo.Position", { defaults: () => ({ x: 0, y: 0 }) });
const Velocity = defineComponent("EcsDemo.Velocity", { defaults: () => ({ x: 0, y: 0 }) });
const Health = defineComponent("EcsDemo.Health", { defaults: () => ({ hp: 100 }) });
const Score = defineWorldResource("EcsDemo.Score");

const world = new World("ecs-demo");
world.addResource(Score, { points: 0 });

// Hierarchy: squad -> hero, squad -> healer
const squad = world.createEntity();
world.setName(squad, "squad");
const hero = world.createEntity([Position, { x: 0, y: 0 }], [Velocity, { x: 10, y: 0 }], Health);
world.setName(hero, "hero");
const healer = world.createEntity([Position, { x: -2, y: 1 }], Health);
world.setName(healer, "healer");
world.setParent(hero, squad);
world.setParent(healer, squad);

world.addSystem(defineSystem({
  name: "physics",
  execute: ({ delta }) => {
    for (const [, pos, vel] of world.query(Position, Velocity)) {
      pos.x += vel.x * delta;
    }
  },
}));
world.addSystem(defineSystem({
  name: "score",
  after: ["physics"],
  execute: ({ delta }) => {
    world.getResourceOrThrow(Score).points += delta;
  },
}));

// 10 simulated seconds at 60 Hz.
for (let i = 0; i < 600; i += 1) {
  world.update(1 / 60);
}

console.log("== ECS demo ==");
console.log("stats:      ", world.stats());
console.log("squad kids: ", world.getChildren(squad).map((e) => world.getName(e)));
console.log("hero pos:   ", world.getComponent(hero, Position));
console.log("score:      ", world.getResource(Score));

const save = JSON.parse(JSON.stringify(world.serialize()));
const restored = World.fromSerialized(save);
console.log("save/load:  ", `${restored.entityCount} entities restored, time=${restored.time.toFixed(2)}s`);

const restoredHero = restored.listEntities().find((e) => restored.getName(e) === "hero");
console.log("restored hero:", restored.inspect(restoredHero));
