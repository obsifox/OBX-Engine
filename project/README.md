# @obx/project

Project system for **ObsiFox Studio** — manifest (format v2) with migration, semver
range checks, standard folder layout, in-memory file store and asset indexing.

```ts
import { Project, AssetIndex, migrateManifest, satisfies, standardFolders } from "@obx/project";

const project = Project.create({ name: "MyGame", version: "0.1.0" });
for (const folder of standardFolders) project.writeFile(`${folder}/.keep`, "");
const migrated = migrateManifest({ format: 1, name: "legacy", settings: { width: 320, height: 180 } });
satisfies("0.10.0", "^0.9.0");
```

See `docs/releases/v0.10.md` for the full API tour. License: MIT.
