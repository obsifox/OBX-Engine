import { JobError } from "./types.js";
export class WorkStealingQueue<T> {
  #items: T[] = [];

  push(item: T): void {
    this.#items.push(item);
  }

  take(): T | undefined {
    return this.#items.shift();
  }

  steal(): T | undefined {
    return this.#items.pop();
  }

  get size(): number {
    return this.#items.length;
  }

  drain(): T[] {
    const items = this.#items;
    this.#items = [];
    return items;
  }
}

