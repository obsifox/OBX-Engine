import { describe, expect, it } from "vitest";
import {
  GameClient,
  GameServer,
  InterpolationSystem,
  InterestManagement,
  LagCompensation,
  MemoryNetwork,
  PACKET_MAGIC,
  PredictionSystem,
  ReliableChannel,
  ReplicationClient,
  ReplicationSystem,
  RpcSystem,
  createTransport,
  decodePacket,
  encodeFrame,
  encodePacket,
  protocolProfiles,
  type EntityState,
} from "../src/index.js";

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function read(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

describe("protocol profiles", () => {
  it("describes each transport kind", () => {
    expect(protocolProfiles.tcp.ordered).toBe(true);
    expect(protocolProfiles.tcp.reliable).toBe(true);
    expect(protocolProfiles.udp.reliable).toBe(false);
    expect(protocolProfiles.udp.ordered).toBe(false);
    expect(protocolProfiles.websocket.framed).toBe(true);
    expect(protocolProfiles.webrtc.reliable).toBe(false);
    const network = new MemoryNetwork();
    const [a, b] = createTransport("udp", network, { dropRate: 0, latencyTicks: 1 });
    a.send(text("ping"));
    a.send(text("pong"));
    network.step(2);
    expect(b.poll().map((payload) => read(payload))).toEqual(["ping", "pong"]);
    a.close();
    expect(a.connected).toBe(false);
  });
});

describe("MemoryNetwork", () => {
  it("delivers with latency and drops deterministically", () => {
    const network = new MemoryNetwork();
    const [a, b] = network.createPair({ latencyTicks: 2, dropRate: 0.5, seed: 7 });
    for (let index = 0; index < 10; index += 1) a.send(text(`m${index}`));
    network.step(1);
    expect(b.poll()).toEqual([]);
    network.step(2);
    const delivered = b.poll();
    expect(delivered.length).toBeLessThan(10);
    expect(delivered.length).toBeGreaterThan(0);
    expect(network.now).toBe(3);
    expect(network.pendingPackets).toBe(0);
    expect(a.stats.sent).toBe(10);
    expect(a.stats.dropped).toBe(10 - delivered.length);
  });
});

describe("packet codec", () => {
  it("roundtrips header and payload", () => {
    const packet = { channel: 3, sequence: 42, kind: 0, payload: text("hello") };
    const decoded = decodePacket(encodePacket(packet));
    expect(decoded.channel).toBe(3);
    expect(decoded.sequence).toBe(42);
    expect(read(decoded.payload)).toBe("hello");
  });

  it("rejects malformed packets", () => {
    expect(() => decodePacket(new Uint8Array(4))).toThrow(RangeError);
    const bad = encodePacket({ channel: 0, sequence: 1, kind: 0, payload: text("x") });
    bad[0] = 0;
    expect(() => decodePacket(bad)).toThrow(RangeError);
    const broken = encodePacket({ channel: 0, sequence: 1, kind: 0, payload: text("xy") });
    expect(() => decodePacket(broken.slice(0, broken.length - 1))).toThrow(RangeError);
    expect(PACKET_MAGIC).toBe(0x4f42);
  });
});

describe("ReliableChannel", () => {
  it("delivers ordered across loss via retransmission", () => {
    const network = new MemoryNetwork();
    const [a, b] = network.createPair({ dropRate: 0.35, seed: 11 });
    const left = new ReliableChannel(a, { resendTicks: 2, maxRetries: 20, ordered: true, channel: 0 });
    const right = new ReliableChannel(b, { resendTicks: 2, maxRetries: 20, ordered: true, channel: 0 });
    for (let index = 0; index < 8; index += 1) left.send(text(`msg-${index}`));
    const received: string[] = [];
    for (let step = 0; step < 60; step += 1) {
      network.step(1);
      left.tick();
      right.tick();
      for (const payload of right.receive()) received.push(read(payload));
    }
    expect(received).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => `msg-${n}`));
    expect(left.stats.retransmitted).toBeGreaterThan(0);
    expect(left.pending).toBe(0);
    expect(right.buffered).toBe(0);
  });

  it("drops packets that never arrive", () => {
    const network = new MemoryNetwork();
    const [a] = network.createPair({ dropRate: 1, seed: 2 });
    const channel = new ReliableChannel(a, { resendTicks: 1, maxRetries: 3, ordered: true, channel: 0 });
    channel.send(text("lost"));
    for (let step = 0; step < 10; step += 1) {
      network.step(1);
      channel.tick();
    }
    expect(channel.stats.lost).toBe(1);
    expect(channel.pending).toBe(0);
  });
});

