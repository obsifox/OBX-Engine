export class KeyboardState {
  readonly down = new Set<string>();
  readonly pressed = new Set<string>();
  readonly released = new Set<string>();
  private repeatFilter = true;

  handleKeyDown(code: string, repeat = false): void {
    if (repeat && this.repeatFilter && this.down.has(code)) return;
    if (!this.down.has(code)) {
      this.down.add(code);
      this.pressed.add(code);
    }
  }

  handleKeyUp(code: string): void {
    if (this.down.delete(code)) {
      this.released.add(code);
    }
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.released.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }

  reset(): void {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }
}
