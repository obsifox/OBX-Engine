import type { ApplicationLifecycle, Clipboard, InputBridge, NativeEvents, PixelSurface, Platform, PlatformCapabilities, PlatformFileSystem, PlatformKind, PlatformThreads, PlatformTiming, PlatformWindow, WindowOptions } from "./types.js";
import { HeadlessWindow } from "./window.js";
import { Surface } from "./surface.js";
import { EventHub } from "./events.js";
import { MemoryClipboard } from "./clipboard.js";
import { LifecycleManager } from "./lifecycle.js";
import { InputHub } from "./input.js";
import { ManualFileSystem } from "./filesystem.js";
import { ManualTiming } from "./timing.js";
import { ManualThreads } from "./threads.js";
export abstract class BasePlatform implements Platform {
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

