import {
  Interpreter,
  ModuleLoader,
  isNativeFunction,
  makeNative,
  parse,
  type NativeFunction,
  type Value,
} from "@obx/obsiscript";

export interface ApiParam {
  name: string;
  type: string;
}

export interface ApiFunction {
  name: string;
  params: ApiParam[];
  returns: string;
}

export interface ApiConstant {
  name: string;
  type: string;
}

export interface ApiDefinition {
  functions: ApiFunction[];
  constants?: ApiConstant[];
}

export function generateDts(api: ApiDefinition, namespace = "obx"): string {
  const lines: string[] = [`declare namespace ${namespace} {`];
  for (const constant of api.constants ?? []) {
    lines.push(`  const ${constant.name}: ${constant.type};`);
  }
  for (const fn of api.functions) {
    const params = fn.params.map((param) => `${param.name}: ${param.type}`).join(", ");
    lines.push(`  function ${fn.name}(${params}): ${fn.returns};`);
  }
  lines.push("}");
  return lines.join("\n");
}

export function validateApi(api: ApiDefinition, bindings: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const fn of api.functions) {
    const binding = bindings[fn.name];
    const callable =
      typeof binding === "function" ||
      (typeof binding === "object" && binding !== null && typeof (binding as { call?: unknown }).call === "function");
    if (!callable) missing.push(fn.name);
  }
  for (const constant of api.constants ?? []) {
    if (!(constant.name in bindings)) missing.push(constant.name);
  }
  return missing;
}

export class SandboxViolation extends Error {
  constructor(
    readonly identifier: string,
    readonly line: number,
  ) {
    super(`sandbox violation: ${identifier}`);
    this.name = "SandboxViolation";
  }
}

const defaultBlocked = [
  "eval",
  "Function",
  "globalThis",
  "process",
  "require",
  "module",
  "fetch",
  "XMLHttpRequest",
  "window",
  "document",
  "import",
  "__proto__",
  "constructor",
  "WebAssembly",
];

export class Sandbox {
  readonly blocked: Set<string>;

  constructor(blocked: readonly string[] = defaultBlocked) {
    this.blocked = new Set(blocked);
  }

  scan(source: string): Array<{ identifier: string; line: number }> {
    const violations: Array<{ identifier: string; line: number }> = [];
    const stripped = source.replace(/\/\/[^\n]*/g, "").replace(/"[^"\n]*"/g, '""');
    stripped.split("\n").forEach((text, index) => {
      for (const identifier of this.blocked) {
        const pattern = new RegExp(`\\b${identifier}\\b`);
        if (pattern.test(text)) violations.push({ identifier, line: index + 1 });
      }
    });
    return violations;
  }

  assert(source: string): void {
    const violations = this.scan(source);
    if (violations.length > 0) throw new SandboxViolation(violations[0]!.identifier, violations[0]!.line);
  }
}

export type ScriptPhase = "registered" | "loaded" | "running" | "disposed" | "failed";

export interface ScriptContext {
  api: Record<string, Value>;
  state: Map<string, Value>;
}

export interface ExportBag {
  get(name: string): Value | undefined;
  has(name: string): boolean;
}

export interface ScriptBundle {
  exports: ExportBag;
  init?: (() => void) | null;
  update?: ((dt: number) => void) | null;
  dispose?: (() => void) | null;
}

class ObjectExports implements ExportBag {
  constructor(private readonly source: Record<string, unknown>) {}

  get(name: string): Value | undefined {
    return this.source[name] as Value | undefined;
  }

  has(name: string): boolean {
    return name in this.source;
  }
}

export interface ScriptEngine {
  readonly name: string;
  execute(source: string, context: ScriptContext): ScriptBundle;
}

export class ObsiScriptEngine implements ScriptEngine {
  readonly name = "obsiscript";

  execute(source: string, context: ScriptContext): ScriptBundle {
    const globals: Record<string, Value> = { ...context.api, state: context.state };
    const loader = new ModuleLoader(globals);
    const interpreter = new Interpreter({
      globals,
      moduleResolver: (name) => loader.load(name),
    });
    const exports = interpreter.run(parse(source));
    const get = (name: string) => (exports.get(name) as Value | undefined) ?? null;
    return {
      exports,
      init: exports.has("init") ? () => interpreter.call(get("init"), [], 0) : null,
      update: exports.has("update") ? (dt: number) => interpreter.call(get("update"), [dt], 0) : null,
      dispose: exports.has("dispose") ? () => interpreter.call(get("dispose"), [], 0) : null,
    };
  }
}

export interface JsBundle {
  exports: Record<string, unknown>;
  init?: (() => void) | null;
  update?: ((dt: number) => void) | null;
  dispose?: (() => void) | null;
}

export class JavaScriptEngine implements ScriptEngine {
  readonly name = "javascript";

  constructor(readonly sandbox = new Sandbox()) {}

