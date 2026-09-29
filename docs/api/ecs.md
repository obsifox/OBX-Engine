# ECS API

`@obx/ecs` — archetype-based entity component system.

## Components

`defineComponent<T>(name, { defaults, serialize, deserialize })` registers a typed
component definition. Names must be unique.

## World

`new World(name)`; `createEntity(...specs)` where a spec is a definition or
`[definition, data]`; `createEntities(count, ...specs)`; `destroyEntity(entity)`;
`addComponent`, `getComponent`, `hasComponent`, `removeComponent`; hierarchy with
`setParent`, `getParent`, `getChildren`; `setName`/`getName`.

## Queries and systems

`world.query(...definitions)` iterates matching entities. `defineSystem({ phase, update })`
registers into `SystemScheduler`; `world.update(delta)` and `world.runPhase(phase, delta)`.

## Persistence

`world.serialize(): SerializedWorld` and `world.loadSerialized(data, options)` round-trip
entities, components and resources.

```ts
import { World, defineComponent } from "@obx/ecs";
```
