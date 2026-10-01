import { describe, expect, it } from "vitest";
import {
  Connection,
  InMemoryDatagramTransport,
  InMemoryNetwork,
  InterpolationBuffer,
  NetworkClock,
  Reader,
  ReliableStream,
  SequencedChannel,
  SerializerError,
  UnreliableChannel,
  Writer,
  decodeVarint,
  encodeVarint,
  addressKey,
  DatagramSocket,
} from "../src/index.js";

const alpha = { host: "127.0.0.1", port: 1001 };
const beta = { host: "127.0.0.1", port: 1002 };

describe("serializer", () => {
  it("round trips primitive fields", () => {
    const bytes = new Writer()
      .u8(200)
      .u16(65500)
      .u32(4_000_000_000)
      .varint(300)
      .f32(1.5)
      .f64(-2.25)
      .bool(true)
      .string("سلام")
      .bytes(new Uint8Array([9, 8, 7]))
      .finish();
    const reader = new Reader(bytes);
    expect(reader.u8()).toBe(200);
    expect(reader.u16()).toBe(65500);
    expect(reader.u32()).toBe(4_000_000_000);
    expect(reader.varint()).toBe(300);
    expect(reader.f32()).toBeCloseTo(1.5, 5);
    expect(reader.f64()).toBeCloseTo(-2.25, 5);
    expect(reader.bool()).toBe(true);
    expect(reader.string()).toBe("سلام");
    expect(Array.from(reader.bytes())).toEqual([9, 8, 7]);
    expect(reader.remaining).toBe(0);
  });

  it("encodes varints compactly", () => {
    expect(Array.from(encodeVarint(0))).toEqual([0]);
    expect(Array.from(encodeVarint(127))).toEqual([127]);
    expect(Array.from(encodeVarint(128))).toEqual([0x80, 1]);
    expect(decodeVarint(encodeVarint(300))).toBe(300);
    expect(decodeVarint(encodeVarint(0xffffffff))).toBe(0xffffffff);
  });

  it("rejects truncated buffers", () => {
    expect(() => new Reader(new Uint8Array([1])).u32()).toThrow(SerializerError);
    expect(() => new Reader(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80])).varint()).toThrow(SerializerError);
  });
});

describe("channels", () => {
  it("passes unreliable payloads through", () => {
    const received: Uint8Array[] = [];
    const channel = new UnreliableChannel((payload) => received.push(payload));
    channel.send(new Uint8Array([1, 2]));
    expect(channel.receive(received[0]!)).toEqual(new Uint8Array([1, 2]));
    expect(channel.stats.sent).toBe(1);
    expect(channel.stats.received).toBe(1);
  });

  it("drops stale sequenced packets", () => {
    const wire: Uint8Array[] = [];
    const sender = new SequencedChannel((packet) => wire.push(packet));
    sender.send(new Uint8Array([1]));
    sender.send(new Uint8Array([2]));
    const receiver = new SequencedChannel();
    expect(receiver.receive(wire[1]!)).toEqual(new Uint8Array([2]));
    expect(receiver.receive(wire[0]!)).toBeNull();
    expect(receiver.stats.dropped).toBe(1);
  });

  it("reorders and delivers reliable streams exactly once", () => {
    const wire: Uint8Array[] = [];
    let clock = 0;
    const sender = new ReliableStream((packet) => wire.push(packet), { resendIntervalMs: 10 }, () => clock);
    const receiver = new ReliableStream();
    sender.send(new Uint8Array([1]));
    sender.send(new Uint8Array([2]));
    sender.send(new Uint8Array([3]));
    const outOfOrder = [wire[2]!, wire[0]!, wire[1]!];
    const delivered: number[][] = [];
    for (const packet of outOfOrder) {
      for (const payload of receiver.receive(packet)) delivered.push(Array.from(payload));
    }
    expect(delivered).toEqual([[1], [2], [3]]);
    expect(sender.stats.sent).toBe(3);
  });

  it("resends unacknowledged packets and drops after max", () => {
    const wire: Uint8Array[] = [];
    let clock = 0;
    const sender = new ReliableStream((packet) => wire.push(packet), { resendIntervalMs: 5, maxResends: 2 }, () => clock);
    sender.send(new Uint8Array([9]));
    clock = 10;
    sender.flush(clock);
    expect(sender.stats.resent).toBe(1);
    clock = 20;
    sender.flush(clock);
    clock = 30;
    sender.flush(clock);
    expect(sender.stats.dropped).toBe(1);
    expect(sender.pendingCount).toBe(0);
  });
});

