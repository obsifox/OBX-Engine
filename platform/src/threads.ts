import type { PlatformThreads, ThreadContext, ThreadEntry, ThreadHandle } from "./types.js";
import { PlatformError } from "./errors.js";
export class ManualThreads implements PlatformThreads {
  readonly supported = true;
  #handles = new Map<number, ManualThreadHandle>();
  #nextId = 1;

  get count(): number {
    return this.#handles.size;
  }

  create(entry: ThreadEntry): ThreadHandle {
    const handle = new ManualThreadHandle(this.#nextId++, entry);
    this.#handles.set(handle.id, handle);
    return handle;
  }

  pump(): number {
    let delivered = 0;
    for (const handle of this.#handles.values()) {
      delivered += handle.pump();
    }
    return delivered;
  }
}

export class ManualThreadHandle implements ThreadHandle {
  readonly id: number;
  running = true;
  #inbox: unknown[] = [];
  #outbox: unknown[] = [];
  #workerHandlers = new Set<(message: unknown) => void>();
  #clientHandlers = new Set<(message: unknown) => void>();
  #errorHandlers = new Set<(error: string) => void>();
  #context: ThreadContext;

  constructor(id: number, entry: ThreadEntry) {
    this.id = id;
    const self = this;
    this.#context = {
      postMessage(message: unknown) {
        self.#outbox.push(message);
      },
      onMessage(handler: (message: unknown) => void) {
        self.#workerHandlers.add(handler);
      },
      close() {
        self.running = false;
      },
    };
    entry.run(this.#context);
  }

  post(message: unknown): void {
    if (!this.running) throw new PlatformError(`Thread ${this.id} is not running`);
    this.#inbox.push(message);
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.#clientHandlers.add(handler);
    return () => {
      this.#clientHandlers.delete(handler);
    };
  }

  onError(handler: (error: string) => void): () => void {
    this.#errorHandlers.add(handler);
    return () => {
      this.#errorHandlers.delete(handler);
    };
  }

  async terminate(): Promise<void> {
    this.running = false;
    this.#inbox = [];
    this.#outbox = [];
    this.#workerHandlers.clear();
    this.#clientHandlers.clear();
    this.#errorHandlers.clear();
  }

  pump(): number {
    if (!this.running) return 0;
    let delivered = 0;
    const inbox = this.#inbox;
    this.#inbox = [];
    for (const message of inbox) {
      delivered += 1;
      for (const handler of [...this.#workerHandlers]) {
        try {
          handler(message);
        } catch (error) {
          for (const errorHandler of this.#errorHandlers) errorHandler(String(error));
        }
      }
      const outbox = this.#outbox;
      this.#outbox = [];
      for (const reply of outbox) {
        for (const handler of [...this.#clientHandlers]) {
          try {
            handler(reply);
          } catch (error) {
            for (const errorHandler of this.#errorHandlers) errorHandler(String(error));
          }
        }
      }
    }
    return delivered;
  }
}

