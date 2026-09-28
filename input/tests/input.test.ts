import { describe, expect, it } from "vitest";
import { InputManager, DomInputAdapter, GamepadState, createBrowserGamepadSource } from "@obx/input";

describe("KeyboardState", () => {
  it("tracks down, pressed and released edges", () => {
    const input = new InputManager();
    input.keyDown("Space");
    expect(input.keyboard.isDown("Space")).toBe(true);
    expect(input.keyboard.wasPressed("Space")).toBe(true);

    input.endFrame();
    expect(input.keyboard.isDown("Space")).toBe(true);
    expect(input.keyboard.wasPressed("Space")).toBe(false);

    input.keyUp("Space");
    expect(input.keyboard.wasReleased("Space")).toBe(true);
    expect(input.keyboard.isDown("Space")).toBe(false);
    input.endFrame();
    expect(input.keyboard.wasReleased("Space")).toBe(false);
  });

  it("filters key repeat", () => {
    const input = new InputManager();
    input.keyDown("KeyA");
    input.keyDown("KeyA", true);
    expect(input.keyboard.pressed.size).toBe(1);
    input.keyUp("KeyA");
    input.keyDown("KeyA");
    expect(input.keyboard.isDown("KeyA")).toBe(true);
  });
});

describe("MouseState", () => {
  it("accumulates deltas and buttons", () => {
    const input = new InputManager();
    input.mouseMove(100, 50);
    input.mouseMove(130, 40);
    expect(input.mouse.x).toBe(130);
    expect(input.mouse.dx).toBe(130);
    expect(input.mouse.dy).toBe(40);
    input.endFrame();

    input.mouseMove(140, 40);
    expect(input.mouse.dx).toBe(10);
    expect(input.mouse.dy).toBe(0);

    input.mouseDown(0);
    expect(input.mouse.isButtonDown(0)).toBe(true);
    expect(input.mouse.wasButtonPressed(0)).toBe(true);
    input.mouseUp(0);
    expect(input.mouse.wasButtonReleased(0)).toBe(true);

    input.mouseWheel(120);
    expect(input.mouse.wheel).toBe(120);
    input.endFrame();
    expect(input.mouse.dx).toBe(0);
    expect(input.mouse.wheel).toBe(0);
    expect(input.mouse.pressed.size).toBe(0);
  });
});

describe("TouchState", () => {
  it("tracks multi-touch points", () => {
    const input = new InputManager();
    input.touchStart(1, 10, 10);
    input.touchStart(2, 200, 100);
    expect(input.touch.count).toBe(2);
    expect(input.touch.wasStarted()).toBe(true);

    input.touchMove(1, 15, 12);
    const point = input.touch.active.get(1);
    expect(point?.position.x).toBe(15);
    expect(point?.startPosition.x).toBe(10);

    input.touchEnd(1);
    expect(input.touch.count).toBe(1);
    expect(input.touch.wasEnded()).toBe(true);
    input.endFrame();
    expect(input.touch.wasEnded()).toBe(false);
  });
});

describe("GamepadState", () => {
  it("applies snapshots with deadzone", () => {
    const pad = new GamepadState();
    pad.applySnapshot({
      id: "test-pad",
      connected: true,
      axes: [0.1, 0.5],
      buttons: [true, false],
    });
    expect(pad.connected).toBe(true);
    expect(pad.getAxis(0)).toBe(0);
    expect(pad.getAxis(1)).toBeCloseTo((0.5 - 0.15) / 0.85, 6);
    expect(pad.isButtonDown(0)).toBe(true);
    expect(pad.wasButtonPressed(0)).toBe(true);

    pad.applySnapshot({
      id: "test-pad",
      connected: true,
      axes: [0, 0],
      buttons: [false, true],
    });
    expect(pad.wasButtonReleased(0)).toBe(true);
    expect(pad.wasButtonPressed(1)).toBe(true);
    pad.endFrame();
    expect(pad.wasButtonPressed(1)).toBe(false);
  });
});

