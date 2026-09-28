import { describe, expect, it } from "vitest";
import {
  Autosave,
  MemoryCloudClient,
  MemoryStorage,
  SaveSystem,
  fnv1a,
  fromBase64,
  packBitsDecode,
  packBitsEncode,
  toBase64,
  xorCrypt,
  type SaveableProvider,
} from "../src/index.js";

function provider(over: Partial<SaveableProvider> = {}): SaveableProvider {
  let state = { level: 1, coins: 0 };
  return {
    id: "player",
    version: 2,
    serialize: () => ({ ...state }),
    deserialize: (data) => {
      state = data as typeof state;
    },
    migrate: (data, fromVersion) => {
      const value = data as Record<string, unknown>;
      if (fromVersion < 2) return { ...value, coins: 0 };
      return value;
    },
    ...over,
  };
}

describe("codecs", () => {
  it("packBits roundtrips runs and literals", () => {
    const input = "aaabbbhello worlddddddd";
    expect(packBitsDecode(packBitsEncode(input))).toBe(input);
    const longLiteral = "abcdefghijklmnopqrstuvwxyz";
    expect(packBitsDecode(packBitsEncode(longLiteral))).toBe(longLiteral);
    expect(packBitsDecode(packBitsEncode(""))).toBe("");
  });

  it("base64 roundtrips", () => {
    const input = "obx-save \u00ff\u0000 binary-ish";
    expect(fromBase64(toBase64(input))).toBe(input);
    expect(toBase64("a")).toBe("YQ==");
  });

  it("xor crypt roundtrips with the key", () => {
    const secret = "obsifox";
    const encrypted = xorCrypt(secret, "key");
    expect(encrypted).not.toBe(secret);
    expect(xorCrypt(encrypted, "key")).toBe(secret);
    expect(() => xorCrypt(secret, "")).toThrow();
  });

  it("computes stable checksums", () => {
    expect(fnv1a("obx")).toBe(fnv1a("obx"));
    expect(fnv1a("obx")).not.toBe(fnv1a("obX"));
    expect(fnv1a("")).toHaveLength(8);
  });
});

describe("SaveSystem", () => {
  it("saves and loads provider state", () => {
    const system = new SaveSystem({ storage: new MemoryStorage(), compression: true });
    const state = { hp: 42 };
    system.register({
      id: "stats",
      version: 1,
      serialize: () => ({ ...state }),
      deserialize: (data) => Object.assign(state, data),
    });
    const info = system.save("slot-1");
    expect(info.slot).toBe("slot-1");
    expect(info.providerIds).toEqual(["stats"]);
    state.hp = 0;
    system.load("slot-1");
    expect(state.hp).toBe(42);
    const slots = system.listSlots();
    expect(slots).toHaveLength(1);
    expect(slots[0]!.checksum).toHaveLength(8);
    system.deleteSlot("slot-1");
    expect(system.listSlots()).toHaveLength(0);
    expect(() => system.load("slot-1")).toThrow(/not found/);
  });

  it("migrates old provider versions", () => {
    const storage = new MemoryStorage();
    const writer = new SaveSystem({ storage, compression: false });
    writer.register({
      id: "legacy",
      version: 1,
      serialize: () => ({ v: 1 }),
      deserialize: () => undefined,
    });
    writer.save("s");
    let data: unknown = null;
    const reader = new SaveSystem({ storage, compression: false });
    reader.register({
      id: "legacy",
      version: 3,
      serialize: () => ({ v: 1 }),
      deserialize: (value) => {
        data = value;
      },
      migrate: (value, from) => ({ ...(value as object), migratedFrom: from }),
    });
    reader.load("s");
    expect(data).toEqual({ v: 1, migratedFrom: 1 });
  });

  it("supports encryption", () => {
    const storage = new MemoryStorage();
    const system = new SaveSystem({ storage, encryptionKey: "secret" });
    let value = 7;
    system.register({
      id: "v",
      version: 1,
      serialize: () => value,
      deserialize: (data) => {
        value = data as number;
      },
    });
    system.save("enc");
    const raw = storage.read("enc")!;
    expect(raw).not.toContain('"data":7');
    value = 0;
    system.load("enc");
    expect(value).toBe(7);
    const wrong = new SaveSystem({ storage, encryptionKey: "nope" });
    expect(() => wrong.load("enc")).toThrow();
  });

  it("detects corrupted saves", () => {
    const storage = new MemoryStorage();
    const system = new SaveSystem({ storage, compression: false });
    system.register({
      id: "v",
      version: 1,
      serialize: () => ({ ok: true }),
      deserialize: () => undefined,
    });
    system.save("bad");
    const raw = storage.read("bad")!;
    const container = JSON.parse(raw) as { payload: string };
    const decoded = fromBase64(container.payload);
    storage.write("bad", JSON.stringify({ ...JSON.parse(raw), payload: toBase64(decoded.replace("ok", "no")) }));
    expect(() => system.load("bad")).toThrow(/checksum/);
  });

  it("runs autosave on schedule", () => {
    let saves = 0;
    const autosave = new Autosave(2, () => {
      saves += 1;
    });
    expect(autosave.update(1)).toBe(false);
    expect(autosave.update(1)).toBe(true);
    expect(saves).toBe(1);
    expect(autosave.update(2)).toBe(true);
    expect(saves).toBe(2);
  });

  it("uses cloud clients", async () => {
    const cloud = new MemoryCloudClient();
    await cloud.upload("a", "data");
    expect(await cloud.download("a")).toBe("data");
    expect(await cloud.list()).toEqual(["a"]);
    expect(await cloud.download("missing")).toBeNull();
  });
});