  execute(source: string, context: ScriptContext): ScriptBundle {
    this.sandbox.assert(source);
    const api: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context.api)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new RangeError(`binding ${key} is not a valid identifier`);
      api[key] = isNativeFunction(value)
        ? (...args: unknown[]) => (value as NativeFunction).call(args as Value[])
        : value;
    }
    const names = Object.keys(api);
    const factory = new Function(
      ...names,
      "exports",
      "state",
      `"use strict";\n${source}\n;return { exports: exports, init: typeof init === "function" ? init : null, update: typeof update === "function" ? update : null, dispose: typeof dispose === "function" ? dispose : null };`,
    ) as (...args: unknown[]) => JsBundle;
    const exportsObject: Record<string, unknown> = {};
    const result = factory(...names.map((name) => api[name]), exportsObject, context.state);
    return {
      exports: new ObjectExports(exportsObject),
      init: result.init ?? null,
      update: result.update ?? null,
      dispose: result.dispose ?? null,
    };
  }
}

export interface ScriptHooks {
  onPhase?: (id: string, phase: ScriptPhase) => void;
  onError?: (id: string, error: Error) => void;
}

export interface ScriptHostOptions {
  engine: ScriptEngine;
  api?: ApiDefinition;
  bindings?: Record<string, Value>;
  hooks?: ScriptHooks;
}

export interface RegisterOptions {
  deps?: string[];
}

export class ScriptModule {
  phase: ScriptPhase = "registered";
  version = 1;
  readonly state = new Map<string, Value>();
  readonly errors: Error[] = [];
  bundle: ScriptBundle | null = null;
  deps: string[] = [];

  constructor(
    readonly id: string,
    public source: string,
  ) {}
}

export class ScriptHost {
  private readonly modules = new Map<string, ScriptModule>();
  private readonly loading = new Set<string>();

  constructor(readonly options: ScriptHostOptions) {}

  register(id: string, source: string, options: RegisterOptions = {}): ScriptModule {
    if (this.modules.has(id)) throw new RangeError(`script ${id} already registered`);
    const module = new ScriptModule(id, source);
    module.deps = [...(options.deps ?? [])];
    this.modules.set(id, module);
    this.transition(module, "registered");
    return module;
  }

  get(id: string): ScriptModule | undefined {
    return this.modules.get(id);
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  load(id: string): ScriptModule {
    const module = this.resolve(id);
    if (module.phase === "loaded" || module.phase === "running") return module;
    if (this.loading.has(id)) throw new RangeError(`circular dependency involving ${id}`);
    this.loading.add(id);
    try {
      for (const dep of module.deps) this.load(dep);
      const context = this.context(module);
      module.bundle = this.options.engine.execute(module.source, context);
      this.transition(module, "loaded");
    } catch (error) {
      module.errors.push(error as Error);
      this.transition(module, "failed");
      this.options.hooks?.onError?.(id, error as Error);
      throw error;
    } finally {
      this.loading.delete(id);
    }
    return module;
  }

  init(id: string): void {
    const module = this.load(id);
    try {
      module.bundle?.init?.();
      this.transition(module, "running");
    } catch (error) {
      module.errors.push(error as Error);
      this.options.hooks?.onError?.(id, error as Error);
      throw error;
    }
  }

  update(dt: number): number {
    let ran = 0;
    for (const module of this.modules.values()) {
      if (module.phase !== "running" || !module.bundle?.update) continue;
      try {
        module.bundle.update(dt);
        ran += 1;
      } catch (error) {
        module.errors.push(error as Error);
        this.options.hooks?.onError?.(module.id, error as Error);
      }
    }
    return ran;
  }

  reload(id: string, source: string): ScriptModule {
    const module = this.resolve(id);
    const phase = module.phase;
    try {
      module.bundle?.dispose?.();
    } catch (error) {
      module.errors.push(error as Error);
    }
    module.source = source;
    module.version += 1;
    module.bundle = null;
    this.transition(module, "registered");
    const fresh = this.load(id);
    if (phase === "running") {
      fresh.bundle?.init?.();
      this.transition(fresh, "running");
    }
    return fresh;
  }

  dispose(id: string): void {
    const module = this.resolve(id);
    try {
      module.bundle?.dispose?.();
    } catch (error) {
      module.errors.push(error as Error);
      this.options.hooks?.onError?.(id, error as Error);
    }
    module.bundle = null;
    this.transition(module, "disposed");
  }

  stats(): Record<string, { phase: ScriptPhase; version: number; errors: number; deps: string[] }> {
    const stats: Record<string, { phase: ScriptPhase; version: number; errors: number; deps: string[] }> = {};
    for (const [id, module] of this.modules) {
      stats[id] = { phase: module.phase, version: module.version, errors: module.errors.length, deps: module.deps };
    }
    return stats;
  }

  private resolve(id: string): ScriptModule {
    const module = this.modules.get(id);
    if (!module) throw new RangeError(`unknown script ${id}`);
    return module;
  }

  private context(module: ScriptModule): ScriptContext {
    const api: Record<string, Value> = { ...(this.options.bindings ?? {}) };
    for (const fn of this.options.api?.functions ?? []) {
      if (!(fn.name in api)) {
        api[fn.name] = makeNative(fn.name, fn.params.length, () => null);
      }
    }
    return { api, state: module.state };
  }

  private transition(module: ScriptModule, phase: ScriptPhase): void {
    module.phase = phase;
    this.options.hooks?.onPhase?.(module.id, phase);
  }
}

export interface MakeHostOptions extends Partial<ScriptHostOptions> {}

export function makeHost(options: MakeHostOptions = {}): ScriptHost {
  return new ScriptHost({
    engine: options.engine ?? new JavaScriptEngine(),
    api: options.api,
    bindings: options.bindings,
    hooks: options.hooks,
  });
}
