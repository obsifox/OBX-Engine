import type { NativeEvent, PlatformWindow, WindowOptions, WindowState } from "./types.js";
import { PlatformError } from "./errors.js";
export class HeadlessWindow implements PlatformWindow {
  readonly id: number;
  readonly state: WindowState;
  #onClose: ((event: NativeEvent) => void) | null;

  constructor(id: number, options: WindowOptions, onClose: ((event: NativeEvent) => void) | null) {
    this.id = id;
    this.state = {
      title: options.title ?? "OBX",
      width: options.width ?? 1280,
      height: options.height ?? 720,
      visible: options.visible ?? true,
      closed: false,
    };
    this.#onClose = onClose;
  }

  setTitle(title: string): void {
    this.state.title = title;
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new PlatformError("Window dimensions must be positive");
    }
    this.state.width = width;
    this.state.height = height;
  }

  show(): void {
    this.state.visible = true;
  }

  hide(): void {
    this.state.visible = false;
  }

  close(): void {
    if (this.state.closed) return;
    this.state.closed = true;
    this.#onClose?.({ type: "close", payload: { windowId: this.id }, timestamp: 0 });
  }

  isClosed(): boolean {
    return this.state.closed;
  }
}

