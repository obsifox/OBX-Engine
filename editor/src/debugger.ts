export interface DebugLocation {
  script: string;
  line: number;
  column: number;
}

export type DebugValue = number | string | boolean | null | DebugValue[] | { [key: string]: DebugValue };

export type DebugValueMap = Record<string, DebugValue>;

export interface Breakpoint {
  id: string;
  location: DebugLocation;
  condition: string | null;
  enabled: boolean;
  hitCount: number;
}

export class BreakpointManager {
  #breakpoints = new Map<string, Breakpoint>();
  #nextId = 1;

  add(location: DebugLocation, condition: string | null = null): Breakpoint {
    const id = `bp-${this.#nextId++}`;
    const breakpoint: Breakpoint = { id, location: { ...location }, condition, enabled: true, hitCount: 0 };
    this.#breakpoints.set(id, breakpoint);
    return breakpoint;
  }

  remove(id: string): boolean {
    return this.#breakpoints.delete(id);
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const breakpoint = this.#breakpoints.get(id);
    if (!breakpoint) return false;
    breakpoint.enabled = enabled;
    return true;
  }

  at(location: DebugLocation): Breakpoint[] {
    return [...this.#breakpoints.values()].filter(
      (breakpoint) =>
        breakpoint.enabled &&
        breakpoint.location.script === location.script &&
        breakpoint.location.line === location.line,
    );
  }

  registerHit(breakpoint: Breakpoint, scope: DebugValueMap): void {
    breakpoint.hitCount += 1;
    void scope;
  }

  shouldPause(location: DebugLocation, scope: DebugValueMap): Breakpoint | null {
    for (const breakpoint of this.at(location)) {
      if (breakpoint.condition && !evaluateWatch(breakpoint.condition, scope)) continue;
      return breakpoint;
    }
    return null;
  }

  get all(): Breakpoint[] {
    return [...this.#breakpoints.values()];
  }
}

export interface DebugFrame {
  functionName: string;
  location: DebugLocation;
  locals: DebugValueMap;
}

export class CallStack {
  #frames: DebugFrame[] = [];

  push(frame: DebugFrame): void {
    this.#frames.push({ ...frame, locals: { ...frame.locals } });
  }

  pop(): DebugFrame | null {
    return this.#frames.pop() ?? null;
  }

  replaceTop(location: DebugLocation): void {
    const top = this.#frames[this.#frames.length - 1];
    if (top) top.location = { ...location };
  }

  updateLocal(name: string, value: DebugValue): boolean {
    const top = this.#frames[this.#frames.length - 1];
    if (!top) return false;
    top.locals[name] = value;
    return true;
  }

  get depth(): number {
    return this.#frames.length;
  }

  frames(): DebugFrame[] {
    return [...this.#frames].reverse();
  }

  top(): DebugFrame | null {
    return this.#frames.length > 0 ? this.#frames[this.#frames.length - 1]! : null;
  }

  clear(): void {
    this.#frames = [];
  }
}

export type StepMode = "continue" | "into" | "over" | "out";

export class StepController {
  mode: StepMode = "continue";
  #anchorDepth = 0;

  request(mode: StepMode, depth: number): void {
    this.mode = mode;
    this.#anchorDepth = depth;
  }

  shouldStopAt(depth: number, crossedLine: boolean): boolean {
    switch (this.mode) {
      case "into":
        return crossedLine;
      case "over":
        return crossedLine && depth <= this.#anchorDepth;
      case "out":
        return depth < this.#anchorDepth;
      default:
        return false;
    }
  }

  get anchorDepth(): number {
    return this.#anchorDepth;
  }
}

export interface WatchExpression {
  id: string;
  expression: string;
  value: DebugValue | null;
  error: string | null;
}

export class WatchList {
  #watches = new Map<string, WatchExpression>();
  #nextId = 1;

  add(expression: string): WatchExpression {
    const id = `watch-${this.#nextId++}`;
    const watch: WatchExpression = { id, expression, value: null, error: null };
    this.#watches.set(id, watch);
    return watch;
  }

  remove(id: string): boolean {
    return this.#watches.delete(id);
  }

