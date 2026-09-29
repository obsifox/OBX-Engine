import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import * as nodeWorker from "node:worker_threads";
import { BasePlatform } from "./platform.js";
import { PlatformError } from "./errors.js";
import type { FileStat, PlatformCapabilities, PlatformFileSystem, PlatformKind, PlatformThreads, PlatformTiming, ThreadContext, ThreadEntry, ThreadHandle, TimerHandle } from "./types.js";

class NodeTiming implements PlatformTiming {
  now(): number {
    return performance.now();
  }

  sleep(ms: number): void {
    const shared = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(shared, 0, 0, ms);
  }

  createTimer(callback: () => void, intervalMs: number, options: { repeat?: boolean } = {}): TimerHandle {
    const repeat = options.repeat ?? false;
    const timer = repeat ? setInterval(callback, intervalMs) : setTimeout(callback, intervalMs);
    let active = true;
    return {
      get active() {
        return active;
      },
      cancel: () => {
        active = false;
        if (repeat) clearInterval(timer);
        else clearTimeout(timer);
      },
    };
  }
}

class NodeFileSystem implements PlatformFileSystem {
  read(path: string): Uint8Array {
    return new Uint8Array(nodeFs.readFileSync(path));
  }

  readText(path: string): string {
    return nodeFs.readFileSync(path, "utf8");
  }

  write(path: string, data: Uint8Array): void {
    nodeFs.mkdirSync(nodePath.dirname(path), { recursive: true });
    nodeFs.writeFileSync(path, data);
  }

  writeText(path: string, text: string): void {
    nodeFs.mkdirSync(nodePath.dirname(path), { recursive: true });
    nodeFs.writeFileSync(path, text, "utf8");
  }

  exists(path: string): boolean {
    return nodeFs.existsSync(path);
  }

  list(path: string): string[] {
    return nodeFs.readdirSync(path).sort();
  }

  mkdir(path: string): void {
    nodeFs.mkdirSync(path, { recursive: true });
  }

  remove(path: string): void {
    nodeFs.rmSync(path, { recursive: true, force: false });
  }

  stat(path: string): FileStat {
    const stats = nodeFs.statSync(path);
    return { size: stats.size, directory: stats.isDirectory(), modifiedMs: stats.mtimeMs };
  }
}

class NodeThreads implements PlatformThreads {
  readonly supported = true;
  #handles = new Map<number, NodeThreadHandle>();
  #nextId = 1;

  get count(): number {
    return this.#handles.size;
  }

  create(entry: ThreadEntry): ThreadHandle {
    const handle = new NodeThreadHandle(this.#nextId++, entry);
    this.#handles.set(handle.id, handle);
    return handle;
  }
}

class NodeThreadHandle implements ThreadHandle {
  readonly id: number;
  running = true;
  #worker: nodeWorker.Worker;
  #handlers = new Set<(message: unknown) => void>();
  #errorHandlers = new Set<(error: string) => void>();

  constructor(id: number, entry: ThreadEntry) {
    this.id = id;
    const source = [
      'const { parentPort } = require("node:worker_threads");',
      "const context = {",
      "  postMessage: (message) => parentPort.postMessage(message),",
      '  onMessage: (handler) => parentPort.on("message", handler),',
      "  close: () => process.exit(0),",
      "};",
      `(${entry.run.toString()})(context);`,
    ].join("\n");
    this.#worker = new nodeWorker.Worker(source, { eval: true });
    this.#worker.on("message", (message: unknown) => {
      for (const handler of this.#handlers) handler(message);
    });
    this.#worker.on("error", (error: Error) => {
      this.running = false;
      for (const handler of this.#errorHandlers) handler(error.message);
    });
    this.#worker.on("exit", () => {
      this.running = false;
    });
  }

  post(message: unknown): void {
    if (!this.running) throw new PlatformError(`Thread ${this.id} is not running`);
    this.#worker.postMessage(message);
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
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
    await this.#worker.terminate();
  }
}

export class NodePlatform extends BasePlatform {
  readonly kind: PlatformKind = "node";
  readonly capabilities: PlatformCapabilities = {
    window: true,
    surface: true,
    threads: true,
    clipboard: true,
    timers: true,
    highResolutionTiming: true,
    filesystem: true,
    inputInjection: true,
  };
  readonly files: PlatformFileSystem = new NodeFileSystem();
  readonly threads: PlatformThreads = new NodeThreads();

  constructor() {
    super(new NodeTiming());
  }
}
