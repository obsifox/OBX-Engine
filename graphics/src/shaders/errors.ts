import { GraphicsError } from "../device.js";

export class ShaderCompileError extends GraphicsError {
  readonly line: number;
  readonly sourceName: string;

  constructor(message: string, sourceName: string, line: number) {
    super(`${sourceName}:${line}: ${message}`);
    this.name = "ShaderCompileError";
    this.sourceName = sourceName;
    this.line = line;
  }
}

