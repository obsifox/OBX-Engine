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

