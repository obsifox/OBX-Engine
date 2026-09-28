/**
 * ObsiFox Error System — §2 Core / §55 Security foundations.
 *
 * All engine-originated errors derive from {@link EngineError} and carry a
 * stable machine-readable `code` plus optional structured `context`.
 */

/** Stable machine-readable error codes used across the engine. */
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
  /** Machine-readable code (defaults to `ERR_UNKNOWN`). */
  code?: ErrorCode | string;
  /** Structured context for logs/debugging. */
  context?: Record<string, unknown>;
  /** Underlying cause. */
  cause?: unknown;
}

/** Base class for every error thrown by the engine. */
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

/** Thrown when an operation is attempted in an invalid lifecycle/state. */
export class InvalidStateError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.INVALID_STATE });
  }
}

/** Thrown when caller-supplied arguments are invalid. */
export class InvalidArgumentError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.INVALID_ARGUMENT });
  }
}

/** Thrown when a required entity/resource/asset does not exist. */
export class NotFoundError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.NOT_FOUND });
  }
}

/** Thrown when creating/registering something that already exists. */
export class AlreadyExistsError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.ALREADY_EXISTS });
  }
}

/** Thrown for configuration problems. */
export class ConfigError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.CONFIG });
  }
}

/** Thrown for lifecycle transition violations. */
export class LifecycleError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.LIFECYCLE });
  }
}

/** Thrown when a feature is not implemented yet (roadmap placeholder). */
export class NotImplementedError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.NOT_IMPLEMENTED });
  }
}

/** Runtime/hosting errors (loop driver, platform adapters, ...). */
export class RuntimeError extends EngineError {
  constructor(message: string, options: Omit<EngineErrorOptions, "code"> = {}) {
    super(message, { ...options, code: ErrorCode.RUNTIME });
  }
}

/** Runtime assertion helper. Throws {@link InvalidStateError} when falsy. */
export function assert(
  condition: unknown,
  message = "Assertion failed",
  context?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    throw new InvalidStateError(message, context ? { context } : {});
  }
}

/** Argument validation helper. Throws {@link InvalidArgumentError} when falsy. */
export function ensure(
  condition: unknown,
  message = "Invalid argument",
  context?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    throw new InvalidArgumentError(message, context ? { context } : {});
  }
}
