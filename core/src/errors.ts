export const ErrorCode = {
  UNKNOWN: "ERR_UNKNOWN",
  INVALID_STATE: "ERR_INVALID_STATE",
  INVALID_ARGUMENT: "ERR_INVALID_ARGUMENT",
  NOT_FOUND: "ERR_NOT_FOUND",
  ALREADY_EXISTS: "ERR_ALREADY_EXISTS",
  CONFIG: "ERR_CONFIG",
  LIFECYCLE: "ERR_LIFECYCLE",
  RUNTIME: "ERR_RUNTIME",
  RENDERER: "ERR_RENDERER",
  ASSET: "ERR_ASSET",
  PLUGIN: "ERR_PLUGIN",
  SCRIPT: "ERR_SCRIPT",
  NETWORK: "ERR_NETWORK",
  ECS: "ERR_ECS",
  NOT_IMPLEMENTED: "ERR_NOT_IMPLEMENTED",
  PERMISSION_DENIED: "ERR_PERMISSION_DENIED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface EngineErrorOptions {

  code?: ErrorCode | string;

  context?: Record<string, unknown>;

  cause?: unknown;
}

export class EngineError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options: EngineErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code ?? ErrorCode.UNKNOWN;
    this.context = options.context ?? {};
    Error.captureStackTrace?.(this, new.target);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

export class InvalidStateError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.INVALID_STATE });
  }
}

export class InvalidArgumentError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.INVALID_ARGUMENT });
  }
}

export class NotFoundError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.NOT_FOUND });
  }
}

export class AlreadyExistsError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.ALREADY_EXISTS });
  }
}

export class ConfigError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.CONFIG });
  }
}

export class LifecycleError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.LIFECYCLE });
  }
}

export class NotImplementedError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.NOT_IMPLEMENTED });
  }
}

export class RuntimeError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.RUNTIME });
  }
}

export function assert(
  condition: unknown,
  message = "Assertion failed",
  context?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    throw new InvalidStateError(message, context ? { context } : {});
  }
}

export function ensure(
  condition: unknown,
  message = "Invalid argument",
  context?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    throw new InvalidArgumentError(message, context ? { context } : {});
  }
}
