import { describe, expect, it } from "vitest";
import {
  AuthorityGuard,
  InputValidator,
  NETWORK_MAGIC,
  RateLimiter,
  SessionAuthority,
  chacha20Xor,
  deriveKey,
  fromHex,
  hmacSha256,
  openPacket,
  sealPacket,
  sha1,
  sha256,
  toHex,
  tokenFingerprint,
} from "../src/index.js";

describe("cryptographic primitives", () => {
  it("matches sha-256 fips vectors", () => {
    expect(toHex(sha256(new TextEncoder().encode("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(toHex(sha256(new Uint8Array(0)))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches hmac-sha256 rfc4231 case 1", () => {
    const key = new Uint8Array(20).fill(0x0b);
    const message = new TextEncoder().encode("Hi There");
    expect(toHex(hmacSha256(key, message))).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });

  it("matches chacha20 rfc8439 encryption vector", () => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) key[i] = i;
    const nonce = fromHex("000000000000004a00000000");
    const plaintext = new TextEncoder().encode("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
    const ciphertext = chacha20Xor(key, nonce, plaintext, 1);
    expect(toHex(ciphertext.slice(0, 16))).toBe("6e2e359a2568f98041ba0728dd0d6981");
    expect(chacha20Xor(key, nonce, ciphertext, 1)).toEqual(plaintext);
  });

  it("matches the sha-1 abc vector", () => {
    expect(toHex(sha1(new TextEncoder().encode("abc")))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});

describe("sessions and tokens", () => {
  it("issues verifiable tokens and rejects tampering", () => {
    const authority = new SessionAuthority(deriveKey("secret", "sessions"), 1000);
    const token = authority.issue("player-1", 500);
    expect(authority.verify(token, 600)).toBe(true);
    expect(authority.verify({ ...token, subject: "player-2" }, 600)).toBe(false);
    expect(authority.verify(token, 2000)).toBe(false);
    expect(tokenFingerprint(token)).toHaveLength(6);
    expect(authority.activeCount).toBe(1);
    expect(authority.revoke(token.sessionId)).toBe(true);
    expect(authority.verify(token, 600)).toBe(false);
  });
});

describe("rate limiting", () => {
  it("throttles bursts and refills over time", () => {
    const limiter = new RateLimiter(2, 1);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 0)).toBe(false);
    expect(limiter.allow("other", 0)).toBe(true);
    expect(limiter.allow("ip", 1500)).toBe(true);
  });
});

describe("packet protection", () => {
  it("seals and opens packets with integrity", () => {
    const key = deriveKey("secret", "packets");
    const nonce = new Uint8Array(12).fill(3);
    const envelope = sealPacket(7, new TextEncoder().encode("state"), key, nonce);
    expect(envelope.magic).toBe(NETWORK_MAGIC);
    const opened = openPacket(envelope, key, nonce);
    expect(new TextDecoder().decode(opened!)).toBe("state");
    const tampered = { ...envelope, payload: envelope.payload.slice() };
    tampered.payload[0] = tampered.payload[0]! ^ 0xff;
    expect(openPacket(tampered, key, nonce)).toBeNull();
    expect(openPacket({ ...envelope, magic: 1 }, key, nonce)).toBeNull();
  });
});

describe("input validation and authority", () => {
  it("validates typed input schemas", () => {
    const validator = new InputValidator([
      { field: "type", kind: "string", maxLength: 4 },
      { field: "seq", kind: "number", min: 0, max: 10 },
      { field: "jump", kind: "boolean" },
    ]);
    expect(validator.validate({ type: "move", seq: 3, jump: true })).toEqual([]);
    expect(validator.validate({ type: "move", seq: 20, jump: true })).toEqual(["seq: above maximum"]);
    expect(validator.validate({ type: "toolong", seq: 1, jump: true })).toEqual(["type: too long"]);
    expect(validator.validate({ seq: 1, jump: true })).toEqual(["type: missing"]);
    expect(validator.validate({ type: "move", seq: Number.NaN, jump: true })).toEqual(["seq: not a finite number"]);
    expect(validator.validate({ type: "move", seq: 1, jump: "yes" })).toEqual(["jump: not a boolean"]);
  });

  it("enforces server-side authority rules", () => {
    const guard = new AuthorityGuard();
    guard.claim("server", "server");
    guard.claim("alice", "client");
    guard.claim("bob", "host");
    expect(guard.canMutate("server", "alice")).toBe(true);
    expect(guard.canMutate("alice", "alice")).toBe(true);
    expect(guard.canMutate("alice", "bob")).toBe(false);
    expect(guard.canSpawn("bob")).toBe(true);
    expect(guard.canSpawn("alice")).toBe(false);
    expect(guard.levelOf("ghost")).toBe("client");
  });
});
