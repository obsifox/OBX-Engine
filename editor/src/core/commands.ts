import { SceneDocument } from "../core/document.js";
import { type EditorNode, type PropertyValue, type SceneSnapshot } from "../core/model.js";
import {  } from "../shell/docking.js";

export abstract class Command {
  abstract readonly label: string;
  abstract apply(): void;
  abstract undo(): void;
}

export class CommandStack {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private openTransaction: Command[] | null = null;

  constructor(readonly limit = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get history(): string[] {
    return [...this.undoStack].reverse().map((command) => command.label);
  }

  get depth(): number {
    return this.undoStack.length;
  }

  execute(command: Command): void {
    command.apply();
    if (this.openTransaction) {
      this.openTransaction.push(command);
      return;
    }
    this.push(command);
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.apply();
    this.undoStack.push(command);
    return true;
  }

  beginTransaction(label: string): void {
    if (this.openTransaction) throw new RangeError("transaction already open");
    this.openTransaction = [];
    this.transactionLabel = label;
  }

  commitTransaction(): boolean {
    if (!this.openTransaction) return false;
    const commands = this.openTransaction;
    this.openTransaction = null;
    if (commands.length === 0) return true;
    this.push(new CompositeCommand(this.transactionLabel, commands));
    return true;
  }

  private transactionLabel = "transaction";

  private push(command: Command): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }
}

export class CompositeCommand extends Command {
  constructor(
    readonly label: string,
    readonly commands: Command[],
  ) {
    super();
  }

  apply(): void {
    for (const command of this.commands) command.apply();
  }

  override undo(): void {
    for (let index = this.commands.length - 1; index >= 0; index -= 1) {
      this.commands[index]!.undo();
    }
  }
}

export class AddNodeCommand extends Command {
  createdId: string | null = null;
  private afterAdd: SceneSnapshot | null = null;

  constructor(
    readonly document: SceneDocument,
    readonly type: string,
    readonly name: string,
    readonly parentId: string | null,
  ) {
    super();
  }

  get label(): string {
    return `Add ${this.type} "${this.name}"`;
  }

  apply(): void {
    if (this.afterAdd && this.createdId && !this.document.has(this.createdId)) {
      this.document.restore(this.afterAdd);
      return;
    }
    const node = this.document.addNode(this.type, this.name, this.parentId);
    this.createdId = node.id;
    this.afterAdd = this.document.snapshot();
  }

  override undo(): void {
    if (this.createdId && this.document.has(this.createdId)) {
      this.document.removeNode(this.createdId);
    }
  }
}

export class RemoveNodeCommand extends Command {
  private snapshot: SceneSnapshot | null = null;

  constructor(
    readonly document: SceneDocument,
    readonly nodeId: string,
  ) {
    super();
  }

  get label(): string {
    return `Remove ${this.nodeId}`;
  }

  apply(): void {
    this.snapshot = this.document.snapshot();
    this.document.removeNode(this.nodeId);
  }

  override undo(): void {
    if (this.snapshot) this.document.restore(this.snapshot);
  }
}

export class RenameNodeCommand extends Command {
  private previous = "";

  constructor(
    readonly document: SceneDocument,
    readonly nodeId: string,
    readonly name: string,
  ) {
    super();
  }

  get label(): string {
    return `Rename to "${this.name}"`;
  }

  apply(): void {
    this.previous = this.document.renameNode(this.nodeId, this.name);
  }

  override undo(): void {
    this.document.renameNode(this.nodeId, this.previous);
  }
}

export class ReparentNodeCommand extends Command {
  private previous: string | null = null;

  constructor(
    readonly document: SceneDocument,
    readonly nodeId: string,
    readonly parentId: string,
  ) {
    super();
  }

  get label(): string {
    return `Reparent ${this.nodeId}`;
  }

  apply(): void {
    this.previous = this.document.reparent(this.nodeId, this.parentId);
  }

  override undo(): void {
    if (this.previous) this.document.reparent(this.nodeId, this.previous);
  }
}

export class SetPropertyCommand<T extends PropertyValue = PropertyValue> extends Command {
  readonly label: string;
  private previous: T | null = null;

  constructor(
    readonly node: EditorNode,
    readonly path: string,
    readonly value: T,
  ) {
    super();
    this.label = `Set ${path}`;
  }

  override apply(): void {
    if (this.path === "name") {
      this.previous = this.node.name as T;
      this.node.name = String(this.value);
      return;
    }
    this.previous = (this.node.properties[this.path] ?? null) as T | null;
    if (this.path.startsWith("transform.")) {
      const [, axis, component] = this.path.split(".");
      const target = this.node.transform[axis as "position" | "rotation" | "scale"];
      target[component as "x" | "y" | "z"] = this.value as number;
      return;
    }
    this.node.properties[this.path] = this.value;
  }

  override undo(): void {
    if (this.path === "name") {
      this.node.name = String(this.previous);
      return;
    }
    if (this.path.startsWith("transform.")) {
      const [, axis, component] = this.path.split(".");
      const target = this.node.transform[axis as "position" | "rotation" | "scale"];
      target[component as "x" | "y" | "z"] = (this.previous ?? 0) as number;
      return;
    }
    if (this.previous === null) delete this.node.properties[this.path];
    else this.node.properties[this.path] = this.previous;
  }
}

