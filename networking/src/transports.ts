import type { Address, Datagram, DatagramTransport } from "./socket.js";
import { addressKey } from "./socket.js";
import { sha1 } from "./crypto.js";

export class InMemoryNetwork {
  #endpoints = new Map<string, InMemoryDatagramTransport>();
  #delivered = 0;
  #dropped = 0;
  #dropRate = 0;

  get delivered(): number {
    return this.#delivered;
  }

  get dropped(): number {
    return this.#dropped;
  }

  setDropRate(rate: number): void {
    this.#dropRate = Math.max(0, Math.min(1, rate));
  }

  register(transport: InMemoryDatagramTransport): void {
    const key = addressKey(transport.localAddress!);
    if (this.#endpoints.has(key)) throw new Error(`address in use: ${key}`);
    this.#endpoints.set(key, transport);
  }

  unregister(transport: InMemoryDatagramTransport): void {
    this.#endpoints.delete(addressKey(transport.localAddress!));
  }

  route(from: Address, to: Address, payload: Uint8Array, deterministic: () => number): boolean {
    if (this.#dropRate > 0 && deterministic() < this.#dropRate) {
      this.#dropped += 1;
      return false;
    }
    const target = this.#endpoints.get(addressKey(to));
    if (!target) {
      this.#dropped += 1;
      return false;
    }
    this.#delivered += 1;
    target.receiveFrom({ from, to, payload });
    return true;
  }
}

export class InMemoryDatagramTransport implements DatagramTransport {
  readonly kind = "memory";
  readonly localAddress: Address;
  #network: InMemoryNetwork;
  #handlers: ((datagram: Datagram) => void)[] = [];
  #open = false;
  #deterministic: () => number;

  constructor(network: InMemoryNetwork, local: Address, deterministic: () => number = () => 0.5) {
    this.#network = network;
    this.localAddress = local;
    this.#deterministic = deterministic;
  }

  async open(): Promise<void> {
    this.#open = true;
    this.#network.register(this);
  }

