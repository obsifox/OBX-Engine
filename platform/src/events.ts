import type { NativeEvent, NativeEventType, NativeEvents } from "./types.js";
import { PlatformError } from "./errors.js";
export class EventHub implements NativeEvents {
  #handlers = new Map<string, Set<(event: NativeEvent) => void>>();
  #log: NativeEvent[] = [];

  emit(type: NativeEventType, payload?: unknown): NativeEvent {
    const event: NativeEvent = { type, payload, timestamp: Date.now() };
    this.#log.push(event);
    for (const handler of this.#handlers.get(type) ?? []) handler(event);
    for (const handler of this.#handlers.get("*") ?? []) handler(event);
    return event;
  }

  on(type: NativeEventType | "*", handler: (event: NativeEvent) => void): () => void {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  history(): NativeEvent[] {
    return [...this.#log];
  }
}

