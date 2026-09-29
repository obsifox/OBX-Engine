export const PLATFORM_VERSION = "1.1.0";

export type PlatformKind = "node" | "manual";

export interface PlatformCapabilities {
  window: boolean;
  surface: boolean;
  threads: boolean;
  clipboard: boolean;
  timers: boolean;
  highResolutionTiming: boolean;
  filesystem: boolean;
  inputInjection: boolean;
}

export interface WindowOptions {
  title?: string;
  width?: number;
  height?: number;
  visible?: boolean;
}

export interface WindowState {
  title: string;
  width: number;
  height: number;
  visible: boolean;
  closed: boolean;
}

export interface PlatformWindow {
  readonly id: number;
  readonly state: WindowState;
  setTitle(title: string): void;
  resize(width: number, height: number): void;
  show(): void;
  hide(): void;
  close(): void;
  isClosed(): boolean;
}

export interface PixelSurface {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  resize(width: number, height: number): void;
}

export interface FileStat {
  size: number;
  directory: boolean;
  modifiedMs: number;
}

export interface PlatformFileSystem {
  read(path: string): Uint8Array;
  readText(path: string): string;
  write(path: string, data: Uint8Array): void;
  writeText(path: string, text: string): void;
  exists(path: string): boolean;
  list(path: string): string[];
  mkdir(path: string): void;
  remove(path: string): void;
  stat(path: string): FileStat;
}

export interface TimerHandle {
  readonly active: boolean;
  cancel(): void;
}

export interface PlatformTiming {
  now(): number;
  sleep(ms: number): void;
  createTimer(callback: () => void, intervalMs: number, options?: { repeat?: boolean }): TimerHandle;
}

export interface ThreadContext {
  postMessage(message: unknown): void;
  onMessage(handler: (message: unknown) => void): void;
  close(): void;
}

export type ThreadEntry = { run: (context: ThreadContext) => void };

export interface ThreadHandle {
  readonly id: number;
  readonly running: boolean;
  post(message: unknown): void;
  onMessage(handler: (message: unknown) => void): () => void;
  onError(handler: (error: string) => void): () => void;
  terminate(): Promise<void>;
}

export interface PlatformThreads {
  readonly supported: boolean;
  readonly count: number;
  create(entry: ThreadEntry): ThreadHandle;
}

export type NativeEventType = "resize" | "focus" | "blur" | "close" | "drop" | "clipboard";

export interface NativeEvent {
  type: NativeEventType;
  payload?: unknown;
  timestamp: number;
}

export interface NativeEvents {
  emit(type: NativeEventType, payload?: unknown): NativeEvent;
  on(type: NativeEventType | "*", handler: (event: NativeEvent) => void): () => void;
  history(): NativeEvent[];
}

export interface Clipboard {
  read(): string;
  write(text: string): void;
  hasText(): boolean;
  clear(): void;
}

export type LifecyclePhase =
  | "created"
  | "starting"
  | "running"
  | "suspending"
  | "suspended"
  | "resuming"
  | "stopping"
  | "stopped";

export interface ApplicationLifecycle {
  readonly phase: LifecyclePhase;
  start(): void;
  suspend(): void;
  resume(): void;
  stop(): void;
  onTransition(handler: (from: LifecyclePhase, to: LifecyclePhase) => void): () => void;
}

export type InputEventType = "key" | "pointer" | "wheel" | "text";

export interface InputEvent {
  type: InputEventType;
  code?: string;
  x?: number;
  y?: number;
  button?: number;
  deltaY?: number;
  text?: string;
  pressed?: boolean;
  timestamp: number;
}

export interface InputBridge {
  emit(event: Omit<InputEvent, "timestamp">): InputEvent;
  on(handler: (event: InputEvent) => void): () => void;
  recent(limit?: number): InputEvent[];
}

export interface Platform {
  readonly kind: PlatformKind;
  readonly capabilities: PlatformCapabilities;
  readonly files: PlatformFileSystem;
  readonly timing: PlatformTiming;
  readonly threads: PlatformThreads;
  readonly events: NativeEvents;
  readonly clipboard: Clipboard;
  readonly lifecycle: ApplicationLifecycle;
  readonly input: InputBridge;
  createWindow(options?: WindowOptions): PlatformWindow;
  windows(): PlatformWindow[];
  createSurface(width: number, height: number): PixelSurface;
}

