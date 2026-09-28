/**
 * ObsiFox Engine — §2 Core / Engine class, Application services + §3 Game Loop wiring.
 *
 * `Engine` composes the core services (config, logging, events, signals,
 * scheduler, time, memory, lifecycle) with the runtime loop and a default ECS
 * world, and drives them through init/start/pause/stop/destroy.
 */

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
} from "@obsifox/core";
import {
  GameLoop,
  TaskSystem,
  detectPlatform,
  type LoopDriver,
  type RenderCallback,
  type RuntimePlatform,
  type UpdateCallback,
} from "@obsifox/runtime";
import { World } from "@obsifox/ecs";

/** Engine-level configuration keys (stored in the {@link ConfigStore}). */
export interface EngineConfig {
  /** Engine instance name. */
  name: string;
  /** Target frame rate (0 = uncapped). */
  targetFps: number;
  /** Fixed simulation step in seconds. */
  fixedDelta: number;
  /** Initial time scale. */
  timeScale: number;
  /** Per-frame real-delta clamp in seconds. */
  maxDelta: number;
  /** Minimum log level. */
  logLevel: LogLevel;
  /** Advance the default ECS world every frame from the loop (default true). */
  autoTickWorld: boolean;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  name: "obsifox-engine",
  targetFps: 0,
  fixedDelta: 1 / 60,
  timeScale: 1,
  maxDelta: 0.25,
  logLevel: "info",
  autoTickWorld: true,
};

/** Payloads published on {@link Engine.events}. */
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
  /** Configuration overrides merged over {@link DEFAULT_ENGINE_CONFIG}. */
  config?: DeepPartial<EngineConfig>;
  /** External logger (a fresh one is created otherwise). */
  logger?: Logger;
  /** Host platform adapter (default: auto-detect). */
  platform?: RuntimePlatform;
  /** Loop driver (default: created by the platform). */
  driver?: LoopDriver;
  /** Inject a pre-built ECS world (default: a fresh one). */
  world?: World;
}

/**
 * The engine heart.
 *
 * ```ts
 * const engine = new Engine({ config: { name: "demo", logLevel: "debug" } });
 * await engine.init();
 * engine.start();
 * // ...
 * engine.stop();
 * await engine.destroy();
 * ```
 */
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

    // Keep engine-time scheduler in lockstep with the loop clock.
    this.loop.onUpdate(() => {
      this.scheduler.update(this.clock.time);
      if (this.config.get("autoTickWorld", true)) {
        this.world.update(this.clock.delta);
      }
      this.events.emit("engine:frame", { frame: this.clock.frame, delta: this.clock.delta });
    });
  }

  /** Shared frame clock. */
  get clock(): Clock {
    return this.loop.clock;
  }

  get name(): string {
    return this.config.get("name", DEFAULT_ENGINE_CONFIG.name);
  }

  /** Initialize services. Required before {@link start}. */
  async init(): Promise<void> {
    if (this.lifecycle.state !== LifecycleState.CREATED && this.lifecycle.state !== LifecycleState.STOPPED) {
      throw new InvalidStateError(`Cannot init engine in state "${this.lifecycle.state}"`);
    }
    if (this.lifecycle.state === LifecycleState.STOPPED) {
      // Re-init after stop: go through starting path on start() instead.
      return;
    }

    await this.lifecycle.guard(async () => {
      this.lifecycle.transition(LifecycleState.INITIALIZING);
      this.logger.level = this.config.get("logLevel", this.logger.level);
      this.logger.debug("engine initializing", { name: this.name, platform: this.platform.id });
      // Subsystems (renderer, physics, ...) register init work here in later phases.
      this.lifecycle.transition(LifecycleState.INITIALIZED);
      this.events.emit("engine:initialized", { name: this.name });
      this.signals.initialized.emit();
    });
  }

  /** Start the game loop (initializes lazily when needed). */
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

  /** Stop the loop. The engine can be started again afterwards. */
  stop(): void {
    if (!this.lifecycle.isActive) return;
    this.lifecycle.transition(LifecycleState.STOPPING);
    this.loop.stop();
    this.lifecycle.transition(LifecycleState.STOPPED);
    this.logger.info("engine stopped", { name: this.name });
    this.events.emit("engine:stopped", { name: this.name });
    this.signals.stopped.emit();
  }

  /** Freeze simulation time (the loop keeps rendering). */
  pause(): void {
    if (this.lifecycle.state !== LifecycleState.RUNNING) return;
    this.clock.paused = true;
    this.lifecycle.transition(LifecycleState.PAUSED);
    this.events.emit("engine:paused", { name: this.name });
    this.signals.paused.emit();
  }

  /** Resume simulation time after {@link pause}. */
  resume(): void {
    if (this.lifecycle.state !== LifecycleState.PAUSED) return;
    this.clock.paused = false;
    this.lifecycle.transition(LifecycleState.RUNNING);
    this.events.emit("engine:resumed", { name: this.name });
    this.signals.resumed.emit();
  }

  /** Tear everything down. Idempotent-safe: destroys from any state. */
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

  /** Passthrough: subscribe to variable-rate updates. */
  onUpdate(callback: UpdateCallback): Unsubscribe {
    return this.loop.onUpdate(callback);
  }

  /** Passthrough: subscribe to fixed-timestep simulation steps. */
  onFixedUpdate(callback: (fixedDeltaSeconds: number) => void): Unsubscribe {
    return this.loop.onFixedUpdate(callback);
  }

  /** Passthrough: subscribe to render passes (interpolation alpha). */
  onRender(callback: RenderCallback): Unsubscribe {
    return this.loop.onRender(callback);
  }

  /** Report an engine-level error to listeners (and log it). */
  reportError(error: unknown): void {
    this.logger.error("engine error", {
      error: error instanceof Error ? error.message : String(error),
    });
    this.events.emit("engine:error", { error });
    this.signals.error.emit(error);
  }
}
