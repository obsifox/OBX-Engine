import { describe, expect, it } from "vitest";
import {
  ExtensionError,
  ExtensionRegistry,
  NativeAbi,
  WasmModule,
  generateCHeader,
  generateRustBindings,
  parseSignature,
} from "../src/index.js";

const wasmEmpty = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

const wasmAdd = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b,
]);

describe("parseSignature", () => {
  it("parses abi signatures", () => {
    expect(parseSignature("i32(i32,i32)")).toEqual({ returns: "i32", params: ["i32", "i32"] });
    expect(parseSignature("void()")).toEqual({ returns: "void", params: [] });
    expect(parseSignature("f64(f64, string)")).toEqual({ returns: "f64", params: ["f64", "string"] });
    expect(() => parseSignature("nope")).toThrow(RangeError);
    expect(() => parseSignature("i32(void)")).toThrow(RangeError);
    expect(() => parseSignature("weird(i32)")).toThrow(RangeError);
  });
});

describe("NativeAbi", () => {
  it("defines symbols and marshals calls", () => {
    const abi = new NativeAbi("mathx", "1.2.0");
    abi.define("add", "i32(i32,i32)", (a, b) => (a as number) + (b as number));
    abi.define("scale", "f64(f64,f64)", (a, b) => (a as number) * (b as number));
    abi.define("tag", "string(string)", (a) => `tag:${a}`);
    abi.define("noop", "void()", () => {});
    expect(abi.call("add", [2, 3])).toBe(5);
    expect(abi.call("add", [2.7, 3.2])).toBe(5);
    expect(abi.call("scale", [1.5, 2])).toBe(3);
    expect(abi.call("tag", ["x"])).toBe("tag:x");
    expect(abi.call("noop")).toBe(0);
    expect(abi.has("add")).toBe(true);
    expect(abi.describe()).toEqual({
      add: "i32(i32,i32)",
      scale: "f64(f64,f64)",
      tag: "string(string)",
      noop: "void()",
    });
  });

  it("rejects bad symbols and calls", () => {
    const abi = new NativeAbi("bad");
    abi.define("one", "i32(i32)", (a) => (a as number) + 1);
    expect(() => abi.define("one", "i32(i32)", (a) => a)).toThrow(RangeError);
    expect(() => abi.call("ghost")).toThrow(RangeError);
    expect(() => abi.call("one", [])).toThrow(RangeError);
    expect(() => abi.call("one", [1, 2])).toThrow(RangeError);
    expect(() => abi.define("x", "bogus(i32)", (a) => a)).toThrow(RangeError);
  });

  it("generates c and rust binding text", () => {
    const abi = new NativeAbi("core");
    abi.define("add", "i32(i32,i32)", (a, b) => (a as number) + (b as number));
    abi.define("title", "string()", () => "obx");
    const header = generateCHeader(abi);
    expect(header).toContain("#include <stdint.h>");
    expect(header).toContain("int32_t add(int32_t a0, int32_t a1);");
    expect(header).toContain("const char* title(void);");
    const rust = generateRustBindings(abi);
    expect(rust).toContain('extern "C" {');
    expect(rust).toContain("pub fn add(a0: i32, a1: i32) -> i32;");
    expect(rust).toContain("pub fn title() -> *const c_char;");
  });
});

describe("ExtensionRegistry", () => {
  it("gates platforms and capabilities", () => {
    const registry = new ExtensionRegistry({ platform: "web", grants: ["clock"] });
    const linuxOnly = {
      name: "fs",
      version: "1.0.0",
      platforms: ["linux"],
      capabilities: ["filesystem" as const],
    };
    expect(() => registry.load(linuxOnly)).toThrow(ExtensionError);

    const needsNet = {
      name: "net",
      version: "1.0.0",
      platforms: ["any"],
      capabilities: ["network" as const],
    };
    expect(() => registry.load(needsNet)).toThrow(/requires capability network/);
    expect(registry.size).toBe(0);
  });

  it("runs lifecycle and exposes abi", () => {
    const events: string[] = [];
    const abi = new NativeAbi("mathx");
    abi.define("twice", "i32(i32)", (a) => (a as number) * 2);
    const registry = new ExtensionRegistry({
      platform: "linux",
      grants: ["clock", "gpu"],
      log: (message) => events.push(message),
    });
    registry.load({
      name: "mathx",
      version: "2.0.0",
      platforms: ["any"],
      capabilities: ["none"],
      abi,
      init: (context) => events.push(`init:${context.platform}`),
      update: (dt) => events.push(`update:${dt}`),
      dispose: () => events.push("dispose"),
    });
    expect(registry.get("mathx")!.version).toBe("2.0.0");
    expect(registry.abi("mathx")!.call("twice", [21])).toBe(42);
    expect(registry.update(0.5)).toBe(1);
    expect(registry.names()).toEqual(["mathx"]);
    expect(() => registry.load({ name: "mathx", version: "1", platforms: ["any"], capabilities: ["none"] })).toThrow(/already loaded/);
    expect(registry.unload("mathx")).toBe(true);
    expect(registry.unload("mathx")).toBe(false);
    expect(events).toEqual(["init:linux", "update:0.5", "dispose"]);
    expect(registry.abi("mathx")).toBe(null);
  });
});

describe("WasmModule", () => {
  it("validates module bytes", () => {
    expect(WasmModule.validate(wasmEmpty)).toBe(true);
    expect(WasmModule.validate(wasmAdd)).toBe(true);
    expect(WasmModule.validate(new Uint8Array([0x00, 0x61, 0x73]))).toBe(false);
    expect(WasmModule.validate(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(false);
    expect(() => WasmModule.fromBytes(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toThrow(RangeError);
  });

  it("instantiates modules and calls exports", async () => {
    const empty = await WasmModule.fromBytes(wasmEmpty).instantiate();
    expect(empty.exports()).toEqual([]);
    expect(empty.memory()).toBe(null);

    const add = await WasmModule.fromBytes(wasmAdd).instantiate();
    expect(add.exports()).toEqual(["add"]);
    expect(add.call("add", 2, 3)).toBe(5);
    expect(add.call("add", -4, 10)).toBe(6);
    expect(() => add.call("ghost", 1)).toThrow(RangeError);
    expect(add.memory()).toBe(null);
  });
});