describe("InputManager actions and axes", () => {
  it("maps keyboard, mouse and gamepad to actions", () => {
    const input = new InputManager();
    input.defineAction("jump", {
      keys: ["Space", "KeyW"],
      mouseButtons: [0],
      gamepadButtons: [0],
    });

    input.keyDown("Space");
    expect(input.isActionDown("jump")).toBe(true);
    expect(input.wasActionPressed("jump")).toBe(true);
    input.keyUp("Space");
    input.endFrame();

    input.mouseDown(0);
    expect(input.isActionDown("jump")).toBe(true);
    input.mouseUp(0);
    input.endFrame();

    input.injectGamepadSnapshot(0, {
      id: "pad",
      connected: true,
      axes: [],
      buttons: [true],
    });
    expect(input.isActionDown("jump")).toBe(true);
    expect(input.wasActionPressed("jump")).toBe(true);
    expect(input.isActionDown("unknown")).toBe(false);
  });

  it("computes axes from keys and sticks", () => {
    const input = new InputManager();
    input.defineAxis("moveX", {
      positiveKeys: ["KeyD"],
      negativeKeys: ["KeyA"],
      gamepadAxis: 0,
    });

    expect(input.getAxis("moveX")).toBe(0);
    input.keyDown("KeyD");
    expect(input.getAxis("moveX")).toBe(1);
    input.keyDown("KeyA");
    expect(input.getAxis("moveX")).toBe(0);
    input.keyUp("KeyD");
    input.keyUp("KeyA");

    input.injectGamepadSnapshot(0, {
      id: "pad",
      connected: true,
      axes: [-1],
      buttons: [],
    });
    expect(input.getAxis("moveX")).toBeCloseTo(-1, 6);
    expect(input.getAxis("missing")).toBe(0);
  });

  it("supports axis scale and inversion", () => {
    const input = new InputManager();
    input.defineAxis("look", { gamepadAxis: 2, gamepadInverted: true, scale: 2 });
    input.injectGamepadSnapshot(0, {
      id: "pad",
      connected: true,
      axes: [0, 0, 1],
      buttons: [],
    });
    expect(input.getAxis("look")).toBeCloseTo(-2, 6);
  });

  it("removes bindings", () => {
    const input = new InputManager();
    input.defineAction("fire", { keys: ["KeyF"] });
    input.keyDown("KeyF");
    expect(input.isActionDown("fire")).toBe(true);
    input.removeAction("fire");
    expect(input.isActionDown("fire")).toBe(false);
  });
});

describe("DomInputAdapter", () => {
  it("wires DOM-like events into the manager", () => {
    const listeners = new Map<string, (event: unknown) => void>();
    const target = {
      addEventListener(type: string, handler: (event: never) => void) {
        listeners.set(type, handler as (event: unknown) => void);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    };

    const input = new InputManager();
    const adapter = new DomInputAdapter();
    adapter.attach(input, target, { preventDefaultKeys: ["Space"] });

    listeners.get("keydown")?.({ code: "KeyE", repeat: false, preventDefault() {} });
    listeners.get("mousemove")?.({ clientX: 40, clientY: 60 });
    listeners.get("mousedown")?.({ button: 1 });
    listeners.get("touchstart")?.({
      changedTouches: [{ identifier: 7, clientX: 1, clientY: 2 }],
    });

    expect(input.keyboard.isDown("KeyE")).toBe(true);
    expect(input.mouse.x).toBe(40);
    expect(input.mouse.isButtonDown(1)).toBe(true);
    expect(input.touch.count).toBe(1);

    adapter.detach();
    expect(listeners.size).toBe(0);
    expect(createBrowserGamepadSource()()).toEqual([]);
  });

  it("polls gamepads through the source hook", () => {
    const input = new InputManager();
    const adapter = new DomInputAdapter();
    const listeners = new Map<string, (event: unknown) => void>();
    adapter.attach(
      input,
      {
        addEventListener(type: string, handler: (event: never) => void) {
          listeners.set(type, handler as (event: unknown) => void);
        },
        removeEventListener(type: string) {
          listeners.delete(type);
        },
      },
      {
        gamepadSource: () => [
          {
            index: 3,
            id: "virtual",
            connected: true,
            axes: [1],
            buttons: [{ pressed: true }],
          },
        ],
      },
    );
    adapter.pollGamepads();
    const pad = input.getGamepad(3);
    expect(pad.isButtonDown(0)).toBe(true);
    expect(pad.getAxis(0)).toBeCloseTo(1, 6);
    expect(GamepadState).toBeDefined();
  });
});
