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

export interface LogRecord {
  level: Exclude<LogLevel, "silent">;

  message: string;

  context: Record<string, unknown>;

  scopes: readonly string[];

  timestamp: number;
}

export interface LogSink {
  write(record: LogRecord): void;

  flush?(): void | Promise<void>;
}

export interface LoggerOptions {

  level?: LogLevel;

  sinks?: LogSink[];

  scopes?: string[];

  now?: () => number;
}

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
