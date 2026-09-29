# Installation

## From source

```bash
git clone https://github.com/obsifox/OBX-Engine
cd obx-engine
npm install
npm run build
```

## Workspace layout

Every subsystem is an independent npm package under the `@obx` scope: `@obx/core`,
`@obx/math`, `@obx/ecs`, `@obx/engine`, `@obx/rendering`, `@obx/physics`, `@obx/ui`,
`@obx/scripting`, `@obx/plugins`, `@obx/registry` and more. Import only what a project
needs; packages are lockstep-versioned.

## Templates

Start from `templates/` (empty, 2d, 3d, platformer, rpg, fps, tps, racing, open-world,
visual-novel, multiplayer, application, web). Instantiate programmatically:

```ts
import { parseTemplate, instantiateTemplate } from "@obx/registry";
```

## Verify

```bash
npm test
node examples/v095-demo/src/main.js
```
