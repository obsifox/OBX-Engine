import { describe, expect, it } from "vitest";
import {
  BreakpointHit,
  Interpreter,
  ModuleLoader,
  RuntimeError,
  isClass,
  isFunction,
  isInstance,
  makeNative,
  parse,
  tokenize,
  typeCheck,
} from "../src/index.js";

function run(source: string, globals: Record<string, never> = {}) {
  const interpreter = new Interpreter({ globals });
  const exports = interpreter.run(parse(source));
  return { interpreter, exports };
}

describe("lexer", () => {
  it("tokenizes literals, operators and comments", () => {
    const tokens = tokenize('let x: number = 1.5 // note\nfn add(a, b) { return a + b; }');
    const types = tokens.map((token) => `${token.type}:${token.value}`);
    expect(types[0]).toBe("keyword:let");
    expect(types).toContain("number:1.5");
    expect(types).toContain("identifier:x");
    expect(types).toContain("operator:+");
    expect(types).toContain("identifier:add");
    expect(tokens[tokens.length - 1]!.type).toBe("eof");
    expect(tokens.filter((token) => token.value === "note").length).toBe(0);
  });

  it("handles strings with escapes and rejects garbage", () => {
    const tokens = tokenize('"a\\nb"');
    expect(tokens[0]!.value).toBe("a\nb");
    expect(() => tokenize("@")).toThrow(SyntaxError);
    expect(() => tokenize('"open')).toThrow(SyntaxError);
    expect(() => tokenize("0.5.5")).toThrow(SyntaxError);
  });
});

describe("parser", () => {
  it("parses declarations, control flow and classes", () => {
    const program = parse(`
      let x = 1;
      const name = "obsi";
      fn add(a: number, b: number): number { return a + b; }
      class Vec {
        fn init(x, y) { this.x = x; this.y = y; }
        fn sum() { return this.x + this.y; }
      }
      if (x > 0) { x = x + 1; } else { x = 0; }
      while (x < 3) { x = x + 1; }
      for (let i = 0; i < 2; i = i + 1) { print(i); }
      export fn tick() { return x; }
      export let count = 2;
      spawn(0.5, fn() { print("later"); });
    `);
    const kinds = program.statements.map((statement) => statement.kind);
    expect(kinds).toEqual(["let", "let", "fn", "class", "if", "while", "for", "export", "export", "spawn"]);
    expect(() => parse("let = 5")).toThrow(SyntaxError);
    expect(() => parse("fn (")).toThrow(SyntaxError);
    expect(() => parse("let x = (1;")).toThrow(SyntaxError);
  });
});

describe("interpreter", () => {
  it("evaluates expressions, variables and control flow", () => {
    const { exports } = run(`
      let x = 2;
      x = x + 3 * 4;
      let s = "n=" + str(x);
      let total = 0;
      for (let i = 0; i < 4; i = i + 1) { total = total + i; }
      if (total == 6 and x == 14) { total = total + 1; }
      export let result = total;
      export let label = s;
    `);
    expect(exports.get("result")).toBe(7);
    expect(exports.get("label")).toBe("n=14");
  });

  it("supports functions, closures and recursion", () => {
    const { exports } = run(`
      fn counter() {
        let n = 0;
        fn bump() { n = n + 1; return n; }
        return bump;
      }
      let c = counter();
      c();
      export let first = c();
      fn fact(n) { if (n <= 1) { return 1; } return n * fact(n - 1); }
      export let fact5 = fact(5);
    `);
    expect(exports.get("first")).toBe(2);
    expect(exports.get("fact5")).toBe(120);
  });

  it("instantiates classes with methods and fields", () => {
    const { exports } = run(`
      class Vec {
        fn init(x, y) { this.x = x; this.y = y; }
        fn add(o) { return Vec(this.x + o.x, this.y + o.y); }
        fn sum() { return this.x + this.y; }
      }
      let a = Vec(1, 2);
      let b = a.add(Vec(3, 4));
      export let total = b.sum();
      export let kind = str(a);
    `);
    expect(exports.get("total")).toBe(10);
    expect(exports.get("kind")).toContain("Vec");
  });

  it("uses arrays, maps and builtins", () => {
    const { interpreter, exports } = run(`
      let list = [1, 2];
      push(list, 3);
      let last = pop(list);
      let m = { "a": 1, b: 2 };
      m.c = 9;
      fn joinCheck() { return str(list) + "|" + str(keys(m)); }
      export let info = len(list) + last + m.a + m.c + max(2, 7) + min(2, 7) + abs(0 - 5);
      export let text = joinCheck();
    `);
    expect(exports.get("info")).toBe(2 + 3 + 1 + 9 + 7 + 2 + 5);
    expect(String(exports.get("text"))).toContain("1");
    expect(interpreter.lastPrint.length).toBe(0);
  });

  it("binds native functions and enforces arity", () => {
    const interpreter = new Interpreter({
      globals: {
        double: makeNative("double", 1, (args) => (args[0] as number) * 2),
        note: makeNative("note", "any", (args) => {
          interpreter.lastPrint.push(String(args[0]));
          return null;
        }),
      },
    });
    const exports = interpreter.run(parse('export let value = double(21); note("hi");'));
    expect(exports.get("value")).toBe(42);
    expect(interpreter.lastPrint).toEqual(["hi"]);
    expect(() => interpreter.run(parse("double(1, 2);"))).toThrow(RuntimeError);
  });

  it("reports runtime errors with line numbers", () => {
    expect(() => run("let x = 1;\nx = y + 2;")).toThrow(/undefined variable y/);
    expect(() => run("let x = 5 / 0;")).toThrow(/division by zero/);
    expect(() => run('let x = "a" - 1;')).toThrow(/invalid operands/);
    expect(() => run("const c = 1;\nc = 2;")).toThrow(/cannot assign to const/);
    try {
      run("\n\nmissing();");
    } catch (error) {
      expect((error as RuntimeError).line).toBe(3);
    }
  });

  it("supports const immutability and truthiness", () => {
    const { exports } = run(`
      let flag = not false;
      let empty = "";
      if (empty) { flag = false; }
      export let ok = flag and true;
    `);
    expect(exports.get("ok")).toBe(true);
  });
});

