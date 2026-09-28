import type { Unsubscribe } from "@obx/core";
import type { RenderCallback } from "@obx/runtime";
import { Engine, type EngineOptions } from "./engine.js";

export interface ApplicationOptions extends EngineOptions {

  name?: string;
}

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

  async run(): Promise<void> {
    await this.engine.init();
    this.engine.start();
  }

  async quit(): Promise<void> {
    this.engine.stop();
    await this.engine.destroy();
  }

  onUpdate(callback: (deltaSeconds: number) => void): Unsubscribe {
    return this.engine.onUpdate(callback);
  }

  onFixedUpdate(callback: (fixedDeltaSeconds: number) => void): Unsubscribe {
    return this.engine.onFixedUpdate(callback);
  }

  onRender(callback: RenderCallback): Unsubscribe {
    return this.engine.onRender(callback);
  }
}
