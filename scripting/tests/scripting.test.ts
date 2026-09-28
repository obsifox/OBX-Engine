import { describe, expect, it } from "vitest";
import {
  JavaScriptEngine,
  ObsiScriptEngine,
  Sandbox,
  SandboxViolation,
  ScriptHost,
  generateDts,
  makeHost,
  validateApi,
  type ApiDefinition,
  type ScriptPhase,
} from "../src/index.js";
import { makeNative, type Value } from "@obx/obsiscript";

describe("Sandbox", () => {
  it("flags blocked identifiers and passes clean code", () => {
    const sandbox = new Sandbox();
    expect(sandbox.scan("let x = 1;").length).toBe(0);
    const violations = sandbox.scan('eval("1+1")');
    expect(violations[0]!.identifier).toBe("eval");
    expect(violations[0]!.line).toBe(1);
    expect(() => sandbox.assert("process.exit(0)")).toThrow(SandboxViolation);
    expect(() => sandbox.assert("globalThis.x = 1")).toThrow(SandboxViolation);
    expect(() => sandbox.assert("require('fs')")).toThrow(SandboxViolation);
    expect(() => sandbox.assert('let s = "eval is fine in strings";')).not.toThrow();
    expect(() => sandbox.assert("let x = 1; // process here")).not.toThrow();
    expect(new Sandbox(["boom"]).scan("boom()")[0]!.identifier).toBe("boom");
  });
});

const api: ApiDefinition = {
  functions: [
    { name: "spawnDot", params: [{ name: "x", type: "number" }, { name: "y", type: "number" }], returns: "void" },
    { name: "score", params: [], returns: "number" },
  ],
  constants: [{ name: "VERSION", type: "string" }],
};

describe("generateDts and validateApi", () => {
  it("emits declaration text for the api", () => {
    const dts = generateDts(api);
    expect(dts).toContain("declare namespace obx {");
    expect(dts).toContain("const VERSION: string;");
    expect(dts).toContain("function spawnDot(x: number, y: number): void;");
    expect(dts).toContain("function score(): number;");
    expect(generateDts(api, "game")).toContain("declare namespace game {");
  });

  it("reports missing bindings", () => {
    expect(validateApi(api, { spawnDot: () => {}, score: () => 1, VERSION: "1" })).toEqual([]);
    expect(validateApi(api, { spawnDot: () => {} })).toEqual(["score", "VERSION"]);
  });
});

describe("JavaScriptEngine", () => {
  it("executes scripts with injected api and exports", () => {
    const engine = new JavaScriptEngine();
    const calls: string[] = [];
    const bundle = engine.execute(
      'exports.answer = score() + 1;\nexports.name = VERSION;',
      {
        api: {
          score: makeNative("score", 0, () => 41),
          VERSION: "0.9.0" as Value,
        },
        state: new Map(),
      },
    );
    expect(bundle.exports.get("answer")).toBe(42);
    expect(bundle.exports.get("name")).toBe("0.9.0");
    calls.push(engine.name);
    expect(calls).toEqual(["javascript"]);
  });

  it("runs lifecycle hooks and rejects sandbox violations", () => {
    const engine = new JavaScriptEngine();
    const events: string[] = [];
    const bundle = engine.execute(
      'let n = 0;\nfunction init() { n = 1; exports.ready = n; }\nfunction update(dt) { exports.total = (exports.total || 0) + dt; }\nfunction dispose() { exports.dead = true; }',
      { api: {}, state: new Map() },
    );
    bundle.init?.();
    bundle.update?.(0.5);
    bundle.update?.(1.5);
    bundle.dispose?.();
    expect(bundle.exports.get("ready")).toBe(1);
    expect(bundle.exports.get("total")).toBe(2);
    expect(bundle.exports.get("dead")).toBe(true);
    expect(() => engine.execute("eval('x')", { api: {}, state: new Map() })).toThrow(SandboxViolation);
    expect(events).toEqual([]);
  });
});

