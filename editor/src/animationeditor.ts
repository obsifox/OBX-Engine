import {
  AnimationEditor,
  SkeletonEditor,
  EventTrack,
  type AnimationEvent,
  type ClipDocument,
  type SkeletonDocument,
} from "@obx/animation";
import { Quat, Vec3 } from "@obx/math";

export interface AnimationEditorPanelState {
  activeClip: string;
  selectedTrack: string | null;
  selectedBone: string | null;
  dirty: boolean;
}

export class AnimationEditorPanel {
  clips = new Map<string, AnimationEditor>();
  skeleton: SkeletonEditor;
  state: AnimationEditorPanelState = { activeClip: "", selectedTrack: null, selectedBone: null, dirty: false };
  #undo: ClipDocument[] = [];
  #redo: ClipDocument[] = [];

  constructor(skeleton: SkeletonEditor = new SkeletonEditor()) {
    this.skeleton = skeleton;
  }

  get activeClip(): AnimationEditor | null {
    return this.clips.get(this.state.activeClip) ?? null;
  }

  createClip(name: string, duration = 1, loop = true): AnimationEditor {
    const editor = new AnimationEditor(name, duration, loop);
    this.clips.set(name, editor);
    this.state.activeClip = name;
    this.state.dirty = true;
    return editor;
  }

  selectClip(name: string): boolean {
    if (!this.clips.has(name)) return false;
    this.state.activeClip = name;
    return true;
  }

  selectTrack(target: string): void {
    this.state.selectedTrack = target;
  }

  selectBone(name: string): void {
    this.state.selectedBone = name;
  }

  #pushUndo(): void {
    const active = this.activeClip;
    if (!active) return;
    this.#undo.push(active.serialize());
    this.#redo = [];
    if (this.#undo.length > 48) this.#undo.shift();
  }

  setKey(target: string, time: number, value: Vec3 | Quat | number): boolean {
    const active = this.activeClip;
    if (!active) return false;
    this.#pushUndo();
    active.setKey(target, time, value);
    this.state.dirty = true;
    return true;
  }

  addEvent(event: AnimationEvent): boolean {
    const active = this.activeClip;
    if (!active) return false;
    this.#pushUndo();
    active.addEvent(event);
    this.state.dirty = true;
    return true;
  }

  addBone(name: string, parent: string | null, position = new Vec3(0, 0, 0)): boolean {
    if (this.skeleton.build().bones.some((bone) => bone.name === name)) return false;
    this.skeleton.addBone(name, parent, position);
    this.state.dirty = true;
    return true;
  }

  undo(): boolean {
    const active = this.activeClip;
    const previous = this.#undo.pop();
    if (!active || !previous) return false;
    this.#redo.push(active.serialize());
    const restored = AnimationEditor.deserialize(previous);
    this.clips.set(restored.name, restored);
    this.state.activeClip = restored.name;
    return true;
  }

  redo(): boolean {
    const active = this.activeClip;
    const next = this.#redo.pop();
    if (!active || !next) return false;
    this.#undo.push(active.serialize());
    const restored = AnimationEditor.deserialize(next);
    this.clips.set(restored.name, restored);
    this.state.activeClip = restored.name;
    return true;
  }

  eventTrack(): EventTrack {
    return this.activeClip?.eventTrack() ?? new EventTrack([]);
  }

  validate(): string[] {
    const errors: string[] = [];
    for (const clip of this.clips.values()) {
      for (const error of clip.validate()) errors.push(`${clip.name}: ${error}`);
    }
    for (const error of this.skeleton.validate()) errors.push(`skeleton: ${error}`);
    return errors;
  }

  exportAll(): { clips: ClipDocument[]; skeleton: SkeletonDocument } {
    return {
      clips: [...this.clips.values()].map((clip) => clip.serialize()),
      skeleton: this.skeleton.serialize(),
    };
  }

  importClips(documents: readonly ClipDocument[]): void {
    for (const document of documents) {
      const editor = AnimationEditor.deserialize(document);
      this.clips.set(editor.name, editor);
    }
    this.state.dirty = true;
  }
}
