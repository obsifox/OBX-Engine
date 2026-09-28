import {
  type Block,
  type ClassDecl,
  type Expr,
  type FunctionDecl,
  type Program,
  type Stmt,
} from "./ast.js";

export type Value =
  | number
  | string
  | boolean
  | null
  | Value[]
  | Map<string, Value>
  | ObsiFunction
  | ObsiClass
  | ObsiInstance
  | NativeFunction;

export class RuntimeError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}

class ReturnSignal extends Error {
  constructor(readonly value: Value) {
    super("return");
  }
}

export class Environment {
  private readonly values = new Map<string, Value>();
  private readonly constants = new Set<string>();

  constructor(readonly parent: Environment | null = null) {}

  define(name: string, value: Value, constant = false): void {
    this.values.set(name, value);
    if (constant) this.constants.add(name);
    else this.constants.delete(name);
  }

  has(name: string): boolean {
    return this.values.has(name) || (this.parent?.has(name) ?? false);
  }

  get(name: string): Value {
    if (this.values.has(name)) return this.values.get(name)!;
    if (this.parent) return this.parent.get(name);
    throw new RuntimeError(`undefined variable ${name}`, 0);
  }

  set(name: string, value: Value): void {
    if (this.values.has(name)) {
      if (this.constants.has(name)) throw new RuntimeError(`cannot assign to const ${name}`, 0);
      this.values.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.set(name, value);
      return;
    }
    throw new RuntimeError(`undefined variable ${name}`, 0);
  }

  snapshot(): Record<string, Value> {
    const data: Record<string, Value> = {};
    for (const [name, value] of this.values) data[name] = value;
    return data;
  }
}

export class ObsiFunction {
  constructor(
    readonly declaration: FunctionDecl,
    readonly closure: Environment,
    readonly name: string,
  ) {}
}

export class ObsiClass {
  readonly methods = new Map<string, ObsiFunction>();

  constructor(readonly name: string) {}

  findMethod(name: string): ObsiFunction | undefined {
    return this.methods.get(name);
  }
}

export class ObsiInstance {
  readonly fields = new Map<string, Value>();

  constructor(readonly klass: ObsiClass) {}

  get(name: string): Value {
    if (this.fields.has(name)) return this.fields.get(name)!;
    const method = this.klass.findMethod(name);
    if (method) return method;
    throw new RuntimeError(`undefined property ${name}`, 0);
  }

  set(name: string, value: Value): void {
    this.fields.set(name, value);
  }
}

export interface NativeFunction {
  name: string;
  arity: number | "any";
  call: (args: Value[]) => Value;
}

export function makeNative(name: string, arity: number | "any", call: (args: Value[]) => Value): NativeFunction {
  return { name, arity, call };
}

export function isNativeFunction(value: Value): value is NativeFunction {
  return typeof value === "object" && value !== null && "call" in value && "arity" in value && "name" in value && !("declaration" in value) && !("klass" in value);
}

export function isFunction(value: Value): value is ObsiFunction {
  return value instanceof ObsiFunction;
}

export function isClass(value: Value): value is ObsiClass {
  return value instanceof ObsiClass;
}

export function isInstance(value: Value): value is ObsiInstance {
  return value instanceof ObsiInstance;
}

export function isCallable(value: Value): boolean {
  return isFunction(value) || isClass(value) || isNativeFunction(value);
}

export interface SchedulerTask {
  due: number;
  fn: ObsiFunction;
}

export class Scheduler {
  private time = 0;
  readonly tasks: SchedulerTask[] = [];

  schedule(delay: number, fn: ObsiFunction): void {
    this.tasks.push({ due: this.time + Math.max(0, delay), fn });
    this.tasks.sort((a, b) => a.due - b.due);
  }

  runDue(dt: number, invoke: (fn: ObsiFunction) => void): number {
    this.time += dt;
    let ran = 0;
    while (this.tasks.length > 0 && this.tasks[0]!.due <= this.time) {
      const task = this.tasks.shift()!;
      invoke(task.fn);
      ran += 1;
    }
    return ran;
  }

  get pending(): number {
    return this.tasks.length;
  }

  get now(): number {
    return this.time;
  }
}

export interface DebuggerHooks {
  onLine?: (line: number, environment: Environment) => void;
  breakpoints?: Set<number>;
}

export class BreakpointHit extends Error {
  constructor(readonly line: number) {
    super(`breakpoint at line ${line}`);
    this.name = "BreakpointHit";
  }
}

export interface InterpreterOptions {
  debug?: DebuggerHooks;
  globals?: Record<string, Value>;
}

export class Interpreter {
  readonly globals = new Environment();
  readonly scheduler = new Scheduler();
  readonly exports = new Map<string, Value>();
  readonly debug: DebuggerHooks;
  stepCount = 0;
  private readonly moduleResolver: ((name: string) => Map<string, Value>) | null;

