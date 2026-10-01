import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  InputValidator,
  InterpolationBuffer,
  NetworkClock,
  NodeTcpTransport,
  NodeUdpTransport,
  NodeWebSocketTransport,
  RateLimiter,
  ReliableStream,
  SessionAuthority,
  TcpListener,
  decodeWebSocketFrames,
  deriveKey,
  encodeWebSocketFrame,
  openPacket,
  sealPacket,
  tokenFingerprint,
  websocketAcceptKey,
} from "@obx/networking";
import {
  BandwidthBudget,
  DedicatedClient,
  DedicatedServer,
  EntityRegistry,
  OwnershipTracker,
  ReconciliationQueue,
  applyDelta,
  snapshotDelta,
} from "@obx/multiplayer";
import {
  applyPostChain,
  createFrameBuffer,
  defaultPostSettings,
  encodePng,
} from "@obx/rendering";
import { renderScene } from "./render.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "output");
mkdirSync(outDir, { recursive: true });

const report = {
  version: "1.6.0",
  demo: "v160-demo",
  errors: 0,
  scenarios: {},
};

const udpServerAddress = { host: "127.0.0.1", port: 26001 };
const udpServerTransport = new NodeUdpTransport(udpServerAddress);
const server = new DedicatedServer(udpServerTransport, { tickRate: 20, maxClients: 4, bandwidthBytesPerSecond: 240_000 });
const bound = await server.start();
const udpClient = new DedicatedClient(new NodeUdpTransport({ host: "127.0.0.1", port: 26002 }), udpServerAddress, "alice");
await udpClient.start();
const udpGuest = new DedicatedClient(new NodeUdpTransport({ host: "127.0.0.1", port: 26003 }), udpServerAddress, "mallory");
await udpGuest.start();
udpClient.authenticate();
udpGuest.authenticate();
await sleep(60);
udpClient.sendInput({ type: "move", seq: 1, x: 0.5 });
udpClient.sendInput({ type: "move", seq: -9, x: 0.5 });
udpGuest.sendInput({ type: "move", seq: 2, x: 0.25 });
await sleep(40);
for (let i = 0; i < 45; i += 1) {
  const netId = server.spawnEntity(i % 2 === 0 ? "player" : "prop", i % 2 === 0 ? "alice" : "mallory");
  server.entities.setComponent(netId, "transform", { x: i * 0.35, y: 0.5, z: 0 });
  server.entities.patchFields(netId, "transform", { x: i * 0.4 });
  server.step(0.05);
}
await sleep(60);
const serverStats = server.profiler.counters;
report.scenarios.udpDedicated = {
  transport: "udp-loopback",
  boundPort: bound ? bound.port : 0,
  clients: server.clientCount,
  ticks: server.tick,
  entities: server.entities.size,
  tokensIssued: udpClient.stats.tokens + udpGuest.stats.tokens,
  validInputs: server.messages.filter((m) => m.from === "alice").length + server.messages.filter((m) => m.from === "mallory").length,
  rejectedInputs: udpClient.stats.rejections + udpGuest.stats.rejections,
  packetsIn: serverStats.packets,
  bytesIn: serverStats.bytes,
  budgetDropped: server.budget.dropped,
};

const tcpListener = new TcpListener();
const tcpEchoAddress = await tcpListener.listen(0, "127.0.0.1", (from, payload, reply) => {
  reply(payload);
});
const tcpClient = new NodeTcpTransport({ host: "127.0.0.1", port: tcpEchoAddress.port });
await tcpClient.open();
const tcpInbox = [];
tcpClient.onReceive((datagram) => tcpInbox.push(datagram.payload));
for (let i = 0; i < 12; i += 1) {
  await tcpClient.send({ host: "127.0.0.1", port: tcpEchoAddress.port }, new Uint8Array([i, 2, 3, 4, 5, 6, 7, 8]));
}
await sleep(60);
report.scenarios.tcpLoopback = {
  transport: "tcp-loopback",
  port: tcpEchoAddress.port,
  echoFrames: tcpInbox.length,
  echoBytes: tcpInbox.reduce((sum, payload) => sum + payload.length, 0),
};

