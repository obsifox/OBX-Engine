import type { AnimationClip } from "./animation.js";

export interface AnimationEvent {
  time: number;
  name: string;
  payload?: Record<string, unknown>;
}

export type AnimationEventListener = (event: AnimationEvent) => void;

export class EventTrack {
  readonly events: AnimationEvent[];

  constructor(events: AnimationEvent[] = []) {
    this.events = [...events].sort((a, b) => a.time - b.time);
  }

  add(event: AnimationEvent): AnimationEvent {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
    return event;
  }

  remove(name: string, atTime?: number): number {
    const before = this.events.length;
    const kept = this.events.filter((event) => event.name !== name || (atTime !== undefined && Math.abs(event.time - atTime) > 1e-6));
    this.events.length = 0;
    this.events.push(...kept);
    return before - this.events.length;
  }

  eventsInRange(fromTime: number, toTime: number, duration = 0, loop = false): AnimationEvent[] {
    if (toTime >= fromTime) return this.events.filter((event) => event.time > fromTime && event.time <= toTime);
    if (!loop || duration <= 0) return [];
    return [
      ...this.events.filter((event) => event.time > fromTime && event.time <= duration),
      ...this.events.filter((event) => event.time >= 0 && event.time <= toTime),
    ];
  }

  eventsForClip(clip: AnimationClip, fromTime: number, toTime: number): AnimationEvent[] {
    return this.eventsInRange(fromTime, toTime, clip.duration, clip.loop);
  }
}

export class AnimationEventEmitter {
  #listeners = new Map<string, AnimationEventListener[]>();
  #anyListeners: AnimationEventListener[] = [];

  on(name: string, listener: AnimationEventListener): void {
    const list = this.#listeners.get(name) ?? [];
    list.push(listener);
    this.#listeners.set(name, list);
  }

  onAny(listener: AnimationEventListener): void {
    this.#anyListeners.push(listener);
  }

  off(name: string, listener: AnimationEventListener): boolean {
    const list = this.#listeners.get(name);
    if (!list) return false;
    const index = list.indexOf(listener);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }

  emit(event: AnimationEvent): number {
    let count = 0;
    for (const listener of this.#listeners.get(event.name) ?? []) {
      listener(event);
      count += 1;
    }
    for (const listener of this.#anyListeners) {
      listener(event);
      count += 1;
    }
    return count;
  }

  emitRange(track: EventTrack, fromTime: number, toTime: number, duration = 0, loop = false): number {
    let count = 0;
    for (const event of track.eventsInRange(fromTime, toTime, duration, loop)) {
      count += this.emit(event);
    }
    return count;
  }

  clear(): void {
    this.#listeners.clear();
    this.#anyListeners = [];
  }
}

export interface EventPlaybackCursor {
  time: number;
  duration: number;
  loop: boolean;
}

export class AnimationEventPlayer {
  readonly track: EventTrack;
  readonly emitter = new AnimationEventEmitter();
  #cursor: EventPlaybackCursor;

  constructor(track: EventTrack, cursor: EventPlaybackCursor) {
    this.track = track;
    this.#cursor = cursor;
  }

  advance(toTime: number): number {
    const from = this.#cursor.time;
    const fired = this.emitter.emitRange(this.track, from, toTime, this.#cursor.duration, this.#cursor.loop);
    this.#cursor = { ...this.#cursor, time: toTime };
    return fired;
  }

  get time(): number {
    return this.#cursor.time;
  }
}
