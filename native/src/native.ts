export type NativeType = "i32" | "i64" | "f32" | "f64" | "void" | "string" | "ptr";

export interface NativeSignature {
  returns: NativeType;
  params: NativeType[];
}

export type NativeHandler = (...args: number[]) => number | string | void;

export interface NativeSymbol {
  name: string;
  signature: NativeSignature;
  handler: NativeHandler;
}

export function parseSignature(text: string): NativeSignature {
  const match = /^([a-z0-9]+)\(([^)]*)\)$/.exec(text.trim());
  if (!match) throw new RangeError(`invalid signature ${text}`);
  const returns = match[1] as NativeType;
  const params = match[2]!.trim() === "" ? [] : (match[2]!.split(",").map((part) => part.trim()) as NativeType[]);
  const valid: NativeType[] = ["i32", "i64", "f32", "f64", "void", "string", "ptr"];
  if (!valid.includes(returns)) throw new RangeError(`invalid return type ${returns}`);
  for (const param of params) {
    if (!valid.includes(param)) throw new RangeError(`invalid param type ${param}`);
    if (param === "void") throw new RangeError("void is not a parameter type");
  }
  return { returns, params };
}

function coerce(type: NativeType, value: number | string): number | string {
  switch (type) {
    case "i32":
      return Math.trunc(Number(value)) | 0;
    case "i64":
      return Math.trunc(Number(value));
    case "f32":
    case "f64":
      return Number(value);
    case "string":
      return String(value);
    case "ptr":
      return Math.trunc(Number(value));
    case "void":
      return 0;
  }
}

export class NativeAbi {
  private readonly symbols = new Map<string, NativeSymbol>();

  constructor(
    readonly name: string,
    readonly version = "1.0.0",
  ) {}

  define(name: string, signature: string, handler: NativeHandler): NativeSymbol {
    if (this.symbols.has(name)) throw new RangeError(`duplicate symbol ${name}`);
    const symbol: NativeSymbol = { name, signature: parseSignature(signature), handler };
    this.symbols.set(name, symbol);
    return symbol;
  }

  has(name: string): boolean {
    return this.symbols.has(name);
  }

  describe(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const symbol of this.symbols.values()) {
      out[symbol.name] = `${symbol.signature.returns}(${symbol.signature.params.join(",")})`;
    }
    return out;
  }

  call(name: string, args: Array<number | string> = []): number | string {
    const symbol = this.symbols.get(name);
    if (!symbol) throw new RangeError(`unknown symbol ${name}`);
    if (args.length !== symbol.signature.params.length) {
      throw new RangeError(`${name} expects ${symbol.signature.params.length} args, got ${args.length}`);
    }
    const marshaled = symbol.signature.params.map((type, index) => coerce(type, args[index]!));
    const result = symbol.handler(...(marshaled as number[]));
    if (symbol.signature.returns === "void") return 0;
    return coerce(symbol.signature.returns, (result ?? 0) as number | string);
  }
}

export function generateCHeader(abi: NativeAbi): string {
  const typeMap: Record<string, string> = {
    i32: "int32_t",
    i64: "int64_t",
    f32: "float",
    f64: "double",
    void: "void",
    string: "const char*",
    ptr: "void*",
  };
  const lines = [`#pragma once`, `#include <stdint.h>`, ``];
  const symbols = abi.describe();
  for (const [name, signature] of Object.entries(symbols)) {
    const parsed = parseSignature(signature);
    const params = parsed.params.map((type, index) => `${typeMap[type]} a${index}`).join(", ") || "void";
    lines.push(`${typeMap[parsed.returns]} ${name}(${params});`);
  }
  return lines.join("\n") + "\n";
}