const net = await import("node:net");
const wsServer = net.createServer((socket) => {
  let handshake = "";
  socket.on("data", (chunk) => {
    handshake += chunk.toString("utf8");
    const boundary = handshake.indexOf("\r\n\r\n");
    if (boundary < 0) return;
    const key = /Sec-WebSocket-Key: (.+)\r\n/.exec(handshake)?.[1] ?? "";
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${websocketAcceptKey(key.trim())}\r\n\r\n`);
    let frames = new TextEncoder().encode(handshake.slice(boundary + 4));
    handshake = "";
    socket.on("data", (more) => {
      frames = new Uint8Array([...frames, ...new Uint8Array(more)]);
      let decoded = decodeWebSocketFrames({ data: frames });
      while (decoded !== null) {
        frames = decoded.rest;
        socket.write(Buffer.from(encodeWebSocketFrame(decoded.payload, false, 2)));
        decoded = decodeWebSocketFrames({ data: frames });
      }
    });
  });
});
const wsPort = await new Promise((resolve) => wsServer.listen(0, "127.0.0.1", () => resolve(wsServer.address().port)));
const wsClient = new NodeWebSocketTransport({ host: "127.0.0.1", port: wsPort });
await wsClient.open();
const wsInbox = [];
wsClient.onReceive((datagram) => wsInbox.push(datagram.payload));
await wsClient.send({ host: "127.0.0.1", port: wsPort }, new Uint8Array([9, 9, 9]));
await wsClient.send({ host: "127.0.0.1", port: wsPort }, new Uint8Array([8, 8]));
await sleep(60);
report.scenarios.websocket = {
  transport: "websocket-loopback",
  port: wsPort,
  handshake: "101-switching-protocols",
  acceptKeySample: websocketAcceptKey("dGhlIHNhbXBsZSBub25jZQ=="),
  echoFrames: wsInbox.length,
  echoBytes: wsInbox.reduce((sum, payload) => sum + payload.length, 0),
};
await wsClient.close();
wsServer.close();

const listener = new TcpListener();
let serverStream = null;
let serverDelivered = 0;
let replyWire = () => {};
const echoAddress = await listener.listen(0, "127.0.0.1", (from, payload, reply) => {
  replyWire = reply;
  serverDelivered += serverStream.receive(payload).length;
  replyWire(serverStream.ack());
});
serverStream = new ReliableStream((packet) => replyWire(packet));
const streamA = new NodeTcpTransport({ host: "127.0.0.1", port: echoAddress.port });
await streamA.open();
const stream = new ReliableStream((packet) => {
  void streamA.send({ host: "127.0.0.1", port: echoAddress.port }, packet);
});
const streamInbox = [];
streamA.onReceive((datagram) => {
  streamInbox.push(...stream.receive(datagram.payload));
  void streamA.send({ host: "127.0.0.1", port: echoAddress.port }, stream.ack());
});
for (let i = 0; i < 8; i += 1) stream.send(new Uint8Array([i + 1, 64, 128]));
stream.flush();
await sleep(60);
report.scenarios.reliableStream = {
  transport: "reliable-stream-over-tcp",
  framesSent: stream.stats.sent,
  framesDelivered: serverDelivered,
  retransmits: stream.stats.resent,
};

const secret = new Uint8Array(32).fill(7);
const key = deriveKey(secret, "obx-demo");
const nonce = new Uint8Array(12).fill(3);
const sealed = sealPacket(1, new Uint8Array([1, 2, 3, 4, 5]), key, nonce);
const opened = openPacket(sealed, key, nonce);
const tampered = { ...sealed, payload: sealed.payload.slice() };
tampered.payload[0] = (tampered.payload[0] ?? 0) ^ 0xff;
const tamperRejected = openPacket(tampered, key, nonce) === null;
const sessions = new SessionAuthority(secret);
const token = sessions.issue("alice", 1_000);
const verifyOk = sessions.verify(token, 1_050);
const verifyExpired = sessions.verify(token, 4_000_000);
const forged = { ...token, subject: "mallory" };
const forgeRejected = !sessions.verify(forged, 1_050);
const limiter = new RateLimiter(3, 3);
let allowed = 0;
for (let i = 0; i < 8; i += 1) if (limiter.allow("flood", 10)) allowed += 1;
const validator = new InputValidator([{ field: "seq", kind: "number", min: 0 }]);
report.scenarios.security = {
  sealedBytes: sealed.length,
  roundTrip: opened !== null && opened.length === 5,
  tamperRejected,
  tokenVerified: verifyOk,
  tokenExpiryRejected: !verifyExpired,
  tokenForgeRejected: forgeRejected,
  fingerprint: tokenFingerprint(token),
  rateLimitAllowed: allowed,
  rateLimitRejected: 8 - allowed,
  inputErrors: validator.validate({ seq: -3 }).length,
};

const clock = new NetworkClock(20);
const rtt = clock.syncFromRtt(100, 110, 112, 124);
const rtt2 = clock.syncFromRtt(101, 112, 114, 127);
const buffer = new InterpolationBuffer(100);
buffer.push(0, { x: 0 });
buffer.push(100, { x: 10 });
buffer.push(200, { x: 20 });
const rendered = buffer.sample(250, (a, b, t) => ({ x: a.x + (b.x - a.x) * t }));
const queue = new ReconciliationQueue();
for (let i = 1; i <= 32; i += 1) queue.submit({ seq: i, input: { dx: i } });
const replay = queue.acknowledge(12);
const registry = new EntityRegistry();
const ownership = new OwnershipTracker();
const sample = registry.spawn("player", "alice");
ownership.assign(sample.netId, "alice");
registry.setComponent(sample.netId, "transform", { x: 1, y: 2, hp: 100 });
registry.patchFields(sample.netId, "transform", { x: 5 });
const delta = snapshotDelta({ tick: 1, entities: { 1: { x: 0 } } }, { tick: 2, entities: { 1: { x: 3 } } });
const merged = applyDelta({ tick: 1, entities: { 1: { x: 0 } } }, delta);
report.scenarios.sync = {
  rttMs: rtt,
  rttMs2: rtt2,
  clockOffsetMs: clock.offset,
  interpolationX: rendered ? rendered.x : 0,
  predictionPending: queue.pendingCount,
  predictionReplayFrames: replay.length,
  ownershipOwner: ownership.ownerOf(sample.netId),
  deltaAppliedX: merged.entities[1].x,
};

const budget = new BandwidthBudget(1000);
budget.allow(600, 0);
budget.allow(600, 0);
budget.allow(600, 1200);
report.scenarios.budget = { limitBytesPerSecond: 1000, dropped: budget.dropped };

const connection = new Connection(new NodeUdpTransport({ host: "127.0.0.1", port: 26020 }), { host: "127.0.0.1", port: 26021 });
report.scenarios.connection = {
  state: connection.state,
  invalidPackets: connection.invalidPackets,
};

await udpGuest.stop();
await udpClient.stop();
await server.stop();
await tcpClient.close();
tcpListener.close();
await streamA.close();
listener.close();
connection.close();

if (report.errors > 0) throw new Error("networking scenario errors");

const WIDTH = 1280;
const HEIGHT = 560;
const startedAt = Date.now();
const scene = renderScene(WIDTH, HEIGHT, 2);
const renderMs = Date.now() - startedAt;

const frameBuffer = createFrameBuffer(WIDTH, HEIGHT);
frameBuffer.color.set(scene.color);
const renderPost = defaultPostSettings();
renderPost.bloom = { enabled: true, threshold: 0.9, intensity: 0.5, radius: 3 };
renderPost.toneMap = "aces";
renderPost.grade = { exposure: 1.0, contrast: 1.06, saturation: 1.12, lift: 0, gamma: 1, gain: 1 };
renderPost.vignette = { strength: 0.22, radius: 0.9 };
renderPost.fxaaEnabled = true;
applyPostChain(frameBuffer, renderPost, null);

const ldr = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
for (let i = 0; i < ldr.length; i += 1) {
  ldr[i] = Math.round(Math.min(1, Math.max(0, frameBuffer.color[i])) * 255);
}
writeFileSync(join(outDir, "frame.png"), encodePng({ width: WIDTH, height: HEIGHT, data: ldr }));

report.render = {
  width: WIDTH,
  height: HEIGHT,
  supersample: "2x2",
  samplesPerPixel: 4,
  renderMs,
  postChain: ["bloom(0.9/0.5/3)", "aces", "grade(1.06/1.12)", "fxaa", "vignette(0.22/0.9)"],
};

writeFileSync(join(outDir, "stats.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
