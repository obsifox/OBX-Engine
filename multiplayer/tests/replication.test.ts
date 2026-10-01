import { describe, expect, it } from "vitest";
import {
  AuthorityGuard,
  InMemoryDatagramTransport,
  InMemoryNetwork,
  RateLimiter,
  SessionAuthority,
} from "@obx/networking";
import {
  BandwidthBudget,
  DedicatedClient,
  DedicatedServer,
  EntityRegistry,
  OwnershipTracker,
  ReconciliationQueue,
  TrafficProfiler,
  applyDelta,
  decodeComponentDeltas,
  decodeDelta,
  decodeSnapshot,
  encodeComponentDeltas,
  encodeDelta,
  encodeSnapshot,
  snapshotDelta,
} from "../src/index.js";

describe("entity replication", () => {
  it("spawns, patches and destroys network entities", () => {
    const registry = new EntityRegistry();
    const entity = registry.spawn("player", "alice");
    registry.setComponent(entity.netId, "transform", { x: 1, y: 2, hp: 100 });
    registry.patchFields(entity.netId, "transform", { x: 5 });
    const deltas = registry.drainDeltas();
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.fields).toEqual({ x: 5, y: 2, hp: 100 });
    expect(registry.drainDeltas()).toHaveLength(0);
    expect(registry.drainSpawns().map((spawn) => spawn.netId)).toEqual([entity.netId]);
    expect(registry.destroy(entity.netId)).toBe(true);
    expect(registry.drainDespawns()).toEqual([entity.netId]);
    expect(registry.get(entity.netId)).toBeUndefined();
  });

  it("round trips component deltas", () => {
    const encoded = encodeComponentDeltas([
      { netId: 3, component: "health", fields: { hp: 80, dead: false, tag: "boss" } },
    ]);
    const decoded = decodeComponentDeltas(encoded);
    expect(decoded[0]!.netId).toBe(3);
    expect(decoded[0]!.fields.hp).toBe(80);
    expect(decoded[0]!.fields.dead).toBe(false);
    expect(decoded[0]!.fields.tag).toBe("boss");
  });

  it("tracks ownership transfers", () => {
    const ownership = new OwnershipTracker();
    ownership.assign(1, "alice");
    expect(ownership.ownerOf(1)).toBe("alice");
    expect(ownership.ownedBy("alice")).toEqual([1]);
    expect(ownership.transfer(1, "bob", "carol")).toBe(false);
    expect(ownership.transfer(1, "alice", "bob")).toBe(true);
    expect(ownership.ownerOf(1)).toBe("bob");
    ownership.release(1);
    expect(ownership.ownerOf(1)).toBeNull();
  });
});

describe("snapshots and deltas", () => {
  it("computes and applies snapshot deltas", () => {
    const baseline = { tick: 1, entities: { 1: { x: 0, y: 0 }, 2: { x: 5, y: 5 } } };
    const current = { tick: 2, entities: { 1: { x: 3, y: 0 }, 3: { x: 9, y: 9 } } };
    const delta = snapshotDelta(baseline, current);
    expect(delta.changed.map((entry) => entry.netId).sort()).toEqual([1, 3]);
    expect(delta.removed).toEqual([2]);
    const merged = applyDelta(baseline, delta);
    expect(merged.entities[1]).toEqual({ x: 3, y: 0 });
    expect(merged.entities[2]).toBeUndefined();
    expect(merged.tick).toBe(2);
  });

  it("round trips snapshot and delta encodings", () => {
    const snapshot = { tick: 7, entities: { 1: { x: 1.5, y: -2 } } };
    expect(decodeSnapshot(encodeSnapshot(snapshot))).toEqual(snapshot);
    const delta = snapshotDelta({ tick: 6, entities: {} }, snapshot);
    const decoded = decodeDelta(encodeDelta(delta));
    expect(decoded.tick).toBe(7);
    expect(decoded.changed[0]!.fields.x).toBeCloseTo(1.5, 5);
  });

  it("profiles traffic and enforces bandwidth budgets", () => {
    const profiler = new TrafficProfiler();
    profiler.record("rpc", 100);
    profiler.record("rpc", 50);
    profiler.record("snapshot", 300);
    expect(profiler.counters.packets).toBe(3);
    expect(profiler.counters.byKind.rpc).toBe(150);
    expect(profiler.averageBytesPerPacket()).toBeCloseTo(150, 5);
    profiler.reset();
    expect(profiler.counters.bytes).toBe(0);
    const budget = new BandwidthBudget(1000);
    expect(budget.allow(600, 0)).toBe(true);
    expect(budget.allow(600, 0)).toBe(false);
    expect(budget.dropped).toBe(1);
    expect(budget.allow(600, 1200)).toBe(true);
  });

  it("replays unacknowledged prediction frames on reconciliation", () => {
    const queue = new ReconciliationQueue();
    queue.submit({ seq: 1, input: { dx: 1 } });
    queue.submit({ seq: 2, input: { dx: 2 } });
    queue.submit({ seq: 3, input: { dx: 3 } });
    const replay = queue.acknowledge(1);
    expect(replay.map((frame) => frame.seq)).toEqual([2, 3]);
    expect(queue.confirmedSeq).toBe(1);
    expect(queue.pendingCount).toBe(2);
    queue.acknowledge(3);
    expect(queue.pendingCount).toBe(0);
  });
});

