# `@obx/editor` v1.4.0 API — ObsiFox Studio

Editor package: scene editing core (v0.10) plus the ObsiFox Studio layer (v1.4: project
manager, hierarchy, asset browser, extended inspector, script editor, docking shell,
scene tools, shortcuts/palette/preferences infrastructure). Headless, deterministic
(`now` injectable), framework-free. Verified against source on 2026-09-27.

## Naming

| Export | Value |
| --- | --- |
| `STUDIO_NAME` | `"ObsiFox Studio"` |
| `EDITOR_VERSION` | `"0.11.0"` |

## Scene Core (v0.10, extended)

`Vec2`/`Vec3` re-exported from `@obx/math`. `PropertyValue = number | string | boolean |
Vec2 | Vec3 | PropertyValue[]` (arrays added in v1.4). `PropertyDescriptor`:
`{ name, kind: "number"|"string"|"boolean"|"vec2"|"vec3"|"enum", min?, max?,
enumValues?, readOnly?, description? }`. `defaultInspectorSchemas`: Node2D, Sprite,
Camera, Light, Body, AnimationPlayer, Script.

`EditorNode`: `{ id, name, type, parent, children: string[], transform:
{ position: Vec3, rotation: Vec3, scale: Vec3 }, components: string[], enabled,
properties: Map<string, PropertyValue> }`.

`SceneDocument(options?)`: `Node2D` root named `Scene`; `addNode({name?, type?, parent?,
transform?, properties?})` returns id (`node_N`); `removeNode` (never root), `renameNode`,
`reparentNode` (cycle-safe, never root), `getNode`, `findByName`, `allNodes()`,
`size`, `rootId`, `snapshot()`, `restore(snapshot)`, `validate()`, `fromJSON`,
`toJSON`, `resetNodeCounter()`.

Command system (`editor.ts`): `Command` (`do`/`undo`/`mergeWith`/`label`/`affects`),
`CommandStack` (`execute`, `undo`, `redo`, `beginTransaction`/`commitTransaction`/
`rollbackTransaction`, `depth`, `redoDepth`, `canUndo`, `canRedo`, `clear`, `setLimit`
default 100, `history()`), built-ins `AddNodeCommand`, `RemoveNodeCommand`,
`RenameNodeCommand`, `ReparentNodeCommand`, `SetPropertyCommand` (paths: `name`,
`transform.<axis>.<x|y|z>`, else node properties; null deletes; mergeable),
`CommandTransaction` → `CompositeCommand`. `Selection` (`set/add/remove/toggle/clear/
has/primary/count/values` + `SelectionChange` event). `Inspector` (schemas, `validate`,
`propertiesFor`, `applyValue`, `describe`). `TransformTool` (`mode`, `space`,
`begin/drag/commit/cancel`, `snap`). `EditorConsole` (`log/warn/error/info`,
`LogLevel` filter, `entries`, `format`, `clear`, `count`). `Profiler` (`mark`/`measure`
returns ms via `now()`, `startFrame`/`endFrame` → `FrameStats`, `report`). `Viewport`
(`resize`, `worldToScreen`, `screenToWorld`, `pick`, `setGrid`, `renderGrid`).
`EditorSession` facade: `addNode`, `renameNode`, `deleteNode`, `reparentNode`,
`setProperty` (undoable), `select`, `setTransformMode`, `transformBegin/drag/commit`,
`undo`, `redo`, `console`, `profiler`, `viewport`, `scene` (root EditorNode),
`selectedNode`, `snapshot()`.

## Infrastructure (`infra.ts`)

- `Shortcuts` — `normalizeCombo` (`ctrl+k` → `Ctrl+K`), `parseCombo`, `bind` (optionally
  `{ when }`), `unbind`, `handleEvent(key, {ctrlKey, metaKey, shiftKey, altKey, context?})`
  → registered handler, `resolve`, `all()` → `ShortcutBinding[]`
  `{ combo, commandId, when? }`, `bindingsFor`, `contexts`, `clear`, `setContext`.
  Also `shortcutsOf` helper. **Known quirk**: `Ctrl+P` normalizes equal to `Ctrl+Shift+P`
  (all combos accept optional `Shift+`).
- `CommandPalette` — `register(command: {id, title, category?, keywords?, run, when?})`,
  `execute(id)`, `search(query)` scored (category prefix > title prefix > title
  substring > keyword > fuzzy, ties keep registration order), `visible`/`selectedIndex`/
  `open`/`close`/`toggle`/`select`/`confirm`, `recent()` (max 10), `size`, `list`.
  Helpers `fuzzyScore`, `registerCoreCommands` (undo/redo/save).
