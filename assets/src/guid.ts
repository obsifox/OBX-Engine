export type AssetGUID = string;

const HEX = "0123456789abcdef";

function fnv(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hexFromSeed(seed: string, groups: number): string[] {
  const parts: string[] = [];
  let state = seed;
  for (let group = 0; group < groups; group += 1) {
    state = `${state}:${group}`;
    const a = fnv(state);
    const b = fnv(`${state}:b`);
    parts.push(a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0"));
  }
  return parts;
}

function randomHex(length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += HEX[Math.floor(Math.random() * 16)];
  }
  return out;
}

export function createAssetGuid(seed?: string | number): AssetGUID {
  if (seed === undefined) {
    return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
  }
  const groups = hexFromSeed(typeof seed === "number" ? `n:${seed}` : `s:${seed}`, 5);
  return `${groups[0]!.slice(0, 8)}-${groups[1]!.slice(0, 4)}-4${groups[2]!.slice(1, 4)}-a${groups[3]!.slice(1, 4)}-${groups[4]!.slice(0, 12)}`;
}

export function isAssetGuid(value: unknown): value is AssetGUID {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

export function contentHash(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < bytes.length; index += 1) {
    a ^= bytes[index]!;
    a = Math.imul(a, 0x01000193);
    b = (b + bytes[index]! * (index + 1)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
