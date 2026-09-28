import type { RenderCommand } from "./commands.js";

export interface RenderBackend {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  begin(): void;
  submit(commands: readonly RenderCommand[]): void;
  end(): void;
}
