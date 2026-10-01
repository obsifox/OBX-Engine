export {
  AddNodeCommand,
  Command,
  CommandStack,
  CompositeCommand,
  EditorConsole,
  EditorSession,
  Inspector,
  Profiler,
  RemoveNodeCommand,
  RenameNodeCommand,
  ReparentNodeCommand,
  SceneDocument,
  Selection,
  SetPropertyCommand,
  TransformTool,
  Viewport,
  defaultInspectorSchemas,
  identityTransform,
  resetNodeCounter,
  type ConsoleEntry,
  type EditorNode,
  type FrameSample,
  type InspectorSchema,
  type LogLevel,
  type PropertyDescriptor,
  type PropertyValue,
  type SceneSnapshot,
  type SnapSettings,
  type ToolMode,
  type TransformData,
  type Vec2,
  type Vec3,
  type ViewportCamera,
} from "./editor.js";
export {
  CommandPalette,
  LayoutPersistence,
  Preferences,
  Shortcuts,
  fuzzyScore,
  normalizeCombo,
  parseCombo,
  type PaletteCommand,
  type PreferenceValue,
  type ShortcutBinding,
} from "./infra.js";
export { ProjectError, ProjectManager, type ProjectInfo } from "./project.js";
export {
  AssetBrowser,
  type AssetEntry,
  type AssetEntryKind,
  type AssetPreview,
  type BrowserFilter,
  type DragPayload,
  type ImportHandler,
  type ImportReport,
  type MenuItem,
  type PreviewHandler,
  type SortKey,
} from "./browser.js";
export {
  DuplicateNodeCommand,
  HierarchyPanel,
  cloneTransform,
  type HierarchyRow,
} from "./hierarchy.js";
export {
  CameraController,
  SnapService,
  TransformGizmo,
  type CameraFrame,
  type GizmoHandle,
  type GizmoOptions,
  type GizmoSpace,
  type SnapSettingsExt,
} from "./scenetools.js";
export {
  ExtendedInspector,
  type ExtendedPropertyDescriptor,
  type ExtendedPropertyKind,
  type ExtendedPropertyValue,
  type MultiEditResult,
  type PropertyValidationIssue,
} from "./properties.js";
export {
  ScriptEditor,
  analyze,
  findMatches,
  languageForPath,
  tokenize,
  type ExecutionResult,
  type FindMatch,
  type ScriptDiagnostic,
  type ScriptLanguage,
  type ScriptReloader,
  type ScriptRunner,
  type ScriptTab,
  type Token,
  type TokenKind,
} from "./scripteditor.js";
export {
  DockingSystem,
  StatusBar,
  Toolbar,
  defaultLayout,
  type DockLayout,
  type DockLeaf,
  type DockNode,
  type DockSplit,
  type DockSplitDirection,
  type PanelKind,
  type StatusField,
  type ToolbarButton,
} from "./shell.js";
export {
  ObsiFoxStudio,
  type RunReport,
  type SceneFilePayload,
  type StudioOptions,
} from "./studio.js";
export * from "./animationeditor.js";
export * from "./aipanel.js";
export * from "./debugger.js";

export const EDITOR_VERSION = "0.11.0";
export const STUDIO_NAME = "ObsiFox Studio";
