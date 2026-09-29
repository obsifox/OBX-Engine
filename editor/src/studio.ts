import {
  CommandStack,
  EditorConsole,
  EditorSession,
  Inspector,
  Profiler,
  SceneDocument,
  Selection,
  TransformTool,
  Viewport,
  defaultInspectorSchemas,
  type EditorNode,
  type InspectorSchema,
} from "./editor.js";
import { CommandPalette, LayoutPersistence, Preferences, Shortcuts, type PaletteCommand } from "./infra.js";
import { ProjectManager, type ProjectInfo } from "./project.js";
import { AssetBrowser, type AssetEntry, type ImportReport } from "./browser.js";
import { HierarchyPanel } from "./hierarchy.js";
import { CameraController, SnapService, TransformGizmo, type GizmoHandle } from "./scenetools.js";
import { ExtendedInspector, type ExtendedPropertyDescriptor, type MultiEditResult } from "./properties.js";
import { ScriptEditor, type ExecutionResult, type ScriptDiagnostic, type ScriptTab } from "./scripteditor.js";
import { DockingSystem, StatusBar, Toolbar, type DockLayout, type PanelKind } from "./shell.js";

export interface StudioOptions {
  projectName?: string;
  projectRoot?: string;
  schemas?: InspectorSchema[];
  now?: () => number;
}

export interface SceneFilePayload {
  format: "obx-editor-scene";
  version: 1;
  rootId: string;
  nodes: EditorNode[];
  savedAt: number;
}

export interface RunReport {
  ok: boolean;
  logs: string[];
  errors: ScriptDiagnostic[];
  steps: string[];
}

let sceneCounter = 0;

export class ObsiFoxStudio {
  readonly session: EditorSession;
  readonly projects: ProjectManager;
  readonly browser: AssetBrowser;
  readonly hierarchy: HierarchyPanel;
  readonly docking: DockingSystem;
  readonly toolbar: Toolbar;
  readonly statusBar: StatusBar;
  readonly palette: CommandPalette;
  readonly shortcuts: Shortcuts;
  readonly preferences: Preferences;
  readonly layouts: LayoutPersistence;
  readonly scripts: ScriptEditor;
  readonly gizmo: TransformGizmo;
  readonly snap: SnapService;
  readonly camera: CameraController;
  readonly extendedInspector: ExtendedInspector;
  readonly console: EditorConsole;
  readonly stack: CommandStack;
  readonly selection: Selection;
  readonly inspector: Inspector;
  readonly tool: TransformTool;
  readonly viewport: Viewport;
  readonly profiler: Profiler;
  readonly document: SceneDocument;
  private readonly now: () => number;
  private scenePath = "";
  private savedSceneHash = "";

  constructor(options: StudioOptions = {}) {
    this.session = new EditorSession(options.projectName ?? "Scene");
    this.document = this.session.document;
    this.stack = this.session.stack;
    this.selection = this.session.selection;
    this.inspector = this.session.inspector;
    this.tool = this.session.tool;
    this.console = this.session.console;
    this.profiler = this.session.profiler;
    this.viewport = this.session.viewport;
    this.projects = new ProjectManager();
    this.browser = new AssetBrowser();
    this.hierarchy = new HierarchyPanel(this.document, this.selection, this.stack);
    this.docking = new DockingSystem();
    this.toolbar = new Toolbar();
    this.statusBar = new StatusBar();
    this.palette = new CommandPalette();
    this.shortcuts = new Shortcuts();
    this.preferences = new Preferences({
      "editor.gridSize": 0.5,
      "editor.autoSave": false,
      "editor.theme": "obsidian",
    });
    this.layouts = new LayoutPersistence();
    this.scripts = new ScriptEditor();
    this.gizmo = new TransformGizmo();
    this.snap = new SnapService();
    this.camera = new CameraController(this.viewport);
    this.extendedInspector = new ExtendedInspector(this.inspector, options.schemas ?? []);
    this.now = options.now ?? (() => Date.now());
    this.registerCoreCommands();
    if (options.projectName && options.projectRoot) {
      this.createProject(options.projectName, options.projectRoot);
    }
    this.statusBar.set("scene", this.document.rootId);
    this.statusBar.set("tool", this.tool.mode);
  }

  private registerCoreCommands(): void {
    const commands: PaletteCommand[] = [
      { id: "file.save", title: "Save Scene", category: "File", run: () => void this.saveScene() },
      { id: "edit.undo", title: "Undo", category: "Edit", run: () => this.stack.undo() },
      { id: "edit.redo", title: "Redo", category: "Edit", run: () => this.stack.redo() },
      { id: "scene.add", title: "Add Entity", category: "Scene", run: () => this.addEntity("Node2D", "Node") },
      { id: "scene.duplicate", title: "Duplicate Selection", category: "Scene", run: () => this.duplicateSelection() },
      { id: "view.palette", title: "Command Palette", category: "View", run: () => undefined },
    ];
    for (const command of commands) this.palette.register(command);
    this.shortcuts.bind("ctrl+s", "file.save");
    this.shortcuts.bind("ctrl+z", "edit.undo");
    this.shortcuts.bind("ctrl+y", "edit.redo");
    this.shortcuts.bind("ctrl+d", "scene.duplicate");
  }

  createProject(name: string, root: string): ProjectInfo {
    const info = this.projects.create(name, root);
    this.statusBar.set("project", info.name);
    this.console.log("info", `project "${name}" created`);
    return info;
  }