  async send(to: Address, payload: Uint8Array): Promise<void> {
    if (!this.#open) return;
    this.#network.route(this.localAddress, to, payload.slice(), this.#deterministic);
  }

  async close(): Promise<void> {
    this.#open = false;
    this.#network.unregister(this);
    this.#handlers = [];
  }

  onReceive(handler: (datagram: Datagram) => void): void {
    this.#handlers.push(handler);
  }

  receiveFrom(datagram: Datagram): void {
    for (const handler of this.#handlers) handler(datagram);
  }
}

export class NodeUdpTransport implements DatagramTransport {
  readonly kind = "udp";
  localAddress: Address | null = null;
  #bind: Address;
  #socket: import("node:dgram").Socket | null = null;
  #handlers: ((datagram: Datagram) => void)[] = [];

  constructor(bind: Address) {
    this.#bind = bind;
  }

  async open(): Promise<void> {
    const dgram = await import("node:dgram");
    const socket = dgram.createSocket("udp4");
    this.#socket = socket;
    socket.on("message", (message, remote) => {
      const datagram: Datagram = {
        from: { host: remote.address, port: remote.port },
        to: this.localAddress!,
        payload: new Uint8Array(message),
      };
      for (const handler of this.#handlers) handler(datagram);
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(this.#bind.port, this.#bind.host, () => {
        const address = socket.address();
        this.localAddress = { host: address.address, port: address.port };
        resolve();
      });
    });
  }

  async send(to: Address, payload: Uint8Array): Promise<void> {
    if (!this.#socket) return;
    await new Promise<void>((resolve) => {
      this.#socket!.send(Buffer.from(payload), to.port, to.host, () => resolve());
    });
  }

  async close(): Promise<void> {
    const socket = this.#socket;
    this.#socket = null;
    this.#handlers = [];
    if (!socket) return;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }

  onReceive(handler: (datagram: Datagram) => void): void {
    this.#handlers.push(handler);
  }
}

export function encodeStreamFrame(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + payload.length);
  new DataView(out.buffer).setUint32(0, payload.length, false);
  out.set(payload, 4);
  return out;
}

export class StreamFrameDecoder {
  #buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    const merged = new Uint8Array(this.#buffer.length + chunk.length);
    merged.set(this.#buffer);
    merged.set(chunk, this.#buffer.length);
    this.#buffer = merged;
    const frames: Uint8Array[] = [];
    while (this.#buffer.length >= 4) {
      const view = new DataView(this.#buffer.buffer, this.#buffer.byteOffset, this.#buffer.byteLength);
      const length = view.getUint32(0, false);
      if (this.#buffer.length < 4 + length) break;
      frames.push(this.#buffer.slice(4, 4 + length));
      this.#buffer = this.#buffer.slice(4 + length);
    }
    return frames;
  }
}

export class NodeTcpTransport implements DatagramTransport {
  readonly kind = "tcp";
  localAddress: Address | null = null;
  #remote: Address;
  #socket: import("node:net").Socket | null = null;
  #decoder = new StreamFrameDecoder();
  #handlers: ((datagram: Datagram) => void)[] = [];

  constructor(remote: Address) {
    this.#remote = remote;
  }

  async open(): Promise<void> {
    const net = await import("node:net");
    const socket = net.createConnection({ host: this.#remote.host, port: this.#remote.port });
    this.#socket = socket;
    socket.on("data", (chunk) => {
      for (const frame of this.#decoder.push(new Uint8Array(chunk))) {
        const datagram: Datagram = { from: this.#remote, to: this.localAddress!, payload: frame };
        for (const handler of this.#handlers) handler(datagram);
      }
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.once("connect", () => {
        const address = socket.localAddress ?? "127.0.0.1";
        this.localAddress = { host: address, port: socket.localPort ?? 0 };
        resolve();
      });
    });
  }

  async send(to: Address, payload: Uint8Array): Promise<void> {
    if (!this.#socket) return;
    this.#socket.write(Buffer.from(encodeStreamFrame(payload)));
  }

  async close(): Promise<void> {
    const socket = this.#socket;
    this.#socket = null;
    this.#handlers = [];
    if (!socket) return;
    await new Promise<void>((resolve) => socket.end(() => resolve()));
  }

  onReceive(handler: (datagram: Datagram) => void): void {
    this.#handlers.push(handler);
  }
}

export class TcpListener {
  #server: import("node:net").Server | null = null;
  #sockets = new Set<import("node:net").Socket>();

  async listen(port: number, host: string, onFrame: (from: Address, payload: Uint8Array, reply: (payload: Uint8Array) => void) => void): Promise<Address> {
    const net = await import("node:net");
    const server = net.createServer((socket) => {
      this.#sockets.add(socket);
      const decoder = new StreamFrameDecoder();
      const from: Address = { host: socket.remoteAddress ?? "127.0.0.1", port: socket.remotePort ?? 0 };
      socket.on("data", (chunk) => {
        for (const frame of decoder.push(new Uint8Array(chunk))) {
          onFrame(from, frame, (payload) => socket.write(Buffer.from(encodeStreamFrame(payload))));
        }
      });
      socket.on("close", () => this.#sockets.delete(socket));
    });
    this.#server = server;
    await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
    const address = server.address();
    if (address && typeof address === "object") return { host: address.address, port: address.port };
    return { host, port };
  }

  async close(): Promise<void> {
    for (const socket of this.#sockets) socket.destroy();
    this.#sockets.clear();
    const server = this.#server;
    this.#server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function websocketAcceptKey(key: string): string {
  return btoa(String.fromCharCode(...sha1(new TextEncoder().encode(key + WS_GUID))));
}

export function encodeWebSocketFrame(payload: Uint8Array, masked = false, opcode = 2): Uint8Array {
  const length = payload.length;
  const extended = length > 125 ? (length > 65535 ? 8 : 2) : 0;
  const maskBytes = masked ? 4 : 0;
  const frame = new Uint8Array(2 + extended + maskBytes + length);
  frame[0] = 0x80 | opcode;
  const maskBit = masked ? 0x80 : 0;
  if (length <= 125) {
    frame[1] = maskBit | length;
  } else if (length <= 65535) {
    frame[1] = maskBit | 126;
    new DataView(frame.buffer).setUint16(2, length, false);
  } else {
    frame[1] = maskBit | 127;
    new DataView(frame.buffer).setUint32(2, 0, false);
    new DataView(frame.buffer).setUint32(6, length, false);
  }
  const maskOffset = 2 + extended;
  const payloadOffset = maskOffset + maskBytes;
  if (masked) {
    const mask = [0x1a, 0x2b, 0x3c, 0x4d];
    frame.set(mask, maskOffset);
    for (let i = 0; i < length; i += 1) frame[payloadOffset + i] = payload[i]! ^ mask[i % 4]!;
  } else {
    frame.set(payload, payloadOffset);
  }
  return frame;
}

export function decodeWebSocketFrames(buffer: { data: Uint8Array }): { payload: Uint8Array; rest: Uint8Array } | null {
  const bytes = buffer.data;
  if (bytes.length < 2) return null;
  const masked = (bytes[1]! & 0x80) !== 0;
  let length = bytes[1]! & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (bytes.length < 4) return null;
    length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(2, false);
    offset = 4;
  } else if (length === 127) {
    if (bytes.length < 10) return null;
    length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(6, false);
    offset = 10;
  }
  const maskLength = masked ? 4 : 0;
  if (bytes.length < offset + maskLength + length) return null;
  const payload = new Uint8Array(length);
  const mask = masked ? bytes.slice(offset, offset + 4) : null;
  for (let i = 0; i < length; i += 1) {
    payload[i] = mask ? bytes[offset + maskLength + i]! ^ mask[i % 4]! : bytes[offset + maskLength + i]!;
  }
  return { payload, rest: bytes.slice(offset + maskLength + length) };
}

export class NodeWebSocketTransport implements DatagramTransport {
  readonly kind = "websocket";
  localAddress: Address | null = null;
  #remote: Address;
  #socket: import("node:net").Socket | null = null;
  #buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  #handlers: ((datagram: Datagram) => void)[] = [];
  #handshaken = false;
  #queue: Uint8Array[] = [];

  constructor(remote: Address) {
    this.#remote = remote;
  }

  async open(): Promise<void> {
    const net = await import("node:net");
    const crypto = await import("node:crypto");
    const socket = net.createConnection({ host: this.#remote.host, port: this.#remote.port });
    this.#socket = socket;
    const key = crypto.randomBytes(16).toString("base64");
    socket.on("data", (chunk) => {
      const incoming = new Uint8Array(chunk);
      const merged = new Uint8Array(this.#buffer.length + incoming.length);
      merged.set(this.#buffer);
      merged.set(incoming, this.#buffer.length);
      this.#buffer = merged;
      if (!this.#handshaken) {
        const text = new TextDecoder().decode(this.#buffer);
        const boundary = text.indexOf("\r\n\r\n");
        if (boundary < 0) return;
        const header = text.slice(0, boundary);
        if (!header.includes("101")) throw new Error("websocket handshake rejected");
        this.#buffer = this.#buffer.slice(boundary + 4);
        this.#handshaken = true;
        for (const queued of this.#queue) this.#socket!.write(Buffer.from(encodeWebSocketFrame(queued, true, 2)));
        this.#queue = [];
      }
      let decoded: { payload: Uint8Array; rest: Uint8Array } | null = null;
      while ((decoded = decodeWebSocketFrames({ data: this.#buffer })) !== null) {
        this.#buffer = decoded.rest;
        const datagram: Datagram = { from: this.#remote, to: this.localAddress!, payload: decoded.payload };
        for (const handler of this.#handlers) handler(datagram);
      }
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.once("connect", () => {
        this.localAddress = { host: socket.localAddress ?? "127.0.0.1", port: socket.localPort ?? 0 };
        socket.write(`GET / HTTP/1.1\r\nHost: ${this.#remote.host}:${this.#remote.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
        resolve();
      });
    });
  }

  async send(to: Address, payload: Uint8Array): Promise<void> {
    if (!this.#socket) return;
    if (!this.#handshaken) {
      this.#queue.push(payload);
      return;
    }
    this.#socket.write(Buffer.from(encodeWebSocketFrame(payload, true, 2)));
  }

  async close(): Promise<void> {
    const socket = this.#socket;
    this.#socket = null;
    this.#handlers = [];
    if (!socket) return;
    await new Promise<void>((resolve) => socket.end(() => resolve()));
  }

  onReceive(handler: (datagram: Datagram) => void): void {
    this.#handlers.push(handler);
  }
}

export interface WebRtcPeerDescription {
  sessionDescription: string;
  candidates: string[];
}

export class WebRtcTransport implements DatagramTransport {
  readonly kind = "webrtc";
  localAddress: Address | null = null;
  #handlers: ((datagram: Datagram) => void)[] = [];
  #remote: Address;
  #channel: { send(data: Uint8Array): void; close(): void; onMessage(handler: (data: Uint8Array) => void): void } | null = null;

  constructor(remote: Address) {
    this.#remote = remote;
  }

  async open(): Promise<void> {
    throw new Error("WebRtcTransport requires a platform data-channel provider; use attachChannel in production builds");
  }

  attachChannel(channel: { send(data: Uint8Array): void; close(): void; onMessage(handler: (data: Uint8Array) => void): void }): void {
    this.#channel = channel;
    channel.onMessage((data) => {
      const datagram: Datagram = { from: this.#remote, to: this.localAddress!, payload: data };
      for (const handler of this.#handlers) handler(datagram);
    });
  }

  async send(to: Address, payload: Uint8Array): Promise<void> {
    this.#channel?.send(payload);
  }

  async close(): Promise<void> {
    this.#channel?.close();
    this.#channel = null;
    this.#handlers = [];
  }

  onReceive(handler: (datagram: Datagram) => void): void {
    this.#handlers.push(handler);
  }
}
