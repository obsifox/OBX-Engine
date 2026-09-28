import type { InputManager } from "./manager.js";

interface DomTarget {
  addEventListener(type: string, handler: (event: never) => void, options?: unknown): void;
  removeEventListener(type: string, handler: (event: never) => void, options?: unknown): void;
}

interface KeyDomEvent {
  code: string;
  repeat: boolean;
  preventDefault(): void;
}

interface MouseDomEvent {
  clientX: number;
  clientY: number;
  button: number;
}

interface WheelDomEvent {
  deltaY: number;
}

interface TouchLike {
  identifier: number;
  clientX: number;
  clientY: number;
}

interface TouchDomEvent {
  changedTouches: ArrayLike<TouchLike>;
}

export interface DomInputOptions {
  preventDefaultKeys?: readonly string[];
  gamepadSource?: () => GamepadLike[];
}

export interface GamepadLike {
  index: number;
  id: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

export class DomInputAdapter {
  private manager: InputManager | null = null;
  private target: DomTarget | null = null;
  private listeners: Array<[string, (event: never) => void]> = [];
  private options: DomInputOptions = {};

  attach(manager: InputManager, target: DomTarget, options: DomInputOptions = {}): void {
    this.detach();
    this.manager = manager;
    this.target = target;
    this.options = options;

    const prevent = new Set(options.preventDefaultKeys ?? []);
    const on = <T>(type: string, handler: (event: T) => void): void => {
      const wrapped = handler as unknown as (event: never) => void;
      target.addEventListener(type, wrapped);
      this.listeners.push([type, wrapped]);
    };

    on<KeyDomEvent>("keydown", (event) => {
      if (prevent.has(event.code)) event.preventDefault();
      manager.keyDown(event.code, event.repeat);
    });

    on<KeyDomEvent>("keyup", (event) => {
      manager.keyUp(event.code);
    });

    on<MouseDomEvent>("mousemove", (event) => {
      manager.mouseMove(event.clientX, event.clientY);
    });

    on<MouseDomEvent>("mousedown", (event) => {
      manager.mouseDown(event.button);
    });

    on<MouseDomEvent>("mouseup", (event) => {
      manager.mouseUp(event.button);
    });

    on<WheelDomEvent>("wheel", (event) => {
      manager.mouseWheel(event.deltaY);
    });

    on<TouchDomEvent>("touchstart", (event) => {
      for (const touch of Array.from(event.changedTouches)) {
        manager.touchStart(touch.identifier, touch.clientX, touch.clientY);
      }
    });

    on<TouchDomEvent>("touchmove", (event) => {
      for (const touch of Array.from(event.changedTouches)) {
        manager.touchMove(touch.identifier, touch.clientX, touch.clientY);
      }
    });

    on<TouchDomEvent>("touchend", (event) => {
      for (const touch of Array.from(event.changedTouches)) {
        manager.touchEnd(touch.identifier);
      }
    });
  }

  pollGamepads(): void {
    const source = this.options.gamepadSource;
    if (!source || !this.manager) return;
    for (const pad of source()) {
      this.manager.injectGamepadSnapshot(pad.index, {
        id: pad.id,
        connected: pad.connected,
        axes: pad.axes,
        buttons: pad.buttons.map((button) => button.pressed),
      });
    }
  }

  detach(): void {
    if (this.target) {
      for (const [type, handler] of this.listeners) {
        this.target.removeEventListener(type, handler);
      }
    }
    this.listeners = [];
    this.target = null;
    this.manager = null;
  }
}

export function createBrowserGamepadSource(): () => GamepadLike[] {
  return () => {
    const nav = (globalThis as { navigator?: { getGamepads?: () => (GamepadLike | null)[] } }).navigator;
    if (!nav?.getGamepads) return [];
    return Array.from(nav.getGamepads()).filter((pad): pad is GamepadLike => pad !== null);
  };
}
