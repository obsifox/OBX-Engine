# @obx/extensions

Editor extension registry for **ObsiFox Studio** — ten contribution kinds (commands,
panels, menus, inspectors, tools, gizmos, importers, asset types, node types) with
lifecycle hooks and per-extension error isolation.

```ts
import { ExtensionRegistry } from "@obx/extensions";

const registry = new ExtensionRegistry();
registry.register({
  id: "obx.scene-tools",
  name: "Scene Tools",
  version: "1.0.0",
  contributions: {
    commands: [{ id: "scene.duplicate", title: "Duplicate Selected", run: (ctx) => ctx.log("duplicated") }],
    panels: [{ id: "hierarchy", title: "Scene Tree", location: "left", order: 0 }],
    tools: [{ id: "move", label: "Move", run: () => "move" }],
  },
});
registry.activate("obx.scene-tools");
```

See `docs/releases/v0.10.md` for the full API tour. License: MIT.
