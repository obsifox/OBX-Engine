import { Connection, NetworkClock, RateLimiter, SessionAuthority, InputValidator, AuthorityGuard, type Address, type DatagramTransport, InMemoryDatagramTransport, InMemoryNetwork, type Datagram } from "@obx/networking";
import { EntityRegistry, encodeComponentDeltas, decodeComponentDeltas, OwnershipTracker, type ComponentDelta } from "./replication.js";
import { TrafficProfiler, BandwidthBudget, type WorldSnapshot, snapshotDelta, encodeDelta, type SnapshotDelta } from "./sync.js";

export interface DedicatedConfig {
  tickRate: number;
  maxClients: number;
  secret: Uint8Array;
  bandwidthBytesPerSecond: number;
}

export function defaultDedicatedConfig(): DedicatedConfig {
  return { tickRate: 30, maxClients: 32, secret: new Uint8Array(32).fill(7), bandwidthBytesPerSecond: 64_000 };
}

export interface ClientSlot {
  address: Address;
  connection: Connection;
  subject: string;
  authenticated: boolean;
}

export class DedicatedServer {
  readonly config: DedicatedConfig;
  readonly clock: NetworkClock;
  readonly entities: EntityRegistry;
  readonly ownership = new OwnershipTracker();
  readonly profiler = new TrafficProfiler();
  readonly sessions: SessionAuthority;
  readonly limiter: RateLimiter;
  readonly authority = new AuthorityGuard();
  readonly validator: InputValidator;
  #budget: BandwidthBudget;
  #transport: DatagramTransport;
  #clients = new Map<string, ClientSlot>();
  #baseline: WorldSnapshot | null = null;
  #ticks = 0;
  #messages: { from: string; payload: Uint8Array }[] = [];

  constructor(transport: DatagramTransport, config: Partial<DedicatedConfig> = {}) {
    this.config = { ...defaultDedicatedConfig(), ...config };
    this.clock = new NetworkClock(this.config.tickRate);
    this.entities = new EntityRegistry();
    this.sessions = new SessionAuthority(this.config.secret);
    this.limiter = new RateLimiter(20, 10);
    this.validator = new InputValidator([
      { field: "type", kind: "string", maxLength: 32 },
      { field: "seq", kind: "number", min: 0 },
    ]);
    this.#budget = new BandwidthBudget(this.config.bandwidthBytesPerSecond);
    this.#transport = transport;
    transport.onReceive((datagram) => this.#handle(datagram));
  }

  static overMemory(network: InMemoryNetwork, local: Address, config: Partial<DedicatedConfig> = {}): DedicatedServer {
    return new DedicatedServer(new InMemoryDatagramTransport(network, local), config);
  }

  get clientCount(): number {
    return this.#clients.size;
  }

  get tick(): number {
    return this.#ticks;
  }

  get budget(): BandwidthBudget {
    return this.#budget;
  }

  get messages(): { from: string; payload: Uint8Array }[] {
    return this.#messages;
  }

  async start(): Promise<Address | null> {
    await this.#transport.open();
    return this.#transport.localAddress;
  }

  #key(datagram: Datagram): string {
    return `${datagram.from.host}:${datagram.from.port}`;
  }

