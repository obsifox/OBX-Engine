const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
  }
  return Uint8Array.from(bytes);
}

export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? utf8Bytes(input) : input;
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 9) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + K[i]! + w[i]!) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  return [...h].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

export function hmacSha256Hex(key: string, message: string): string {
  const blockSize = 64;
  let keyBytes = utf8Bytes(key);
  if (keyBytes.length > blockSize) keyBytes = utf8Bytes(sha256Hex(keyBytes));
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(keyBytes);
  const inner = new Uint8Array(blockSize + utf8Bytes(message).length);
  const outerPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i += 1) {
    inner[i] = paddedKey[i]! ^ 0x36;
    outerPad[i] = paddedKey[i]! ^ 0x5c;
  }
  inner.set(utf8Bytes(message), blockSize);
  const innerHash = sha256Hex(inner);
  const outer = new Uint8Array(blockSize + 32);
  outer.set(outerPad);
  outer.set(hexToBytes(innerHash), blockSize);
  return sha256Hex(outer);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export interface BuildFileEntry {
  path: string;
  content: string | Uint8Array;
}

export interface SignedBuildManifest {
  version: string;
  files: { path: string; hash: string; bytes: number }[];
  treeHash: string;
  signature: string;
  signedAtUnix: number;
}

export function buildFileHash(entry: BuildFileEntry): string {
  return sha256Hex(typeof entry.content === "string" ? entry.content : entry.content);
}

export function signBuild(version: string, files: readonly BuildFileEntry[], secret: string, signedAtUnix = 0): SignedBuildManifest {
  const entries = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((entry) => {
      const hash = buildFileHash(entry);
      const bytes = typeof entry.content === "string" ? entry.content.length : entry.content.length;
      return { path: entry.path, hash, bytes };
    });
  const treeHash = sha256Hex(entries.map((entry) => `${entry.path}:${entry.hash}`).join("\n"));
  const signature = hmacSha256Hex(secret, `${version}:${treeHash}`);
  return { version, files: entries, treeHash, signature, signedAtUnix };
}

export interface VerifyReport {
  ok: boolean;
  treeHash: string;
  expectedTreeHash: string;
  signatureValid: boolean;
  tamperedFiles: string[];
}

export function verifyBuild(manifest: SignedBuildManifest, files: readonly BuildFileEntry[], secret: string): VerifyReport {
  const rebuilt = signBuild(manifest.version, files, secret, manifest.signedAtUnix);
  const tamperedFiles: string[] = [];
  for (const entry of manifest.files) {
    const current = rebuilt.files.find((file) => file.path === entry.path);
    if (!current || current.hash !== entry.hash) tamperedFiles.push(entry.path);
  }
  const signatureValid = hmacSha256Hex(secret, `${manifest.version}:${manifest.treeHash}`) === manifest.signature;
  return {
    ok: tamperedFiles.length === 0 && signatureValid && rebuilt.treeHash === manifest.treeHash,
    treeHash: rebuilt.treeHash,
    expectedTreeHash: manifest.treeHash,
    signatureValid,
    tamperedFiles,
  };
}

export function normalizeTimestamp(unix: number, epochStartUnix: number): number {
  return epochStartUnix > 0 ? epochStartUnix : unix;
}
