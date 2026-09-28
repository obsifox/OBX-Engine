export class MouseState {
  x = 0;
  y = 0;
  dx = 0;
  dy = 0;
  wheel = 0;
  readonly down = new Set<number>();
  readonly pressed = new Set<number>();
  readonly released = new Set<number>();

  handleMove(x: number, y: number): void {
    this.dx += x - this.x;
    this.dy += y - this.y;
    this.x = x;
    this.y = y;
  }

  handleDown(button: number): void {
    if (!this.down.has(button)) {
      this.down.add(button);
      this.pressed.add(button);
    }
  }

  handleUp(button: number): void {
    if (this.down.delete(button)) {
      this.released.add(button);
    }
  }

  handleWheel(deltaY: number): void {
    this.wheel += deltaY;
  }

  isButtonDown(button: number): boolean {
    return this.down.has(button);
  }

  wasButtonPressed(button: number): boolean {
    return this.pressed.has(button);
  }

  wasButtonReleased(button: number): boolean {
    return this.released.has(button);
  }

  endFrame(): void {
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.pressed.clear();
    this.released.clear();
  }

  reset(): void {
    this.down.clear();
    this.endFrame();
  }
}