  #handle(datagram: Datagram): void {
    const key = this.#key(datagram);
    if (!this.limiter.allow(key, this.clock.tickNumber(this.#ticks * 1000))) return;
    this.profiler.record("inbound", datagram.payload.length);
    const text = new TextDecoder().decode(datagram.payload);
    if (text.startsWith("auth:")) {
      if (this.#clients.size >= this.config.maxClients) return;
      const subject = text.slice(5);
      const token = this.sessions.issue(subject, this.#ticks * 1000);
      const connection = new Connection(this.#transport, datagram.from);
      connection.accept();
      this.#clients.set(key, { address: datagram.from, connection, subject, authenticated: true });
      this.authority.claim(subject, "client");
      void this.#transport.send(datagram.from, new TextEncoder().encode(`token:${token.sessionId}:${token.signature}`));
      return;
    }
    const slot = this.#clients.get(key);
    if (!slot || !slot.authenticated) return;
    if (text.startsWith("msg:")) {
      this.#messages.push({ from: slot.subject, payload: new TextEncoder().encode(text.slice(4)) });
      return;
    }
    if (text.startsWith("input:")) {
      const fields = JSON.parse(text.slice(6)) as Record<string, unknown>;
      const errors = this.validator.validate(fields);
      if (errors.length > 0) {
        void this.#transport.send(slot.address, new TextEncoder().encode(`reject:${errors.join(",")}`));
        return;
      }
      this.#messages.push({ from: slot.subject, payload: new TextEncoder().encode(text) });
    }
  }

  spawnEntity(prefab: string, owner: string): number {
    const entity = this.entities.spawn(prefab, owner, "server");
    this.ownership.assign(entity.netId, owner);
    return entity.netId;
  }

  step(deltaSeconds: number): SnapshotDelta | null {
    this.#ticks += 1;
    this.clock.advance(deltaSeconds);
    const deltas = this.entities.drainDeltas();
    const spawns = this.entities.drainSpawns();
    const despawns = this.entities.drainDespawns();
    const snapshot = this.#snapshot();
    const delta = snapshotDelta(this.#baseline, snapshot);
    this.#baseline = snapshot;
    const payload = encodeDelta(delta);
    if (spawns.length > 0 || despawns.length > 0 || delta.changed.length > 0 || delta.removed.length > 0) {
      if (this.#budget.allow(payload.length, this.#ticks * 1000)) {
        this.broadcast(payload);
      }
    }
    if (deltas.length > 0) {
      this.broadcast(encodeComponentDeltas(deltas));
    }
    return delta;
  }

  #snapshot(): WorldSnapshot {
    const entities: Record<number, Record<string, number>> = {};
    for (const delta of this.entities.fullState()) {
      const numeric: Record<string, number> = {};
      for (const [key, value] of Object.entries(delta.fields)) {
        if (typeof value === "number") numeric[key] = value;
        else if (typeof value === "boolean") numeric[key] = value ? 1 : 0;
        else numeric[key] = value.length;
      }
      entities[delta.netId] = numeric;
    }
    return { tick: this.#ticks, entities };
  }

  broadcast(payload: Uint8Array): void {
    for (const slot of this.#clients.values()) {
      if (this.#budget.allow(payload.length, this.#ticks * 1000)) {
        slot.connection.send(payload);
        this.profiler.record("outbound", payload.length);
      }
    }
  }

  applyRemoteDeltas(bytes: Uint8Array): ComponentDelta[] {
    const deltas = decodeComponentDeltas(bytes);
    for (const delta of deltas) {
      if (this.entities.get(delta.netId)) this.entities.patchFields(delta.netId, delta.component, delta.fields);
    }
    return deltas;
  }

  async stop(): Promise<void> {
    for (const slot of this.#clients.values()) slot.connection.close();
    this.#clients.clear();
    await this.#transport.close();
  }
}

export interface ClientRuntimeStats {
  tokens: number;
  messages: number;
  rejections: number;
}

export class DedicatedClient {
  #transport: DatagramTransport;
  #server: Address;
  #subject: string;
  #token: string | null = null;
  #stats: ClientRuntimeStats = { tokens: 0, messages: 0, rejections: 0 };
  #inbox: Uint8Array[] = [];

  constructor(transport: DatagramTransport, server: Address, subject: string) {
    this.#transport = transport;
    this.#server = server;
    this.#subject = subject;
    transport.onReceive((datagram) => {
      const text = new TextDecoder().decode(datagram.payload);
      if (text.startsWith("token:")) {
        this.#token = text;
        this.#stats.tokens += 1;
      } else if (text.startsWith("reject:")) {
        this.#stats.rejections += 1;
      } else {
        this.#stats.messages += 1;
        this.#inbox.push(datagram.payload);
      }
    });
  }

  get stats(): ClientRuntimeStats {
    return { ...this.#stats };
  }

  get token(): string | null {
    return this.#token;
  }

  get inbox(): Uint8Array[] {
    return this.#inbox;
  }

  async start(): Promise<void> {
    await this.#transport.open();
  }

  authenticate(): void {
    void this.#transport.send(this.#server, new TextEncoder().encode(`auth:${this.#subject}`));
  }

  send(message: string): void {
    void this.#transport.send(this.#server, new TextEncoder().encode(`msg:${message}`));
  }

  sendInput(fields: Record<string, unknown>): void {
    void this.#transport.send(this.#server, new TextEncoder().encode(`input:${JSON.stringify(fields)}`));
  }

  async stop(): Promise<void> {
    await this.#transport.close();
  }
}
