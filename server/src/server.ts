import { GameServer, type Reducer, type Transport } from "@obx/networking";

export type ServerLogLevel = "debug" | "info" | "warn" | "error";

export interface ServerConfig {
  name: string;
  host: string;
  port: number;
  tickRate: number;
  maxClients: number;
  logLevel: ServerLogLevel;
}

export interface ServerConfigInput {
  name?: string;
  host?: string;
  port?: number;
  tickRate?: number;
  maxClients?: number;
  logLevel?: ServerLogLevel;
}

export class ServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerError";
  }
}

const logLevels: ServerLogLevel[] = ["debug", "info", "warn", "error"];

export function createServerConfig(input: ServerConfigInput = {}): ServerConfig {
  const port = input.port ?? 7777;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ServerError(`invalid port ${port}`);
  const tickRate = input.tickRate ?? 20;
  if (!Number.isInteger(tickRate) || tickRate < 1 || tickRate > 240) throw new ServerError(`invalid tickRate ${tickRate}`);
  const maxClients = input.maxClients ?? 32;
  if (!Number.isInteger(maxClients) || maxClients < 1) throw new ServerError(`invalid maxClients ${maxClients}`);
  const logLevel = input.logLevel ?? "info";
  if (!logLevels.includes(logLevel)) throw new ServerError(`invalid logLevel ${logLevel}`);
  const name = input.name ?? "obx-server";
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw new ServerError(`invalid server name ${name}`);
  return { name, host: input.host ?? "127.0.0.1", port, tickRate, maxClients, logLevel };
}

export interface ServerLogEntry {
  level: ServerLogLevel;
  message: string;
  tick: number;
  meta?: Record<string, number | string | boolean>;
}

export class ServerLogger {
  readonly entries: ServerLogEntry[] = [];
  private readonly sinks: Array<(entry: ServerLogEntry) => void> = [];
  private tick = 0;
  private threshold = 0;

  constructor(readonly options: { level?: ServerLogLevel; capacity?: number } = {}) {
    this.threshold = logLevels.indexOf(options.level ?? "info");
  }

  setLevel(level: ServerLogLevel): void {
    this.threshold = logLevels.indexOf(level);
  }

  advance(): void {
    this.tick += 1;
  }

  log(level: ServerLogLevel, message: string, meta?: Record<string, number | string | boolean>): void {
    if (logLevels.indexOf(level) < this.threshold) return;
    const entry: ServerLogEntry = { level, message, tick: this.tick };
    if (meta) entry.meta = meta;
    this.entries.push(entry);
    const capacity = this.options.capacity ?? 500;
    while (this.entries.length > capacity) this.entries.shift();
    for (const sink of this.sinks) sink(entry);
  }

  attach(sink: (entry: ServerLogEntry) => void): void {
    this.sinks.push(sink);
  }

