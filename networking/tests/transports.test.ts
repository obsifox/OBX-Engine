import { describe, expect, it } from "vitest";
import {
  NodeTcpTransport,
  NodeUdpTransport,
  NodeWebSocketTransport,
  StreamFrameDecoder,
  TcpListener,
  WebRtcTransport,
  decodeWebSocketFrames,
  encodeStreamFrame,
  encodeWebSocketFrame,
  websocketAcceptKey,
} from "../src/index.js";

describe("framing", () => {
  it("round trips stream frames across chunk boundaries", () => {
    const decoder = new StreamFrameDecoder();
    const frame = encodeStreamFrame(new Uint8Array([1, 2, 3, 4, 5]));
    const first = frame.slice(0, 3);
    const second = frame.slice(3);
    expect(decoder.push(first)).toEqual([]);
    const frames = decoder.push(second);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("decodes multiple frames from one chunk", () => {
    const decoder = new StreamFrameDecoder();
    const merged = new Uint8Array([...encodeStreamFrame(new Uint8Array([1])), ...encodeStreamFrame(new Uint8Array([2, 2]))]);
    const frames = decoder.push(merged);
    expect(frames.map((frame) => Array.from(frame))).toEqual([[1], [2, 2]]);
  });
});

describe("websocket framing", () => {
  it("matches the rfc6455 accept key example", () => {
    expect(websocketAcceptKey("dGhlIHNhbXBsZSBub25jZQ==")).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });

  it("round trips masked and unmasked frames", () => {
    const masked = encodeWebSocketFrame(new Uint8Array([10, 20, 30]), true, 2);
    const decodedMasked = decodeWebSocketFrames({ data: masked })!;
    expect(decodedMasked.payload).toEqual(new Uint8Array([10, 20, 30]));
    const plain = encodeWebSocketFrame(new Uint8Array([40, 50]), false, 2);
    const decodedPlain = decodeWebSocketFrames({ data: plain })!;
    expect(decodedPlain.payload).toEqual(new Uint8Array([40, 50]));
    expect(decodedPlain.rest.length).toBe(0);
  });

  it("handles extended payload lengths", () => {
    const big = new Uint8Array(200).fill(7);
    const frame = encodeWebSocketFrame(big, true, 2);
    expect(decodeWebSocketFrames({ data: frame })!.payload.length).toBe(200);
    expect(decodeWebSocketFrames({ data: frame.slice(0, 10) })).toBeNull();
  });
});

describe("real loopback transports", () => {
  it("delivers tcp frames between client and server", async () => {
    const received: { payload: Uint8Array; reply: (payload: Uint8Array) => void }[] = [];
    const listener = new TcpListener();
    const address = await listener.listen(0, "127.0.0.1", (from, payload, reply) => {
      received.push({ payload, reply });
      reply(new Uint8Array([9, 9]));
    });
    const client = new NodeTcpTransport(address);
    const inbox: Uint8Array[] = [];
    client.onReceive((datagram) => inbox.push(datagram.payload));
    await client.open();
    await client.send(address, new Uint8Array([1, 2, 3]));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(received[0]!.payload).toEqual(new Uint8Array([1, 2, 3]));
    expect(inbox[0]).toEqual(new Uint8Array([9, 9]));
    expect(client.localAddress).not.toBeNull();
    await client.close();
    await listener.close();
  });

  it("delivers udp datagrams between sockets", async () => {
    const server = new NodeUdpTransport({ host: "127.0.0.1", port: 0 });
    await server.open();
    const client = new NodeUdpTransport({ host: "127.0.0.1", port: 0 });
    await client.open();
    const inbox: Uint8Array[] = [];
    server.onReceive((datagram) => {
      inbox.push(datagram.payload);
      void server.send(datagram.from, new Uint8Array([4]));
    });
    await client.send(server.localAddress!, new Uint8Array([1]));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(inbox[0]).toEqual(new Uint8Array([1]));
    expect(server.kind).toBe("udp");
    await client.close();
    await server.close();
  });

  it("completes a websocket handshake and exchanges binary frames", async () => {
    const net = await import("node:net");
    let serverSocket: import("node:net").Socket | null = null;
    const server = net.createServer((socket) => {
      serverSocket = socket;
      let handshake = "";
      socket.on("data", (chunk) => {
        handshake += chunk.toString("utf8");
        if (!handshake.includes("\r\n\r\n")) return;
        const key = /Sec-WebSocket-Key: (.+)\r\n/.exec(handshake)![1]!;
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${websocketAcceptKey(key.trim())}\r\n\r\n`);
        let frameBuffer = new Uint8Array(0);
        {
          const boundaryBytes = new TextEncoder().encode(handshake.slice(handshake.indexOf("\r\n\r\n") + 4));
          frameBuffer = boundaryBytes;
        }
        handshake = "";
        const feed = (chunk: Buffer): void => {
          frameBuffer = new Uint8Array([...frameBuffer, ...new Uint8Array(chunk)]);
          let decoded: { payload: Uint8Array; rest: Uint8Array } | null = null;
          while ((decoded = decodeWebSocketFrames({ data: frameBuffer })) !== null) {
            frameBuffer = decoded.rest;
            socket.write(Buffer.from(encodeWebSocketFrame(decoded.payload, false, 2)));
          }
        };
        socket.on("data", feed);
      });
    });
    const port = await new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
    const client = new NodeWebSocketTransport({ host: "127.0.0.1", port });
    const inbox: Uint8Array[] = [];
    client.onReceive((datagram) => inbox.push(datagram.payload));
    await client.open();
    await client.send({ host: "127.0.0.1", port }, new Uint8Array([7, 7, 7]));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(inbox[0]).toEqual(new Uint8Array([7, 7, 7]));
    expect(client.kind).toBe("websocket");
    await client.close();
    serverSocket?.destroy();
    await new Promise((resolve) => server.close(() => resolve()));
  });

  it("exposes webrtc architecture with channel attachment", async () => {
    const transport = new WebRtcTransport({ host: "stun", port: 1 });
    expect(transport.kind).toBe("webrtc");
    await expect(transport.open()).rejects.toThrow(/data-channel provider/);
    const sent: Uint8Array[] = [];
    let handler: ((data: Uint8Array) => void) | null = null;
    transport.attachChannel({
      send: (data) => sent.push(data),
      close: () => undefined,
      onMessage: (callback) => (handler = callback),
    });
    const seen: Uint8Array[] = [];
    transport.onReceive((datagram) => seen.push(datagram.payload));
    await transport.send({ host: "stun", port: 1 }, new Uint8Array([1]));
    expect(sent[0]).toEqual(new Uint8Array([1]));
    handler!(new Uint8Array([2]));
    expect(seen[0]).toEqual(new Uint8Array([2]));
    await transport.close();
  });
});
