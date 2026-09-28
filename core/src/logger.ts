/**
 * ObsiFox Logging — §2 Core / Logger.
 *
 * Minimal, pluggable, scope-aware logger. Sinks decide where records go
 * (console, file, memory, network...). The engine core never assumes a sink;
 * a console sink is provided for convenience.
 */

/** Severity levels, ordered from most to least verbose. */
export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  silent: 6,
};

/** A single log record handed to sinks. */
export interface LogRecord {
  level: Exclude<LogLevel, "silent">;
  /** Human-readable message. */
  message: string;
  /** Structured fields attached to the record. */
  context: Record<string, unknown>;
  /** Logger scope chain, e.g. `["engine", "renderer"]`. */
  scopes: readonly string[];
  /** Epoch milliseconds. */
  timestamp: number;
}

/** Destination for log records. */
export interface LogSink {
  write(record: LogRecord): void;
  /** Optional flush hook. */
  flush?(): void | Promise<void>;
}

export interface LoggerOptions {
  /** Minimum level to emit (default `"info"`). */
  level?: LogLevel;
  /** Sinks to write to (default: none — attach sinks explicitly). */
  sinks?: LogSink[];
  /** Scope names prepended to records. */
  scopes?: string[];
  /** Clock used for timestamps (default: `Date.now`). */
  now?: () => number;
}

/** Simple in-memory sink — used by tests and the editor console. */
export class MemoryLogSink implements LogSink {
  readonly records: LogRecord[] = [];
  readonly limit: number;

  constructor(limit = 1000) {
    this.limit = limit;
  }

  write(record: LogRecord): void {
    this.records.push(record);
    if (this.records.length > this.limit) {
      this.records.splice(0, this.records.length - this.limit);
    }
  }

  clear(): void {
    this.records.length = 0;
  }
}

/** Console sink with sensible formatting. */
export class ConsoleLogSink implements LogSink {
  write(record: LogRecord): void {
    const scope = record.scopes.length > 0 ? `[${record.scopes.join(".")}] ` : "";
    const extras = Object.keys(record.context).length > 0 ? ` ${JSON.stringify(record.context)}` : "";
    const line = `${scope}${record.message}${extras}`;
    switch (record.level) {
      case "trace":
      case "debug":
        console.debug(line);
        break;
      case "info":
        console.info(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "error":
      case "fatal":
        console.error(line);
        break;
    }
  }
}

/**
 * Scope-aware leveled logger.
 *
 * ```ts
 * const log = new Logger({ level: "debug", sinks: [new ConsoleLogSink()] });
 * const renderLog = log.child("renderer");
 * renderLog.info("backend ready", { backend: "webgl" });
 * ```
 */
export class Logger {
  #level: LogLevel;
  #sinks: LogSink[];
  #scopes: readonly string[];
  readonly #now: () => number;

  constructor(options: LoggerOptions = {}) {
    this.#level = options.level ?? "info";
    this.#sinks = [...(options.sinks ?? [])];
    this.#scopes = options.scopes ?? [];
    this.#now = options.now ?? Date.now;
  }

  get level(): LogLevel {
    return this.#level;
  }

  set level(value: LogLevel) {
    this.#level = value;
  }

  get scopes(): readonly string[] {
    return this.#scopes;
  }

  /** Whether a record at `level` would be emitted. */
  isEnabled(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.#level] && this.#level !== "silent";
  }

  addSink(sink: LogSink): () => void {
    this.#sinks.push(sink);
    return () => this.removeSink(sink);
  }

  removeSink(sink: LogSink): void {
    const index = this.#sinks.indexOf(sink);
    if (index >= 0) this.#sinks.splice(index, 1);
  }

  /** Derive a logger with an additional scope (shares sinks/level). */
  child(...scopes: string[]): Logger {
    const derived = new Logger({
      level: this.#level,
      sinks: this.#sinks,
      scopes: [...this.#scopes, ...scopes],
      now: this.#now,
    });
    return derived;
  }

  log(level: Exclude<LogLevel, "silent">, message: string, context: Record<string, unknown> = {}): void {
    if (!this.isEnabled(level)) return;
    const record: LogRecord = {
      level,
      message,
      context,
      scopes: this.#scopes,
      timestamp: this.#now(),
    };
    for (const sink of this.#sinks) {
      try {
        sink.write(record);
      } catch {
        // Sinks must never break logging.
      }
    }
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log("trace", message, context);
  }
  debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }
  info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }
  warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }
  error(message: string, context?: Record<string, unknown>): void {
    this.log("error", message, context);
  }
  fatal(message: string, context?: Record<string, unknown>): void {
    this.log("fatal", message, context);
  }
}
