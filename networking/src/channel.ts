import { Reader, Writer } from "./serializer.js";

export type ChannelMode = "reliable" | "unreliable" | "sequenced";

export interface ChannelStats {
  sent: number;
  received: number;
  dropped: number;
  resent: number;
  duplicated: number;
}

function emptyStats(): ChannelStats {
  return { sent: 0, received: 0, dropped: 0, resent: 0, duplicated: 0 };
}

export class UnreliableChannel {
  readonly mode: ChannelMode = "unreliable";
  #stats = emptyStats();
  #deliver: (payload: Uint8Array) => void;

  constructor(deliver: (payload: Uint8Array) => void = () => undefined) {
    this.#deliver = deliver;
  }

  get stats(): ChannelStats {
    return { ...this.#stats };
  }

  setDeliver(deliver: (payload: Uint8Array) => void): void {
    this.#deliver = deliver;
  }

  send(payload: Uint8Array): void {
    this.#stats.sent += 1;
    this.#deliver(payload);
  }

  receive(payload: Uint8Array): Uint8Array {
    this.#stats.received += 1;
    return payload;
  }
}

export class SequencedChannel {
  readonly mode: ChannelMode = "sequenced";
  #outgoing = 0;
  #incoming = -1;
  #stats = emptyStats();
  #deliver: (payload: Uint8Array) => void;

  constructor(deliver: (payload: Uint8Array) => void = () => undefined) {
    this.#deliver = deliver;
  }

  get stats(): ChannelStats {
    return { ...this.#stats };
  }

  setDeliver(deliver: (payload: Uint8Array) => void): void {
    this.#deliver = deliver;
  }

  send(payload: Uint8Array): void {
    const writer = new Writer().u16(this.#outgoing).bytes(payload);
    this.#outgoing = (this.#outgoing + 1) & 0xffff;
    this.#stats.sent += 1;
    this.#deliver(writer.finish());
  }

  receive(packet: Uint8Array): Uint8Array | null {
    const reader = new Reader(packet);
    const sequence = reader.u16();
    const payload = reader.bytes();
    if (sequence <= this.#incoming) {
      this.#stats.dropped += 1;
      return null;
    }
    this.#incoming = sequence;
    this.#stats.received += 1;
    return payload;
  }
}

export interface ResendConfig {
  resendIntervalMs: number;
  maxResends: number;
}

export class ReliableStream {
  readonly mode: ChannelMode = "reliable";
  #config: ResendConfig;
  #outgoing = 0;
  #incoming = 0;
  #pending = new Map<number, { payload: Uint8Array; lastSent: number; resends: number }>();
  #received = new Map<number, Uint8Array>();
  #stats = emptyStats();
  #deliver: (packet: Uint8Array) => void;
  #now: () => number;

  constructor(deliver: (packet: Uint8Array) => void = () => undefined, config: Partial<ResendConfig> = {}, now: () => number = () => performance.now()) {
    this.#deliver = deliver;
    this.#config = { resendIntervalMs: config.resendIntervalMs ?? 80, maxResends: config.maxResends ?? 24 };
    this.#now = now;
  }

  get stats(): ChannelStats {
    return { ...this.#stats };
  }

  setDeliver(deliver: (packet: Uint8Array) => void): void {
    this.#deliver = deliver;
  }

  #frame(kind: number, sequence: number, payload: Uint8Array): Uint8Array {
    return new Writer().u8(kind).u16(sequence).bytes(payload).finish();
  }

  send(payload: Uint8Array): number {
    const sequence = this.#outgoing;
    this.#outgoing = (this.#outgoing + 1) & 0xffff;
    this.#pending.set(sequence, { payload, lastSent: this.#now(), resends: 0 });
    this.#deliver(this.#frame(1, sequence, payload));
    this.#stats.sent += 1;
    return sequence;
  }

  flush(now: number = this.#now()): void {
    for (const [sequence, entry] of this.#pending) {
      if (now - entry.lastSent < this.#config.resendIntervalMs) continue;
      if (entry.resends >= this.#config.maxResends) {
        this.#pending.delete(sequence);
        this.#stats.dropped += 1;
        continue;
      }
      entry.lastSent = now;
      entry.resends += 1;
      this.#stats.resent += 1;
      this.#deliver(this.#frame(1, sequence, entry.payload));
    }
  }

  ack(): Uint8Array {
    return this.#frame(2, this.#incoming, new Uint8Array(0));
  }

  receive(packet: Uint8Array): Uint8Array[] {
    const reader = new Reader(packet);
    const kind = reader.u8();
    const sequence = reader.u16();
    const payload = reader.bytes();
    if (kind === 2) {
      this.#pending.delete(sequence);
      return [];
    }
    if (sequence < this.#incoming && (this.#incoming - sequence) < 0x8000) {
      this.#stats.duplicated += 1;
      return [];
    }
    this.#received.set(sequence, payload);
    const delivered: Uint8Array[] = [];
    while (this.#received.has(this.#incoming)) {
      delivered.push(this.#received.get(this.#incoming)!);
      this.#received.delete(this.#incoming);
      this.#incoming = (this.#incoming + 1) & 0xffff;
      this.#stats.received += 1;
    }
    this.#deliver(this.ack());
    return delivered;
  }

  get pendingCount(): number {
    return this.#pending.size;
  }
}