export function generateRustBindings(abi: NativeAbi): string {
  const typeMap: Record<string, string> = {
    i32: "i32",
    i64: "i64",
    f32: "f32",
    f64: "f64",
    void: "()",
    string: "*const c_char",
    ptr: "*mut c_void",
  };
  const lines = [`use std::os::raw::c_char;`, ``, `extern "C" {`];
  const symbols = abi.describe();
  for (const [name, signature] of Object.entries(symbols)) {
    const parsed = parseSignature(signature);
    const params = parsed.params.map((type, index) => `a${index}: ${typeMap[type]}`).join(", ");
    lines.push(`    pub fn ${name}(${params}) -> ${typeMap[parsed.returns]};`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

export type Capability = "filesystem" | "network" | "gpu" | "audio" | "clock" | "none";

export interface ExtensionContext {
  platform: string;
  grants: Capability[];
  log: (message: string) => void;
}

export interface ExtensionModule {
  name: string;
  version: string;
  platforms: string[];
  capabilities: Capability[];
  abi?: NativeAbi;
  init?: (context: ExtensionContext) => void;
  update?: (dt: number) => void;
  dispose?: () => void;
}

export class ExtensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionError";
  }
}

export interface ExtensionRegistryOptions {
  platform: string;
  grants?: Capability[];
  log?: (message: string) => void;
}

export class ExtensionRegistry {
  private readonly loaded = new Map<string, ExtensionModule>();
  private readonly contexts = new Map<string, ExtensionContext>();

  constructor(readonly options: ExtensionRegistryOptions) {}

  load(module: ExtensionModule): ExtensionContext {
    if (this.loaded.has(module.name)) throw new ExtensionError(`extension ${module.name} already loaded`);
    if (!module.platforms.includes("any") && !module.platforms.includes(this.options.platform)) {
      throw new ExtensionError(`extension ${module.name} does not support ${this.options.platform}`);
    }
    const grants = this.options.grants ?? [];
    for (const capability of module.capabilities) {
      if (capability === "none") continue;
      if (!grants.includes(capability)) {
        throw new ExtensionError(`extension ${module.name} requires capability ${capability}`);
      }
    }
    const context: ExtensionContext = {
      platform: this.options.platform,
      grants: [...grants],
      log: this.options.log ?? (() => {}),
    };
    module.init?.(context);
    this.loaded.set(module.name, module);
    this.contexts.set(module.name, context);
    return context;
  }

  unload(name: string): boolean {
    const module = this.loaded.get(name);
    if (!module) return false;
    module.dispose?.();
    this.loaded.delete(name);
    this.contexts.delete(name);
    return true;
  }

  update(dt: number): number {
    let ran = 0;
    for (const module of this.loaded.values()) {
      module.update?.(dt);
      ran += 1;
    }
    return ran;
  }

  get(name: string): ExtensionModule | undefined {
    return this.loaded.get(name);
  }

  abi(name: string): NativeAbi | null {
    return this.loaded.get(name)?.abi ?? null;
  }

  names(): string[] {
    return [...this.loaded.keys()];
  }

  get size(): number {
    return this.loaded.size;
  }
}

const wasmMagic = [0x00, 0x61, 0x73, 0x6d];

export class WasmModule {
  private constructor(readonly bytes: Uint8Array) {}

  static validate(bytes: Uint8Array): boolean {
    if (bytes.length < 8) return false;
    for (let index = 0; index < 4; index += 1) {
      if (bytes[index] !== wasmMagic[index]) return false;
    }
    return bytes[4] === 1 && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 0;
  }

  static fromBytes(bytes: Uint8Array): WasmModule {
    if (!WasmModule.validate(bytes)) throw new RangeError("invalid wasm module");
    return new WasmModule(bytes);
  }

  async instantiate(imports: WebAssembly.Imports = {}): Promise<WasmInstance> {
    const module = await WebAssembly.compile(new Uint8Array(this.bytes));
    const instance = await WebAssembly.instantiate(module, imports);
    return new WasmInstance(instance);
  }
}

export class WasmInstance {
  constructor(readonly instance: WebAssembly.Instance) {}

  exports(): string[] {
    return Object.keys(this.instance.exports);
  }

  call(name: string, ...args: number[]): number | null {
    const fn = this.instance.exports[name];
    if (typeof fn !== "function") throw new RangeError(`unknown wasm export ${name}`);
    return (fn as (...values: number[]) => number)(...args) ?? null;
  }

  memory(name = "memory"): Uint8Array | null {
    const buffer = this.instance.exports[name];
    if (!(buffer instanceof WebAssembly.Memory)) return null;
    return new Uint8Array(buffer.buffer);
  }
}