  openProject(id: string): ProjectInfo {
    const info = this.projects.open(id);
    this.statusBar.set("project", info.name);
    this.docking.focus("project-manager");
    return info;
  }

  createScene(name: string): SceneFilePayload {
    sceneCounter += 1;
    this.scenePath = `scenes/${name}.scene`;
    this.console.log("info", `scene ${this.scenePath} created`);
    this.statusBar.set("scene", this.scenePath);
    if (this.projects.current) this.projects.addScene(this.projects.current.id, this.scenePath);
    return this.serializeScene();
  }

  addEntity(type: string, name: string, parentId: string | null = null): string {
    const id = this.hierarchy.addNode(type, name, parentId);
    this.statusBar.set("selection", name);
    return id;
  }

  duplicateSelection(): string[] {
    return this.hierarchy.duplicateSelected();
  }

  modifyComponent(nodeId: string, path: string, value: unknown): void {
    const node = this.document.node(nodeId);
    const result = this.extendedInspector.multiEdit([node], path, value as never);
    if (result.issues.length > 0) {
      for (const issue of result.issues) this.console.log("warn", issue.message);
    }
    this.statusBar.set("dirty", "true");
  }

  multiEdit(nodeIds: string[], path: string, value: unknown): MultiEditResult {
    const nodes = nodeIds.map((id) => this.document.node(id));
    return this.extendedInspector.multiEdit(nodes, path, value as never);
  }

  importAssets(paths: string[]): ImportReport[] {
    const reports = this.browser.import(paths);
    for (const report of reports) {
      this.console.log(report.status === "failed" ? "error" : "info", `${report.path}: ${report.message}`);
    }
    this.statusBar.set("assets", String(this.browser.all().length));
    return reports;
  }

  saveScene(): SceneFilePayload {
    const payload = this.serializeScene();
    this.savedSceneHash = JSON.stringify(payload.nodes);
    if (this.projects.current) this.projects.markSaved(this.projects.current.id);
    this.statusBar.set("dirty", "false");
    this.console.log("info", `saved ${this.scenePath || "scene"}`);
    return payload;
  }

  loadScene(payload: SceneFilePayload | string): void {
    const parsed = typeof payload === "string" ? (JSON.parse(payload) as SceneFilePayload) : payload;
    if (parsed.format !== "obx-editor-scene") throw new RangeError("not an editor scene");
    this.document.restore({ rootId: parsed.rootId, nodes: parsed.nodes });
    this.savedSceneHash = JSON.stringify(parsed.nodes);
    this.statusBar.set("dirty", "false");
    this.console.log("info", "scene loaded");
  }

  serializeScene(): SceneFilePayload {
    const snapshot = this.document.snapshot();
    return {
      format: "obx-editor-scene",
      version: 1,
      rootId: snapshot.rootId,
      nodes: snapshot.nodes,
      savedAt: this.now(),
    };
  }

  isDirty(): boolean {
    return JSON.stringify(this.document.snapshot().nodes) !== this.savedSceneHash;
  }

  editScript(path: string, text: string): ScriptTab {
    const tab = this.scripts.open(path, text);
    this.docking.focus("script-editor");
    this.statusBar.set("script", path);
    return tab;
  }

  runProject(): RunReport {
    this.toolbar.setActive("play", true);
    const steps: string[] = [];
    const logs: string[] = [];
    const errors: ScriptDiagnostic[] = [];
    steps.push("compile");
    for (const tab of this.scripts.tabs) {
      const result: ExecutionResult = this.scripts.execute(tab.id);
      logs.push(...result.output);
      errors.push(...this.scripts.errorDiagnostics(tab.id));
      if (!result.ok && result.error) {
        errors.push({ line: 1, column: 0, endLine: 1, endColumn: 1, severity: "error", message: result.error });
      }
    }
    steps.push("simulate");
    logs.push(`entities=${this.document.size}`);
    steps.push("present");
    const ok = errors.length === 0;
    this.console.log(ok ? "info" : "error", ok ? "run completed" : `run failed with ${errors.length} error(s)`);
    this.toolbar.setActive("play", false);
    return { ok, logs, errors, steps };
  }

  debugErrors(): ScriptDiagnostic[] {
    const errors: ScriptDiagnostic[] = [];
    for (const tab of this.scripts.tabs) {
      errors.push(...this.scripts.errorDiagnostics(tab.id));
    }
    for (const entry of this.console.filter("error")) {
      errors.push({ line: 1, column: 0, endLine: 1, endColumn: 1, severity: "error", message: entry.message });
    }
    return errors;
  }

  hitTestGizmo(point: { x: number; y: number }): GizmoHandle {
    const selection = this.selection.list.map((id) => this.document.node(id));
    const originNode = selection[0];
    const origin = originNode
      ? this.viewport.worldToScreen({ x: originNode.transform.position.x, y: originNode.transform.position.y })
      : { x: 0, y: 0 };
    const geometry = this.gizmo.geometry({ origin, mode: this.tool.mode === "select" ? "translate" : this.tool.mode });
    return this.gizmo.hitTest(point, geometry);
  }

  describe(nodeId: string): ExtendedPropertyDescriptor[] {
    return this.extendedInspector.describe(this.document.node(nodeId));
  }

  visiblePanels(): PanelKind[] {
    return this.docking.visiblePanels();
  }

  layoutSnapshot(): DockLayout {
    return this.docking.layout;
  }
}
