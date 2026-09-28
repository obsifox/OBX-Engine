import { describe, expect, it } from "vitest";
import { MemoryNetwork } from "@obx/networking";
import {
  DedicatedServer,
  HeadlessRuntime,
  ServerError,
  ServerLogger,
  ServerMetrics,
  ServerPluginHost,
  ServerScriptHost,
  createServerConfig,
} from "../src/index.js";

describe("server config", () => {
  it("validates and defaults", () => {
    const config = createServerConfig();
    expect(config).toMatchObject({ name: "obx-server", host: "127.0.0.1", port: 7777, tickRate: 20, maxClients: 32 });
    const custom = createServerConfig({ name: "arena", port: 9000, tickRate: 60, maxClients: 4, logLevel: "debug" });
    expect(custom.port).toBe(9000);
    expect(custom.logLevel).toBe("debug");
    expect(() => createServerConfig({ port: 0 })).toThrow(ServerError);
    expect(() => createServerConfig({ port: 70000 })).toThrow(ServerError);
    expect(() => createServerConfig({ tickRate: 500 })).toThrow(ServerError);
    expect(() => createServerConfig({ maxClients: 0 })).toThrow(ServerError);
    expect(() => createServerConfig({ name: "1bad" })).toThrow(ServerError);
    expect(() => createServerConfig({ logLevel: "loud" as never })).toThrow(ServerError);
  });
});

describe("ServerLogger", () => {
  it("filters levels and notifies sinks", () => {
    const logger = new ServerLogger({ level: "info", capacity: 3 });
    const seen: string[] = [];
    logger.attach((entry) => seen.push(entry.level));
    logger.advance();
    logger.log("debug", "hidden");
    logger.log("info", "started");
    logger.log("warn", "careful");
    logger.log("error", "boom");
    expect(logger.filter("all")).toHaveLength(3);
    expect(logger.filter("error")).toHaveLength(1);
    expect(seen).toEqual(["info", "warn", "error"]);
    logger.log("info", "extra");
    expect(logger.entries).toHaveLength(3);
    logger.clear();
    expect(logger.entries).toHaveLength(0);
    logger.setLevel("debug");
    logger.log("debug", "now visible");
    expect(logger.filter("debug")).toHaveLength(1);
  });
});

describe("ServerMetrics", () => {
  it("tracks counters and gauges", () => {
    const metrics = new ServerMetrics();
    metrics.advance();
    metrics.advance();
    metrics.inc("packets", 5);
    metrics.inc("packets");
    metrics.set("clients", 3);
    expect(metrics.get("packets")).toBe(6);
    expect(metrics.get("clients")).toBe(3);
    expect(metrics.uptimeTicks).toBe(2);
    expect(metrics.snapshot()).toMatchObject({ ticks: 2, packets: 6, clients: 3 });
    expect(metrics.get("missing")).toBe(0);
  });
});

describe("ServerPluginHost", () => {
  it("isolates plugin failures", () => {
    const host = new ServerPluginHost();
    const calls: string[] = [];
    host.register({
      id: "good",
      onStart: () => calls.push("good-start"),
      onTick: () => calls.push("good-tick"),
      onMessage: () => "pong",
    });
    host.register({
      id: "bad",
      onStart: () => {
        throw new Error("plugin crash");
      },
    });
    host.start();
    host.tick(1);
    const replies = host.message("c1", "ping");
    expect(calls).toEqual(["good-start", "good-tick"]);
    expect(replies).toEqual(["pong"]);
    expect(host.errorsFor("bad")[0]).toContain("plugin crash");
    expect(host.errorsFor("good")).toEqual([]);
    expect(host.ids().sort()).toEqual(["bad", "good"]);
    expect(host.unregister("bad")).toBe(true);
    expect(() => host.register({ id: "good" })).toThrow(ServerError);
  });
});

describe("ServerScriptHost", () => {
  it("runs enabled scripts only", () => {
    const host = new ServerScriptHost();
    const ran: number[] = [];
    host.register({ id: "ai", onTick: (tick) => ran.push(tick) });
    host.register({ id: "idle" });
    host.disable("ai");
    expect(host.run(1)).toBe(1);
    host.enable("ai");
    expect(host.run(2)).toBe(2);
    expect(ran).toEqual([2]);
    expect(host.list()).toEqual(["ai", "idle"]);
    expect(host.remove("idle")).toBe(true);
    expect(() => host.register({ id: "ai" })).toThrow(ServerError);
  });
});

describe("HeadlessRuntime", () => {
  it("steps a headless loop", () => {
    const runtime = new HeadlessRuntime({ tickRate: 30 });
    const ticks: number[] = [];
    runtime.onTick((tick) => ticks.push(tick));
    expect(() => runtime.step()).toThrow(ServerError);
    runtime.start();
    expect(runtime.step(3)).toBe(3);
    runtime.stop();
    expect(runtime.running).toBe(false);
    expect(ticks).toEqual([1, 2, 3]);
    expect(() => new HeadlessRuntime({ tickRate: 0 })).toThrow(ServerError);
  });
});

describe("DedicatedServer", () => {
  it("runs lifecycle with monitoring", () => {
    const config = createServerConfig({ name: "arena", maxClients: 2, logLevel: "debug" });
    const server = new DedicatedServer(config, { reducer: (state) => state });
    const network = new MemoryNetwork();
    const [clientWire, serverWire] = network.createPair();
    server.plugins.register({
      id: "motd",
      onStart: () => undefined,
      onMessage: () => "welcome",
    });
    server.scripts.register({ id: "spawner", onTick: () => undefined });
    server.start();
    server.connect("c1", serverWire);
    expect(server.network.clients).toEqual(["c1"]);
    server.broadcast("hello");
    server.step(5);
    const status = server.status();
    expect(status.running).toBe(true);
    expect(status.tick).toBe(5);
    expect(status.clients).toBe(1);
    expect(status.metrics).toMatchObject({ ticks: 5, connections: 1, broadcasts: 1, clients: 1 });
    expect(server.logger.filter("info").some((entry) => entry.message.includes("arena started"))).toBe(true);
    expect(clientWire.connected).toBe(true);
    server.disconnect("c1");
    expect(server.status().clients).toBe(0);
    server.stop();
    expect(server.running).toBe(false);
    expect(() => server.step()).toThrow(ServerError);
    server.stop();
  });

  it("enforces the client limit", () => {
    const config = createServerConfig({ maxClients: 1 });
    const server = new DedicatedServer(config);
    const network = new MemoryNetwork();
    const [a] = network.createPair();
    const [b] = network.createPair();
    server.start();
    server.connect("c1", a);
    expect(() => server.connect("c2", b)).toThrow(ServerError);
  });
});