  evaluate(scope: DebugValueMap): WatchExpression[] {
    for (const watch of this.#watches.values()) {
      try {
        watch.value = evaluateWatch(watch.expression, scope);
        watch.error = null;
      } catch (error) {
        watch.value = null;
        watch.error = error instanceof Error ? error.message : String(error);
      }
    }
    return [...this.#watches.values()];
  }

  get all(): WatchExpression[] {
    return [...this.#watches.values()];
  }
}

export function evaluateWatch(expression: string, scope: DebugValueMap): DebugValue {
  const tokens = tokenizeWatch(expression);
  let position = 0;

  const peek = (): string | null => (position < tokens.length ? tokens[position]! : null);
  const consume = (): string => {
    const token = peek();
    if (token === null) throw new Error("unexpected end of expression");
    position += 1;
    return token;
  };

  const parsePrimary = (): DebugValue => {
    const token = consume();
    if (token === "(") {
      const value = parseAdditive();
      if (consume() !== ")") throw new Error("expected )");
      return value;
    }
    if (token === "-" ) {
      const value = parsePrimary();
      if (typeof value !== "number") throw new Error("unary minus on non-number");
      return -value;
    }
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    if (token.startsWith('"')) return token.slice(1, -1);
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "null") return null;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
      if (!(token in scope)) throw new Error(`unknown variable ${token}`);
      let value = scope[token]!;
      while (peek() === ".") {
        consume();
        const key = consume();
        if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`cannot access ${key}`);
        if (!(key in value)) throw new Error(`unknown property ${key}`);
        value = (value as DebugValueMap)[key]!;
      }
      return value;
    }
    throw new Error(`unexpected token ${token}`);
  };

  const parseMultiplicative = (): DebugValue => {
    let value = parsePrimary();
    while (peek() === "*" || peek() === "/") {
      const operator = consume();
      const right = parsePrimary();
      if (typeof value !== "number" || typeof right !== "number") throw new Error("arithmetic on non-number");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };

  const parseAdditive = (): DebugValue => {
    let value = parseMultiplicative();
    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      const right = parseMultiplicative();
      if (operator === "+" && typeof value === "string" && typeof right === "string") {
        value = value + right;
        continue;
      }
      if (typeof value !== "number" || typeof right !== "number") throw new Error("arithmetic on non-number");
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  const parseComparison = (): DebugValue => {
    const value = parseAdditive();
    const token = peek();
    if (token === ">" || token === "<" || token === ">=" || token === "<=" || token === "==" || token === "!=") {
      consume();
      const right = parseAdditive();
      switch (token) {
        case ">":
          return (value as number) > (right as number);
        case "<":
          return (value as number) < (right as number);
        case ">=":
          return (value as number) >= (right as number);
        case "<=":
          return (value as number) <= (right as number);
        case "==":
          return value === right;
        default:
          return value !== right;
      }
    }
    return value;
  };

  const parseAnd = (): DebugValue => {
    let value = parseComparison();
    while (peek() === "&&") {
      consume();
      const right = parseComparison();
      value = Boolean(value) && Boolean(right);
    }
    return value;
  };

  const parseOr = (): DebugValue => {
    let value = parseAnd();
    while (peek() === "||") {
      consume();
      const right = parseAnd();
      value = Boolean(value) || Boolean(right);
    }
    return value;
  };

  const result = parseOr();
  if (position < tokens.length) throw new Error(`unexpected token ${tokens[position]}`);
  return result;
}

function tokenizeWatch(expression: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"') {
      let value = '"';
      index += 1;
      while (index < expression.length && expression[index] !== '"') {
        value += expression[index];
        index += 1;
      }
      if (index >= expression.length) throw new Error("unterminated string");
      tokens.push(value + '"');
      index += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = "";
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index]!)) {
        value += expression[index];
        index += 1;
      }
      tokens.push(value);
      continue;
    }
    if (/[0-9]/.test(char) || (char === "-" && /[0-9]/.test(expression[index + 1] ?? ""))) {
      let value = "";
      if (char === "-") {
        value += "-";
        index += 1;
      }
      while (index < expression.length && /[0-9.]/.test(expression[index]!)) {
        value += expression[index];
        index += 1;
      }
      tokens.push(value);
      continue;
    }
    if (char === ">" || char === "<" || char === "=" || char === "!") {
      const pair = expression.slice(index, index + 2);
      if (pair === ">=" || pair === "<=" || pair === "==" || pair === "!=") {
        tokens.push(pair);
        index += 2;
        continue;
      }
      if (char === "=" || char === "!") throw new Error(`unexpected character ${char}`);
      tokens.push(char);
      index += 1;
      continue;
    }
    if (char === "&" || char === "|") {
      const pair = expression.slice(index, index + 2);
      if (pair === "&&" || pair === "||") {
        tokens.push(pair);
        index += 2;
        continue;
      }
      throw new Error(`unexpected character ${char}`);
    }
    if ("()+*/.,".includes(char)) {
      tokens.push(char);
      index += 1;
      continue;
    }
    if (char === "-") {
      tokens.push("-");
      index += 1;
      continue;
    }
    throw new Error(`unexpected character ${char}`);
  }
  return tokens;
}