describe("ScriptHost", () => {
  function bindings() {
    const log: string[] = [];
    return {
      log,
      values: {
        log: makeNative("log", "any", (args) => {
          log.push(String(args[0]));
          return null;
        }),
        score: makeNative("score", 0, () => 7),
      },
    };
  }

  it("manages lifecycle phases and stats", () => {
    const phases: Array<[string, ScriptPhase]> = [];
    const { values } = bindings();
    const host = new ScriptHost({
      engine: new JavaScriptEngine(),
      api,
      bindings: values,
      hooks: { onPhase: (id, phase) => phases.push([id, phase]) },
    });
    host.register("main", 'exports.v = score();\nfunction init() { exports.up = 0; }\nfunction update(dt) { exports.up += dt; }');
    host.init("main");
    expect(host.update(0.25)).toBe(1);
    expect(host.update(0.25)).toBe(1);
    const module = host.get("main")!;
    expect(module.bundle!.exports.get("v")).toBe(7);
    expect(module.bundle!.exports.get("up")).toBe(0.5);
    host.dispose("main");
    expect(host.get("main")!.phase).toBe("disposed");
    expect(host.stats().main).toEqual({ phase: "disposed", version: 1, errors: 0, deps: [] });
    expect(phases.map(([, phase]) => phase)).toEqual(["registered", "loaded", "running", "disposed"]);
    expect(host.update(1)).toBe(0);
  });

  it("hot reloads scripts while preserving state", () => {
    const host = new ScriptHost({ engine: new JavaScriptEngine(), bindings: {} });
    host.register("game", 'function init() { if (!state.get("runs")) state.set("runs", 0); state.set("runs", state.get("runs") + 1); exports.mode = "v1"; }\nfunction update(dt) { exports.frames = (exports.frames || 0) + 1; }');
    host.init("game");
    host.update(1);
    const module = host.reload("game", 'function init() { state.set("runs", state.get("runs") + 1); exports.mode = "v2"; }\nfunction update(dt) { exports.frames = 100; }');
    expect(module.version).toBe(2);
    expect(module.phase).toBe("running");
    expect(module.bundle!.exports.get("mode")).toBe("v2");
    host.update(1);
    expect(module.bundle!.exports.get("frames")).toBe(100);
    expect(module.state.get("runs")).toBe(2);
  });

  it("loads dependencies in order and rejects cycles", () => {
    const host = new ScriptHost({ engine: new JavaScriptEngine(), bindings: {} });
    host.register("a", "exports.name = 'a';", { deps: ["b"] });
    host.register("b", "exports.name = 'b';", { deps: ["c"] });
    host.register("c", "exports.name = 'c';");
    host.load("a");
    expect(host.get("c")!.phase).toBe("loaded");
    expect(host.stats().a.deps).toEqual(["b"]);

    const cyclic = new ScriptHost({ engine: new JavaScriptEngine(), bindings: {} });
    cyclic.register("x", "exports.n = 1;", { deps: ["y"] });
    cyclic.register("y", "exports.n = 2;", { deps: ["x"] });
    expect(() => cyclic.load("x")).toThrow(/circular dependency/);
  });

  it("records script errors and reports them", () => {
    const errors: string[] = [];
    const host = new ScriptHost({
      engine: new JavaScriptEngine(),
      bindings: {},
      hooks: { onError: (id) => errors.push(id) },
    });
    host.register("bad", "missingFn();");
    expect(() => host.load("bad")).toThrow();
    expect(host.get("bad")!.phase).toBe("failed");
    expect(errors).toEqual(["bad"]);
    expect(host.get("bad")!.errors.length).toBe(1);
    expect(host.get("ghost")).toBe(undefined);
  });
});

describe("ObsiScriptEngine integration", () => {
  it("runs obsiscript with host api and lifecycle", () => {
    const host = new ScriptHost({
      engine: new ObsiScriptEngine(),
      bindings: {
        boost: makeNative("boost", 1, (args) => (args[0] as number) + 10),
      },
    });
    host.register("script", 'export fn init() { state["runs"] = 0; }\nexport fn update(dt) { state["runs"] = state["runs"] + 1; }\nexport let base = boost(5);');
    host.init("script");
    host.update(1);
    host.update(1);
    const module = host.get("script")!;
    expect(module.bundle!.exports.get("base")).toBe(15);
    expect(module.state.get("runs")).toBe(2);
  });
});

describe("makeHost helper", () => {
  it("creates a host with default engine", () => {
    const host = makeHost({ bindings: { x: 1 as Value } });
    host.register("s", "exports.y = 2;");
    host.load("s");
    expect(host.get("s")!.bundle!.exports.get("y")).toBe(2);
  });
});