describe("RpcSystem", () => {
  it("routes requests and responses", () => {
    const network = new MemoryNetwork();
    const [a, b] = network.createPair();
    const client = new RpcSystem(new ReliableChannel(a), { timeoutTicks: 20 });
    const serverSide = new RpcSystem(new ReliableChannel(b));
    serverSide.register("add", (payload) => String(Number(payload) + 1));
    const id = client.call("add", "41");
    for (let step = 0; step < 4; step += 1) {
      network.step(1);
      client.tick();
      serverSide.tick();
    }
    const results = client.poll();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id, method: "add", ok: true, value: "42" });
    expect(client.stats.responses).toBe(1);
    expect(client.pending).toBe(0);
  });

  it("fails unknown methods and times out", () => {
    const network = new MemoryNetwork();
    const [a, b] = network.createPair();
    const client = new RpcSystem(new ReliableChannel(a), { timeoutTicks: 3 });
    const serverSide = new RpcSystem(new ReliableChannel(b));
    client.call("missing");
    for (let step = 0; step < 6; step += 1) {
      network.step(1);
      client.tick();
      serverSide.tick();
    }
    const failed = client.poll();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ ok: false, value: "unknown method" });

    const solo = new MemoryNetwork();
    const [x, y] = solo.createPair();
    y.close();
    const lonely = new RpcSystem(new ReliableChannel(x), { timeoutTicks: 3 });
    lonely.call("slow");
    for (let step = 0; step < 8; step += 1) {
      solo.step(1);
      lonely.tick();
    }
    const timed = lonely.poll();
    expect(timed).toHaveLength(1);
    expect(timed[0]).toMatchObject({ ok: false, value: "timeout" });
    expect(lonely.stats.failed).toBe(1);
  });
});

describe("replication", () => {
  it("tracks patches and applies snapshots", () => {
    const server = new ReplicationSystem();
    server.track("hero", { x: 0, y: 0, hp: 100 });
    server.patch("hero", { hp: 80 });
    server.track("crate", { x: 9, y: 9 });
    const snapshot = server.snapshot(5);
    expect(snapshot.entities.hero!.hp).toBe(80);
    const client = new ReplicationClient();
    client.apply(snapshot);
    client.apply({ tick: 1, entities: { hero: { x: -5, y: -5, hp: 1 } } });
    expect(client.state("hero")!.hp).toBe(80);
    expect(client.lastTick).toBe(5);
    expect(client.ids().sort()).toEqual(["crate", "hero"]);
    expect(() => server.patch("ghost", { x: 1 })).toThrow(RangeError);
    expect(server.untrack("crate")).toBe(true);
    expect(server.count).toBe(1);
  });
});

describe("prediction", () => {
  it("replays unacked inputs after correction", () => {
    const mover: (state: EntityState, input: { seq: number; fields: Record<string, number> }) => EntityState =
      (state, input) => ({ x: (state.x as number) + (input.fields.dx ?? 0), y: state.y as number });
    const prediction = new PredictionSystem({ x: 0, y: 0 }, mover);
    prediction.predict({ seq: 1, fields: { dx: 1 } });
    prediction.predict({ seq: 2, fields: { dx: 1 } });
    prediction.predict({ seq: 3, fields: { dx: 5 } });
    expect(prediction.predicted.x).toBe(7);
    prediction.correct({ x: 1, y: 0 }, 2);
    expect(prediction.predicted.x).toBe(6);
    expect(prediction.pendingInputs).toBe(1);
  });
});