export interface ExceptionInfo {
  message: string;
  location: DebugLocation | null;
  handled: boolean;
}

export class ExceptionTrap {
  pauseOnThrow = true;
  #exceptions: ExceptionInfo[] = [];

  trap(message: string, location: DebugLocation | null): ExceptionInfo {
    const info: ExceptionInfo = { message, location: location ? { ...location } : null, handled: false };
    this.#exceptions.push(info);
    return info;
  }

  markHandled(index: number): boolean {
    const info = this.#exceptions[index];
    if (!info) return false;
    info.handled = true;
    return true;
  }

  get exceptions(): ExceptionInfo[] {
    return [...this.#exceptions];
  }

  unhandled(): ExceptionInfo[] {
    return this.#exceptions.filter((info) => !info.handled);
  }
}

export interface DiagnosticEvent {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}

export class DiagnosticsRing {
  #events: DiagnosticEvent[] = [];
  #capacity: number;
  #clock = 0;

  constructor(capacity = 128) {
    this.#capacity = capacity;
  }

  record(level: DiagnosticEvent["level"], message: string): DiagnosticEvent {
    this.#clock += 1;
    const event: DiagnosticEvent = { timestamp: this.#clock, level, message };
    this.#events.push(event);
    if (this.#events.length > this.#capacity) this.#events.shift();
    return event;
  }

  recent(count: number): DiagnosticEvent[] {
    return this.#events.slice(-count);
  }

  count(level: DiagnosticEvent["level"]): number {
    return this.#events.filter((event) => event.level === level).length;
  }

  get size(): number {
    return this.#events.length;
  }
}

export type DebugInstruction =
  | { op: "line"; line: number }
  | { op: "enter"; name: string }
  | { op: "leave" }
  | { op: "set"; name: string; value: DebugValue }
  | { op: "expr"; name: string; expression: string }
  | { op: "throw"; message: string };

export interface DebugProgram {
  script: string;
  instructions: DebugInstruction[];
}

export type DebugState = "running" | "paused" | "stopped" | "faulted";

export interface RemoteMessage {
  type: "setBreakpoint" | "clearBreakpoint" | "pause" | "continue" | "step" | "stackTrace" | "variables" | "evaluate" | "event";
  [key: string]: DebugValue;
}

export class InMemoryTransport {
  #server: ((message: RemoteMessage) => RemoteMessage | null) | null = null;
  #client: ((message: RemoteMessage) => void) | null = null;
  messages = 0;

  bindServer(handler: (message: RemoteMessage) => RemoteMessage | null): void {
    this.#server = handler;
  }

  bindClient(handler: (message: RemoteMessage) => void): void {
    this.#client = handler;
  }

  sendToServer(message: RemoteMessage): RemoteMessage | null {
    this.messages += 1;
    return this.#server ? this.#server(message) : null;
  }

  sendToClient(message: RemoteMessage): void {
    this.messages += 1;
    this.#client?.(message);
  }
}

export class DebugSession {
  readonly breakpoints = new BreakpointManager();
  readonly callStack = new CallStack();
  readonly step = new StepController();
  readonly watches = new WatchList();
  readonly exceptions = new ExceptionTrap();
  readonly diagnostics = new DiagnosticsRing();
  state: DebugState = "stopped";
  program: DebugProgram | null = null;
  #pc = 0;
  #globals: DebugValueMap = {};
  #transport: InMemoryTransport | null = null;

  attach(program: DebugProgram, transport: InMemoryTransport | null = null): void {
    this.program = program;
    this.#pc = 0;
    this.state = "running";
    this.callStack.clear();
    this.#globals = {};
    this.#transport = transport;
    if (transport) {
      transport.bindServer((message) => this.handleRemote(message));
    }
    this.diagnostics.record("info", `attached to ${program.script}`);
  }

