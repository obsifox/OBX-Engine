import { CommandStack } from "../core/commands.js";
import { EditorConsole } from "../core/console.js";
import { SceneDocument } from "../core/document.js";
import { Inspector } from "../core/inspector.js";
import { Profiler } from "../core/profiler.js";
import { Selection } from "../core/selection.js";
import { TransformTool } from "../core/transform.js";
import { Viewport } from "../core/viewport.js";

export class EditorSession {
  readonly document: SceneDocument;
  readonly stack: CommandStack;
  readonly selection = new Selection();
  readonly inspector = new Inspector();
  readonly tool = new TransformTool();
  readonly console = new EditorConsole();
  readonly profiler = new Profiler();
  readonly viewport = new Viewport();

  constructor(rootName = "Scene") {
    this.document = new SceneDocument(rootName);
    this.stack = new CommandStack();
  }
}
