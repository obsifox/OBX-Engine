import { Random } from "@obx/core";

export type TransportKind = "tcp" | "udp" | "websocket" | "webrtc" | "memory";

export interface ProtocolProfile {
  kind: TransportKind;
  ordered: boolean;
  reliable: boolean;
  framed: boolean;
}

export const protocolProfiles: Record<TransportKind, ProtocolProfile> = {
  tcp: { kind: "tcp", ordered: true, reliable: true, framed: true },
  udp: { kind: "udp", ordered: false, reliable: false, framed: false },
  websocket: { kind: "websocket", ordered: true, reliable: true, framed: true },
  webrtc: { kind: "webrtc", ordered: false, reliable: false, framed: true },
  memory: { kind: "memory", ordered: true, reliable: true, framed: true },
};

export abstract class Transport {
  abstract send(data: Uint8Array): void;
  abstract poll(): Uint8Array[];
  abstract close(): void;
  abstract get connected(): boolean;
}

export interface LinkOptions {
  latencyTicks?: number;
  jitterTicks?: number;
  dropRate?: number;
  seed?: number;
}

class Wire {
  readonly queue: Array<{ at: number; data: Uint8Array }> = [];
  constructor(
    readonly options: Required<LinkOptions>,
    readonly rng: Random,
  ) {}
}

export class MemoryTransport extends Transport {
  private open = true;
  readonly stats = { sent: 0, received: 0, dropped: 0 };

  constructor(
    private readonly outbound: Wire,
    private readonly inbound: Wire,
    private readonly clock: { tick: number },
  ) {
    super();
  }

  send(data: Uint8Array): void {
    if (!this.open) return;
    this.stats.sent += 1;
    if (this.outbound.rng.next() < this.outbound.options.dropRate) {
      this.stats.dropped += 1;
      return;
    }
    const jitter = this.outbound.options.jitterTicks > 0
      ? Math.floor(this.outbound.rng.next() * (this.outbound.options.jitterTicks + 1))
      : 0;
    this.outbound.queue.push({
      at: this.clock.tick + this.outbound.options.latencyTicks + jitter,
      data: new Uint8Array(data),
    });
  }

  poll(): Uint8Array[] {
    const due: Uint8Array[] = [];
    const rest: Array<{ at: number; data: Uint8Array }> = [];
    for (const item of this.inbound.queue) {
      if (item.at <= this.clock.tick) {
        due.push(item.data);
        this.stats.received += 1;
      } else {
        rest.push(item);
      }
    }
    this.inbound.queue.length = 0;
    this.inbound.queue.push(...rest);
    return due;
  }

  close(): void {
    this.open = false;
    this.outbound.queue.length = 0;
    this.inbound.queue.length = 0;
  }

  get connected(): boolean {
    return this.open;
  }
}

export class MemoryNetwork {
  private tick = 0;
  private readonly clock = { tick: 0 };
  private readonly links: MemoryTransport[] = [];
  private readonly wires: Wire[] = [];

  constructor(private readonly defaults: LinkOptions = {}) {}

  createPair(options: LinkOptions = {}): [MemoryTransport, MemoryTransport] {
    const merged: Required<LinkOptions> = {
      latencyTicks: options.latencyTicks ?? this.defaults.latencyTicks ?? 0,
      jitterTicks: options.jitterTicks ?? this.defaults.jitterTicks ?? 0,
      dropRate: options.dropRate ?? this.defaults.dropRate ?? 0,
      seed: options.seed ?? this.defaults.seed ?? 1,
    };
    const forward = new Wire(merged, new Random(merged.seed));
    const backward = new Wire(merged, new Random(merged.seed + 1));
    this.wires.push(forward, backward);
    const a = new MemoryTransport(forward, backward, this.clock);
    const b = new MemoryTransport(backward, forward, this.clock);
    this.links.push(a, b);
    return [a, b];
  }

  step(ticks = 1): void {
    for (let index = 0; index < ticks; index += 1) {
      this.tick += 1;
      this.clock.tick = this.tick;
    }
  }

  get now(): number {
    return this.tick;
  }

  get pendingPackets(): number {
    return this.wires.reduce((total, wire) => total + wire.queue.length, 0);
  }
}

export function createTransport(
  kind: TransportKind,
  network: MemoryNetwork,
  options: LinkOptions = {},
): [MemoryTransport, MemoryTransport] {
  const profile = protocolProfiles[kind];
  const tuned: LinkOptions = {
    latencyTicks: options.latencyTicks ?? (kind === "memory" ? 0 : 1),
    jitterTicks: options.jitterTicks ?? (profile.reliable ? 0 : 1),
    dropRate: options.dropRate ?? (profile.reliable ? 0 : 0.1),
    seed: options.seed,
  };
  return network.createPair(tuned);
}

