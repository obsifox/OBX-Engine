import { type EditorNode, type Vec3 } from "../core/model.js";

export type ToolMode = "select" | "translate" | "rotate" | "scale";

export interface SnapSettings {
  translateStep: number;
  rotateStep: number;
  scaleStep: number;
}

export class TransformTool {
  mode: ToolMode = "select";
  snap: SnapSettings = { translateStep: 0.5, rotateStep: 15, scaleStep: 0.25 };

  setMode(mode: ToolMode): void {
    this.mode = mode;
  }

  applyDrag(node: EditorNode, delta: Vec3, useSnap = false): void {
    if (this.mode === "translate") {
      const step = useSnap ? this.snap.translateStep : 0;
      node.transform.position.x = this.adjust(node.transform.position.x, delta.x, step);
      node.transform.position.y = this.adjust(node.transform.position.y, delta.y, step);
      node.transform.position.z = this.adjust(node.transform.position.z, delta.z, step);
      return;
    }
    if (this.mode === "rotate") {
      const step = useSnap ? this.snap.rotateStep : 0;
      node.transform.rotation.x = this.adjust(node.transform.rotation.x, delta.x, step);
      node.transform.rotation.y = this.adjust(node.transform.rotation.y, delta.y, step);
      node.transform.rotation.z = this.adjust(node.transform.rotation.z, delta.z, step);
      return;
    }
    if (this.mode === "scale") {
      const step = useSnap ? this.snap.scaleStep : 0;
      node.transform.scale.x = Math.max(0.01, this.adjust(node.transform.scale.x, delta.x, step));
      node.transform.scale.y = Math.max(0.01, this.adjust(node.transform.scale.y, delta.y, step));
      node.transform.scale.z = Math.max(0.01, this.adjust(node.transform.scale.z, delta.z, step));
    }
  }

  private adjust(current: number, delta: number, step: number): number {
    const next = current + delta;
    return step > 0 ? Math.round(next / step) * step : next;
  }
}