describe("type checker", () => {
  it("accepts consistent types and reports mismatches", () => {
    const good = typeCheck(parse('let x: number = 1;\nlet s: string = "a";\nfn f(a: number): number { return a + 1; }\nlet y = f(x);'));
    expect(good).toEqual([]);
    const bad = typeCheck(parse('let x: number = "no";\nlet z = 1;\nz = "str";\nfn f(): number { return "bad"; }'));
    expect(bad.length).toBe(3);
    expect(bad[0]!.message).toContain("cannot assign string to number");
    expect(bad[2]!.message).toContain("expected return number");
  });

  it("flags undefined variables", () => {
    const issues = typeCheck(parse("let a = ghost;"));
    expect(issues[0]!.message).toContain("undefined variable ghost");
  });
});

describe("modules", () => {
  it("loads modules with exports and caches them", () => {
    const loader = new ModuleLoader();
    loader.register("math", 'export fn twice(x) { return x * 2; }\nexport let base = 10;');
    loader.register("main", 'import "math" as m;\nexport let value = m.twice(5) + m.base;');
    const main = loader.load("main");
    expect(main.get("value")).toBe(20);
    expect(loader.has("math")).toBe(true);
    const again = loader.load("math");
    expect(again.get("base")).toBe(10);
    expect(() => loader.load("ghost")).toThrow(/unknown module/);
  });

  it("detects circular imports and duplicate registration", () => {
    const loader = new ModuleLoader();
    loader.register("a", 'import "b" as b;\nexport let x = 1;');
    loader.register("b", 'import "a" as a;\nexport let y = 2;');
    expect(() => loader.load("a")).toThrow(/circular import/);
    expect(() => loader.register("a", "export let z = 1;")).toThrow(RangeError);
  });
});

describe("scheduler and debugger", () => {
  it("runs spawned tasks by time", () => {
    const { interpreter, exports } = run(`
      let log = [];
      spawn(0.5, fn() { push(log, "a"); });
      spawn(1.5, fn() { push(log, "b"); });
      export fn done() { return len(log); }
    `);
    expect(interpreter.tick(0.4)).toBe(0);
    expect(interpreter.tick(0.2)).toBe(1);
    expect(interpreter.tick(1)).toBe(1);
    const done = exports.get("done");
    expect(isFunction(done)).toBe(true);
    expect(interpreter.call(done!, [], 0)).toBe(2);
  });

  it("hits breakpoints and reports states", () => {
    let hit = 0;
    const source = "let a = 1;\nlet b = a + 2;\nexport let c = b;";
    const interpreter = new Interpreter({
      debug: {
        breakpoints: new Set([2]),
        onLine: (line) => {
          if (line <= 2) hit += 1;
        },
      },
    });
    try {
      interpreter.run(parse(source));
    } catch (error) {
      expect(error).toBeInstanceOf(BreakpointHit);
      expect((error as BreakpointHit).line).toBe(2);
    }
    expect(hit).toBeGreaterThan(0);
  });
});

describe("value helpers", () => {
  it("classifies runtime values", () => {
    const { interpreter } = run("class K { fn init() { } }\nfn f() { return 1; }\nlet k = K();");
    const f = interpreter.globals.get("f");
    const k = interpreter.globals.get("k");
    const klass = interpreter.globals.get("K");
    expect(isFunction(f)).toBe(true);
    expect(isInstance(k)).toBe(true);
    expect(isClass(klass)).toBe(true);
    expect(interpreter.stringify([1, "a", null])).toBe('[1, a, null]');
    expect(interpreter.truthy(0)).toBe(false);
  });
});