describe("interpolation", () => {
  it("lerps between buffered states", () => {
    const interpolation = new InterpolationSystem();
    interpolation.push(10, { x: 0, y: 0 });
    interpolation.push(20, { x: 10, y: 5 });
    expect(interpolation.sample(15)).toEqual({ x: 5, y: 2.5 });
    expect(interpolation.sample(5)!.x).toBe(0);
    expect(interpolation.sample(99)!.x).toBe(10);
    expect(interpolation.buffered).toBe(2);
  });
});

describe("lag compensation", () => {
  it("rewinds to historical states", () => {
    const lag = new LagCompensation({ historyTicks: 8 });
    lag.record(1, { hero: { x: 0 } });
    lag.record(4, { hero: { x: 4 } });
    lag.record(8, { hero: { x: 8 } });
    expect(lag.rewind(5)!.hero!.x).toBe(4);
    expect(lag.rewind(8)!.hero!.x).toBe(8);
    expect(lag.rewind(0)).toBeNull();
    expect(lag.depth).toBe(3);
  });
});

describe("interest management", () => {
  it("filters entities by radius", () => {
    const interest = new InterestManagement(10);
    expect(interest.visible({ x: 0, y: 0 }, { x: 6, y: 8 })).toBe(true);
    expect(interest.visible({ x: 0, y: 0 }, { x: 30, y: 0 })).toBe(false);
    const ids = interest.filter({ x: 0, y: 0 }, {
      near: { x: 3, y: 4 },
      far: { x: 40, y: 0 },
      edge: { x: 6, y: 8 },
    });
    expect(ids.sort()).toEqual(["edge", "near"]);
  });
});

describe("client/server architecture", () => {
  it("syncs authoritative state to clients", () => {
    const network = new MemoryNetwork();
    const [clientWire, serverWire] = network.createPair();
    const reducer = (state: EntityState, input: { seq: number; fields: Record<string, number> }): EntityState => ({
      ...state,
      x: (state.x as number) + (input.fields.dx ?? 0),
      y: (state.y as number) + (input.fields.dy ?? 0),
    });
    const server = new GameServer({ reducer, interestRadius: 25 });
    server.replication.track("hero", { x: 0, y: 0, hp: 100 });
    server.replication.track("far-npc", { x: 90, y: 90 });
    server.addClient("hero", serverWire);
    const client = new GameClient(clientWire, {
      initialState: { x: 0, y: 0, hp: 100 },
      reducer,
    });
    client.sendInput({ dx: 2, dy: 1, owner: 0 });
    client.sendInput({ dx: 2, dy: 1, owner: 0 });
    server.tick();
    server.tick();
    client.tick();
    expect(server.stats.inputs).toBe(2);
    const state = server.replication.state("hero")!;
    expect(state.x).toBe(4);
    expect(state.y).toBe(2);
    const latest = client.latest!;
    expect(latest.entities.hero!.x).toBe(4);
    expect(latest.entities["far-npc"]).toBeUndefined();
    expect(server.lagCompensation.rewind(server.tickCount)!.hero!.x).toBe(4);
    server.removeClient("hero");
    expect(server.clients).toEqual([]);
  });

  it("rejects duplicate clients", () => {
    const network = new MemoryNetwork();
    const [a, b] = network.createPair();
    const server = new GameServer();
    server.addClient("c1", a);
    expect(() => server.addClient("c1", b)).toThrow(RangeError);
    expect(encodeFrame({ type: "input", seq: 1, fields: { dx: 1 } }).length).toBeGreaterThan(0);
    expect(server.tickCount).toBe(0);
  });
});
