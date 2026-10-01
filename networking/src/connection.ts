import { Reader, Writer } from "./serializer.js";
import type { Address, Datagram, DatagramTransport } from "./socket.js";
import { addressKey } from "./socket.js";

export type ConnectionState = "connecting" | "open" | "closing" | "closed";

export interface ConnectionEvents {
  onOpen?: (connection: Connection) => void;
  onClose?: (connection: Connection) => void;
  onData?: (connection: Connection, payload: Uint8Array) => void;
}

const HANDSHAKE_HELLO = 1;
const HANDSHAKE_WELCOME = 2;
const HANDSHAKE_HEARTBEAT = 3;
const HANDSHAKE_DATA = 4;
const HANDSHAKE_CLOSE = 5;

export class Connection {
  readonly remote: Address;
  #transport: DatagramTransport;
  #state: ConnectionState = "connecting";
  #events: ConnectionEvents;
  #rtt = 0;
  #heartbeats = 0;
  #invalid = 0;
  #lastHeartbeat = 0;
  #now: () => number;

  constructor(transport: DatagramTransport, remote: Address, events: ConnectionEvents = {}, now: () => number = () => performance.now()) {
    this.#transport = transport;
    this.remote = remote;
    this.#events = events;
    this.#now = now;
    transport.onReceive((datagram) => this.#handle(datagram));
  }

  get state(): ConnectionState {
    return this.#state;
  }

  get rtt(): number {
    return this.#rtt;
  }

  get heartbeats(): number {
    return this.#heartbeats;
  }

  get invalidPackets(): number {
    return this.#invalid;
  }

  #sendPacket(kind: number, payload: Uint8Array = new Uint8Array(0)): void {
    const packet = new Writer().u8(kind).f64(this.#now()).bytes(payload).finish();
    void this.#transport.send(this.remote, packet);
  }

  #handle(datagram: Datagram): void {
    if (addressKey(datagram.from) !== addressKey(this.remote)) return;
    let kind = 0;
    let stamp = 0;
    let payload: Uint8Array = new Uint8Array(0);
    try {
      const reader = new Reader(datagram.payload);
      kind = reader.u8();
      stamp = reader.f64();
      payload = reader.bytes();
    } catch {
      this.#invalid += 1;
      return;
    }
    if (kind === HANDSHAKE_HELLO && this.#state === "connecting") {
      this.#sendPacket(HANDSHAKE_WELCOME);
      this.#state = "open";
      this.#events.onOpen?.(this);
      return;
    }
    if (kind === HANDSHAKE_WELCOME && this.#state === "connecting") {
      this.#state = "open";
      this.#events.onOpen?.(this);
      return;
    }
    if (kind === HANDSHAKE_HEARTBEAT) {
      this.#rtt = this.#now() - stamp;
      this.#heartbeats += 1;
      this.#lastHeartbeat = this.#now();
      return;
    }
    if (kind === HANDSHAKE_DATA) {
      this.#events.onData?.(this, payload);
      return;
    }
    if (kind === HANDSHAKE_CLOSE) {
      this.#state = "closed";
      this.#events.onClose?.(this);
    }
  }

  connect(): void {
    if (this.#state !== "connecting") return;
    this.#sendPacket(HANDSHAKE_HELLO);
  }

  accept(): void {
    if (this.#state !== "connecting") return;
    this.#sendPacket(HANDSHAKE_WELCOME);
    this.#state = "open";
    this.#events.onOpen?.(this);
  }

  heartbeat(): void {
    if (this.#state !== "open") return;
    this.#sendPacket(HANDSHAKE_HEARTBEAT);
  }

  send(payload: Uint8Array): void {
    if (this.#state !== "open") return;
    this.#sendPacket(HANDSHAKE_DATA, payload);
  }

  close(): void {
    if (this.#state === "closed") return;
    this.#sendPacket(HANDSHAKE_CLOSE);
    this.#state = "closed";
    this.#events.onClose?.(this);
  }

  idleForMs(now: number = this.#now()): number {
    return now - this.#lastHeartbeat;
  }
}
