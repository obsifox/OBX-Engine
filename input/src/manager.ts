import { GamepadState, type GamepadSnapshot } from "./gamepad.js";
import { KeyboardState } from "./keyboard.js";
import { MouseState } from "./mouse.js";
import { TouchState } from "./touch.js";

export interface ActionBinding {
  keys?: readonly string[];
  mouseButtons?: readonly number[];
  gamepadButtons?: readonly number[];
}

export interface AxisBinding {
  positiveKeys?: readonly string[];
  negativeKeys?: readonly string[];
  gamepadAxis?: number;
  gamepadInverted?: boolean;
  scale?: number;
}

export class InputManager {
  readonly keyboard = new KeyboardState();
  readonly mouse = new MouseState();
  readonly touch = new TouchState();
  readonly gamepads = new Map<number, GamepadState>();

  private actions = new Map<string, ActionBinding>();
  private axes = new Map<string, AxisBinding>();

  defineAction(name: string, binding: ActionBinding): void {
    this.actions.set(name, binding);
  }

  defineAxis(name: string, binding: AxisBinding): void {
    this.axes.set(name, binding);
  }

  removeAction(name: string): void {
    this.actions.delete(name);
  }

  removeAxis(name: string): void {
    this.axes.delete(name);
  }

  isActionDown(name: string): boolean {
    const binding = this.actions.get(name);
    if (!binding) return false;
    for (const key of binding.keys ?? []) {
      if (this.keyboard.isDown(key)) return true;
    }
    for (const button of binding.mouseButtons ?? []) {
      if (this.mouse.isButtonDown(button)) return true;
    }
    for (const pad of this.gamepads.values()) {
      for (const button of binding.gamepadButtons ?? []) {
        if (pad.connected && pad.isButtonDown(button)) return true;
      }
    }
    return false;
  }

  wasActionPressed(name: string): boolean {
    const binding = this.actions.get(name);
    if (!binding) return false;
    for (const key of binding.keys ?? []) {
      if (this.keyboard.wasPressed(key)) return true;
    }
    for (const button of binding.mouseButtons ?? []) {
      if (this.mouse.wasButtonPressed(button)) return true;
    }
    for (const pad of this.gamepads.values()) {
      for (const button of binding.gamepadButtons ?? []) {
        if (pad.connected && pad.wasButtonPressed(button)) return true;
      }
    }
    return false;
  }

  wasActionReleased(name: string): boolean {
    const binding = this.actions.get(name);
    if (!binding) return false;
    for (const key of binding.keys ?? []) {
      if (this.keyboard.wasReleased(key)) return true;
    }
    for (const button of binding.mouseButtons ?? []) {
      if (this.mouse.wasButtonReleased(button)) return true;
    }
    for (const pad of this.gamepads.values()) {
      for (const button of binding.gamepadButtons ?? []) {
        if (pad.connected && pad.wasButtonReleased(button)) return true;
      }
    }
    return false;
  }

  getAxis(name: string): number {
    const binding = this.axes.get(name);
    if (!binding) return 0;
    let value = 0;
    for (const key of binding.positiveKeys ?? []) {
      if (this.keyboard.isDown(key)) value += 1;
    }
    for (const key of binding.negativeKeys ?? []) {
      if (this.keyboard.isDown(key)) value -= 1;
    }
    if (value === 0 && binding.gamepadAxis !== undefined) {
      for (const pad of this.gamepads.values()) {
        if (!pad.connected) continue;
        const raw = pad.getAxis(binding.gamepadAxis);
        value += binding.gamepadInverted ? -raw : raw;
      }
    }
    return value * (binding.scale ?? 1);
  }

  getGamepad(index: number): GamepadState {
    let pad = this.gamepads.get(index);
    if (!pad) {
      pad = new GamepadState();
      pad.index = index;
      this.gamepads.set(index, pad);
    }
    return pad;
  }

  injectGamepadSnapshot(index: number, snapshot: GamepadSnapshot): void {
    this.getGamepad(index).applySnapshot(snapshot);
  }

  keyDown(code: string, repeat = false): void {
    this.keyboard.handleKeyDown(code, repeat);
  }

  keyUp(code: string): void {
    this.keyboard.handleKeyUp(code);
  }

  mouseMove(x: number, y: number): void {
    this.mouse.handleMove(x, y);
  }

  mouseDown(button: number): void {
    this.mouse.handleDown(button);
  }

  mouseUp(button: number): void {
    this.mouse.handleUp(button);
  }

  mouseWheel(deltaY: number): void {
    this.mouse.handleWheel(deltaY);
  }

  touchStart(id: number, x: number, y: number): void {
    this.touch.handleStart(id, x, y);
  }

  touchMove(id: number, x: number, y: number): void {
    this.touch.handleMove(id, x, y);
  }

  touchEnd(id: number): void {
    this.touch.handleEnd(id);
  }

  endFrame(): void {
    this.keyboard.endFrame();
    this.mouse.endFrame();
    this.touch.endFrame();
    for (const pad of this.gamepads.values()) {
      pad.endFrame();
    }
  }

  reset(): void {
    this.keyboard.reset();
    this.mouse.reset();
    this.touch.reset();
    for (const pad of this.gamepads.values()) {
      pad.reset();
    }
  }
}
