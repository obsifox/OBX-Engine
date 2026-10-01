import { hmacSha256, sha256, toHex, fromHex, chacha20Xor } from "./crypto.js";

export interface SessionToken {
  sessionId: string;
  subject: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

export class SessionAuthority {
  #secret: Uint8Array;
  #ttlMs: number;
  #sessions = new Map<string, SessionToken>();

  constructor(secret: Uint8Array, ttlMs = 3600_000) {
    this.#secret = secret;
    this.#ttlMs = ttlMs;
  }

  #sign(payload: string): string {
    return toHex(hmacSha256(this.#secret, new TextEncoder().encode(payload)));
  }

  issue(subject: string, now: number, sessionId = `s-${subject}-${now}`): SessionToken {
    const token: SessionToken = {
      sessionId,
      subject,
      issuedAt: now,
      expiresAt: now + this.#ttlMs,
      signature: "",
    };
    token.signature = this.#sign(`${sessionId}|${subject}|${token.issuedAt}|${token.expiresAt}`);
    this.#sessions.set(sessionId, token);
    return token;
  }

  verify(token: SessionToken, now: number): boolean {
    const expected = this.#sign(`${token.sessionId}|${token.subject}|${token.issuedAt}|${token.expiresAt}`);
    if (expected !== token.signature) return false;
    if (now > token.expiresAt) return false;
    return this.#sessions.get(token.sessionId)?.signature === token.signature;
  }

  revoke(sessionId: string): boolean {
    return this.#sessions.delete(sessionId);
  }

  get activeCount(): number {
    return this.#sessions.size;
  }
}

export class RateLimiter {
  #capacity: number;
  #refillPerSecond: number;
  #tokens = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(capacity = 10, refillPerSecond = 5) {
    this.#capacity = capacity;
    this.#refillPerSecond = refillPerSecond;
  }

  allow(key: string, now: number, cost = 1): boolean {
    const entry = this.#tokens.get(key) ?? { tokens: this.#capacity, updatedAt: now };
    const elapsed = Math.max(0, now - entry.updatedAt) / 1000;
    entry.tokens = Math.min(this.#capacity, entry.tokens + elapsed * this.#refillPerSecond);
    entry.updatedAt = now;
    if (entry.tokens < cost) {
      this.#tokens.set(key, entry);
      return false;
    }
    entry.tokens -= cost;
    this.#tokens.set(key, entry);
    return true;
  }

  inspect(key: string): number {
    return this.#tokens.get(key)?.tokens ?? this.#capacity;
  }
}

export interface PacketEnvelope {
  magic: number;
  sequence: number;
  payload: Uint8Array;
  checksum: string;
}

export const NETWORK_MAGIC = 0x4f42;

export function sealPacket(sequence: number, payload: Uint8Array, key: Uint8Array, nonce: Uint8Array): PacketEnvelope {
  const encrypted = chacha20Xor(key, nonce, payload, sequence);
  const checksum = toHex(hmacSha256(key, encrypted).slice(0, 8));
  return { magic: NETWORK_MAGIC, sequence, payload: encrypted, checksum };
}

export function openPacket(envelope: PacketEnvelope, key: Uint8Array, nonce: Uint8Array): Uint8Array | null {
  if (envelope.magic !== NETWORK_MAGIC) return null;
  const expected = toHex(hmacSha256(key, envelope.payload).slice(0, 8));
  if (expected !== envelope.checksum) return null;
  return chacha20Xor(key, nonce, envelope.payload, envelope.sequence);
}

export interface ValidationRule {
  field: string;
  kind: "number" | "string" | "boolean";
  min?: number;
  max?: number;
  maxLength?: number;
}

export class InputValidator {
  #rules: ValidationRule[];

  constructor(rules: ValidationRule[]) {
    this.#rules = rules;
  }

  validate(input: Record<string, unknown>): string[] {
    const errors: string[] = [];
    for (const rule of this.#rules) {
      const value = input[rule.field];
      if (value === undefined || value === null) {
        errors.push(`${rule.field}: missing`);
        continue;
      }
      if (rule.kind === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`${rule.field}: not a finite number`);
          continue;
        }
        if (rule.min !== undefined && value < rule.min) errors.push(`${rule.field}: below minimum`);
        if (rule.max !== undefined && value > rule.max) errors.push(`${rule.field}: above maximum`);
      } else if (rule.kind === "string") {
        if (typeof value !== "string") {
          errors.push(`${rule.field}: not a string`);
          continue;
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) errors.push(`${rule.field}: too long`);
      } else if (typeof value !== "boolean") {
        errors.push(`${rule.field}: not a boolean`);
      }
    }
    return errors;
  }
}

export type AuthorityLevel = "client" | "host" | "server";

export class AuthorityGuard {
  #levels = new Map<string, AuthorityLevel>();

  claim(subject: string, level: AuthorityLevel): void {
    this.#levels.set(subject, level);
  }

  levelOf(subject: string): AuthorityLevel {
    return this.#levels.get(subject) ?? "client";
  }

  canMutate(subject: string, owner: string): boolean {
    const level = this.levelOf(subject);
    return level === "server" || subject === owner;
  }

  canSpawn(subject: string): boolean {
    return this.levelOf(subject) !== "client";
  }
}

export function deriveKey(secret: string, label: string): Uint8Array {
  return sha256(new TextEncoder().encode(`${secret}:${label}`));
}

export function tokenFingerprint(token: SessionToken): string {
  return toHex(sha256(new TextEncoder().encode(token.signature)).slice(0, 3));
}

export { fromHex };