describe("clock and interpolation", () => {
  it("estimates server time from rtt samples", () => {
    const clock = new NetworkClock(50);
    const rtt = clock.syncFromRtt(100, 110, 112, 124);
    expect(rtt).toBe(24);
    expect(clock.estimateServerTime(200)).toBeCloseTo(199, 5);
    expect(clock.tickInterval).toBeCloseTo(20, 5);
    expect(clock.tickNumber(1000)).toBeGreaterThan(0);
    clock.reset();
    expect(clock.offset).toBe(0);
  });

  it("interpolates buffered snapshots with delay", () => {
    const buffer = new InterpolationBuffer<{ x: number }>(50);
    buffer.push(100, { x: 0 });
    buffer.push(200, { x: 10 });
    const sample = buffer.sample(200, (a, b, t) => ({ x: a.x + (b.x - a.x) * t }));
    expect(sample!.x).toBeCloseTo(5, 5);
    expect(buffer.sample(50, (a) => a)!.x).toBe(0);
    expect(buffer.sample(999, (a) => a)!.x).toBe(10);
    buffer.prune(150);
    expect(buffer.size).toBe(1);
  });
});

describe("memory transport and connections", () => {
  it("routes datagrams between endpoints", async () => {
    const network = new InMemoryNetwork();
    const a = new InMemoryDatagramTransport(network, alpha);
    const b = new InMemoryDatagramTransport(network, beta);
    const seen: string[] = [];
    await a.open();
    await b.open();
    b.onReceive((datagram) => seen.push(new TextDecoder().decode(datagram.payload)));
    await a.send(beta, new TextEncoder().encode("ping"));
    expect(seen).toEqual(["ping"]);
    expect(network.delivered).toBe(1);
    expect(addressKey(alpha)).toBe("127.0.0.1:1001");
    await a.close();
    await b.close();
    expect(network.delivered).toBe(1);
  });

  it("drops packets by deterministic drop rate", async () => {
    const network = new InMemoryNetwork();
    let toggle = 0;
    const a = new InMemoryDatagramTransport(network, alpha, () => (toggle += 0.3) % 1);
    const b = new InMemoryDatagramTransport(network, beta, () => 0.5);
    await a.open();
    await b.open();
    network.setDropRate(0.5);
    let received = 0;
    b.onReceive(() => (received += 1));
    for (let i = 0; i < 6; i += 1) await a.send(beta, new Uint8Array([i]));
    expect(received).toBeGreaterThan(0);
    expect(network.dropped).toBeGreaterThan(0);
    expect(received + network.dropped).toBe(6);
    await a.close();
    await b.close();
  });

  it("handshakes, heartbeats and closes connections", async () => {
    const network = new InMemoryNetwork();
    const transportA = new InMemoryDatagramTransport(network, alpha);
    const transportB = new InMemoryDatagramTransport(network, beta);
    await transportA.open();
    await transportB.open();
    let serverOpen = 0;
    let clientOpen = 0;
    const client = new Connection(transportA, beta, { onOpen: () => (clientOpen += 1) }, () => 1000);
    const server = new Connection(transportB, alpha, { onOpen: () => (serverOpen += 1) }, () => 1000);
    server.accept();
    client.connect();
    expect(client.state).toBe("open");
    expect(server.state).toBe("open");
    expect(clientOpen + serverOpen).toBe(2);
    const payloads: string[] = [];
    server.accept();
    const chat = new Connection(transportB, alpha, { onData: (_c, payload) => payloads.push(new TextDecoder().decode(payload)) }, () => 1000);
    void chat;
    client.send(new TextEncoder().encode("hello"));
    client.heartbeat();
    expect(client.heartbeats).toBe(0);
    client.close();
    expect(client.state).toBe("closed");
    await transportA.close();
    await transportB.close();
  });

  it("wraps transports in datagram sockets", async () => {
    const network = new InMemoryNetwork();
    const transport = new InMemoryDatagramTransport(network, alpha);
    const socket = new DatagramSocket(transport);
    await socket.open();
    const seen: Uint8Array[] = [];
    socket.onDatagram((datagram) => seen.push(datagram.payload));
    const other = new InMemoryDatagramTransport(network, beta);
    await other.open();
    await other.send(alpha, new Uint8Array([5]));
    expect(seen[0]).toEqual(new Uint8Array([5]));
    expect(socket.localAddress).toEqual(alpha);
    await socket.close();
    await other.close();
  });
});
