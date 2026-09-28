export interface SaveStorage {
  read(key: string): string | null;
  write(key: string, data: string): void;
  remove(key: string): void;
  list(): string[];
}

export class MemoryStorage implements SaveStorage {
  private readonly data = new Map<string, string>();

  read(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  write(key: string, data: string): void {
    this.data.set(key, data);
  }

  remove(key: string): void {
    this.data.delete(key);
  }

  list(): string[] {
    return [...this.data.keys()].sort();
  }
}

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function packBitsEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const out: number[] = [];
  let index = 0;
  while (index < bytes.length) {
    const value = bytes[index]!;
    let run = 1;
    while (index + run < bytes.length && bytes[index + run] === value && run < 130) {
      run += 1;
    }
    if (run >= 3) {
      out.push(128 + run - 3, value);
      index += run;
    } else {
      const start = index;
      let literal = 0;
      while (
        index < bytes.length &&
        literal < 128 &&
        !(index + 2 < bytes.length && bytes[index] === bytes[index + 1] && bytes[index] === bytes[index + 2])
      ) {
        index += 1;
        literal += 1;
      }
      out.push(literal - 1, ...bytes.slice(start, index));
    }
  }
  return String.fromCharCode(...out);
}

export function packBitsDecode(input: string): string {
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) bytes[i] = input.charCodeAt(i) & 0xff;
  const out: number[] = [];
  let index = 0;
  while (index < bytes.length) {
    const header = bytes[index]!;
    index += 1;
    if (header < 128) {
      const count = header + 1;
      for (let i = 0; i < count; i += 1) out.push(bytes[index++]!);
    } else {
      const count = header - 128 + 3;
      const value = bytes[index++]!;
      for (let i = 0; i < count; i += 1) out.push(value);
    }
  }
  return new TextDecoder().decode(new Uint8Array(out));
}

export function xorCrypt(input: string, key: string): string {
  if (key.length === 0) throw new RangeError("Encryption key required");
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    out += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i += 3) {
    const b0 = input.charCodeAt(i) & 0xff;
    const b1 = input.charCodeAt(i + 1) & 0xff;
    const b2 = input.charCodeAt(i + 2) & 0xff;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < input.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < input.length ? B64[b2 & 63] : "=";
  }
  return out;
}

export function fromBase64(input: string): string {
  const clean = input.replace(/=+$/, "");
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const value = B64.indexOf(clean[i]!);
    if (value < 0) throw new RangeError("Invalid base64");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return out;
}

export interface SaveableProvider {
  id: string;
  version: number;
  serialize(): unknown;
  deserialize(data: unknown): void;
  migrate?: (data: unknown, fromVersion: number) => unknown;
}

export interface SaveSlotInfo {
  slot: string;
  createdAt: string;
  checksum: string;
  providerIds: string[];
}

export interface SaveEnvelope {
  format: "obx-save";
  formatVersion: 1;
  slot: string;
  createdAt: string;
  checksum: string;
  compressed: boolean;
  encrypted: boolean;
  providerIds: string[];
}

export interface SaveSystemOptions {
  storage?: SaveStorage;
  compression?: boolean;
  encryptionKey?: string | null;
}

export class SaveSystem {
  readonly storage: SaveStorage;
  compression: boolean;
  encryptionKey: string | null;
  private readonly providers = new Map<string, SaveableProvider>();

  constructor(options: SaveSystemOptions = {}) {
    this.storage = options.storage ?? new MemoryStorage();
    this.compression = options.compression ?? true;
    this.encryptionKey = options.encryptionKey ?? null;
  }

  register(provider: SaveableProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(id: string): void {
    this.providers.delete(id);
  }

  save(slot: string): SaveSlotInfo {
    const providers: Record<string, { version: number; data: unknown }> = {};
    for (const [id, provider] of this.providers) {
      providers[id] = { version: provider.version, data: provider.serialize() };
    }
    const body = JSON.stringify(providers);
    const envelope: SaveEnvelope = {
      format: "obx-save",
      formatVersion: 1,
      slot,
      createdAt: new Date().toISOString(),
      checksum: fnv1a(body),
      compressed: this.compression,
      encrypted: this.encryptionKey !== null,
      providerIds: [...this.providers.keys()],
    };
    let payload = body;
    if (this.compression) payload = packBitsEncode(payload);
    if (this.encryptionKey) payload = xorCrypt(payload, this.encryptionKey);
    const container = JSON.stringify({ envelope, payload: toBase64(payload) });
    this.storage.write(slot, container);
    return this.slotInfo(envelope);
  }

  load(slot: string): SaveSlotInfo {
    const raw = this.storage.read(slot);
    if (!raw) throw new Error(`Save slot "${slot}" not found`);
    const container = JSON.parse(raw) as { envelope: SaveEnvelope; payload: string };
    let payload = fromBase64(container.payload);
    if (container.envelope.encrypted) {
      if (!this.encryptionKey) throw new Error("Save is encrypted");
      payload = xorCrypt(payload, this.encryptionKey);
    }
    if (container.envelope.compressed) payload = packBitsDecode(payload);
    if (fnv1a(payload) !== container.envelope.checksum) {
      throw new Error("Save checksum mismatch");
    }
    const providers = JSON.parse(payload) as Record<string, { version: number; data: unknown }>;
    for (const [id, entry] of Object.entries(providers)) {
      const provider = this.providers.get(id);
      if (!provider) continue;
      let data = entry.data;
      if (entry.version < provider.version && provider.migrate) {
        data = provider.migrate(data, entry.version);
      }
      provider.deserialize(data);
    }
    return this.slotInfo(container.envelope);
  }

  deleteSlot(slot: string): void {
    this.storage.remove(slot);
  }

  listSlots(): SaveSlotInfo[] {
    return this.storage.list().map((slot) => {
      const raw = this.storage.read(slot)!;
      const container = JSON.parse(raw) as { envelope: SaveEnvelope };
      return this.slotInfo(container.envelope);
    });
  }

  private slotInfo(envelope: SaveEnvelope): SaveSlotInfo {
    return {
      slot: envelope.slot,
      createdAt: envelope.createdAt,
      checksum: envelope.checksum,
      providerIds: [...envelope.providerIds],
    };
  }
}

export class Autosave {
  private elapsed = 0;

  constructor(
    readonly intervalSeconds: number,
    readonly onSave: () => void,
  ) {}

  update(dt: number): boolean {
    this.elapsed += dt;
    if (this.elapsed >= this.intervalSeconds) {
      this.elapsed = 0;
      this.onSave();
      return true;
    }
    return false;
  }
}

export interface CloudSaveClient {
  upload(slot: string, data: string): Promise<void>;
  download(slot: string): Promise<string | null>;
  list(): Promise<string[]>;
}

export class MemoryCloudClient implements CloudSaveClient {
  private readonly data = new Map<string, string>();

  async upload(slot: string, data: string): Promise<void> {
    this.data.set(slot, data);
  }

  async download(slot: string): Promise<string | null> {
    return this.data.get(slot) ?? null;
  }

  async list(): Promise<string[]> {
    return [...this.data.keys()].sort();
  }
}
