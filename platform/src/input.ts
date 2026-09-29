import type { InputBridge, InputEvent, InputEventType } from "./types.js";
export class InputHub implements InputBridge {
  #handlers = new Set<(event: InputEvent) => void>();
  #recent: InputEvent[] = [];
  #clock: () => number;

  constructor(clock: () => number) {
    this.#clock = clock;
  }

  emit(event: Omit<InputEvent, "timestamp">): InputEvent {
    const full: InputEvent = { ...event, timestamp: this.#clock() };
    this.#recent.push(full);
    if (this.#recent.length > 256) this.#recent.shift();
    for (const handler of this.#handlers) handler(full);
    return full;
  }

  on(handler: (event: InputEvent) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  recent(limit = 32): InputEvent[] {
    return this.#recent.slice(-limit);
  }
}

