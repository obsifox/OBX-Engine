export interface GamepadSnapshot {
  id: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly boolean[];
}

export class GamepadState {
  index = 0;
  id = "";
  connected = false;
  axes: number[] = [];
  buttons: boolean[] = [];
  readonly pressed = new Set<number>();
  readonly released = new Set<number>();
  deadzone = 0.15;

  applySnapshot(snapshot: GamepadSnapshot): void {
    this.id = snapshot.id;
    this.connected = snapshot.connected;
    this.axes = [...snapshot.axes];
    const next = [...snapshot.buttons];
    for (let i = 0; i < Math.max(next.length, this.buttons.length); i += 1) {
      const was = this.buttons[i] ?? false;
      const is = next[i] ?? false;
      if (!was && is) this.pressed.add(i);
      if (was && !is) this.released.add(i);
    }
    this.buttons = next;
  }

  getAxis(axis: number): number {
    const raw = this.axes[axis] ?? 0;
    const mag = Math.abs(raw);
    if (mag < this.deadzone) return 0;
    return Math.sign(raw) * ((mag - this.deadzone) / (1 - this.deadzone));
  }

  isButtonDown(button: number): boolean {
    return this.buttons[button] ?? false;
  }

  wasButtonPressed(button: number): boolean {
    return this.pressed.has(button);
  }

  wasButtonReleased(button: number): boolean {
    return this.released.has(button);
  }

  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }

  reset(): void {
    this.axes = [];
    this.buttons = [];
    this.connected = false;
    this.endFrame();
  }
}
