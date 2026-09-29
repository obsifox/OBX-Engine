# Getting Started

OBX Engine is a TypeScript-first game and application engine: `ENGINE != GAME`.

## Prerequisites

- Node.js >= 20
- npm 9+

## Quick start

```bash
git clone https://github.com/obsifox/OBX-Engine
cd obx-engine
npm install
npm test          # 513 tests
```

Run a demo:

```bash
node examples/twod-demo/index.js     # 2D frame to PNG
node examples/v100-demo/src/main.js  # plugins + marketplace tour
```

## Hello frame

```ts
import { SoftwareBackend, Renderer2D, Camera2D, Colors, encodePng } from "@obx/engine";

const backend = new SoftwareBackend(640, 360);
const renderer = new Renderer2D(backend);
const camera = new Camera2D({ viewportWidth: 640, viewportHeight: 360 });
renderer.begin(camera, Colors.obsidian);
renderer.flush();
```

Next: [Installation](installation.md) - [Core API](core.md).