export class PlatformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformError";
  }
}

class HeadlessWindow implements PlatformWindow {
  readonly id: number;
  readonly state: WindowState;
  #onClose: ((event: NativeEvent) => void) | null;

  constructor(id: number, options: WindowOptions, onClose: ((event: NativeEvent) => void) | null) {
    this.id = id;
    this.state = {
      title: options.title ?? "OBX",
      width: options.width ?? 1280,
      height: options.height ?? 720,
      visible: options.visible ?? true,
      closed: false,
    };
    this.#onClose = onClose;
  }

  setTitle(title: string): void {
    this.state.title = title;
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new PlatformError("Window dimensions must be positive");
    }
    this.state.width = width;
    this.state.height = height;
  }

  show(): void {
    this.state.visible = true;
  }

  hide(): void {
    this.state.visible = false;
  }

  close(): void {
    if (this.state.closed) return;
    this.state.closed = true;
    this.#onClose?.({ type: "close", payload: { windowId: this.id }, timestamp: 0 });
  }

  isClosed(): boolean {
    return this.state.closed;
  }
}

class Surface implements PixelSurface {
  width: number;
  height: number;
  data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new PlatformError("Surface dimensions must be positive");
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new PlatformError("Surface dimensions must be positive");
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

class EventHub implements NativeEvents {
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

class MemoryClipboard implements Clipboard {
  #text = "";

  read(): string {
    return this.#text;
  }

  write(text: string): void {
    this.#text = text;
  }

  hasText(): boolean {
    return this.#text.length > 0;
  }

  clear(): void {
    this.#text = "";
  }
}

const LIFECYCLE_TRANSITIONS: Record<LifecyclePhase, LifecyclePhase[]> = {
  created: ["starting"],
  starting: ["running", "stopping"],
  running: ["suspending", "stopping"],
  suspending: ["suspended", "stopping"],
  suspended: ["resuming", "stopping"],
  resuming: ["running", "stopping"],
  stopping: ["stopped"],
  stopped: [],
};

class LifecycleManager implements ApplicationLifecycle {
  phase: LifecyclePhase = "created";
  #handlers = new Set<(from: LifecyclePhase, to: LifecyclePhase) => void>();

  #transition(to: LifecyclePhase): void {
    const allowed = LIFECYCLE_TRANSITIONS[this.phase];
    if (!allowed.includes(to)) {
      throw new PlatformError(`Invalid lifecycle transition ${this.phase} -> ${to}`);
    }
    const from = this.phase;
    this.phase = to;
    for (const handler of this.#handlers) handler(from, to);
  }

  start(): void {
    this.#transition("starting");
    this.#transition("running");
  }

  suspend(): void {
    this.#transition("suspending");
    this.#transition("suspended");
  }

  resume(): void {
    this.#transition("resuming");
    this.#transition("running");
  }

  stop(): void {
    if (this.phase === "stopped") return;
    if (this.phase === "created") {
      this.#transition("starting");
    }
    this.#transition("stopping");
    this.#transition("stopped");
  }

  onTransition(handler: (from: LifecyclePhase, to: LifecyclePhase) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }
}

class InputHub implements InputBridge {
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

class ManualFileSystem implements PlatformFileSystem {
  #files = new Map<string, Uint8Array>();
  #dirs = new Set<string>(["/"]);
  #clock: () => number;

  constructor(clock: () => number) {
    this.#clock = clock;
  }

  read(path: string): Uint8Array {
    const data = this.#files.get(path);
    if (!data) throw new PlatformError(`File not found: ${path}`);
    return new Uint8Array(data);
  }

  readText(path: string): string {
    return new TextDecoder().decode(this.read(path));
  }

  write(path: string, data: Uint8Array): void {
    this.#ensureParent(path);
    this.#files.set(path, new Uint8Array(data));
  }

  writeText(path: string, text: string): void {
    this.write(path, new TextEncoder().encode(text));
  }

  exists(path: string): boolean {
    return this.#files.has(path) || this.#dirs.has(path);
  }

  list(path: string): string[] {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const names = new Set<string>();
    for (const key of this.#files.keys()) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split("/")[0]!);
    }
    for (const dir of this.#dirs) {
      if (dir.startsWith(prefix) && dir !== path) names.add(dir.slice(prefix.length).split("/")[0]!);
    }
    return [...names].sort();
  }

