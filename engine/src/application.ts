/**
 * Application facade — §2 Core / Application class + §51 Application Runtime (seed).
 *
 * `Application` is the developer-facing entry point: it owns an {@link Engine},
 * handles run/quit and provides a stable place for app-level concerns
 * (window lifecycle, plugins, IPC) in later phases.
 */

import type { Unsubscribe } from "@obsifox/core";
import type { RenderCallback } from "@obsifox/runtime";
import { Engine, type EngineOptions } from "./engine.js";

export interface ApplicationOptions extends EngineOptions {
  /** Application display name (shorthand for `config.name`). */
  name?: string;
}

/** High-level engine host. */
export class Application {
  readonly engine: Engine;

  constructor(options: ApplicationOptions = {}) {
    const { name, ...engineOptions } = options;
    this.engine = new Engine({
      ...engineOptions,
      config: {
        ...(engineOptions.config ?? {}),
        ...(name ? { name } : {}),
      },
    });
  }

  get name(): string {
    return this.engine.name;
  }

  get isRunning(): boolean {
    return this.engine.lifecycle.isActive;
  }

  /**
   * Initialize and start the engine. Resolves once the loop is running
   * (the loop itself keeps executing on the platform driver).
   */
  async run(): Promise<void> {
    await this.engine.init();
    this.engine.start();
  }

  /** Stop and destroy the engine. */
  async quit(): Promise<void> {
    this.engine.stop();
    await this.engine.destroy();
  }

  /** Frame-update subscription. */
  onUpdate(callback: (deltaSeconds: number) => void): Unsubscribe {
    return this.engine.onUpdate(callback);
  }

  /** Fixed-timestep subscription. */
  onFixedUpdate(callback: (fixedDeltaSeconds: number) => void): Unsubscribe {
    return this.engine.onFixedUpdate(callback);
  }

  /** Render subscription. */
  onRender(callback: RenderCallback): Unsubscribe {
    return this.engine.onRender(callback);
  }
}