  run(): void {
    if (!this.program || this.state === "stopped") return;
    while (this.#pc < this.program.instructions.length) {
      const instruction = this.program.instructions[this.#pc]!;
      this.#pc += 1;
      this.#execute(instruction);
      const state = this.state as DebugState;
      if (state === "paused" || state === "faulted" || state === "stopped") return;
    }
    this.state = "stopped";
    this.diagnostics.record("info", "program completed");
    this.#emit({ type: "event", event: "terminated" });
  }

  #execute(instruction: DebugInstruction): void {
    switch (instruction.op) {
      case "line": {
        const location: DebugLocation = { script: this.program!.script, line: instruction.line, column: 1 };
        const top = this.callStack.top();
        if (top) top.location = location;
        else this.callStack.push({ functionName: "<module>", location, locals: {} });
        const scope = this.scope();
        const breakpoint = this.breakpoints.shouldPause(location, scope);
        if (breakpoint) {
          this.breakpoints.registerHit(breakpoint, scope);
          this.pause();
          return;
        }
        if (this.step.shouldStopAt(this.callStack.depth, true)) this.pause();
        return;
      }
      case "enter": {
        this.callStack.push({ functionName: instruction.name, location: { script: this.program!.script, line: 0, column: 1 }, locals: {} });
        return;
      }
      case "leave": {
        this.callStack.pop();
        return;
      }
      case "set": {
        this.callStack.updateLocal(instruction.name, instruction.value);
        return;
      }
      case "expr": {
        this.callStack.updateLocal(instruction.name, evaluateWatch(instruction.expression, this.scope()));
        return;
      }
      case "throw": {
        const location = this.callStack.top()?.location ?? null;
        const info = this.exceptions.trap(instruction.message, location);
        this.diagnostics.record("error", instruction.message);
        if (this.exceptions.pauseOnThrow) {
          this.state = "faulted";
          this.#emit({ type: "event", event: "exception", message: info.message });
        }
        return;
      }
      default:
        return;
    }
  }

  pause(): void {
    this.state = "paused";
    this.#emit({ type: "event", event: "paused", depth: this.callStack.depth });
  }

  continue(): void {
    if (this.state === "paused" || this.state === "faulted") this.state = "running";
    this.step.request("continue", this.callStack.depth);
    this.run();
  }

  stepInto(): void {
    this.state = "running";
    this.step.request("into", this.callStack.depth);
    this.run();
  }

  stepOver(): void {
    this.state = "running";
    this.step.request("over", this.callStack.depth);
    this.run();
  }

  stepOut(): void {
    this.state = "running";
    this.step.request("out", this.callStack.depth);
    this.run();
  }

  scope(): DebugValueMap {
    const scope: DebugValueMap = { ...this.#globals };
    for (const frame of this.callStack.frames()) {
      Object.assign(scope, frame.locals);
    }
    return scope;
  }

  setGlobal(name: string, value: DebugValue): void {
    this.#globals[name] = value;
  }

  evaluate(expression: string): DebugValue {
    return evaluateWatch(expression, this.scope());
  }

  handleRemote(message: RemoteMessage): RemoteMessage | null {
    switch (message.type) {
      case "setBreakpoint": {
        const location = message.location as unknown as DebugLocation;
        const breakpoint = this.breakpoints.add(location, (message.condition as string) ?? null);
        return { type: "setBreakpoint", id: breakpoint.id };
      }
      case "clearBreakpoint":
        return { type: "clearBreakpoint", ok: this.breakpoints.remove(String(message.id)) };
      case "pause":
        this.pause();
        return { type: "event", event: "paused" };
      case "continue":
        this.continue();
        return { type: "event", event: "resumed" };
      case "step": {
        const mode = String(message.mode) as "into" | "over" | "out";
        if (mode === "into") this.stepInto();
        else if (mode === "over") this.stepOver();
        else this.stepOut();
        return { type: "event", event: "resumed" };
      }
      case "stackTrace":
        return {
          type: "stackTrace",
          frames: this.callStack.frames().map((frame) => `${frame.functionName}@${frame.location.line}`),
        };
      case "variables":
        return { type: "variables", scope: JSON.stringify(this.scope()) };
      case "evaluate":
        return { type: "evaluate", value: JSON.stringify(this.evaluate(String(message.expression))) };
      default:
        return null;
    }
  }

  #emit(message: RemoteMessage): void {
    this.#transport?.sendToClient(message);
  }
}