  mkdir(path: string): void {
    this.#dirs.add(path);
  }

  remove(path: string): void {
    if (!this.#files.delete(path) && !this.#dirs.delete(path)) {
      throw new PlatformError(`Path not found: ${path}`);
    }
  }

  stat(path: string): FileStat {
    if (this.#files.has(path)) {
      return { size: this.#files.get(path)!.length, directory: false, modifiedMs: this.#clock() };
    }
    if (this.#dirs.has(path)) {
      return { size: 0, directory: true, modifiedMs: this.#clock() };
    }
    throw new PlatformError(`Path not found: ${path}`);
  }

  #ensureParent(path: string): void {
    const parts = path.split("/").filter((part) => part.length > 0);
    parts.pop();
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      this.#dirs.add(current);
    }
    this.#dirs.add("/");
  }
}

class ManualTiming implements PlatformTiming {
  #nowMs = 0;
  #timers = new Map<number, { callback: () => void; intervalMs: number; repeat: boolean; due: number; active: boolean }>();
  #nextTimerId = 1;

  now(): number {
    return this.#nowMs;
  }

  sleep(ms: number): void {
    this.advance(ms);
  }

  createTimer(callback: () => void, intervalMs: number, options: { repeat?: boolean } = {}): TimerHandle {
    const id = this.#nextTimerId++;
    const entry = {
      callback,
      intervalMs,
      repeat: options.repeat ?? false,
      due: this.#nowMs + intervalMs,
      active: true,
    };
    this.#timers.set(id, entry);
    return {
      get active() {
        return entry.active;
      },
      cancel: () => {
        entry.active = false;
        this.#timers.delete(id);
      },
    };
  }

  advance(ms: number): void {
    const target = this.#nowMs + ms;
    for (;;) {
      let nextId: number | null = null;
      let nextDue = Infinity;
      for (const [id, entry] of this.#timers) {
        if (entry.active && entry.due <= target && entry.due < nextDue) {
          nextDue = entry.due;
          nextId = id;
        }
      }
      if (nextId === null) break;
      const entry = this.#timers.get(nextId)!;
      this.#nowMs = entry.due;
      if (entry.repeat) {
        entry.due += entry.intervalMs;
      } else {
        entry.active = false;
        this.#timers.delete(nextId);
      }
      entry.callback();
    }
    this.#nowMs = target;
  }
}

class ManualThreads implements PlatformThreads {
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

class ManualThreadHandle implements ThreadHandle {
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

abstract class BasePlatform implements Platform {
  abstract readonly kind: PlatformKind;
  abstract readonly capabilities: PlatformCapabilities;
  abstract readonly files: PlatformFileSystem;
  abstract readonly threads: PlatformThreads;

  readonly events = new EventHub();
  readonly clipboard = new MemoryClipboard();
  readonly lifecycle = new LifecycleManager();
  readonly input: InputBridge;

  timing: PlatformTiming;

  protected windowList: HeadlessWindow[] = [];
  protected nextWindowId = 1;

  constructor(timing: PlatformTiming) {
    this.timing = timing;
    this.input = new InputHub(() => timing.now());
  }

  createWindow(options: WindowOptions = {}): PlatformWindow {
    const window = new HeadlessWindow(this.nextWindowId++, options, (event) => {
      this.events.emit(event.type, event.payload);
    });
    this.windowList.push(window);
    return window;
  }

  windows(): PlatformWindow[] {
    return [...this.windowList];
  }

  createSurface(width: number, height: number): PixelSurface {
    return new Surface(width, height);
  }
}

export class ManualPlatform extends BasePlatform {
  readonly kind = "manual" as const;
  readonly capabilities: PlatformCapabilities = {
    window: true,
    surface: true,
    threads: true,
    clipboard: true,
    timers: true,
    highResolutionTiming: false,
    filesystem: true,
    inputInjection: true,
  };
  readonly files: PlatformFileSystem;
  readonly threads: ManualThreads;

  constructor() {
    const timing = new ManualTiming();
    super(timing);
    this.files = new ManualFileSystem(() => timing.now());
    this.threads = new ManualThreads();
  }

  get manualTiming(): PlatformTiming {
    return this.timing;
  }

  advance(ms: number): void {
    (this.timing as ManualTiming).advance(ms);
  }

  pumpThreads(): number {
    return this.threads.pump();
  }
}

export { BasePlatform };
