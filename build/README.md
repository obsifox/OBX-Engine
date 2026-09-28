# @obx/build

Build system for OBX Engine — build graph with incremental rebuilds, dependency
analysis, module bundling, asset compression, build cache, and the export pipeline
targetting windows, linux, android, web and headless server.

```ts
import { BuildPipeline, BuildCache } from "@obx/build";

const pipeline = new BuildPipeline({ cache: new BuildCache() });
const result = pipeline.run({ name: "MyGame", version: "1.0.0", entry: "src/main.js", files }, "web");
```

See `docs/releases/v0.95.md` for the full API tour. License: MIT.
