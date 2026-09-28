import { Vec2 } from "@obx/math";

export interface TouchPoint {
  id: number;
  position: Vec2;
  startPosition: Vec2;
}

export class TouchState {
  readonly active = new Map<number, TouchPoint>();
  readonly started: TouchPoint[] = [];
  readonly ended: TouchPoint[] = [];

  handleStart(id: number, x: number, y: number): void {
    const point: TouchPoint = {
      id,
      position: new Vec2(x, y),
      startPosition: new Vec2(x, y),
    };
    this.active.set(id, point);
    this.started.push(point);
  }

  handleMove(id: number, x: number, y: number): void {
    const point = this.active.get(id);
    if (point) point.position.set(x, y);
  }

  handleEnd(id: number): void {
    const point = this.active.get(id);
    if (point && this.active.delete(id)) {
      this.ended.push(point);
    }
  }

  get count(): number {
    return this.active.size;
  }

  wasStarted(): boolean {
    return this.started.length > 0;
  }

  wasEnded(): boolean {
    return this.ended.length > 0;
  }

  endFrame(): void {
    this.started.length = 0;
    this.ended.length = 0;
  }

  reset(): void {
    this.active.clear();
    this.endFrame();
  }
}