- `Preferences` — typed store: `get/set/setMany/getAll/getSchema/setDefault/validate/
  reset/revert/keys`, nested keys via `a.b.c`; values validated per schema
  (`min`/`max`/`enum`/`type`); `PreferenceChangeEvent`.
- `LayoutPersistence` — `save(name, layout)`, `load(name)`, `remove`, `names`, `exists`,
  `clear`, `exportJSON()`, `importJSON(text)`, `LAYOUT_VERSION`; backend must provide
  `read/write/delete/list` (`inMemoryBackend()`).

## Project Manager (`project.ts`)

`ProjectManager({ backend, now })` — `create(name, { root, template, settings })` →
`ProjectRecord {id, name, root, scenes, settings, dirty, createdAt, updatedAt, format:
"obx-project"}`, `open(id)`, `current`, `close()`, `all()`, `recent(limit)`,
`addScene(id?, name?, assetPath?)`, `removeScene`, `renameProject`, `markSaved()`,
`save()`, `settings`, `updateSettings`, `importProject`, `exportProject(current)`,
`validate(record)`, `delete(id)` (block: current). Throws `ProjectError`.

## Hierarchy Panel (`hierarchy.ts`)

`HierarchyPanel({ document, selection, run })` — `rows()` top-down with `depth`
(expanded roots only), `toggle`, `expandAll`, `collapseAll` (root stays expanded),
`selectOnly`, `selectMany`, `addNode(name?, type?)` (saves `lastParent`, undoable),
`addNodeTo`, `deleteSelected`, `rename`, `reparent`, `duplicate` (undoable,
`… copy` names), `duplicateSelected`, `expandTo`, `find`, `node(id)`,
`lastParent` (last added node). `DuplicateNodeCommand(document, sourceId, targetParent?)`
clones node + descendants with fresh ids.

## Scene Tools (`scenetools.ts`)

- `TransformGizmo({ tool, space, snap })` — `geometry(origin, zoom)` →
  `GizmoHandle[] {id, start, end, width}` (translate/scale axis lines; rotate falls back
  to the same layout), `hitTest(point, origin?, zoom?)` → handle id, `beginDrag`,
  `drag(point)` → `GizmoDelta {x,y,z,rotationZ}`, `endDrag`, `cancel`, `applyTo(nodes,
  delta, zoom)` (world: direct offsets; local: delta rotated by primary node's
  `rotation.z`; rotate mode: `rotationZ` added to each node), `isActive`, `reset`,
  `pointerSnap(points)` (moves to nearest vertex within `snap.vertexSnapDistance`),
  `snapPoint`. Import aliases `toolModeFor` = `toolFor`, `isInSnapRange` = `near`.
- `SnapService({ gridSize, vertexSnapDistance, grid?, vertex? })` — `snapPoint`,
  `resolve`, `setGrid`, `setVertex`, `toggleGrid`, `toggleVertex`.
- `CameraController({ viewport })` — `navigateTo(center, zoom?)`, `frameNodes(nodes)`,
  `flyTo(nodes, { steps, durationMs, now? })` → `CameraKeyframe[]` (deterministic).

## Asset Browser (`browser.ts`)

`AssetBrowser({ database?, importer?, previewer?, now? })` — `addEntry`, `root`,
`navigate(path)`, `up()`, `currentPath`, `folders()`, `entries`, `all()`, `visible()`
(filtered+sorted), `search(query)`, `setSort(name|size|type|date, direction)`,
`setFilter(type?)`, `select/clearSelection`, `selected`, `import(path)` →
`{status: "imported"|"reimported"|"failed", entry?, error?, ...}` (no importer =
`imported`, known path = `reimported`, importer throw = `failed`), `reimport`,
`beginDrag(path)` → `DragPayload`, `drop(path, target)` (folder move + importer
`move`), `contextMenu(path)` → actions, `preview(path)` → `{name, type, size, details}`
(metadata spread into `details`), `metadataOf`, `setMetadata`, `metadata`, `removeEntry`,
`rename`, `sortEntries` (exported), `defaultPreviewer`. Known bug (accepted): `search`
also matches ancestor folder names.

## Extended Inspector (`properties.ts`)

`ExtendedInspector({ document, selection, run, schemas? })` — reads/writes
`descriptor(name, node)`: primitive via `transform.<axis>` / `properties`; **arrays**
(`path + "[]"` descriptors; `applyValue` at `path[]` writes/creates arrays),
`resource` (`current = {path, assetId?}` via `assignResource`), `reference`
(`{kind:"entity"|"node"|"component", target}` via `setReference`).
`inspect(target?)`, `write(path, value)` (undoable), `validate`, `validateNode`,
`resetToDefault`, `multiEdit(nodes, path, value)`, `canEdit`,
`assignResource(path, resource)` / `setReference(path, reference)`.
`ExtendedPropertyDescriptor = Omit<PropertyDescriptor,"kind"> & { kind: ..., path? }`.

