export { KeyboardState } from "./keyboard.js";
export { MouseState } from "./mouse.js";
export { TouchState, type TouchPoint } from "./touch.js";
export { GamepadState, type GamepadSnapshot } from "./gamepad.js";
export {
  InputManager,
  type ActionBinding,
  type AxisBinding,
} from "./manager.js";
export {
  DomInputAdapter,
  createBrowserGamepadSource,
  type DomInputOptions,
  type GamepadLike,
} from "./dom.js";

export const INPUT_VERSION = "0.3.0";