  constructor(options: InterpreterOptions & { moduleResolver?: (name: string) => Map<string, Value> } = {}) {
    this.debug = options.debug ?? {};
    this.moduleResolver = options.moduleResolver ?? null;
    this.installBuiltins();
    for (const [name, value] of Object.entries(options.globals ?? {})) {
      this.globals.define(name, value, true);
    }
  }

  run(program: Program): Map<string, Value> {
    for (const statement of program.statements) this.execute(statement, this.globals);
    return this.exports;
  }

  executeBlock(block: Block, environment: Environment): void {
    for (const statement of block.statements) this.execute(statement, environment);
  }

  call(fn: Value, args: Value[], line = 0, thisValue: Value | null = null): Value {
    if (isNativeFunction(fn)) {
      if (fn.arity !== "any" && args.length !== fn.arity) {
        throw new RuntimeError(`${fn.name} expects ${fn.arity} args, got ${args.length}`, line);
      }
      return fn.call(args);
    }
    if (isFunction(fn)) {
      if (args.length !== fn.declaration.params.length) {
        throw new RuntimeError(`${fn.name} expects ${fn.declaration.params.length} args, got ${args.length}`, line);
      }
      const environment = new Environment(fn.closure);
      if (thisValue !== null) environment.define("this", thisValue);
      fn.declaration.params.forEach((param, index) => environment.define(param.name, args[index] ?? null));
      try {
        this.executeBlock(fn.declaration.body, environment);
      } catch (error) {
        if (error instanceof ReturnSignal) return error.value;
        throw error;
      }
      return null;
    }
    if (isClass(fn)) {
      const instance = new ObsiInstance(fn);
      const init = fn.findMethod("init");
      if (init) {
        const environment = new Environment(init.closure);
        environment.define("this", instance);
        init.declaration.params.forEach((param, index) => environment.define(param.name, args[index] ?? null));
        try {
          this.executeBlock(init.declaration.body, environment);
        } catch (error) {
          if (!(error instanceof ReturnSignal)) throw error;
        }
      }
      return instance;
    }
    throw new RuntimeError(`value is not callable`, line);
  }

  tick(dt: number): number {
    return this.scheduler.runDue(dt, (fn) => {
      this.call(fn, [], 0);
    });
  }

  private execute(statement: Stmt, environment: Environment): void {
    this.stepCount += 1;
    switch (statement.kind) {
      case "let": {
        const value = this.evaluate(statement.value, environment);
        environment.define(statement.name, value, statement.constant);
        return;
      }
      case "expr":
        this.evaluate(statement.expression, environment);
        return;
      case "if": {
        const condition = this.evaluate(statement.condition, environment);
        if (this.truthy(condition)) this.executeBlock(statement.then, new Environment(environment));
        else if (statement.otherwise) this.executeBlock(statement.otherwise, new Environment(environment));
        return;
      }
      case "while": {
        while (this.truthy(this.evaluate(statement.condition, environment))) {
          this.stepCount += 1;
          this.executeBlock(statement.body, new Environment(environment));
        }
        return;
      }
      case "for": {
        const scope = new Environment(environment);
        if (statement.setup) this.execute(statement.setup, scope);
        while (statement.condition === null || this.truthy(this.evaluate(statement.condition, scope))) {
          this.stepCount += 1;
          this.executeBlock(statement.body, new Environment(scope));
          if (statement.step) this.execute(statement.step, scope);
        }
        return;
      }
      case "return":
        throw new ReturnSignal(statement.value ? this.evaluate(statement.value, environment) : null);
      case "fn": {
        const fn = new ObsiFunction(statement.declaration, environment, statement.declaration.name || "anonymous");
        environment.define(statement.declaration.name || "anonymous", fn);
        return;
      }
      case "class": {
        const klass = new ObsiClass(statement.declaration.name);
        environment.define(statement.declaration.name, klass);
        for (const method of statement.declaration.methods) {
          klass.methods.set(method.name, new ObsiFunction(method, environment, method.name));
        }
        return;
      }
      case "import": {
        if (!this.moduleResolver) throw new RuntimeError(`module loading is not enabled`, statement.line);
        const exports = this.moduleResolver(statement.module);
        environment.define(statement.alias, exports);
        return;
      }
      case "export": {
        this.execute(statement.statement, environment);
        if (statement.statement.kind === "let") {
          this.exports.set(statement.name, environment.get(statement.name));
        } else if (statement.statement.kind === "fn" || statement.statement.kind === "class") {
          this.exports.set(statement.name, environment.get(statement.name));
        }
        return;
      }
      case "spawn": {
        const delay = this.evaluate(statement.delay, environment);
        const body = this.evaluate(statement.body, environment);
        if (typeof delay !== "number") throw new RuntimeError("spawn delay must be a number", statement.line);
        if (!isFunction(body)) throw new RuntimeError("spawn body must be a function", statement.line);
        this.scheduler.schedule(delay, body);
        return;
      }
    }
  }

