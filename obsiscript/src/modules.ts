import { parse } from "./parser.js";
import { Environment, Interpreter, RuntimeError, type Value } from "./interp.js";

export interface ModuleRecord {
  name: string;
  source: string;
}

export class ModuleLoader {
  private readonly sources = new Map<string, string>();
  private readonly cache = new Map<string, Map<string, Value>>();
  private readonly loading = new Set<string>();
  readonly interpreters = new Map<string, Interpreter>();

  constructor(readonly globals: Record<string, Value> = {}) {}

  register(name: string, source: string): void {
    if (this.sources.has(name) || this.cache.has(name)) throw new RangeError(`module ${name} already registered`);
    this.sources.set(name, source);
  }

  has(name: string): boolean {
    return this.sources.has(name);
  }

  load(name: string): Map<string, Value> {
    const cached = this.cache.get(name);
    if (cached) return cached;
    const source = this.sources.get(name);
    if (source === undefined) throw new RuntimeError(`unknown module ${name}`, 0);
    if (this.loading.has(name)) throw new RuntimeError(`circular import involving ${name}`, 0);
    this.loading.add(name);
    try {
      const interpreter = new Interpreter({
        globals: this.globals,
        moduleResolver: (target) => this.load(target),
      });
      const exports = interpreter.run(parse(source));
      this.cache.set(name, exports);
      this.interpreters.set(name, interpreter);
      return exports;
    } finally {
      this.loading.delete(name);
    }
  }

  get exports(): Record<string, Map<string, Value>> {
    return Object.fromEntries(this.cache);
  }

  reset(): void {
    this.cache.clear();
    this.interpreters.clear();
    this.loading.clear();
  }
}

export function runModule(source: string, globals: Record<string, Value> = {}, loader?: ModuleLoader): Map<string, Value> {
  const host = loader ?? new ModuleLoader(globals);
  const interpreter = new Interpreter({
    globals,
    moduleResolver: (name) => host.load(name),
  });
  return interpreter.run(parse(source));
}

export { Environment };
