import {
  Clock,
  ConfigStore,
  EventBus,
  InvalidStateError,
  Lifecycle,
  LifecycleState,
  Logger,
  MemoryTracker,
  Scheduler,
  Signal,
  type DeepPartial,
  type LogLevel,
  type Unsubscribe,
} from "@obx/core";
import {
  GameLoop,
  TaskSystem,
  detectPlatform,
  type LoopDriver,
  type RenderCallback,
  type RuntimePlatform,
  type UpdateCallback,
} from "@obx/runtime";
import { World } from "@obx/ecs";

export interface EngineConfig {

  name: string;

  targetFps: number;

  fixedDelta: number;

  timeScale: number;

  maxDelta: number;

  logLevel: LogLevel;

  autoTickWorld: boolean;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  name: "obx-engine",
  targetFps: 0,
  fixedDelta: 1 / 60,
  timeScale: 1,
  maxDelta: 0.25,
  logLevel: "info",
  autoTickWorld: true,
};

export interface EngineEvents extends Record<string, unknown> {
  "engine:initialized": { name: string };
  "engine:started": { name: string };
  "engine:stopped": { name: string };
  "engine:paused": { name: string };
  "engine:resumed": { name: string };
  "engine:destroyed": { name: string };
  "engine:error": { error: unknown };
  "engine:frame": { frame: number; delta: number };
}

export interface EngineOptions {

  config?: DeepPartial<EngineConfig>;

  logger?: Logger;

  platform?: RuntimePlatform;

  driver?: LoopDriver;

  world?: World;
}

export class Engine {
  readonly config: ConfigStore<EngineConfig>;
  readonly logger: Logger;
  readonly events: EventBus<EngineEvents>;
  readonly signals: {
    initialized: Signal<[]>;
    started: Signal<[]>;
    stopped: Signal<[]>;
    paused: Signal<[]>;
    resumed: Signal<[]>;
    destroyed: Signal<[]>;
    error: Signal<[error: unknown]>;
  };
  readonly scheduler: Scheduler;
  readonly loop: GameLoop;
  readonly lifecycle: Lifecycle;
  readonly memory: MemoryTracker;
  readonly tasks: TaskSystem;
  readonly platform: RuntimePlatform;
  readonly world: World;

  #frameHookUnsubscribe: Unsubscribe | null = null;

  constructor(options: EngineOptions = {}) {
    this.config = new ConfigStore<EngineConfig>({
      ...DEFAULT_ENGINE_CONFIG,
      ...(options.config ?? {}),
    });

    this.logger =
      options.logger ??
      new Logger({ level: this.config.get("logLevel", DEFAULT_ENGINE_CONFIG.logLevel), scopes: ["engine"] });

    this.events = new EventBus<EngineEvents>();
    this.signals = {
      initialized: new Signal(),
      started: new Signal(),
      stopped: new Signal(),
      paused: new Signal(),
      resumed: new Signal(),
      destroyed: new Signal(),
      error: new Signal(),
    };
    this.scheduler = new Scheduler();
    this.lifecycle = new Lifecycle();
    this.memory = new MemoryTracker();
    this.tasks = new TaskSystem();
    this.platform = options.platform ?? detectPlatform();
    this.world = options.world ?? new World("default");

    this.loop = new GameLoop({
      driver: options.driver ?? this.platform.createLoopDriver({ targetFps: this.config.get("targetFps", 0) }),
      fixedDelta: this.config.get("fixedDelta", 1 / 60),
      maxDelta: this.config.get("maxDelta", 0.25),
      timeScale: this.config.get("timeScale", 1),
    });

    this.loop.onUpdate(() => {
      this.scheduler.update(this.clock.time);
      if (this.config.get("autoTickWorld", true)) {
        this.world.update(this.clock.delta);
      }
      this.events.emit("engine:frame", { frame: this.clock.frame, delta: this.clock.delta });
    });
  }

  get clock(): Clock {
    return this.loop.clock;
  }

  get name(): string {
    return this.config.get("name", DEFAULT_ENGINE_CONFIG.name);
  }

  async init(): Promise<void> {
    if (this.lifecycle.state !== LifecycleState.CREATED && this.lifecycle.state !== LifecycleState.STOPPED) {
      throw new InvalidStateError(`Cannot init engine in state "${this.lifecycle.state}"`);
    }
    if (this.lifecycle.state === LifecycleState.STOPPED) {

      return;
    }

    await this.lifecycle.guard(async () => {
      this.lifecycle.transition(LifecycleState.INITIALIZING);
      this.logger.level = this.config.get("logLevel", this.logger.level);
      this.logger.debug("engine initializing", { name: this.name, platform: this.platform.id });

      this.lifecycle.transition(LifecycleState.INITIALIZED);
      this.events.emit("engine:initialized", { name: this.name });
      this.signals.initialized.emit();
    });
  }

  start(): void {
    if (this.lifecycle.state === LifecycleState.CREATED) {
      throw new InvalidStateError("Call engine.init() before engine.start()");
    }
    this.lifecycle.transition(LifecycleState.STARTING);

    this.loop.start();
    this.lifecycle.transition(LifecycleState.RUNNING);
    this.logger.info("engine started", { name: this.name });
    this.events.emit("engine:started", { name: this.name });
    this.signals.started.emit();
  }

  stop(): void {
    if (!this.lifecycle.isActive) return;
    this.lifecycle.transition(LifecycleState.STOPPING);
    this.loop.stop();
    this.lifecycle.transition(LifecycleState.STOPPED);
    this.logger.info("engine stopped", { name: this.name });
    this.events.emit("engine:stopped", { name: this.name });
    this.signals.stopped.emit();
  }

  pause(): void {
    if (this.lifecycle.state !== LifecycleState.RUNNING) return;
    this.clock.paused = true;
    this.lifecycle.transition(LifecycleState.PAUSED);
    this.events.emit("engine:paused", { name: this.name });
    this.signals.paused.emit();
  }

  resume(): void {
    if (this.lifecycle.state !== LifecycleState.PAUSED) return;
    this.clock.paused = false;
    this.lifecycle.transition(LifecycleState.RUNNING);
    this.events.emit("engine:resumed", { name: this.name });
    this.signals.resumed.emit();
  }

  async destroy(): Promise<void> {
    if (this.lifecycle.isDestroyed) return;
    if (this.lifecycle.isActive) {
      this.stop();
    }
    if (this.lifecycle.state !== LifecycleState.DESTROYING) {
      this.lifecycle.transition(LifecycleState.DESTROYING);
    }
    this.scheduler.clear();
    this.#frameHookUnsubscribe?.();
    this.memory.clear();
    this.logger.info("engine destroyed", { name: this.name });
    this.events.emit("engine:destroyed", { name: this.name });
    this.signals.destroyed.emit();
    this.events.clear();
    this.lifecycle.transition(LifecycleState.DESTROYED);
  }

  onUpdate(callback: UpdateCallback): Unsubscribe {
    return this.loop.onUpdate(callback);
  }

  onFixedUpdate(callback: (fixedDeltaSeconds: number) => void): Unsubscribe {
    return this.loop.onFixedUpdate(callback);
  }

  onRender(callback: RenderCallback): Unsubscribe {
    return this.loop.onRender(callback);
  }

  reportError(error: unknown): void {
    this.logger.error("engine error", {
      error: error instanceof Error ? error.message : String(error),
    });
    this.events.emit("engine:error", { error });
    this.signals.error.emit(error);
  }
}