  filter(level: ServerLogLevel | "all"): ServerLogEntry[] {
    return level === "all" ? [...this.entries] : this.entries.filter((entry) => entry.level === level);
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export class ServerMetrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private ticks = 0;

  inc(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  set(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  get(name: string): number {
    return this.counters.get(name) ?? this.gauges.get(name) ?? 0;
  }

  advance(): void {
    this.ticks += 1;
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = { ticks: this.ticks };
    for (const [key, value] of this.counters) out[key] = value;
    for (const [key, value] of this.gauges) out[key] = value;
    return out;
  }

  get uptimeTicks(): number {
    return this.ticks;
  }
}

export interface ServerPlugin {
  id: string;
  onStart?: () => void;
  onStop?: () => void;
  onTick?: (tick: number) => void;
  onMessage?: (clientId: string, text: string) => string | null;
}

export class ServerPluginHost {
  private readonly plugins = new Map<string, ServerPlugin>();
  private readonly failures = new Map<string, string[]>();

  register(plugin: ServerPlugin): void {
    if (this.plugins.has(plugin.id)) throw new ServerError(`plugin ${plugin.id} already registered`);
    this.plugins.set(plugin.id, plugin);
    this.failures.set(plugin.id, []);
  }

  unregister(id: string): boolean {
    this.failures.delete(id);
    return this.plugins.delete(id);
  }

  start(): void {
    this.guarded((plugin) => plugin.onStart?.(), "start");
  }

  stop(): void {
    this.guarded((plugin) => plugin.onStop?.(), "stop");
  }

  tick(tick: number): void {
    this.guarded((plugin) => plugin.onTick?.(tick), "tick");
  }

  message(clientId: string, text: string): string[] {
    const replies: string[] = [];
    this.guarded((plugin) => {
      const reply = plugin.onMessage?.(clientId, text);
      if (reply) replies.push(reply);
    }, "message");
    return replies;
  }

  private guarded(action: (plugin: ServerPlugin) => void, phase: string): void {
    for (const [id, plugin] of this.plugins) {
      try {
        action(plugin);
      } catch (error) {
        const list = this.failures.get(id) ?? [];
        list.push(`${phase}: ${error instanceof Error ? error.message : String(error)}`);
        this.failures.set(id, list);
      }
    }
  }

  errorsFor(id: string): string[] {
    return [...(this.failures.get(id) ?? [])];
  }

  ids(): string[] {
    return [...this.plugins.keys()];
  }
}

export interface ServerScript {
  id: string;
  onTick?: (tick: number) => void;
}

export class ServerScriptHost {
  private readonly scripts = new Map<string, ServerScript>();
  private readonly disabled = new Set<string>();

  register(script: ServerScript): void {
    if (this.scripts.has(script.id)) throw new ServerError(`script ${script.id} already registered`);
    this.scripts.set(script.id, script);
  }

  remove(id: string): boolean {
    this.disabled.delete(id);
    return this.scripts.delete(id);
  }

  disable(id: string): void {
    if (this.scripts.has(id)) this.disabled.add(id);
  }

  enable(id: string): void {
    this.disabled.delete(id);
  }

  run(tick: number): number {
    let ran = 0;
    for (const [id, script] of this.scripts) {
      if (this.disabled.has(id)) continue;
      script.onTick?.(tick);
      ran += 1;
    }
    return ran;
  }

  list(): string[] {
    return [...this.scripts.keys()];
  }
}

export class HeadlessRuntime {
  private ticks = 0;
  private started = false;
  private readonly listeners: Array<(tick: number) => void> = [];

  constructor(readonly options: { tickRate: number }) {
    if (!Number.isInteger(options.tickRate) || options.tickRate < 1) throw new ServerError("invalid tickRate");
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
  }

  step(steps = 1): number {
    if (!this.started) throw new ServerError("runtime not started");
    for (let index = 0; index < steps; index += 1) {
      this.ticks += 1;
      for (const listener of this.listeners) listener(this.ticks);
    }
    return this.ticks;
  }

  onTick(listener: (tick: number) => void): void {
    this.listeners.push(listener);
  }

  get tick(): number {
    return this.ticks;
  }

  get running(): boolean {
    return this.started;
  }
}

export interface DedicatedServerOptions {
  reducer?: Reducer;
  interestRadius?: number;
}

export class DedicatedServer {
  readonly logger: ServerLogger;
  readonly metrics = new ServerMetrics();
  readonly plugins = new ServerPluginHost();
  readonly scripts = new ServerScriptHost();
  readonly runtime: HeadlessRuntime;
  readonly network: GameServer;
  private started = false;

  constructor(
    readonly config: ServerConfig,
    options: DedicatedServerOptions = {},
  ) {
    this.logger = new ServerLogger({ level: config.logLevel });
    this.runtime = new HeadlessRuntime({ tickRate: config.tickRate });
    this.network = new GameServer({
      tickRate: config.tickRate,
      interestRadius: options.interestRadius,
      reducer: options.reducer,
    });
    this.runtime.onTick((tick) => {
      this.logger.advance();
      this.metrics.advance();
      this.scripts.run(tick);
      this.plugins.tick(tick);
      this.network.tick();
      this.metrics.set("clients", this.network.clients.length);
    });
  }

  start(): void {
    if (this.started) return;
    if (this.network.clients.length >= this.config.maxClients) throw new ServerError("server full");
    this.started = true;
    this.runtime.start();
    this.plugins.start();
    this.logger.log("info", `${this.config.name} started on ${this.config.host}:${this.config.port}`);
  }

  stop(): void {
    if (!this.started) return;
    this.plugins.stop();
    this.runtime.stop();
    this.started = false;
    this.logger.log("info", `${this.config.name} stopped`);
  }

  connect(clientId: string, transport: Transport): void {
    if (this.network.clients.length >= this.config.maxClients) throw new ServerError("server full");
    this.network.addClient(clientId, transport);
    this.metrics.inc("connections");
    this.logger.log("info", `client ${clientId} connected`);
  }

  disconnect(clientId: string): void {
    this.network.removeClient(clientId);
    this.metrics.inc("disconnections");
    this.logger.log("info", `client ${clientId} disconnected`);
  }

  broadcast(text: string): void {
    this.metrics.inc("broadcasts");
    for (const reply of this.plugins.message("*", text)) {
      this.logger.log("debug", `plugin reply: ${reply}`);
    }
  }

  step(steps = 1): number {
    if (!this.started) throw new ServerError("server not started");
    return this.runtime.step(steps);
  }

  status(): {
    running: boolean;
    tick: number;
    clients: number;
    metrics: Record<string, number>;
  } {
    return {
      running: this.started,
      tick: this.runtime.tick,
      clients: this.network.clients.length,
      metrics: this.metrics.snapshot(),
    };
  }

  get running(): boolean {
    return this.started;
  }
}

export const SERVER_VERSION = "0.95.0";
