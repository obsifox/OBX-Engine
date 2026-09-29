import type { InputEvent, Platform, PlatformWindow, PixelSurface } from "@obx/platform";
import { GameLoop } from "./game-loop.js";
import { ManualLoopDriver, TimeoutLoopDriver } from "./loop-driver.js";

export interface RuntimeHostOptions {
  platform: Platform;
  title?: string;
  width?: number;
  height?: number;
  targetFps?: number;
  onFrame?: (deltaMs: number, host: RuntimeHost) => void;
  onStart?: (host: RuntimeHost) => void;
  onStop?: (host: RuntimeHost) => void;
  onError?: (error: unknown, host: RuntimeHost) => void;
}

export class RuntimeHost {
  readonly platform: Platform;
  readonly window: PlatformWindow;
  readonly surface: PixelSurface;
  readonly loop: GameLoop;
  readonly errors: string[] = [];

  #options: RuntimeHostOptions;
  #running = false;
  #frameCount = 0;
  #timestampMs = 0;
  #inputLog: InputEvent[] = [];
  #inputHandlers = new Set<(event: InputEvent) => void>();

  constructor(options: RuntimeHostOptions) {
    this.#options = options;
    this.platform = options.platform;
    const width = options.width ?? 1280;
    const height = options.height ?? 720;
    this.window = options.platform.createWindow({ title: options.title ?? "OBX Runtime", width, height });
    this.surface = options.platform.createSurface(width, height);
    const driver =
      options.platform.kind === "manual"
        ? new ManualLoopDriver()
        : new TimeoutLoopDriver({ targetFps: options.targetFps ?? 60 });
    this.loop = new GameLoop({ driver, trackFps: true });
    this.loop.onUpdate(() => this.#frame());
    this.platform.events.on("resize", (event) => {
      const size = event.payload as { width?: number; height?: number } | undefined;
      if (size?.width && size?.height) this.surface.resize(size.width, size.height);
    });
    this.platform.input.on((event) => {
      this.#inputLog.push(event);
      for (const handler of this.#inputHandlers) handler(event);
    });
  }

  get isRunning(): boolean {
    return this.#running;
  }

  get frameCount(): number {
    return this.#frameCount;
  }

  get deltaMs(): number {
    return this.loop.clock.delta * 1000;
  }

  start(): void {
    if (this.#running) return;
    this.platform.lifecycle.start();
    this.window.show();
    this.#running = true;
    this.loop.start();
    this.#options.onStart?.(this);
  }

  stop(): void {
    if (!this.#running) {
      this.platform.lifecycle.stop();
      return;
    }
    this.#running = false;
    this.loop.stop();
    this.platform.lifecycle.stop();
    this.#options.onStop?.(this);
  }

  step(deltaMs = 16): number {
    this.#timestampMs += deltaMs;
    this.loop.step(this.#timestampMs);
    return this.#frameCount;
  }

  onInput(handler: (event: InputEvent) => void): () => void {
    this.#inputHandlers.add(handler);
    return () => {
      this.#inputHandlers.delete(handler);
    };
  }

  recentInput(limit = 16): InputEvent[] {
    return this.#inputLog.slice(-limit);
  }

  stats(): {
    frames: number;
    running: boolean;
    fps: number;
    errors: number;
    window: { title: string; width: number; height: number };
    surface: { width: number; height: number };
    lifecycle: string;
  } {
    return {
      frames: this.#frameCount,
      running: this.#running,
      fps: this.loop.fps,
      errors: this.errors.length,
      window: { title: this.window.state.title, width: this.window.state.width, height: this.window.state.height },
      surface: { width: this.surface.width, height: this.surface.height },
      lifecycle: this.platform.lifecycle.phase,
    };
  }

  #frame(): void {
    const deltaMs = this.loop.clock.delta * 1000;
    this.#frameCount += 1;
    try {
      this.#options.onFrame?.(deltaMs, this);
    } catch (error) {
      this.errors.push(String(error));
      this.#options.onError?.(error, this);
    }
  }
}
