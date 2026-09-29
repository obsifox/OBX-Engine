# Editor Documentation

**ObsiFox Studio** — `@obx/editor` + `@obx/project` + `@obx/extensions`.

## Scene editing

`SceneDocument` (typed node tree, reparent guards, snapshots), `CommandStack`
(undo/redo + transactions), commands (`AddNodeCommand`, `RemoveNodeCommand`,
`RenameNodeCommand`, `ReparentNodeCommand`, `SetPropertyCommand`, `CompositeCommand`).

## Tools and panels

`Selection`, `Inspector` + `defaultInspectorSchemas` (describe/read/validate),
`TransformTool` (translate/rotate/scale with snapping), `EditorConsole`, `Profiler`,
`Viewport` (2D pan/zoom/frame). `EditorSession` bundles everything.

## Projects and extensions

`@obx/project`: manifests (format 2), migration, semver ranges, `standardFolders`,
`AssetIndex`. `@obx/extensions`: ten contribution kinds with per-extension error
isolation (`ExtensionRegistry`).