  private evaluate(expression: Expr, environment: Environment): Value {
    this.stepCount += 1;
    switch (expression.kind) {
      case "number":
        return expression.value;
      case "string":
        return expression.value;
      case "bool":
        return expression.value;
      case "null":
        return null;
      case "identifier":
        return this.lookup(expression.name, environment, expression.line);
      case "this":
        return this.lookup("this", environment, expression.line);
      case "array":
        return expression.items.map((item) => this.evaluate(item, environment));
      case "map": {
        const map = new Map<string, Value>();
        for (const entry of expression.entries) {
          const key = entry.key.kind === "identifier" ? entry.key.name : this.evaluate(entry.key, environment);
          map.set(String(key), this.evaluate(entry.value, environment));
        }
        return map;
      }
      case "unary": {
        const operand = this.evaluate(expression.operand, environment);
        if (expression.op === "-") {
          if (typeof operand !== "number") throw new RuntimeError("unary - expects a number", 0);
          return -operand;
        }
        return !this.truthy(operand);
      }
      case "binary":
        return this.binary(expression.op, this.evaluate(expression.left, environment), this.evaluate(expression.right, environment));
      case "logical": {
        const left = this.evaluate(expression.left, environment);
        if (expression.op === "&&") return this.truthy(left) ? this.evaluate(expression.right, environment) : left;
        return this.truthy(left) ? left : this.evaluate(expression.right, environment);
      }
      case "assign": {
        const value = this.evaluate(expression.value, environment);
        if (expression.target.kind === "identifier") {
          environment.set(expression.target.name, value);
          return value;
        }
        if (expression.target.kind === "member") {
          const object = this.evaluate(expression.target.object, environment);
          if (isInstance(object)) {
            object.set(expression.target.name, value);
            return value;
          }
          if (object instanceof Map) {
            object.set(expression.target.name, value);
            return value;
          }
          throw new RuntimeError("cannot assign member on this value", expression.target.line);
        }
        if (expression.target.kind === "index") {
          const object = this.evaluate(expression.target.object, environment);
          const index = this.evaluate(expression.target.index, environment);
          if (Array.isArray(object)) {
            if (typeof index !== "number") throw new RuntimeError("array index must be a number", 0);
            object[Math.floor(index)] = value;
            return value;
          }
          if (object instanceof Map) {
            object.set(String(index), value);
            return value;
          }
          throw new RuntimeError("cannot index this value", 0);
        }
        throw new RuntimeError("invalid assignment target", 0);
      }
      case "call": {
        const args = expression.args.map((arg) => this.evaluate(arg, environment));
        if (expression.callee.kind === "member") {
          const object = this.evaluate(expression.callee.object, environment);
          if (isInstance(object)) {
            const method = object.klass.findMethod(expression.callee.name);
            if (method) return this.call(method, args, expression.line, object);
          }
          const target = this.evaluate(expression.callee, environment);
          return this.call(target, args, expression.line);
        }
        const callee = this.evaluate(expression.callee, environment);
        return this.call(callee, args, expression.line);
      }
      case "index": {
        const object = this.evaluate(expression.object, environment);
        const index = this.evaluate(expression.index, environment);
        if (Array.isArray(object)) {
          if (typeof index !== "number") throw new RuntimeError("array index must be a number", 0);
          return object[Math.floor(index)] ?? null;
        }
        if (object instanceof Map) return object.get(String(index)) ?? null;
        if (typeof object === "string") {
          if (typeof index !== "number") throw new RuntimeError("string index must be a number", 0);
          return object[Math.floor(index)] ?? null;
        }
        throw new RuntimeError("cannot index this value", 0);
      }
      case "member": {
        const object = this.evaluate(expression.object, environment);
        if (isInstance(object)) return object.get(expression.name);
        if (object instanceof Map) return object.get(expression.name) ?? null;
        if (isClass(object)) {
          const method = object.findMethod(expression.name);
          if (method) return method;
        }
        throw new RuntimeError(`undefined property ${expression.name}`, expression.line);
      }
      case "function":
        return new ObsiFunction(
          { name: expression.name ?? "anonymous", params: expression.params, returnType: { name: "any" }, body: expression.body, line: 0 },
          environment,
          expression.name ?? "anonymous",
        );
    }
  }

  private lookup(name: string, environment: Environment, line: number): Value {
    this.debug.onLine?.(line, environment);
    if (this.debug.breakpoints?.has(line)) throw new BreakpointHit(line);
    if (!environment.has(name)) throw new RuntimeError(`undefined variable ${name}`, line);
    return environment.get(name);
  }