## Script Editor (`scripteditor.ts`)

`ScriptEditor({ now })` — `open(path, text?)`, `edit(path, text)`, `close`, `setActive`,
`tabs`, `active`, `text`, `setCursor({line, column})`, `cursorAt`, `find(query)` →
`TextMatch[] {line, column, endLine, endColumn, text}`, `replace(path, query,
replacement)`, `replaceAll(path, query, replacement)` → count, `highlight(path,
scheme?)` → `Token[] {start, end, text, kind: "keyword"|"identifier"|"number"|
"string"|"comment"|"operator"|"punctuation"|"whitespace"|"text"}`, `diagnostics(path)`
per open tab, `errorDiagnostics()` across tabs, `execute(path, runner?)` →
`{ok, output, error?, durationMs}`, `setRunner(runner)`, `reload(path, text)`,
`dirty`. Exports `tokenize(text, language, scheme?)`, `analyze(text)`,
`findMatches(text, query)`, `languageForPath`, `defaultSyntaxSchemes`
(javascript/typescript: keyword `#41E0FF`, string `#FFB020`, comment `#8A94A6`,
number `#FF6A1A`, identifier `#E8ECF2`).

## Docking / Shell (`shell.ts`)

- `DockingSystem(initial)` — `DockLayout {id, orientation, ratio, first, second}` or
  `DockLeaf {id, tabs, activeTab}` or `DockSplit` (`{type:"split",...}`).
  `find(id)`, `focus(tabId)` (activates + focuses contained panel), `splitPanel(target,
  orientation, newPanel, ratio=0.5)`, `tabify(tabId, newPanel)` (false if same leaf
  already), `closePanel(id)`, `moveTab(id, targetLeaf, index?)`, `maximize(id)` /
  `restore()`, `visiblePanels()`, `layout`, `restoreLayout(layout)`, `serialize()`,
  `restore(serialized)`, `layoutSnapshot()` (Studio helper).
- `Toolbar(commands, { run? })` — 8 buttons: `translate`, `rotate`, `scale`, `grid`,
  `vertex-snap`, `play`, `pause`, `stop`; `press(id)`, `setEnabled(id, on)`,
  `setActive(id, on)` (tool trio exclusive — sets `TransformTool` mode; `grid` toggles
  `SnapService`), `enabled(id)`, `active(id)`, `buttons`.
- `StatusBar` — `set(id, value)`, `get`, `remove`, `list()`, `clear`, `values` (a
  `Map`).

## Studio Facade (`studio.ts`)

`ObsiFoxStudio(options?)` wires everything: `session`, `document`, `selection`,
`stack`, `console`, `profiler`, `inspector` (extended), `tool` (TransformTool), `gizmo`,
`snap`, `cameraRig`, `projects`, `browser`, `hierarchy`, `docking`, `toolbar`,
`statusBar`, `palette`, `shortcuts`, `preferences`, `layouts`, `scripts`.

Workflow methods (v1.4 completion criteria):
`createProject(name, root?, template?)`, `openProject(id)`,
`createScene(name?)` → serialized scene, `addEntity(type, name?, parent?)`,
`modifyComponent(entityId, propertyPath, value)`, `multiEdit(ids, path, value)`,
`duplicateSelection()`, `importAssets(paths)`, `saveScene()` → `SceneSnapshot`,
`loadScene(snapshot)` (format `obx-editor-scene` v1), `serializeScene()`, `isDirty()`,
`editScript(path, text)` → tab, `runProject()` → `{ok, logs, errors}` (script runner →
console → profiler.present()), `debugErrors()` → error+diagnostic entries (sets
`statusBar` `errors`), `hitTestGizmo(point)`, `describe()`, `visiblePanels()`,
`layoutSnapshot()`, `registerCoreCommands` (save/undo/redo/duplicate), `bindShortcuts`
(`Ctrl+S/Z/Y/D`).

## Scene serialization

`serializeScene()` / `saveScene()` write `{format: "obx-editor-scene", version: 1,
name, nodes: [{id, name, type, parent, transform{position/rotation/scale}, components,
enabled, properties}], root}`. `loadScene` accepts that shape and restores via
`SceneDocument.fromJSON` (needs `version: 1` + `root`).

## Tests

`editor/tests/`: `editor.test.ts` (15), `infra.test.ts` (10), `project.test.ts` (11),
`browser.test.ts` (13), `hierarchy.test.ts` (8), `scenetools.test.ts` (9),
`properties.test.ts` (10), `scripteditor.test.ts` (9), `shell.test.ts` (13),
`studio.test.ts` (12) = 110 tests. Example: `examples/v140-demo` (full 10-step
workflow + studio shell render).
