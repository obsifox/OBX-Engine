# @obx/editor

Scene-editing model for **ObsiFox Studio** — scene document with undo/redo command
stack, selection, inspector schemas, transform tools with snapping, editor console,
profiler and a 2D viewport camera.

```ts
import {
  EditorSession, AddNodeCommand, SetPropertyCommand, CompositeCommand,
} from "@obx/editor";

const session = new EditorSession();
const hero = session.document.addNode("Node3D", "Hero", session.document.rootId);
session.stack.execute(new SetPropertyCommand(hero, "hp", 140));
session.selection.select(hero.id);
session.tool.setMode("translate");
session.tool.applyDrag(hero, { x: 1.2, y: 0, z: -0.4 }, true);
```

See `docs/releases/v0.10.md` for the full API tour. License: MIT.