export const PACKET_MAGIC = 0x4f42;
export const PACKET_KIND_DATA = 0;
export const PACKET_KIND_ACK = 1;

export interface Packet {
  channel: number;
  sequence: number;
  kind: number;
  payload: Uint8Array;
}

export function encodePacket(packet: Packet): Uint8Array {
  const bytes = new Uint8Array(12 + packet.payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, PACKET_MAGIC);
  view.setUint8(2, packet.kind);
  view.setUint8(3, packet.channel);
  view.setUint32(4, packet.sequence);
  view.setUint32(8, packet.payload.length);
  bytes.set(packet.payload, 12);
  return bytes;
}

export function decodePacket(bytes: Uint8Array): Packet {
  if (bytes.length < 12) throw new RangeError("packet too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0) !== PACKET_MAGIC) throw new RangeError("bad packet magic");
  const kind = view.getUint8(2);
  const channel = view.getUint8(3);
  const sequence = view.getUint32(4);
  const length = view.getUint32(8);
  if (bytes.length !== 12 + length) throw new RangeError("bad packet length");
  return { channel, sequence, kind, payload: bytes.slice(12) };
}

export interface ReliableOptions {
  resendTicks?: number;
  maxRetries?: number;
  ordered?: boolean;
  channel?: number;
}

export class ReliableChannel {
  private nextSequence = 1;
  private expected = 1;
  private readonly inFlight = new Map<number, { payload: Uint8Array; age: number; retries: number }>();
  private readonly held = new Map<number, Uint8Array>();
  private readonly delivered: Uint8Array[] = [];
  readonly stats = { sent: 0, delivered: 0, retransmitted: 0, lost: 0, acks: 0 };

  constructor(
    readonly transport: Transport,
    readonly options: Required<ReliableOptions> = {
      resendTicks: 2,
      maxRetries: 5,
      ordered: true,
      channel: 0,
    },
  ) {}

  send(payload: Uint8Array): number {
    const sequence = this.nextSequence;
    this.nextSequence += 1;
    this.inFlight.set(sequence, { payload: new Uint8Array(payload), age: 0, retries: 0 });
    this.stats.sent += 1;
    this.transport.send(encodePacket({ channel: this.options.channel, sequence, kind: PACKET_KIND_DATA, payload }));
    return sequence;
  }

  tick(): void {
    for (const [sequence, entry] of this.inFlight) {
      entry.age += 1;
      if (entry.age < this.options.resendTicks) continue;
      if (entry.retries >= this.options.maxRetries) {
        this.inFlight.delete(sequence);
        this.stats.lost += 1;
        continue;
      }
      entry.age = 0;
      entry.retries += 1;
      this.stats.retransmitted += 1;
      this.transport.send(encodePacket({
        channel: this.options.channel,
        sequence,
        kind: PACKET_KIND_DATA,
        payload: entry.payload,
      }));
    }
    this.processInbound();
  }

  receive(): Uint8Array[] {
    this.processInbound();
    const out = this.delivered.splice(0, this.delivered.length);
    return out;
  }

  private processInbound(): void {
    for (const raw of this.transport.poll()) {
      let packet: Packet;
      try {
        packet = decodePacket(raw);
      } catch {
        continue;
      }
      if (packet.channel !== this.options.channel) continue;
      if (packet.kind === PACKET_KIND_ACK) {
        if (this.inFlight.delete(packet.sequence)) this.stats.acks += 1;
        continue;
      }
      this.transport.send(encodePacket({
        channel: this.options.channel,
        sequence: packet.sequence,
        kind: PACKET_KIND_ACK,
        payload: new Uint8Array(0),
      }));
      if (packet.sequence < this.expected) continue;
      if (!this.options.ordered) {
        this.stats.delivered += 1;
        this.delivered.push(packet.payload);
        this.expected = Math.max(this.expected, packet.sequence + 1);
        continue;
      }
      this.held.set(packet.sequence, packet.payload);
      while (this.held.has(this.expected)) {
        this.delivered.push(this.held.get(this.expected)!);
        this.held.delete(this.expected);
        this.expected += 1;
        this.stats.delivered += 1;
      }
    }
  }

  get pending(): number {
    return this.inFlight.size;
  }

  get buffered(): number {
    return this.held.size;
  }
}

export interface RpcResult {
  id: number;
  method: string;
  ok: boolean;
  value: string;
}

interface RpcFrame {
  t: "req" | "res" | "err";
  id: number;
  method: string;
  payload: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class RpcSystem {
  private nextId = 1;
  private readonly handlers = new Map<string, (payload: string) => string>();
  private readonly waiting = new Map<number, { method: string; age: number }>();
  private readonly results: RpcResult[] = [];
  readonly stats = { requests: 0, responses: 0, failed: 0 };

  constructor(
    readonly channel: ReliableChannel,
    readonly options: { timeoutTicks?: number } = {},
  ) {}

  register(method: string, handler: (payload: string) => string): void {
    this.handlers.set(method, handler);
  }

  call(method: string, payload = ""): number {
    const id = this.nextId;
    this.nextId += 1;
    this.stats.requests += 1;
    this.waiting.set(id, { method, age: 0 });
    this.channel.send(encoder.encode(JSON.stringify({ t: "req", id, method, payload } satisfies RpcFrame)));
    return id;
  }

  tick(): void {
    this.channel.tick();
    this.drain();
    const timeout = this.options.timeoutTicks ?? 30;
    for (const [id, entry] of this.waiting) {
      entry.age += 1;
      if (entry.age < timeout) continue;
      this.waiting.delete(id);
      this.stats.failed += 1;
      this.results.push({ id, method: entry.method, ok: false, value: "timeout" });
    }
  }

  private drain(): void {
    for (const raw of this.channel.receive()) {
      const frame = JSON.parse(decoder.decode(raw)) as RpcFrame;
      if (frame.t === "req") {
        const handler = this.handlers.get(frame.method);
        const response: RpcFrame = handler
          ? { t: "res", id: frame.id, method: frame.method, payload: handler(frame.payload) }
          : { t: "err", id: frame.id, method: frame.method, payload: "unknown method" };
        this.channel.send(encoder.encode(JSON.stringify(response)));
        continue;
      }
      const entry = this.waiting.get(frame.id);
      if (!entry) continue;
      this.waiting.delete(frame.id);
      if (frame.t === "res") this.stats.responses += 1;
      else this.stats.failed += 1;
      this.results.push({ id: frame.id, method: entry.method, ok: frame.t === "res", value: frame.payload });
    }
  }

  poll(): RpcResult[] {
    return this.results.splice(0, this.results.length);
  }

  get pending(): number {
    return this.waiting.size;
  }
}

export type EntityValue = number | string | boolean;
export type EntityState = Record<string, EntityValue>;

export interface Snapshot {
  tick: number;
  entities: Record<string, EntityState>;
}

export class ReplicationSystem {
  private readonly entities = new Map<string, EntityState>();

  track(id: string, state: EntityState): void {
    this.entities.set(id, { ...state });
  }

  untrack(id: string): boolean {
    return this.entities.delete(id);
  }

  patch(id: string, patch: Partial<EntityState>): void {
    const state = this.entities.get(id);
    if (!state) throw new RangeError(`unknown entity ${id}`);
    Object.assign(state, patch);
  }

  state(id: string): EntityState | null {
    const state = this.entities.get(id);
    return state ? { ...state } : null;
  }

  snapshot(tick: number, filter?: (id: string, state: EntityState) => boolean): Snapshot {
    const entities: Record<string, EntityState> = {};
    for (const [id, state] of this.entities) {
      if (filter && !filter(id, state)) continue;
      entities[id] = { ...state };
    }
    return { tick, entities };
  }

  serialize(snapshot: Snapshot): string {
    return JSON.stringify(snapshot);
  }

  get count(): number {
    return this.entities.size;
  }
}

export class ReplicationClient {
  private readonly entities = new Map<string, EntityState>();
  private latestTick = -1;

  apply(snapshot: Snapshot): void {
    if (snapshot.tick < this.latestTick) return;
    this.latestTick = snapshot.tick;
    for (const [id, state] of Object.entries(snapshot.entities)) {
      this.entities.set(id, { ...state });
    }
  }

  state(id: string): EntityState | null {
    const state = this.entities.get(id);
    return state ? { ...state } : null;
  }

  ids(): string[] {
    return [...this.entities.keys()];
  }

  get lastTick(): number {
    return this.latestTick;
  }
}

export type Reducer = (state: EntityState, input: { seq: number; fields: Record<string, number> }) => EntityState;

export class PredictionSystem {
  private predictedState: EntityState;
  private readonly history: Array<{ seq: number; fields: Record<string, number> }> = [];

  constructor(
    initialState: EntityState,
    readonly reducer: Reducer,
  ) {
    this.predictedState = { ...initialState };
  }

  predict(input: { seq: number; fields: Record<string, number> }): void {
    this.history.push({ seq: input.seq, fields: { ...input.fields } });
    this.predictedState = this.reducer(this.predictedState, input);
  }

  correct(serverState: EntityState, ackSeq: number): void {
    this.predictedState = { ...serverState };
    const pending = this.history.filter((input) => input.seq > ackSeq);
    this.history.length = 0;
    this.history.push(...pending);
    for (const input of pending) {
      this.predictedState = this.reducer(this.predictedState, input);
    }
  }

  get predicted(): EntityState {
    return { ...this.predictedState };
  }

  get pendingInputs(): number {
    return this.history.length;
  }
}

export class InterpolationSystem {
  private readonly buffer: Array<{ tick: number; state: EntityState }> = [];

  constructor(readonly options: { delayTicks?: number } = {}) {}

  push(tick: number, state: EntityState): void {
    this.buffer.push({ tick, state: { ...state } });
    this.buffer.sort((a, b) => a.tick - b.tick);
  }

  sample(renderTick: number): EntityState | null {
    const delay = this.options.delayTicks ?? 0;
    const target = renderTick - delay;
    if (this.buffer.length === 0) return null;
    const first = this.buffer[0]!;
    if (target <= first.tick) return { ...first.state };
    for (let index = 0; index < this.buffer.length - 1; index += 1) {
      const from = this.buffer[index]!;
      const to = this.buffer[index + 1]!;
      if (target >= from.tick && target <= to.tick) {
        const span = to.tick - from.tick;
        const alpha = span === 0 ? 0 : (target - from.tick) / span;
        const mixed: EntityState = {};
        for (const key of Object.keys(from.state)) {
          const a = from.state[key]!;
          const b = to.state[key] ?? a;
          if (typeof a === "number" && typeof b === "number") mixed[key] = a + (b - a) * alpha;
          else mixed[key] = alpha < 0.5 ? a : b;
        }
        return mixed;
      }
    }
    const last = this.buffer[this.buffer.length - 1]!;
    return { ...last.state };
  }

  get buffered(): number {
    return this.buffer.length;
  }
}

export class LagCompensation {
  private readonly history: Array<{ tick: number; states: Record<string, EntityState> }> = [];

  constructor(readonly options: { historyTicks?: number } = {}) {}

  record(tick: number, states: Record<string, EntityState>): void {
    const copied: Record<string, EntityState> = {};
    for (const [id, state] of Object.entries(states)) copied[id] = { ...state };
    this.history.push({ tick, states: copied });
    const limit = this.options.historyTicks ?? 64;
    while (this.history.length > limit) this.history.shift();
  }

  rewind(tick: number): Record<string, EntityState> | null {
    let best: { tick: number; states: Record<string, EntityState> } | null = null;
    for (const entry of this.history) {
      if (entry.tick <= tick && (!best || entry.tick > best.tick)) best = entry;
    }
    if (!best) return null;
    const out: Record<string, EntityState> = {};
    for (const [id, state] of Object.entries(best.states)) out[id] = { ...state };
    return out;
  }

  get depth(): number {
    return this.history.length;
  }
}

export interface Position {
  x: number;
  y: number;
}

export class InterestManagement {
  constructor(readonly radius: number) {}

  visible(viewer: Position, target: Position, radius = this.radius): boolean {
    const dx = viewer.x - target.x;
    const dy = viewer.y - target.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  filter(viewer: Position, entities: Record<string, EntityState>): string[] {
    const ids: string[] = [];
    for (const [id, state] of Object.entries(entities)) {
      const x = typeof state.x === "number" ? state.x : 0;
      const y = typeof state.y === "number" ? state.y : 0;
      if (this.visible(viewer, { x, y })) ids.push(id);
    }
    return ids;
  }
}

export type NetFrame =
  | { type: "input"; seq: number; fields: Record<string, number> }
  | { type: "snapshot"; snapshot: Snapshot };

export function encodeFrame(frame: NetFrame): Uint8Array {
  return encoder.encode(JSON.stringify(frame));
}

export function decodeFrame(bytes: Uint8Array): NetFrame {
  return JSON.parse(decoder.decode(bytes)) as NetFrame;
}

export interface GameServerOptions {
  tickRate?: number;
  interestRadius?: number;
  reducer?: Reducer;
}

export class GameServer {
  readonly replication = new ReplicationSystem();
  readonly lagCompensation = new LagCompensation();
  readonly interest: InterestManagement | null;
  readonly tickRate: number;
  private readonly sessions = new Map<string, { channel: ReliableChannel; transport: Transport }>();
  private readonly inputs = new Map<string, Array<{ seq: number; fields: Record<string, number> }>>();
  private readonly reducer: Reducer | null;
  private ticks = 0;
  readonly stats = { inputs: 0, snapshots: 0 };

  constructor(options: GameServerOptions = {}) {
    this.tickRate = options.tickRate ?? 20;
    this.reducer = options.reducer ?? null;
    this.interest = options.interestRadius === undefined
      ? null
      : new InterestManagement(options.interestRadius);
  }

  addClient(id: string, transport: Transport): void {
    if (this.sessions.has(id)) throw new RangeError(`client ${id} already connected`);
    this.sessions.set(id, { channel: new ReliableChannel(transport), transport });
    this.inputs.set(id, []);
  }

  removeClient(id: string): void {
    this.sessions.get(id)?.transport.close();
    this.sessions.delete(id);
    this.inputs.delete(id);
  }

  handleFrame(id: string, frame: NetFrame): void {
    if (frame.type !== "input") return;
    this.stats.inputs += 1;
    this.inputs.get(id)?.push({ seq: frame.seq, fields: { ...frame.fields } });
    if (this.reducer) {
      const state = this.replication.state(id);
      if (state) this.replication.patch(id, this.reducer(state, { seq: frame.seq, fields: frame.fields }));
    }
  }

  submitInput(id: string, input: { seq: number; fields: Record<string, number> }): void {
    this.handleFrame(id, { type: "input", seq: input.seq, fields: input.fields });
  }

  tick(): void {
    this.ticks += 1;
    for (const [id, session] of this.sessions) {
      for (const raw of session.channel.receive()) {
        try {
          this.handleFrame(id, decodeFrame(raw));
        } catch {
          continue;
        }
      }
      session.channel.tick();
    }
    const world = this.replication.snapshot(this.ticks);
    this.lagCompensation.record(this.ticks, world.entities);
    for (const [id, session] of this.sessions) {
      const own = world.entities[id] ?? {};
      const viewer: Position = {
        x: typeof own.x === "number" ? own.x : 0,
        y: typeof own.y === "number" ? own.y : 0,
      };
      const entities = this.interest
        ? Object.fromEntries(this.interest.filter(viewer, world.entities).map((e) => [e, world.entities[e]!]))
        : world.entities;
      session.channel.send(encodeFrame({ type: "snapshot", snapshot: { tick: this.ticks, entities } }));
      this.stats.snapshots += 1;
    }
    for (const queue of this.inputs.values()) queue.length = 0;
  }

  get clients(): string[] {
    return [...this.sessions.keys()];
  }

  get tickCount(): number {
    return this.ticks;
  }
}

export class GameClient {
  readonly prediction: PredictionSystem;
  private readonly interpolators = new Map<string, InterpolationSystem>();
  private readonly channel: ReliableChannel;
  private seq = 0;
  private latestSnapshot: Snapshot | null = null;
  readonly stats = { sent: 0, received: 0 };

  constructor(
    readonly transport: Transport,
    options: {
      initialState?: EntityState;
      reducer?: Reducer;
    } = {},
  ) {
    this.channel = new ReliableChannel(transport);
    this.prediction = new PredictionSystem(
      options.initialState ?? {},
      options.reducer ?? ((state) => state),
    );
  }

  sendInput(fields: Record<string, number>): number {
    this.seq += 1;
    this.stats.sent += 1;
    this.channel.send(encodeFrame({ type: "input", seq: this.seq, fields }));
    return this.seq;
  }

  tick(renderTick?: number): void {
    this.channel.tick();
    for (const raw of this.channel.receive()) {
      const frame = decodeFrame(raw);
      if (frame.type !== "snapshot") continue;
      this.stats.received += 1;
      this.latestSnapshot = frame.snapshot;
      for (const [id, state] of Object.entries(frame.snapshot.entities)) {
        let interpolator = this.interpolators.get(id);
        if (!interpolator) {
          interpolator = new InterpolationSystem({ delayTicks: 2 });
          this.interpolators.set(id, interpolator);
        }
        interpolator.push(frame.snapshot.tick, state);
      }
    }
    if (renderTick !== undefined && this.latestSnapshot) {
      for (const interpolator of this.interpolators.values()) interpolator.sample(renderTick);
    }
  }

  interpolationFor(id: string): InterpolationSystem | null {
    return this.interpolators.get(id) ?? null;
  }

  get latest(): Snapshot | null {
    return this.latestSnapshot ? {
      tick: this.latestSnapshot.tick,
      entities: { ...this.latestSnapshot.entities },
    } : null;
  }
}

export const NETWORKING_VERSION = "0.95.0";