describe("dedicated server runtime", () => {
  it("authenticates clients and broadcasts replication", async () => {
    const network = new InMemoryNetwork();
    const server = DedicatedServer.overMemory(network, { host: "127.0.0.1", port: 2001 }, { tickRate: 20 });
    const clientTransport = new InMemoryDatagramTransport(network, { host: "127.0.0.1", port: 2002 });
    const client = new DedicatedClient(clientTransport, { host: "127.0.0.1", port: 2001 }, "alice");
    await server.start();
    await client.start();
    client.authenticate();
    expect(server.clientCount).toBe(1);
    expect(client.stats.tokens).toBe(1);
    expect(client.token).toContain("token:");
    const netId = server.spawnEntity("player", "alice");
    server.entities.setComponent(netId, "transform", { x: 1, y: 2, hp: 100 });
    const delta = server.step(0.05);
    expect(delta!.changed).toHaveLength(1);
    expect(client.inbox.length).toBeGreaterThan(0);
    client.send("hello");
    expect(server.messages[0]!.from).toBe("alice");
    expect(server.profiler.counters.packets).toBeGreaterThan(0);
    expect(server.clock.tickRate).toBe(20);
    await client.stop();
    await server.stop();
  });

  it("rejects invalid inputs with server-side validation", async () => {
    const network = new InMemoryNetwork();
    const server = DedicatedServer.overMemory(network, { host: "127.0.0.1", port: 2101 });
    const clientTransport = new InMemoryDatagramTransport(network, { host: "127.0.0.1", port: 2102 });
    const client = new DedicatedClient(clientTransport, { host: "127.0.0.1", port: 2101 }, "bob");
    await server.start();
    await client.start();
    client.authenticate();
    client.sendInput({ type: "move", seq: -5 });
    expect(client.stats.rejections).toBe(1);
    client.sendInput({ type: "move", seq: 1 });
    expect(client.stats.rejections).toBe(1);
    expect(server.messages).toHaveLength(1);
    await client.stop();
    await server.stop();
  });

  it("applies remote component deltas and enforces auth limits", async () => {
    const network = new InMemoryNetwork();
    const server = DedicatedServer.overMemory(network, { host: "127.0.0.1", port: 2201 }, { maxClients: 1 });
    await server.start();
    const netId = server.spawnEntity("crate", "server");
    const encoded = encodeComponentDeltas([{ netId, component: "transform", fields: { x: 42 } }]);
    const applied = server.applyRemoteDeltas(encoded);
    expect(applied).toHaveLength(1);
    expect(server.entities.get(netId)!.components.get("transform")!.fields.x).toBe(42);
    const guest = new DedicatedClient(new InMemoryDatagramTransport(network, { host: "127.0.0.1", port: 2202 }), { host: "127.0.0.1", port: 2201 }, "guest1");
    const extra = new DedicatedClient(new InMemoryDatagramTransport(network, { host: "127.0.0.1", port: 2203 }), { host: "127.0.0.1", port: 2201 }, "guest2");
    await guest.start();
    await extra.start();
    guest.authenticate();
    extra.authenticate();
    expect(server.clientCount).toBe(1);
    await guest.stop();
    await extra.stop();
    await server.stop();
  });

  it("keeps shared networking security primitives consistent", () => {
    expect(new SessionAuthority(new Uint8Array(32)).activeCount).toBe(0);
    expect(new RateLimiter().allow("k", 0)).toBe(true);
    expect(new AuthorityGuard().levelOf("x")).toBe("client");
  });
});