  private binary(op: string, left: Value, right: Value): Value {
    switch (op) {
      case "+":
        if (typeof left === "number" && typeof right === "number") return left + right;
        if (typeof left === "string" || typeof right === "string") return String(this.stringify(left)) + String(this.stringify(right));
        if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
        throw new RuntimeError("invalid operands for +", 0);
      case "-":
      case "*":
      case "/":
      case "%": {
        if (typeof left !== "number" || typeof right !== "number") throw new RuntimeError(`invalid operands for ${op}`, 0);
        if (op === "-") return left - right;
        if (op === "*") return left * right;
        if (op === "/") {
          if (right === 0) throw new RuntimeError("division by zero", 0);
          return left / right;
        }
        if (right === 0) throw new RuntimeError("division by zero", 0);
        return left % right;
      }
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case "<":
      case ">":
      case "<=":
      case ">=": {
        const comparable = (typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string");
        if (!comparable) throw new RuntimeError(`invalid operands for ${op}`, 0);
        if (op === "<") return (left as number) < (right as number);
        if (op === ">") return (left as number) > (right as number);
        if (op === "<=") return (left as number) <= (right as number);
        return (left as number) >= (right as number);
      }
      default:
        throw new RuntimeError(`unknown operator ${op}`, 0);
    }
  }

  truthy(value: Value): boolean {
    if (value === null || value === false) return false;
    if (value === 0 || value === "") return false;
    return true;
  }

  stringify(value: Value): string {
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (Array.isArray(value)) return `[${value.map((item) => this.stringify(item)).join(", ")}]`;
    if (value instanceof Map) return `{${[...value.entries()].map(([key, item]) => `${key}: ${this.stringify(item)}`).join(", ")}}`;
    if (value instanceof ObsiFunction) return `<fn ${value.name}>`;
    if (value instanceof ObsiClass) return `<class ${value.name}>`;
    if (value instanceof ObsiInstance) return `<${value.klass.name} instance>`;
    return `<native ${isNativeFunction(value) ? value.name : "value"}>`;
  }

  private installBuiltins(): void {
    const native = (name: string, arity: number | "any", call: (args: Value[]) => Value) => {
      this.globals.define(name, makeNative(name, arity, call), true);
    };
    native("print", "any", (args) => {
      this.lastPrint.push(args.map((arg) => this.stringify(arg)).join(" "));
      return null;
    });
    native("len", 1, (args) => {
      const value = args[0];
      if (typeof value === "string" || Array.isArray(value)) return value.length;
      if (value instanceof Map) return value.size;
      throw new RuntimeError("len expects a string, array or map", 0);
    });
    native("push", 2, (args) => {
      const target = args[0];
      if (!Array.isArray(target)) throw new RuntimeError("push expects an array", 0);
      target.push(args[1] ?? null);
      return target.length;
    });
    native("pop", 1, (args) => {
      const target = args[0];
      if (!Array.isArray(target) || target.length === 0) throw new RuntimeError("pop expects a non-empty array", 0);
      return target.pop() ?? null;
    });
    native("str", 1, (args) => this.stringify(args[0] ?? null));
    native("num", 1, (args) => {
      const parsed = Number(args[0]);
      return Number.isFinite(parsed) ? parsed : 0;
    });
    native("abs", 1, (args) => Math.abs(this.numberArg(args[0], "abs")));
    native("floor", 1, (args) => Math.floor(this.numberArg(args[0], "floor")));
    native("sqrt", 1, (args) => Math.sqrt(this.numberArg(args[0], "sqrt")));
    native("sin", 1, (args) => Math.sin(this.numberArg(args[0], "sin")));
    native("cos", 1, (args) => Math.cos(this.numberArg(args[0], "cos")));
    native("atan2", 2, (args) => Math.atan2(this.numberArg(args[0], "atan2"), this.numberArg(args[1], "atan2")));
    native("hypot", 2, (args) => Math.hypot(this.numberArg(args[0], "hypot"), this.numberArg(args[1], "hypot")));
    native("min", 2, (args) => Math.min(this.numberArg(args[0], "min"), this.numberArg(args[1], "min")));
    native("max", 2, (args) => Math.max(this.numberArg(args[0], "max"), this.numberArg(args[1], "max")));
    native("keys", 1, (args) => {
      if (!(args[0] instanceof Map)) throw new RuntimeError("keys expects a map", 0);
      return [...args[0].keys()];
    });
    native("has", 2, (args) => {
      const target = args[0];
      const key = String(args[1]);
      if (target instanceof Map) return target.has(key);
      if (Array.isArray(target)) return target.some((item) => item === args[1]);
      return false;
    });
  }

  readonly lastPrint: string[] = [];

  private numberArg(value: Value | undefined, name: string): number {
    if (typeof value !== "number") throw new RuntimeError(`${name} expects a number`, 0);
    return value;
  }
}
