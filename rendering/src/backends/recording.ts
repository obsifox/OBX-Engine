import type { RenderBackend } from "../backend.js";
import type { RenderCommand } from "../commands.js";

export class RecordingBackend implements RenderBackend {
  readonly name = "recording";
  readonly frameLog: RenderCommand[][] = [];
  currentFrame: RenderCommand[] = [];

  constructor(
    readonly width = 1280,
    readonly height = 720,
  ) {}

  begin(): void {
    this.currentFrame = [];
  }

  submit(commands: readonly RenderCommand[]): void {
    for (const command of commands) {
      this.currentFrame.push(command);
    }
  }

  end(): void {
    this.frameLog.push(this.currentFrame);
  }

  get drawCalls(): number {
    return this.currentFrame.filter((command) => command.type === "drawQuads").length;
  }

  get quads(): number {
    return this.currentFrame.reduce(
      (sum, command) => (command.type === "drawQuads" ? sum + command.quadCount : sum),
      0,
    );
  }

  get clears(): number {
    return this.currentFrame.filter((command) => command.type === "clear").length;
  }
}
